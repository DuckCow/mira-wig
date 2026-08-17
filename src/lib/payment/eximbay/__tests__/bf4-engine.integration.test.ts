import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import { processEximbayBf4Status, type ProcessEximbayBf4StatusInput } from "../bf4-engine";
import {
  EXIMBAY_BF4_SCHEMA,
  EXIMBAY_BF4_VERSION,
  EximbayBf4Stage,
  exactRawSha256,
  validateEximbayBf4Envelope,
  type EximbayBf4Envelope,
} from "../bf4-envelope";
import type { EximbayBf4Fetch } from "../bf4-contact";
import {
  claimEximbayBf4Event,
  correlateEximbayBf4Payment,
  rotateEximbayBf4ClaimToRejected,
  transitionEximbayBf4Event,
} from "../bf4-event";

const API_KEY = "BF4_INTEGRATION_SYNTHETIC_KEY_DO_NOT_LOG";
const MID = "BF4_INTEGRATION_MID";
const NOW = new Date("2026-08-17T01:00:00.000Z");
const RECEIVED_AT = new Date("2026-08-17T01:01:00.000Z");

interface Fixture {
  readonly userId: string;
  readonly styleId: string;
  readonly variantId: string;
  readonly sessionId: string;
  readonly paymentId: string;
  readonly providerOrderId: string;
  readonly transactionId: string;
  readonly amount: number;
  readonly raw: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface RetrieveOverrides {
  readonly status?: "SALE" | "AUTH" | "REGISTERED" | "NONE";
  readonly mid?: string;
  readonly orderId?: string;
  readonly transactionId?: string;
  readonly currency?: string;
  readonly amount?: string;
}

describe.sequential("Eximbay BF4 dormant engine integration", () => {
  let fixture: Fixture;
  let cleanupTarget: Fixture | null = null;

  beforeEach(async () => {
    fixture = await createFixture();
    cleanupTarget = fixture;
  });

  afterEach(async () => {
    if (cleanupTarget) await cleanupFixture(cleanupTarget);
    cleanupTarget = null;
  });

  it("fails closed before claim when no pre-existing EXIMBAY Payment correlates", async () => {
    const raw = statusRaw({ ...fixture, providerOrderId: `missing-${randomUUID()}` });
    const transport = vi.fn<EximbayBf4Fetch>();
    const eventCount = await db.paymentEvent.count();
    const paymentCount = await db.payment.count();

    const result = await process(raw, transport);

    expect(result).toEqual({
      kind: "notCorrelated",
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    expect(transport).not.toHaveBeenCalled();
    await expect(db.paymentEvent.count()).resolves.toBe(eventCount);
    await expect(db.payment.count()).resolves.toBe(paymentCount);
  });

  it("commits both contact markers before fake transport, admits exact SALE, and completes exactly once", async () => {
    const observedStages: string[] = [];
    const transport = vi.fn<EximbayBf4Fetch>(async (input) => {
      const event = await onlyEvent();
      const envelope = validateEximbayBf4Envelope(event.raw);
      observedStages.push(envelope.stage);
      if (requestUrl(input).endsWith("/verify")) {
        expect(envelope.stage).toBe(EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN);
        expect(event.providerPaymentKey).toBeNull();
        return verifySuccess();
      }
      expect(envelope.stage).toBe(EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN);
      expect(event.providerPaymentKey).toBeNull();
      await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
        .resolves.toMatchObject({ providerPaymentKey: null, status: PaymentAttemptStatus.INITIATED });
      return retrieveSuccess(fixture);
    });

    const first = await process(fixture.raw, transport);
    const duplicateTransport = vi.fn<EximbayBf4Fetch>();
    const duplicate = await process(fixture.raw, duplicateTransport);

    expect(observedStages).toEqual([
      EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
      EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
    ]);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(duplicateTransport).not.toHaveBeenCalled();
    expect(first).toMatchObject({
      kind: "handled",
      stage: EximbayBf4Stage.TERMINAL_PROCESSED,
      acknowledgement: { kind: "SUCCESS", body: "rescode=0000&resmsg=Success" },
    });
    expect(duplicate).toMatchObject({
      stage: EximbayBf4Stage.TERMINAL_PROCESSED,
      acknowledgement: { kind: "SUCCESS" },
    });
    const payment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
    expect(payment).toMatchObject({
      providerPaymentKey: fixture.transactionId,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    });
    expect(payment.financialSucceededAt?.getTime()).toBe(RECEIVED_AT.getTime());
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(1);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: fixture.sessionId } }))
      .resolves.toMatchObject({ status: CheckoutSessionStatus.COMPLETED });
    const terminal = validateEximbayBf4Envelope((await onlyEvent()).raw);
    expect(terminal.exactRawQuery).toBeUndefined();
    expect(terminal.exactRawSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("leaves well-formed verify non-success ambiguous with an active claim and zero automatic retry", async () => {
    const firstTransport = vi.fn<EximbayBf4Fetch>(() => Promise.resolve(
      jsonResponse({ rescode: "9999", resmsg: "not admitted" }),
    ));

    const first = await process(fixture.raw, firstTransport);
    const replayTransport = vi.fn<EximbayBf4Fetch>();
    const replay = await process(fixture.raw, replayTransport);

    expect(first).toMatchObject({ stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN });
    expect(replay).toMatchObject({ stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN });
    expect(firstTransport).toHaveBeenCalledTimes(1);
    expect(replayTransport).not.toHaveBeenCalled();
    const event = await onlyEvent();
    expect(event.transmissionId).toMatch(/^eximbay:status:tx:v1:/u);
    expect(event.transmissionId).not.toMatch(/^eximbay:status:reject:v1:/u);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
  });

  it("retains admitted AUTH for adjudication without completion or provider retry", async () => {
    const transport = responseTransport(() => retrieveSuccess(fixture, { status: "AUTH" }));

    const result = await process(fixture.raw, transport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    expect(transport).toHaveBeenCalledTimes(2);
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
  });

  it("leaves an ambiguous retrieve at its durable marker with zero automatic retry", async () => {
    const transport = responseTransport(() => new Response("{}", {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));

    const first = await process(fixture.raw, transport);
    const replayTransport = vi.fn<EximbayBf4Fetch>();
    const replay = await process(fixture.raw, replayTransport);

    expect(first).toMatchObject({ stage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN });
    expect(replay).toMatchObject({ stage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(replayTransport).not.toHaveBeenCalled();
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        providerPaymentKey: null,
      });
  });

  it("retains exact-identity SALE money mismatch for reconciliation without assigning a provider key", async () => {
    const transport = responseTransport(() => retrieveSuccess(fixture, { amount: "99.99" }));

    const result = await process(fixture.raw, transport);
    const replayTransport = vi.fn<EximbayBf4Fetch>();
    const replay = await process(fixture.raw, replayTransport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    expect(replay).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(replayTransport).not.toHaveBeenCalled();
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
        financialSucceededAt: null,
        blockingEndedAt: null,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      verification: "ADMITTED",
      retrieval: "ADMITTED_SALE_MISMATCH",
      diagnostic: "SALE_MONEY_MISMATCH",
      saleFacts: {
        mid: MID,
        providerOrderId: fixture.providerOrderId,
        transactionId: fixture.transactionId,
        amountWire: "99.99",
        amountMinor: 9999,
        status: "SALE",
      },
    });
  });

  it("commits money mismatch evidence when the exact safe Payment is already OUTCOME_UNKNOWN", async () => {
    await db.payment.update({
      where: { id: fixture.paymentId },
      data: { attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN },
    });
    const transport = responseTransport(() => retrieveSuccess(fixture, { amount: "99.99" }));

    const result = await process(fixture.raw, transport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: null,
      });
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
  });

  it("retains money mismatch evidence without forcing an authority-divergent Payment", async () => {
    const divergentAmount = fixture.amount + 1;
    const transport = vi.fn<EximbayBf4Fetch>(async (input) => {
      if (requestUrl(input).endsWith("/verify")) return verifySuccess();
      await db.payment.update({
        where: { id: fixture.paymentId },
        data: { amount: divergentAmount },
      });
      return retrieveSuccess(fixture, { amount: "99.99" });
    });

    const result = await process(fixture.raw, transport);
    const replayTransport = vi.fn<EximbayBf4Fetch>();
    const replay = await process(fixture.raw, replayTransport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    expect(replay).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(replayTransport).not.toHaveBeenCalled();
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        amount: divergentAmount,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: null,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      retrieval: "ADMITTED_SALE_MISMATCH",
      diagnostic: "SALE_MONEY_MISMATCH",
    });
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
  });

  const identityMismatchCases: readonly [string, RetrieveOverrides][] = [
    ["MID", { mid: "other-mid" }],
    ["order", { orderId: "other-order" }],
    ["transaction", { transactionId: "other-transaction" }],
  ];
  it.each(identityMismatchCases)("keeps retrieved %s identity mismatch event-only", async (_label, overrides) => {
    const transport = responseTransport(() => retrieveSuccess(fixture, overrides));

    const result = await process(fixture.raw, transport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      retrieval: "ADMITTED_SALE_MISMATCH",
      diagnostic: "SALE_IDENTITY_MISMATCH",
    });
  });

  it("keeps callback transaction-type identity mismatch event-only", async () => {
    const transport = responseTransport(() => retrieveSuccess(fixture));
    const raw = fixture.raw.replace("transaction_type=PAYMENT", "transaction_type=REFUND");

    const result = await process(raw, transport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      retrieval: "ADMITTED_SALE_MISMATCH",
      diagnostic: "SALE_IDENTITY_MISMATCH",
    });
  });

  it("treats exact-identity SALE currency inequality as a money mismatch", async () => {
    const transport = responseTransport(() => retrieveSuccess(fixture, {
      currency: "JPY",
      amount: String(fixture.amount),
    }));

    const result = await process(fixture.raw, transport);

    expect(result).toMatchObject({
      stage: EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
      acknowledgement: { kind: "NON_SUCCESS_EVIDENCE_GATED" },
    });
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        providerPaymentKey: null,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      retrieval: "ADMITTED_SALE_MISMATCH",
      diagnostic: "SALE_MONEY_MISMATCH",
    });
  });

  it("rolls back mismatch event evidence when the paired safe-Payment update fails", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `bf4_money_mismatch_failure_${suffix}`;
    const triggerName = `bf4_money_mismatch_failure_${suffix}`;
    await addPaymentOutcomeUnknownFailureTrigger(functionName, triggerName, fixture.paymentId);
    const transport = responseTransport(() => retrieveSuccess(fixture, { amount: "99.99" }));

    try {
      await expect(process(fixture.raw, transport)).rejects.toThrow(
        "synthetic BF4 money mismatch Payment failure",
      );
    } finally {
      await dropPaymentOutcomeUnknownFailureTrigger(functionName, triggerName);
    }

    expect(transport).toHaveBeenCalledTimes(2);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: null,
      });
    expect(validateEximbayBf4Envelope((await onlyEvent()).raw)).toMatchObject({
      stage: EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
      verification: "ADMITTED",
      retrieval: "OUTCOME_UNKNOWN",
    });
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(0);
  });

  it("uses stage CAS so concurrent duplicate callbacks perform one verify and one retrieve total", async () => {
    const verifyStarted = deferred<void>();
    const releaseVerify = deferred<Response>();
    const transport = vi.fn<EximbayBf4Fetch>((input) => {
      if (requestUrl(input).endsWith("/verify")) {
        verifyStarted.resolve();
        return releaseVerify.promise;
      }
      return Promise.resolve(retrieveSuccess(fixture));
    });

    const first = process(fixture.raw, transport);
    await verifyStarted.promise;
    const duplicate = await process(fixture.raw, transport);
    releaseVerify.resolve(verifySuccess());
    const completed = await first;

    expect(duplicate).toMatchObject({ stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN });
    expect(completed).toMatchObject({ stage: EximbayBf4Stage.TERMINAL_PROCESSED });
    expect(transport).toHaveBeenCalledTimes(2);
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(1);
  });

  it("replays local completion from stored SALE facts without verify or retrieve recontact", async () => {
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: fixture.sessionId },
      data: { snapshotData: [] },
    });
    const firstTransport = responseTransport(() => retrieveSuccess(fixture));

    const first = await process(fixture.raw, firstTransport);

    expect(first).toMatchObject({ stage: EximbayBf4Stage.COMPLETION_RETRYABLE });
    expect(firstTransport).toHaveBeenCalledTimes(2);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({ providerPaymentKey: fixture.transactionId, status: PaymentAttemptStatus.SUCCEEDED });
    await db.checkoutSessionLine.updateMany({
      where: { sessionId: fixture.sessionId },
      data: {
        snapshotData: {
          styleName: "BF4 Style",
          color: "Black",
          colorHex: null,
          length: "Medium",
          curl: "Straight",
          coverImageKey: null,
          currencyCode: "USD",
        },
      },
    });
    const replayTransport = vi.fn<EximbayBf4Fetch>();

    const replay = await process(fixture.raw, replayTransport);

    expect(replay).toMatchObject({
      stage: EximbayBf4Stage.TERMINAL_PROCESSED,
      acknowledgement: { kind: "SUCCESS" },
    });
    expect(replayTransport).not.toHaveBeenCalled();
    await expect(db.order.count({ where: { paymentId: fixture.paymentId } })).resolves.toBe(1);
  });

  it("rolls back the TOCTOU contender after active-claim rotation exposes the committed tombstone", async () => {
    const payment = await correlateEximbayBf4Payment(db, fixture.providerOrderId);
    if (!payment) throw new Error("missing BF4 payment");
    const initial = claimEnvelope(fixture.raw, fixture.transactionId);
    const claimed = await claimEximbayBf4Event(db, payment, initial);
    if (claimed.kind !== "event") throw new Error("missing initial BF4 claim");
    const conflictingRaw = fixture.raw.replace("resmsg=Success", "resmsg=Conflict");
    await expect(claimEximbayBf4Event(
      db,
      payment,
      claimEnvelope(conflictingRaw, fixture.transactionId),
    )).resolves.toEqual({ kind: "conflict" });
    const marked = verifyMarkedEnvelope(initial);
    await expect(transitionEximbayBf4Event(db, {
      eventId: claimed.event.id,
      expectedStage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
      envelope: marked,
    })).resolves.toBe(true);
    await expect(transitionEximbayBf4Event(db, {
      eventId: claimed.event.id,
      expectedStage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
      envelope: marked,
    })).resolves.toBe(false);
    const rotationWritten = deferred<void>();
    const releaseCommit = deferred<void>();
    const rotation = db.$transaction(async (tx) => {
      const rotated = await rotateEximbayBf4ClaimToRejected(
        tx,
        claimed.event.id,
        EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
        new Date(RECEIVED_AT.getTime() + 2_000),
      );
      expect(rotated).toBe(true);
      rotationWritten.resolve();
      await releaseCommit.promise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await rotationWritten.promise;

    const contender = claimEximbayBf4Event(db, payment, initial);
    expect(await settlesWithin(contender, 60)).toBe(false);
    releaseCommit.resolve();
    await rotation;

    await expect(contender).resolves.toMatchObject({ kind: "rejectedReplay" });
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(1);
    const rejected = validateEximbayBf4Envelope((await onlyEvent()).raw);
    expect(rejected).toMatchObject({
      stage: EximbayBf4Stage.TERMINAL_REJECTED,
      verification: "DEFINITIVELY_REJECTED",
    });
    expect(rejected.exactRawQuery).toBeUndefined();

    const differentRaw = fixture.raw.replace("resmsg=Success", "resmsg=Accepted");
    const differentClaim = await claimEximbayBf4Event(
      db,
      payment,
      claimEnvelope(differentRaw, fixture.transactionId),
    );
    expect(differentClaim).toMatchObject({ kind: "event", created: true });
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(2);
  });

  it("uses a distinct raw-fallback namespace when the bounded candidate has no transaction ID", async () => {
    const payment = await correlateEximbayBf4Payment(db, fixture.providerOrderId);
    if (!payment) throw new Error("missing BF4 payment");
    const raw = fixture.raw
      .replace("rescode=0000", "rescode=9999")
      .replace(`&transaction_id=${fixture.transactionId}`, "");

    const claimed = await claimEximbayBf4Event(db, payment, claimEnvelope(raw));

    expect(claimed).toMatchObject({ kind: "event", created: true });
    if (claimed.kind !== "event") throw new Error("missing raw fallback event");
    expect(claimed.event.transmissionId).toMatch(/^eximbay:status:raw:v1:[0-9a-f]{64}$/u);
    expect(claimed.event.transmissionId).not.toContain(fixture.transactionId);
  });

  async function onlyEvent() {
    return db.paymentEvent.findFirstOrThrow({
      where: { checkoutSessionId: fixture.sessionId, provider: PaymentProvider.EXIMBAY },
      orderBy: { receivedAt: "asc" },
    });
  }
});

async function process(raw: string, transport: EximbayBf4Fetch) {
  const input: ProcessEximbayBf4StatusInput = {
    exactRawQuery: raw,
    receivedAt: RECEIVED_AT,
    env: syntheticEnv(),
    transport,
    now: monotonicClock(),
  };
  return processEximbayBf4Status(db, input);
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `bf4_user_${suffix}`;
  await ensureUsMarket();
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "BF4 Buyer" } });
  const style = await db.wigStyle.create({
    data: {
      name: "BF4 Style",
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      isActive: true,
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
    select: { id: true },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 1234,
      stock: 3,
      sku: `BF4-${suffix}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "US", amount: 1234 } },
    },
    select: { id: true },
  });
  await db.cartItem.create({
    data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 },
  });
  const session = await createCheckoutSession(db, {
    userId,
    marketCode: "US",
    shipping: validShipping(),
    now: NOW,
  });
  const providerOrderId = syntheticEximbayProviderOrderId();
  const transactionId = `bf4-tx-${suffix}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId,
      idempotencyKey: `bf4-idem-${suffix}`,
      contactIntentAt: NOW,
      contactStartedAt: new Date(NOW.getTime() + 1),
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      initiationCompletedAt: new Date(NOW.getTime() + 2),
    },
    select: { id: true },
  });
  const fixture = {
    userId,
    styleId: style.id,
    variantId: variant.id,
    sessionId: session.sessionId,
    paymentId: payment.id,
    providerOrderId,
    transactionId,
    amount: session.totalAmount,
    raw: "",
  };
  return { ...fixture, raw: statusRaw(fixture) };
}

function statusRaw(input: Pick<Fixture, "providerOrderId" | "transactionId" | "amount">): string {
  return [
    "transaction_type=PAYMENT",
    `mid=${MID}`,
    `order_id=${input.providerOrderId}`,
    "currency=USD",
    `amount=${amountWire(input.amount)}`,
    "rescode=0000",
    "resmsg=Success",
    "fgkey=status-only-not-ready",
    `transaction_id=${input.transactionId}`,
  ].join("&");
}

function responseTransport(retrieve: () => Response): ReturnType<typeof vi.fn<EximbayBf4Fetch>> {
  return vi.fn<EximbayBf4Fetch>((input) => Promise.resolve(
    requestUrl(input).endsWith("/verify") ? verifySuccess() : retrieve(),
  ));
}

function verifySuccess(): Response {
  return jsonResponse({ rescode: "0000", resmsg: "verified" });
}

function retrieveSuccess(
  fixture: Fixture,
  overrides: RetrieveOverrides = {},
): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "retrieved",
    mid: overrides.mid ?? MID,
    payment: {
      order_id: overrides.orderId ?? fixture.providerOrderId,
      currency: overrides.currency ?? "USD",
      amount: overrides.amount ?? amountWire(fixture.amount),
      transaction_id: overrides.transactionId ?? fixture.transactionId,
      status: overrides.status ?? "SALE",
      transaction_date: "20260817010100",
    },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function amountWire(amount: number): string {
  const digits = String(amount).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function syntheticEnv() {
  return {
    EXIMBAY_SANDBOX_API_KEY: API_KEY,
    EXIMBAY_SANDBOX_MID: MID,
  };
}

function monotonicClock(): () => Date {
  let offset = 0;
  return () => {
    offset += 1;
    return new Date(RECEIVED_AT.getTime() + offset);
  };
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function claimEnvelope(raw: string, transactionId?: string): EximbayBf4Envelope {
  return validateEximbayBf4Envelope({
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    stage: EximbayBf4Stage.CLAIMED_PRE_VERIFY,
    exactRawQuery: raw,
    exactRawSha256: exactRawSha256(raw),
    candidate: {
      orderId: rawField(raw, "order_id"),
      transactionId,
      resultCode: rawField(raw, "rescode"),
    },
    verification: "NOT_ATTEMPTED",
    retrieval: "NOT_ATTEMPTED",
    timestamps: {
      receivedAt: RECEIVED_AT.toISOString(),
      stageChangedAt: RECEIVED_AT.toISOString(),
    },
  });
}

function verifyMarkedEnvelope(envelope: EximbayBf4Envelope): EximbayBf4Envelope {
  const markedAt = new Date(RECEIVED_AT.getTime() + 1_000).toISOString();
  return validateEximbayBf4Envelope({
    ...envelope,
    stage: EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
    verification: "OUTCOME_UNKNOWN",
    timestamps: {
      ...envelope.timestamps,
      stageChangedAt: markedAt,
      verifyContactMarkedAt: markedAt,
    },
  });
}

function rawField(raw: string, name: string): string {
  const prefix = `${name}=`;
  const pair = raw.split("&").find((candidate) => candidate.startsWith(prefix));
  if (!pair) throw new Error(`missing ${name}`);
  return pair.slice(prefix.length);
}

async function settlesWithin<T>(promise: Promise<T>, milliseconds: number): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), milliseconds);
  });
  const settled = promise.then(() => true, () => true);
  return Promise.race([settled, timeout]);
}

async function addPaymentOutcomeUnknownFailureTrigger(
  functionName: string,
  triggerName: string,
  paymentId: string,
): Promise<void> {
  requireSafeSqlIdentifier(functionName);
  requireSafeSqlIdentifier(triggerName);
  const safePaymentId = requireSafeSqlValue(paymentId);
  await db.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW."id" = '${safePaymentId}'
        AND NEW."attemptLifecycle"::text = 'OUTCOME_UNKNOWN' THEN
        RAISE EXCEPTION 'synthetic BF4 money mismatch Payment failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE UPDATE OF "attemptLifecycle" ON "Payment"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);
}

async function dropPaymentOutcomeUnknownFailureTrigger(
  functionName: string,
  triggerName: string,
): Promise<void> {
  requireSafeSqlIdentifier(functionName);
  requireSafeSqlIdentifier(triggerName);
  await db.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "Payment"`);
  await db.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
}

function requireSafeSqlIdentifier(value: string): void {
  if (!/^[a-z0-9_]+$/u.test(value)) throw new Error("Unsafe BF4 test SQL identifier.");
}

function requireSafeSqlValue(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Unsafe BF4 test SQL value.");
  return value;
}

async function ensureUsMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
    create: { code: "US", currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
  });
}

function validShipping(): CheckoutShippingInput {
  return {
    recipientName: "BF4 Recipient",
    phone: "+1-555-0100",
    country: ShippingCountry.US,
    postalCode: "94105",
    administrativeArea: "CA",
    city: "San Francisco",
    addressLine1: "1 Market Street",
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  await db.paymentEvent.deleteMany({ where: { checkoutSessionId: fixture.sessionId } });
  await db.paymentOutbox.deleteMany({
    where: { dedupKey: `payment-remediation:EXIMBAY:${fixture.transactionId}` },
  });
  const order = await db.order.findUnique({ where: { paymentId: fixture.paymentId }, select: { id: true } });
  if (order) {
    const items = await db.orderItem.findMany({ where: { orderId: order.id }, select: { id: true } });
    await db.manufacturingRequest.deleteMany({ where: { orderItemId: { in: items.map((item) => item.id) } } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.orderShipping.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
  await db.payment.deleteMany({ where: { id: fixture.paymentId } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSession.deleteMany({ where: { id: fixture.sessionId } });
  await db.cartItem.deleteMany({ where: { userId: fixture.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: fixture.variantId } });
  await db.wigVariant.deleteMany({ where: { id: fixture.variantId } });
  await db.wigStyle.deleteMany({ where: { id: fixture.styleId } });
  await db.user.deleteMany({ where: { id: fixture.userId } });
}
