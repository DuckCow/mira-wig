import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { completeFromCapture, recordCapture, type CaptureFacts } from "@/lib/payment/complete";
import { EXIMBAY_READY_TOTAL_DEADLINE_MS } from "@/lib/payment/eximbay/ready-contact";
import { createPrismaTransactionalEmailProjectionSource } from "@/lib/payment/email";
import {
  EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED,
  recoverEximbayCheckout,
} from "@/lib/payment/eximbay/checkout-recovery";
import type { EximbayBf4Fetch } from "@/lib/payment/eximbay/bf4-contact";
import { hasUnresolvedSessionExposure } from "@/lib/payment/remediation";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { PaymentMethod, PaymentMode } from "@/lib/payment/providers/routing";
import type {
  PaymentInitiateInput,
  PaymentInitiateResult,
  PaymentInitiationProvider,
} from "@/lib/payment/providers/types";
import { createCheckoutSession, expireStale, type CheckoutShippingInput } from "@/lib/payment/session";
import {
  initiatePaymentAttempt,
  initiatePaymentAttemptWithTransientAuthority,
  type InitiatePaymentAttemptInput,
} from "../initiate";

const initiationProviders = vi.hoisted(() => new Map<string, PaymentInitiationProvider>());
const eximbayCallRecords = new WeakMap<PaymentInitiationProvider, PaymentInitiateInput[]>();
const providerOrderEntropy = vi.hoisted(() => {
  const chunks: Uint8Array[] = [];
  return { chunks, calls: 0 };
});

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return {
    ...original,
    randomBytes: (size: number) => {
      providerOrderEntropy.calls += 1;
      return providerOrderEntropy.chunks.shift() ?? original.randomBytes(size);
    },
  };
});

vi.mock("@/lib/payment/providers/initiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/initiation")>()),
  resolveInitiationProvider: (context: ProviderFactoryContext) => {
    const provider = initiationProviders.get(context.ruleId);
    if (!provider) throw new Error(`Missing test initiation provider for ${context.ruleId}`);
    return provider;
  },
}));

type PaymentAttemptCoordinationPoint =
  | "BEFORE_AUTHORIZATION_LOCK"
  | "BEFORE_AUTHORIZATION_COMMIT"
  | "AFTER_AUTHORIZATION_LOCK"
  | "AFTER_AUTHORIZATION_COMMIT"
  | "BEFORE_CONTACT_CLAIM_COMMIT"
  | "AFTER_CONTACT_CLAIM_COMMIT";

interface PaymentAttemptTestCoordination {
  waitAt(point: PaymentAttemptCoordinationPoint): Promise<void>;
  includes(point: PaymentAttemptCoordinationPoint): boolean;
}

interface TestInitiationInput {
  sessionId: string;
  userId: string;
  provider: PaymentInitiationProvider;
  mode: PaymentMode;
  routingRuleId: string;
  now?: Date;
  contactBoundaryNow?: Date;
  eximbayReady?: InitiatePaymentAttemptInput["eximbayReady"];
}

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
}

type TestEximbayReadyFetch = NonNullable<
  NonNullable<InitiatePaymentAttemptInput["eximbayReady"]>["fetchImpl"]
>;

interface VariantOptions {
  amount?: number;
  stock?: number;
  fulfillmentType?: FulfillmentType;
}

describe("payment initiate providerRef persistence", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    initiationProviders.clear();
    providerOrderEntropy.chunks.length = 0;
    providerOrderEntropy.calls = 0;
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({
      data: { id: ctx.userId, name: "Synthetic Eximbay Buyer", email: `${ctx.userId}@example.test` },
    });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("persists providerRef for ready initiate and keeps providerPaymentKey null", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_ready_${randomUUID()}`;

    const result = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    });

    const payment = await onlyPayment(session.sessionId);
    expect(result.status).toBe(PaymentAttemptStatus.INITIATED);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.INITIATED,
      mode: PaymentMode.SANDBOX,
      providerRef,
      providerPaymentKey: null,
    });
  });

  it("persists providerRef and marks AWAITING for redirect initiate", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_redirect_${randomUUID()}`;

    const result = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({
        kind: "redirect",
        approveUrl: "https://fake-provider.example.test/approve",
        providerRef,
      }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    });

    const payment = await onlyPayment(session.sessionId);
    expect(result.status).toBe(PaymentAttemptStatus.AWAITING);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.AWAITING,
      providerRef,
      providerPaymentKey: null,
    });
  });

  it("leaves providerRef null when initiate result omits it", async () => {
    const session = await submitSessionWithOneLine(ctx);

    await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    });

    const payment = await onlyPayment(session.sessionId);
    expect(payment.providerRef).toBeNull();
    expect(payment.providerPaymentKey).toBeNull();
    expect(payment.providerOrderId).toBeNull();
  });

  it("commits one EXIMBAY providerOrderId with CONTACT_AUTHORIZED before contact claim", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const barrier = coordinationBarrier();
    const coordination = coordinationAt("AFTER_AUTHORIZATION_COMMIT", barrier);
    providerOrderEntropy.chunks.push(entropyChunk(0));
    const pending = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls, PaymentProvider.EXIMBAY),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.contact-ordering",
    }, coordination);

    await barrier.reached;
    try {
      const authorized = await onlyPayment(session.sessionId);
      expect(authorized).toMatchObject({
        provider: PaymentProvider.EXIMBAY,
        adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
        providerOrderId: `c${"0".repeat(24)}`,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
        contactStartedAt: null,
      });
      expect(calls).toHaveLength(0);
    } finally {
      barrier.release();
    }

    await expect(pending).resolves.toMatchObject({ provider: PaymentProvider.EXIMBAY });
    const contacted = await onlyPayment(session.sessionId);
    expect(contacted).toMatchObject({
      providerOrderId: `c${"0".repeat(24)}`,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    });
    expect(contacted.contactStartedAt).not.toBeNull();
    expect(providerOrderEntropy.calls).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("reuses the same EXIMBAY Payment and providerOrderId without another generator call", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = fakeProvider({ kind: "ready" }, calls, PaymentProvider.EXIMBAY);
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.compatible-reentry",
    };
    providerOrderEntropy.chunks.push(entropyChunk(1));

    const first = await initiatePaymentAttemptForTest(db, input);
    const firstPayment = await onlyPayment(session.sessionId);
    const second = await initiatePaymentAttemptForTest(db, input);
    const secondPayment = await onlyPayment(session.sessionId);

    expect(second.paymentId).toBe(first.paymentId);
    expect(secondPayment.providerOrderId).toBe(firstPayment.providerOrderId);
    expect(secondPayment.providerOrderId).toBe(`c${"1".repeat(24)}`);
    expect(secondPayment.providerOrderId).not.toBe(secondPayment.id);
    expect(secondPayment.providerOrderId).not.toBe(secondPayment.idempotencyKey);
    expect(providerOrderEntropy.calls).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("keeps initiation blocked before Q004 commit, then creates a fresh identity while accepting the same FGKey", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = fakeProvider({ kind: "ready" }, calls, PaymentProvider.EXIMBAY);
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.r11a-retry",
    };
    providerOrderEntropy.chunks.push(entropyChunk(5), entropyChunk(6));
    const first = await initiatePaymentAttemptForTest(db, input);
    const firstPayment = await db.payment.findUniqueOrThrow({ where: { id: first.paymentId } });
    let resolveQ004!: (response: Response) => void;
    const q004Response = new Promise<Response>((resolve) => { resolveQ004 = resolve; });
    const recovery = recoverEximbayCheckout(db, {
      checkoutSessionId: session.sessionId,
      paymentId: first.paymentId,
      authenticatedUserId: ctx.userId,
      env: {
        [EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED]: "ENABLED",
        EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
        EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
      },
      transport: vi.fn<EximbayBf4Fetch>(() => q004Response),
    });

    const beforeRelease = await initiatePaymentAttemptForTest(db, input);
    expect(beforeRelease.paymentId).toBe(first.paymentId);
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(1);

    resolveQ004(new Response(JSON.stringify({ rescode: "Q004", resmsg: "not observed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(recovery).resolves.toMatchObject({ kind: "released", paymentId: first.paymentId });

    const second = await initiatePaymentAttemptForTest(db, input);
    const secondPayment = await db.payment.findUniqueOrThrow({ where: { id: second.paymentId } });
    expect(second.paymentId).not.toBe(first.paymentId);
    expect(firstPayment.providerOrderId).toBe(`c${"5".repeat(24)}`);
    expect(secondPayment.providerOrderId).toBe(`c${"6".repeat(24)}`);
    expect(secondPayment.providerOrderId).not.toBe(firstPayment.providerOrderId);
    expect(first.initiateResult).toMatchObject({ kind: "ready" });
    expect(second.initiateResult).toMatchObject({ kind: "ready" });

    const replay = await recoverEximbayCheckout(db, {
      checkoutSessionId: session.sessionId,
      paymentId: first.paymentId,
      authenticatedUserId: ctx.userId,
      env: {
        [EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED]: "ENABLED",
        EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
        EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
      },
      transport: vi.fn<EximbayBf4Fetch>(),
    });
    expect(replay).toMatchObject({ kind: "replayed", paymentId: first.paymentId });
    await expect(db.payment.findUniqueOrThrow({ where: { id: second.paymentId } }))
      .resolves.toMatchObject({ blockingEndedAt: null, providerOrderId: secondPayment.providerOrderId });
  });

  it("deterministically converges simultaneous compatible EXIMBAY starts under the session row lock", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = fakeProvider({ kind: "ready" }, calls, PaymentProvider.EXIMBAY);
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.concurrent-compatible",
    };
    const beforeFirstAuthorizationCommit = coordinationBarrier();
    const observer = await openSessionLockObserver("eximbay-compatible");
    providerOrderEntropy.chunks.push(entropyChunk(7));
    let released = false;
    try {
      const first = initiatePaymentAttemptForTest(
        db,
        input,
        coordinationAt("BEFORE_AUTHORIZATION_COMMIT", beforeFirstAuthorizationCommit),
      );
      await beforeFirstAuthorizationCommit.reached;
      const second = initiatePaymentAttemptForTest(db, input);
      const waiting = await waitForSessionLockWait(observer);

      expect(waiting.state).toBe("active");
      expect(waiting.waitEventType).toBe("Lock");
      expect(waiting.blockingPids.length).toBeGreaterThan(0);
      expect(providerOrderEntropy.calls).toBe(1);
      beforeFirstAuthorizationCommit.release();
      released = true;

      const [firstResult, secondResult] = await Promise.all([first, second]);
      const [firstObservation, secondObservation] = await Promise.all([
        db.payment.findUniqueOrThrow({
          where: { id: firstResult.paymentId },
          select: { providerOrderId: true },
        }),
        db.payment.findUniqueOrThrow({
          where: { id: secondResult.paymentId },
          select: { providerOrderId: true },
        }),
      ]);
      const rows = await db.payment.findMany({
        where: { checkoutSessionId: session.sessionId },
        select: {
          id: true,
          providerOrderId: true,
          attemptLifecycle: true,
          blockingEndedAt: true,
        },
      });

      expect(firstResult.paymentId).toBe(secondResult.paymentId);
      expect(firstObservation.providerOrderId).toBe(`c${"7".repeat(24)}`);
      expect(secondObservation.providerOrderId).toBe(firstObservation.providerOrderId);
      expect(rows).toEqual([{
        id: firstResult.paymentId,
        providerOrderId: firstObservation.providerOrderId,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        blockingEndedAt: null,
      }]);
      expect(providerOrderEntropy.calls).toBe(1);
      expect(calls).toHaveLength(1);
    } finally {
      if (!released) beforeFirstAuthorizationCommit.release();
      await observer.end();
    }
  });

  it("retires an uncontacted EXIMBAY identity with its superseded row and allocates a fresh one", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const firstCalls: PaymentInitiateInput[] = [];
    const replacementCalls: PaymentInitiateInput[] = [];
    const barrier = coordinationBarrier();
    providerOrderEntropy.chunks.push(entropyChunk(2), entropyChunk(3));
    const firstPending = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, firstCalls, PaymentProvider.EXIMBAY),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.superseded-old",
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", barrier));

    await barrier.reached;
    const oldPayment = await onlyPayment(session.sessionId);
    const replacement = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, replacementCalls, PaymentProvider.EXIMBAY),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.superseded-new",
    });
    barrier.release();

    await expect(firstPending).rejects.toMatchObject({ code: "ATTEMPT_STATE_CONFLICT" });
    const rows = await db.payment.findMany({
      where: { checkoutSessionId: session.sessionId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === oldPayment.id)).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      providerOrderId: `c${"2".repeat(24)}`,
    });
    expect(rows.find((row) => row.id === replacement.paymentId)).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      providerOrderId: `c${"3".repeat(24)}`,
    });
    expect(providerOrderEntropy.calls).toBe(2);
    expect(firstCalls).toHaveLength(0);
    expect(replacementCalls).toHaveLength(1);
  });

  it("fails a duplicate EXIMBAY providerOrderId closed without regeneration or contact authority", async () => {
    const firstSession = await submitUsSessionWithOneLine(ctx);
    const secondSession = await submitUsSessionWithOneLine(ctx);
    const firstCalls: PaymentInitiateInput[] = [];
    const secondCalls: PaymentInitiateInput[] = [];
    providerOrderEntropy.chunks.push(entropyChunk(4), entropyChunk(4));

    await initiatePaymentAttemptForTest(db, {
      sessionId: firstSession.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, firstCalls, PaymentProvider.EXIMBAY),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.collision-first",
    });
    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: secondSession.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, secondCalls, PaymentProvider.EXIMBAY),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.eximbay.collision-second",
    })).rejects.toMatchObject({ code: "P2002" });

    expect(providerOrderEntropy.calls).toBe(2);
    expect(firstCalls).toHaveLength(1);
    expect(secondCalls).toHaveLength(0);
    await expect(db.payment.count({ where: { checkoutSessionId: secondSession.sessionId } }))
      .resolves.toBe(0);
  });

  it("forces a concurrent two-session EXIMBAY collision through the provider-order unique index", async () => {
    const firstSession = await submitUsSessionWithOneLine(ctx);
    await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
    const secondSession = await submitJpSessionWithOneLine(ctx);
    const firstCalls: PaymentInitiateInput[] = [];
    const secondCalls: PaymentInitiateInput[] = [];
    const sharedProviderOrderId = `c${"8".repeat(24)}`;
    const beforeFirstAuthorizationCommit = coordinationBarrier();
    const observer = await openSessionLockObserver("eximbay-provider-order-collision");
    providerOrderEntropy.chunks.push(entropyChunk(8), entropyChunk(8));
    let released = false;
    try {
      const first = initiatePaymentAttemptForTest(db, {
        sessionId: firstSession.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, firstCalls, PaymentProvider.EXIMBAY),
        mode: PaymentMode.SANDBOX,
        routingRuleId: "test.eximbay.concurrent-collision-first",
      }, coordinationAt("BEFORE_AUTHORIZATION_COMMIT", beforeFirstAuthorizationCommit));
      await beforeFirstAuthorizationCommit.reached;
      const secondOutcome = initiatePaymentAttemptForTest(db, {
        sessionId: secondSession.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, secondCalls, PaymentProvider.EXIMBAY),
        mode: PaymentMode.SANDBOX,
        routingRuleId: "test.eximbay.concurrent-collision-second",
      }).then(
        (value) => ({ kind: "fulfilled" as const, value }),
        (error: unknown) => ({ kind: "rejected" as const, error }),
      );
      const waiting = await waitForPaymentInsertLockWait(observer);

      expect(waiting.state).toBe("active");
      expect(waiting.waitEventType).toBe("Lock");
      expect(waiting.blockingPids.length).toBeGreaterThan(0);
      expect(waiting.query).toContain("Payment");
      expect(providerOrderEntropy.calls).toBe(2);
      beforeFirstAuthorizationCommit.release();
      released = true;

      const [firstResult, secondResult] = await Promise.all([first, secondOutcome]);
      const collisionRows = await db.payment.findMany({
        where: { provider: PaymentProvider.EXIMBAY, providerOrderId: sharedProviderOrderId },
        select: {
          id: true,
          checkoutSessionId: true,
          attemptLifecycle: true,
          contactStartedAt: true,
        },
      });

      expect(secondResult).toMatchObject({ kind: "rejected", error: { code: "P2002" } });
      expect(collisionRows).toHaveLength(1);
      expect(collisionRows[0]).toMatchObject({
        id: firstResult.paymentId,
        checkoutSessionId: firstSession.sessionId,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      });
      expect(collisionRows[0]?.contactStartedAt).toBeInstanceOf(Date);
      await expect(db.payment.count({
        where: { checkoutSessionId: secondSession.sessionId },
      })).resolves.toBe(0);
      expect(providerOrderEntropy.calls).toBe(2);
      expect(firstCalls).toHaveLength(1);
      expect(secondCalls).toHaveLength(0);
    } finally {
      if (!released) beforeFirstAuthorizationCommit.release();
      await observer.end();
    }
  });

  it("does not reinterpret an unrelated unique violation as provider-order collision authority", async () => {
    const firstSession = await submitUsSessionWithOneLine(ctx);
    const secondSession = await submitUsSessionWithOneLine(ctx);
    const routingRuleId = "test.eximbay.unrelated-unique";
    const firstCalls: PaymentInitiateInput[] = [];
    const secondCalls: PaymentInitiateInput[] = [];
    providerOrderEntropy.chunks.push(entropyChunk(5), entropyChunk(6));
    await db.$executeRaw(Prisma.sql`
      CREATE UNIQUE INDEX "Payment_ex2b1_unrelated_routing_rule_test_key"
      ON "Payment" ("routingRuleId")
      WHERE "routingRuleId" = 'test.eximbay.unrelated-unique'
    `);
    try {
      await initiatePaymentAttemptForTest(db, {
        sessionId: firstSession.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, firstCalls, PaymentProvider.EXIMBAY),
        mode: PaymentMode.SANDBOX,
        routingRuleId,
      });
      await expect(initiatePaymentAttemptForTest(db, {
        sessionId: secondSession.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, secondCalls, PaymentProvider.EXIMBAY),
        mode: PaymentMode.SANDBOX,
        routingRuleId,
      })).rejects.toMatchObject({ code: "P2002" });

      expect(providerOrderEntropy.calls).toBe(2);
      expect(firstCalls).toHaveLength(1);
      expect(secondCalls).toHaveLength(0);
      await expect(db.payment.count({ where: { checkoutSessionId: secondSession.sessionId } }))
        .resolves.toBe(0);
    } finally {
      await db.$executeRaw(Prisma.sql`
        DROP INDEX IF EXISTS "Payment_ex2b1_unrelated_routing_rule_test_key"
      `);
    }
  });

  it("records OUTCOME_UNKNOWN after provider contact failure and blocks every recontact", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = failingProvider(calls);

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    })).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    })).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.other",
    })).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    const payment = await onlyPayment(session.sessionId);
    expect(payment.status).toBe(PaymentAttemptStatus.INITIATED);
    expect(payment.attemptLifecycle).toBe(PaymentAttemptLifecycle.OUTCOME_UNKNOWN);
    expect(payment.providerRef).toBeNull();
    expect(payment.providerPaymentKey).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("preserves the baseline generic contact claim when non-commerce identity fields drift", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const authorized = coordinationBarrier();
    const pending = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.generic.baseline-claim",
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", authorized));
    await authorized.reached;
    const payment = await onlyPayment(session.sessionId);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        provider: PaymentProvider.PAYPAL,
        mode: PaymentMode.LIVE,
        routingRuleId: "test.generic.drifted-after-authorization",
      },
    });
    authorized.release();

    await expect(pending).resolves.toMatchObject({ initiateResult: { kind: "ready" } });
    expect(calls).toHaveLength(1);
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      provider: PaymentProvider.PAYPAL,
      mode: PaymentMode.LIVE,
      providerOrderId: null,
      routingRuleId: "test.generic.drifted-after-authorization",
    });
  });

  it("preserves baseline generic OUTCOME_UNKNOWN semantics when output appears before failure handling", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider: PaymentInitiationProvider = {
      code: PaymentProvider.TOSS,
      adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
      initiate: async (input) => {
        calls.push(input);
        await db.payment.update({
          where: { id: input.paymentId },
          data: {
            initiationOutputKind: PaymentInitiationOutputKind.READY,
            initiationCompletedAt: new Date(),
          },
        });
        throw new Error("synthetic generic post-output failure");
      },
    };

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.generic.baseline-outcome-unknown",
    })).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    expect(calls).toHaveLength(1);
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
    });
  });

  it("final capture sets providerPaymentKey while preserving providerRef", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const providerRef = `pref_capture_${randomUUID()}`;
    await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    });
    const facts = captureFacts(session);

    const result = await completeFromCapture(db, facts);
    const payment = await onlyPayment(session.sessionId);

    expect(result.kind).toBe("completed");
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      providerRef,
      providerPaymentKey: facts.providerPaymentKey,
    });
  });

  it("reuses one active attempt for simultaneous compatible starts", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = fakeProvider(
      { kind: "redirect", approveUrl: "https://fake.example/approve", providerRef: "same-ref" },
      calls,
    );
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    };

    const [first, second] = await Promise.all([
      initiatePaymentAttemptForTest(db, input),
      initiatePaymentAttemptForTest(db, input),
    ]);

    expect(first.paymentId).toBe(second.paymentId);
    expect(calls).toHaveLength(1);
    expect([first.initiateResult.kind, second.initiateResult.kind]).toContain("redirect");
    await expect(db.payment.count({
      where: {
        checkoutSessionId: session.sessionId,
        status: { in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.AWAITING] },
      },
    })).resolves.toBe(1);
  });

  it("reclaims the same uncontacted CONTACT_AUTHORIZED row and preserves its idempotency identity", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const authorized = await createUncontactedAuthorizedPayment(session, "test.route.reclaim");
    const calls: PaymentInitiateInput[] = [];

    const result = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.reclaim",
    });

    expect(result.paymentId).toBe(authorized.paymentId);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.idempotencyKey).toBe(authorized.idempotencyKey);
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(1);
  });

  it.each([
    [PaymentAdapterExecutionKind.MOCK, PaymentAdapterExecutionKind.EXTERNAL],
    [PaymentAdapterExecutionKind.EXTERNAL, PaymentAdapterExecutionKind.MOCK],
  ])(
    "supersedes an uncontacted %s attempt before authorizing %s",
    async (persistedKind, currentKind) => {
      const session = await submitSessionWithOneLine(ctx);
      const old = await createUncontactedAuthorizedPayment(
        session,
        "test.route.adapter-drift",
        new Date(),
        persistedKind,
      );
      const calls: PaymentInitiateInput[] = [];

      const result = await initiatePaymentAttemptForTest(db, {
        sessionId: session.sessionId,
        userId: ctx.userId,
        provider: fakeProvider(
          { kind: "ready" },
          calls,
          PaymentProvider.TOSS,
          currentKind,
        ),
        mode: PaymentMode.SANDBOX,
        routingRuleId: "test.route.adapter-drift",
      });

      expect(result.paymentId).not.toBe(old.paymentId);
      expect(calls).toHaveLength(1);
      await expect(db.payment.findUniqueOrThrow({ where: { id: old.paymentId } }))
        .resolves.toMatchObject({
          adapterExecutionKind: persistedKind,
          attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        });
      await expect(db.payment.findUniqueOrThrow({ where: { id: result.paymentId } }))
        .resolves.toMatchObject({
          adapterExecutionKind: currentKind,
          attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        });
    },
  );

  it("C2I expiry-first closes the exact auditor race before provider contact", async () => {
    const session = await moveSessionExpiryIntoPast(await submitSessionWithOneLine(ctx));
    const authorizationNow = new Date(session.expiresAt.getTime() - 2);
    const sweepNow = new Date(session.expiresAt.getTime() + 1);
    const contactBoundaryNow = new Date(session.expiresAt.getTime() + 2);
    const authorizationCommitted = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const initiation = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef: "must-not-persist" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2i.expiry-first",
      now: authorizationNow,
      contactBoundaryNow,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", authorizationCommitted));
    await authorizationCommitted.reached;

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(1);
    authorizationCommitted.release();

    await expect(initiation).rejects.toMatchObject({ code: "SESSION_NOT_USABLE" });
    expect(calls).toHaveLength(0);
    const payment = await onlyPayment(session.sessionId);
    expect(payment).toMatchObject({
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      remediationStatus: PaymentRemediationStatus.NONE,
      blockingEndedAt: contactBoundaryNow,
      contactStartedAt: null,
      providerRef: null,
      providerPaymentKey: null,
      initiationOutputKind: null,
      errorCode: "CHECKOUT_SESSION_NOT_USABLE",
    });
    await expect(db.checkoutSession.findUnique({
      where: { id: session.sessionId },
      select: { status: true },
    })).resolves.toEqual({ status: CheckoutSessionStatus.EXPIRED });
    await expectNoRejectedPaymentSideEffects(session.sessionId);
  });

  it("C2I contact-first prevents later expiry from overtaking CONTACTED and completes once", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const authorizationNow = new Date(session.expiresAt.getTime() - 2);
    const contactBoundaryNow = new Date(session.expiresAt.getTime() - 1);
    const sweepNow = new Date(session.expiresAt.getTime() + 1);
    const receivedAt = new Date(sweepNow.getTime() + 1);
    const authorizationCommitted = coordinationBarrier();
    const contactClaimCommitted = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef: "c2i-contacted" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2i.contact-first",
      now: authorizationNow,
      contactBoundaryNow,
    };
    const initiation = initiatePaymentAttemptForTest(db, input, coordinationAtMany([
      { point: "AFTER_AUTHORIZATION_COMMIT", barrier: authorizationCommitted },
      { point: "AFTER_CONTACT_CLAIM_COMMIT", barrier: contactClaimCommitted },
    ]));
    await authorizationCommitted.reached;

    authorizationCommitted.release();
    await contactClaimCommitted.reached;
    expect(calls).toHaveLength(0);

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(0);
    await expect(db.checkoutSession.findUnique({
      where: { id: session.sessionId },
      select: { status: true },
    })).resolves.toEqual({ status: CheckoutSessionStatus.SUBMITTED });
    contactClaimCommitted.release();
    const initiated = await initiation;

    expect(calls).toHaveLength(1);
    expect(calls[0]?.paymentId).toBe(initiated.paymentId);
    await expect(initiatePaymentAttemptForTest(db, input)).resolves.toMatchObject({
      paymentId: initiated.paymentId,
      initiateResult: { kind: "ready", providerRef: "c2i-contacted" },
    });
    expect(calls).toHaveLength(1);
    const paymentBeforeCapture = await onlyPayment(session.sessionId);
    expect(paymentBeforeCapture).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      contactIntentAt: authorizationNow,
      contactStartedAt: contactBoundaryNow,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      providerRef: "c2i-contacted",
      blockingEndedAt: null,
    });

    await expect(completeFromCapture(db, {
      ...captureFacts(session),
      paymentId: initiated.paymentId,
      capturedAt: contactBoundaryNow,
      receivedAt,
    })).resolves.toMatchObject({ kind: "completed", paymentId: initiated.paymentId });
    await expect(db.checkoutSession.findUnique({
      where: { id: session.sessionId },
      select: { status: true },
    })).resolves.toEqual({ status: CheckoutSessionStatus.COMPLETED });
    await expect(db.order.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(1);
    await expect(db.manufacturingRequest.count({
      where: { orderItem: { order: { checkoutSessionId: session.sessionId } } },
    })).resolves.toBe(1);
  });

  it("C2J CONTACTED commit while expiry waits is observed by the fresh post-lock read", async () => {
    const session = await moveSessionExpiryIntoPast(await submitSessionWithOneLine(ctx));
    const authorizationNow = new Date(session.expiresAt.getTime() - 2);
    const contactBoundaryNow = new Date(session.expiresAt.getTime() - 1);
    const beforeContactCommit = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef: "c2j-contacted" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2j.contacted-lock-wait",
      now: authorizationNow,
      contactBoundaryNow,
    };
    const observer = await openSessionLockObserver("contacted");
    let released = false;

    try {
      const initiation = initiatePaymentAttemptForTest(
        db,
        input,
        coordinationAt("BEFORE_CONTACT_CLAIM_COMMIT", beforeContactCommit),
      );
      await beforeContactCommit.reached;
      const expiry = expireStale(db, { now: new Date(), limit: 10 });
      const waiting = await waitForSessionLockWait(observer);

      expect(waiting.state).toBe("active");
      expect(waiting.waitEventType).toBe("Lock");
      expect(waiting.blockingPids.length).toBeGreaterThan(0);
      beforeContactCommit.release();
      released = true;

      const [initiated, expiryCount] = await Promise.all([initiation, expiry]);
      expect(expiryCount).toBe(0);
      expect(calls).toHaveLength(1);
      await expect(db.checkoutSession.findUnique({
        where: { id: session.sessionId },
        select: { status: true },
      })).resolves.toEqual({ status: CheckoutSessionStatus.SUBMITTED });
      await expect(db.payment.findUnique({
        where: { id: initiated.paymentId },
        select: {
          status: true,
          attemptLifecycle: true,
          contactStartedAt: true,
          initiationOutputKind: true,
          providerRef: true,
          blockingEndedAt: true,
        },
      })).resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        contactStartedAt: contactBoundaryNow,
        initiationOutputKind: PaymentInitiationOutputKind.READY,
        providerRef: "c2j-contacted",
        blockingEndedAt: null,
      });
      await expect(initiatePaymentAttemptForTest(db, input)).resolves.toMatchObject({
        paymentId: initiated.paymentId,
        initiateResult: { kind: "ready", providerRef: "c2j-contacted" },
      });
      expect(calls).toHaveLength(1);
    } finally {
      if (!released) beforeContactCommit.release();
      await observer.end();
    }
  });

  it("C2I compatible reclaim then expiry closes the reclaimed authority without recontact", async () => {
    const session = await moveSessionExpiryIntoPast(await submitSessionWithOneLine(ctx));
    const authorizationNow = new Date(session.expiresAt.getTime() - 2);
    const contactBoundaryNow = new Date(session.expiresAt.getTime() + 1);
    const authorized = await createUncontactedAuthorizedPayment(
      session,
      "test.c2i.compatible-reclaim",
      new Date(authorizationNow.getTime() - 1),
    );
    const authorizationCommitted = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const initiation = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2i.compatible-reclaim",
      now: authorizationNow,
      contactBoundaryNow,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", authorizationCommitted));
    await authorizationCommitted.reached;

    await expect(expireStale(db, {
      now: contactBoundaryNow,
      limit: 10,
    })).resolves.toBe(1);
    authorizationCommitted.release();

    await expect(initiation).rejects.toMatchObject({ code: "SESSION_NOT_USABLE" });
    expect(calls).toHaveLength(0);
    await expect(db.payment.findUnique({ where: { id: authorized.paymentId } })).resolves.toMatchObject({
      id: authorized.paymentId,
      idempotencyKey: authorized.idempotencyKey,
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      blockingEndedAt: contactBoundaryNow,
      contactStartedAt: null,
    });
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(1);
    await expectNoRejectedPaymentSideEffects(session.sessionId);
  });

  it("C2I incompatible supersession then expiry closes only the new authorization", async () => {
    const session = await moveSessionExpiryIntoPast(await submitSessionWithOneLine(ctx));
    const oldAuthorizedAt = new Date(session.expiresAt.getTime() - 4);
    const newAuthorizedAt = new Date(session.expiresAt.getTime() - 2);
    const contactBoundaryNow = new Date(session.expiresAt.getTime() + 1);
    const old = await createUncontactedAuthorizedPayment(
      session,
      "test.c2i.old-route",
      oldAuthorizedAt,
    );
    const authorizationCommitted = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const initiation = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2i.new-route",
      now: newAuthorizedAt,
      contactBoundaryNow,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", authorizationCommitted));
    await authorizationCommitted.reached;
    const replacementId = await paymentIdForRoutingRule(session.sessionId, "test.c2i.new-route");

    await expect(expireStale(db, {
      now: contactBoundaryNow,
      limit: 10,
    })).resolves.toBe(1);
    authorizationCommitted.release();

    await expect(initiation).rejects.toMatchObject({ code: "SESSION_NOT_USABLE" });
    expect(calls).toHaveLength(0);
    await expect(db.payment.findUnique({ where: { id: old.paymentId } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      contactStartedAt: null,
      blockingEndedAt: newAuthorizedAt,
    });
    await expect(db.payment.findUnique({ where: { id: replacementId } })).resolves.toMatchObject({
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      contactStartedAt: null,
      blockingEndedAt: contactBoundaryNow,
      errorCode: "CHECKOUT_SESSION_NOT_USABLE",
    });
    await expect(openContactOwners(session.sessionId)).resolves.toEqual([]);
    await expectNoRejectedPaymentSideEffects(session.sessionId);
  });

  it("C2I already-EXPIRED session rejects before creating provider authority", async () => {
    const session = await moveSessionExpiryIntoPast(await submitSessionWithOneLine(ctx));
    await expect(expireStale(db, {
      now: new Date(session.expiresAt.getTime() + 1),
      limit: 10,
    })).resolves.toBe(1);
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.c2i.already-expired",
      now: new Date(session.expiresAt.getTime() - 1),
      contactBoundaryNow: session.expiresAt,
    })).rejects.toMatchObject({ code: "SESSION_NOT_USABLE" });

    expect(calls).toHaveLength(0);
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
    await expectNoRejectedPaymentSideEffects(session.sessionId);
  });

  it("captures contact time after claim revalidation and before the final usability decision and write", () => {
    const source = readFileSync(new URL("../initiate.ts", import.meta.url), "utf8");
    const start = source.indexOf("async function markContactStarted(");
    const end = source.indexOf("\nfunction contactClaimWhere(", start);
    const claimSource = source.slice(start, end);

    expect(claimSource.indexOf("await validateCommerceAtContactBoundary(tx, session)")).toBeLessThan(
      claimSource.indexOf("const contactBoundaryNow = await captureContactBoundaryTime"),
    );
    expect(claimSource.indexOf("await assertEximbayPreparedFactsStillCurrent")).toBeLessThan(
      claimSource.indexOf("const contactBoundaryNow = await captureContactBoundaryTime"),
    );
    expect(claimSource.indexOf("const contactBoundaryNow = await captureContactBoundaryTime")).toBeLessThan(
      claimSource.indexOf("if (!isUsable(session, contactBoundaryNow))"),
    );
    expect(claimSource.indexOf("if (!isUsable(session, contactBoundaryNow))")).toBeLessThan(
      claimSource.indexOf("attemptLifecycle: PaymentAttemptLifecycle.CONTACTED"),
    );
  });

  it("C2I exact expiresAt boundary rejects with the late freshly captured contact time", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const authorizationNow = new Date(session.expiresAt.getTime() - 1);
    const contactBoundaryClock = vi.fn(() => new Date(session.expiresAt));
    const calls: PaymentInitiateInput[] = [];
    const routingRuleId = "test.c2i.exact-boundary";
    const provider = fakeProvider({ kind: "ready" }, calls);
    initiationProviders.set(routingRuleId, provider);

    await expect(initiatePaymentAttempt(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      adapterContext: testAdapterContext({
        sessionId: session.sessionId,
        userId: ctx.userId,
        provider,
        mode: PaymentMode.SANDBOX,
        routingRuleId,
      }),
      now: authorizationNow,
      contactBoundaryClock,
    })).rejects.toMatchObject({ code: "SESSION_NOT_USABLE" });

    expect(contactBoundaryClock).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      blockingEndedAt: session.expiresAt,
      contactStartedAt: null,
    });
    await expectNoRejectedPaymentSideEffects(session.sessionId);
  });

  it("persists an output-less CONTACTED state as IN_PROGRESS and never recontacts it", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const provider = fakeProvider({ kind: "inProgress" }, calls);
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.in-progress",
    };

    const first = await initiatePaymentAttemptForTest(db, input);
    const second = await initiatePaymentAttemptForTest(db, input);

    expect(first).toMatchObject({ paymentId: second.paymentId, initiateResult: { kind: "inProgress" } });
    expect(second.initiateResult).toEqual({ kind: "inProgress" });
    expect(calls).toHaveLength(1);
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: null,
    });
  });

  it("blocks initiation for session-wide remediation exposure without changing contact authority", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const blocker = await createUncontactedAuthorizedPayment(session, "test.route.blocker");
    await db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        amount: session.totalAmount,
        currency: session.currency,
        providerPaymentKey: `exposed_${randomUUID()}`,
        idempotencyKey: `exposed:${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        financialSucceededAt: new Date(),
        blockingEndedAt: new Date(),
        suspendedByPaymentId: blocker.paymentId,
      },
    });
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.new",
    })).rejects.toMatchObject({ code: "SESSION_REMEDIATION_REQUIRED" });

    expect(calls).toHaveLength(0);
    await expect(db.payment.findUnique({
      where: { id: blocker.paymentId },
      select: { attemptLifecycle: true, contactStartedAt: true, blockingEndedAt: true },
    })).resolves.toEqual({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      contactStartedAt: null,
      blockingEndedAt: null,
    });
  });

  it("fails closed on a same-session suspension cycle without creating or contacting a payment", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const cycleA = await createOrdinarySupersededPayment(session, "cycle-a");
    const cycleB = await createOrdinarySupersededPayment(session, "cycle-b");
    await db.$executeRaw(Prisma.sql`
      UPDATE "Payment"
      SET "attemptLifecycle" = 'SUSPENDED',
          "suspendedByPaymentId" = CASE "id"
            WHEN ${cycleA.id} THEN ${cycleB.id}
            WHEN ${cycleB.id} THEN ${cycleA.id}
          END
      WHERE "id" IN (${cycleA.id}, ${cycleB.id})
    `);
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.cycle",
    })).rejects.toMatchObject({ code: "SESSION_REMEDIATION_REQUIRED" });

    expect(calls).toHaveLength(0);
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(2);
  });

  it("database invariant rejects a second active attempt even outside the service", async () => {
    const session = await submitSessionWithOneLine(ctx);
    await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.kr.card.toss",
    });

    await expect(db.payment.create({
      data: {
        checkoutSessionId: session.sessionId,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        routingRuleId: "test.raw.second",
        status: PaymentAttemptStatus.AWAITING,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        amount: session.totalAmount,
        currency: session.currency,
        idempotencyKey: `raw_second_${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("atomically supersedes an incompatible route and preserves audit evidence", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const provider = fakeProvider({ kind: "ready", providerRef: "route-ref" });
    const first = await createUncontactedAuthorizedPayment(session, "test.route.first");
    const second = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.second",
    });

    expect(second.paymentId).not.toBe(first.paymentId);
    const attempts = await db.payment.findMany({
      where: { checkoutSessionId: session.sessionId },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, attemptLifecycle: true, routingRuleId: true, supersededAt: true, errorCode: true },
    });
    expect(attempts[0]?.supersededAt).toBeInstanceOf(Date);
    expect(attempts).toEqual([
      expect.objectContaining({
        id: first.paymentId,
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        routingRuleId: "test.route.first",
        supersededAt: attempts[0]?.supersededAt,
        errorCode: "PAYMENT_ATTEMPT_SUPERSEDED",
      }),
      expect.objectContaining({
        id: second.paymentId,
        status: PaymentAttemptStatus.INITIATED,
        routingRuleId: "test.route.second",
        supersededAt: null,
      }),
    ]);
  });

  it("Schedule A/C deterministically commits compatible contact before incompatible supersession", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const contactAuthorizedAt = new Date();
    const compatibleAuthorizationAt = new Date(contactAuthorizedAt.getTime() + 1);
    const compatibleContactAt = new Date(contactAuthorizedAt.getTime() + 2);
    const incompatibleAttemptAt = new Date(contactAuthorizedAt.getTime() + 3);
    const initial = await createUncontactedAuthorizedPayment(
      session,
      "test.route.compatible",
      contactAuthorizedAt,
    );
    const calls: PaymentInitiateInput[] = [];
    const providerContact = coordinationBarrier();
    const compatibleAuthorized = coordinationBarrier();
    const incompatibleBeforeLock = coordinationBarrier();
    const provider = barrierProvider(calls, providerContact);

    const compatible = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.compatible",
      now: compatibleAuthorizationAt,
      contactBoundaryNow: compatibleContactAt,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", compatibleAuthorized));
    await compatibleAuthorized.reached;

    const incompatible = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.incompatible",
      now: incompatibleAttemptAt,
    }, coordinationAt("BEFORE_AUTHORIZATION_LOCK", incompatibleBeforeLock));
    await incompatibleBeforeLock.reached;

    compatibleAuthorized.release();
    await providerContact.reached;
    incompatibleBeforeLock.release();
    const supersession = await incompatible.then(
      () => ({ kind: "fulfilled" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    providerContact.release();
    const contacted = await compatible;

    expect(contacted.paymentId).toBe(initial.paymentId);
    expect(supersession).toMatchObject({ kind: "rejected", error: { code: "ATTEMPT_STATE_CONFLICT" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.paymentId).toBe(initial.paymentId);
    const rows = await paymentRaceRows(session.sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: initial.paymentId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
    });
    expect(rows[0]?.contactIntentAt).toEqual(contactAuthorizedAt);
    expect(rows[0]?.contactStartedAt).toEqual(compatibleContactAt);
    await expect(openContactOwners(session.sessionId)).resolves.toEqual([initial.paymentId]);
    await expectNoCommerceWrites(session.sessionId);
  });

  it("Schedule B/C deterministically commits incompatible supersession before the old contact CAS", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const contactAuthorizedAt = new Date();
    const oldAuthorizationAt = new Date(contactAuthorizedAt.getTime() + 1);
    const oldContactAt = new Date(contactAuthorizedAt.getTime() + 2);
    const replacementAuthorizationAt = new Date(contactAuthorizedAt.getTime() + 3);
    const replacementContactAt = new Date(contactAuthorizedAt.getTime() + 4);
    const initial = await createUncontactedAuthorizedPayment(
      session,
      "test.route.compatible",
      contactAuthorizedAt,
    );
    const calls: PaymentInitiateInput[] = [];
    const oldAuthorized = coordinationBarrier();
    const replacementContact = coordinationBarrier();
    const provider = barrierProvider(calls, replacementContact);

    const oldContact = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.compatible",
      now: oldAuthorizationAt,
      contactBoundaryNow: oldContactAt,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", oldAuthorized));
    await oldAuthorized.reached;

    const replacement = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.incompatible",
      now: replacementAuthorizationAt,
      contactBoundaryNow: replacementContactAt,
    });
    await replacementContact.reached;
    oldAuthorized.release();
    const oldResult = await oldContact.then(
      () => ({ kind: "fulfilled" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    replacementContact.release();
    const replacementResult = await replacement;

    expect(oldResult).toMatchObject({ kind: "rejected", error: { code: "ATTEMPT_STATE_CONFLICT" } });
    expect(replacementResult.paymentId).not.toBe(initial.paymentId);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.paymentId).toBe(replacementResult.paymentId);
    const rows = await paymentRaceRows(session.sessionId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual([
      initial.paymentId,
      replacementResult.paymentId,
    ].sort());
    const superseded = rows.find((row) => row.id === initial.paymentId);
    const contacted = rows.find((row) => row.id === replacementResult.paymentId);
    expect(superseded).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      contactIntentAt: contactAuthorizedAt,
      contactStartedAt: null,
      blockingEndedAt: replacementAuthorizationAt,
    });
    expect(contacted).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      contactIntentAt: replacementAuthorizationAt,
      contactStartedAt: replacementContactAt,
      blockingEndedAt: null,
    });
    await expect(openContactOwners(session.sessionId)).resolves.toEqual([replacementResult.paymentId]);
    await expectNoCommerceWrites(session.sessionId);
  });

  it("Schedule D forces two incompatible requests to serialize under the CheckoutSession lock", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const contactAuthorizedAt = new Date();
    const firstAttemptAt = new Date(contactAuthorizedAt.getTime() + 1);
    const firstContactAt = new Date(contactAuthorizedAt.getTime() + 2);
    const secondAttemptAt = new Date(contactAuthorizedAt.getTime() + 3);
    const secondContactAt = new Date(contactAuthorizedAt.getTime() + 4);
    const initial = await createUncontactedAuthorizedPayment(
      session,
      "test.route.initial",
      contactAuthorizedAt,
    );
    const firstHasLock = coordinationBarrier();
    const firstCommitted = coordinationBarrier();
    const secondBeforeLock = coordinationBarrier();
    const providerContact = coordinationBarrier();
    const calls: PaymentInitiateInput[] = [];
    const provider = barrierProvider(calls, providerContact);

    const first = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.incompatible-b",
      now: firstAttemptAt,
      contactBoundaryNow: firstContactAt,
    }, coordinationAtMany([
      { point: "AFTER_AUTHORIZATION_LOCK", barrier: firstHasLock },
      { point: "AFTER_AUTHORIZATION_COMMIT", barrier: firstCommitted },
    ]));
    await firstHasLock.reached;

    const second = initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.incompatible-c",
      now: secondAttemptAt,
      contactBoundaryNow: secondContactAt,
    }, coordinationAt("BEFORE_AUTHORIZATION_LOCK", secondBeforeLock));
    await secondBeforeLock.reached;

    firstHasLock.release();
    await firstCommitted.reached;
    const firstPaymentId = await paymentIdForRoutingRule(
      session.sessionId,
      "test.route.incompatible-b",
    );
    secondBeforeLock.release();
    await providerContact.reached;
    firstCommitted.release();
    const firstResult = await first.then(
      () => ({ kind: "fulfilled" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    );
    providerContact.release();
    const secondResult = await second;
    const rows = await paymentRaceRows(session.sessionId);

    expect(firstResult).toMatchObject({ kind: "rejected", error: { code: "ATTEMPT_STATE_CONFLICT" } });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.id).sort()).toEqual([
      initial.paymentId,
      firstPaymentId,
      secondResult.paymentId,
    ].sort());
    const initialRow = rows.find((row) => row.id === initial.paymentId);
    const firstRow = rows.find((row) => row.id === firstPaymentId);
    const contactedRow = rows.find((row) => row.id === secondResult.paymentId);
    const supersededRows = rows.filter((row) => row.attemptLifecycle === PaymentAttemptLifecycle.SUPERSEDED);
    expect(initialRow).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      contactIntentAt: contactAuthorizedAt,
      contactStartedAt: null,
      blockingEndedAt: firstAttemptAt,
    });
    expect(firstRow).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      contactIntentAt: firstAttemptAt,
      contactStartedAt: null,
      blockingEndedAt: secondAttemptAt,
    });
    expect(supersededRows).toHaveLength(2);
    expect(supersededRows.every((row) => row.contactStartedAt === null)).toBe(true);
    expect(contactedRow).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      contactIntentAt: secondAttemptAt,
      contactStartedAt: secondContactAt,
      blockingEndedAt: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.paymentId).toBe(secondResult.paymentId);
    await expect(openContactOwners(session.sessionId)).resolves.toEqual([secondResult.paymentId]);
    await expectNoCommerceWrites(session.sessionId);
  });

  it("records late superseded success, blocks its replacement, and creates no order", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const provider = fakeProvider({ kind: "ready" });
    const oldAttempt = await createUncontactedAuthorizedPayment(session, "test.route.old");
    const currentAttempt = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.current",
    });
    const oldFacts = {
      ...captureFacts(session),
      paymentId: oldAttempt.paymentId,
      providerPaymentKey: `late_${randomUUID()}`,
    };

    const late = await completeFromCapture(db, oldFacts);
    const duplicateLate = await completeFromCapture(db, oldFacts);
    const current = await completeFromCapture(db, {
      ...captureFacts(session),
      paymentId: currentAttempt.paymentId,
    });

    expect(late).toMatchObject({ kind: "compensationEnqueued", failure: { code: "SUPERSEDED_ATTEMPT_CAPTURED" } });
    expect(duplicateLate).toMatchObject({ kind: "compensationEnqueued", failure: { code: "SUPERSEDED_ATTEMPT_CAPTURED" } });
    expect(current).toMatchObject({ kind: "compensationEnqueued", failure: { code: "PAYMENT_BLOCKED_BY_REMEDIATION" } });
    await expect(db.order.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
    await expect(db.manufacturingRequest.count({
      where: { orderItem: { order: { checkoutSessionId: session.sessionId } } },
    })).resolves.toBe(0);
    await expect(db.paymentOutbox.count({
      where: { dedupKey: `payment-remediation:${PaymentProvider.TOSS}:${oldFacts.providerPaymentKey}` },
    })).resolves.toBe(1);
    await expect(db.payment.findUnique({
      where: { id: oldAttempt.paymentId },
      select: {
        status: true,
        attemptLifecycle: true,
        remediationStatus: true,
        blockingEndedAt: true,
        suspendedByPaymentId: true,
      },
    })).resolves.toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      suspendedByPaymentId: currentAttempt.paymentId,
    });
    const replacement = await db.payment.findUnique({
      where: { id: currentAttempt.paymentId },
      select: { attemptLifecycle: true, suspendedByPaymentId: true, blockingEndedAt: true },
    });
    expect(replacement).toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      suspendedByPaymentId: null,
      blockingEndedAt: null,
    });
  });

  it("transfers the slot only when the current blocker is still uncontacted", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const old = await createUncontactedAuthorizedPayment(session, "test.route.defensive-old");
    await db.payment.update({
      where: { id: old.paymentId },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        supersededAt: new Date(),
        blockingEndedAt: new Date(),
      },
    });
    const current = await createUncontactedAuthorizedPayment(session, "test.route.defensive-current");
    const facts = {
      ...captureFacts(session),
      paymentId: old.paymentId,
      providerPaymentKey: `late_uncontacted_${randomUUID()}`,
    };

    const captured = await recordCapture(db, facts);
    const duplicate = await recordCapture(db, facts);

    expect(duplicate.id).toBe(captured.id);
    await expect(db.payment.findUnique({ where: { id: old.paymentId } })).resolves.toMatchObject({
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      blockingEndedAt: null,
    });
    await expect(db.payment.findUnique({ where: { id: current.paymentId } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      suspendedByPaymentId: old.paymentId,
    });
    await expect(db.order.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
  });

  it("keeps an OUTCOME_UNKNOWN blocker in the slot and suspends the defensive late-success row", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const old = await createUncontactedAuthorizedPayment(session, "test.route.unknown-old");
    await db.payment.update({
      where: { id: old.paymentId },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        supersededAt: new Date(),
        blockingEndedAt: new Date(),
      },
    });
    const current = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "inProgress" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.unknown-current",
    });
    await db.payment.update({
      where: { id: current.paymentId },
      data: { attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN },
    });

    await recordCapture(db, {
      ...captureFacts(session),
      paymentId: old.paymentId,
      providerPaymentKey: `late_unknown_${randomUUID()}`,
    });

    await expect(db.payment.findUnique({ where: { id: current.paymentId } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      blockingEndedAt: null,
    });
    await expect(db.payment.findUnique({ where: { id: old.paymentId } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      suspendedByPaymentId: current.paymentId,
    });
  });

  it("financial success awaiting finalization keeps the blocking slot", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const first = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.success",
    });
    await recordCaptureOnly(session, first.paymentId);
    const replacementCalls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, replacementCalls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.route.replacement",
    })).rejects.toMatchObject({ code: "ATTEMPT_STATE_CONFLICT" });
    expect(replacementCalls).toHaveLength(0);
  });

  it("stale ordinary commerce facts reject before provider contact", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const line = await db.checkoutSessionLine.findFirstOrThrow({
      where: { sessionId: session.sessionId },
      select: { variantId: true },
    });
    await db.variantMarketPrice.update({
      where: { variantId_marketCode: { variantId: line.variantId, marketCode: MarketCode.KR } },
      data: { amount: session.totalAmount + 1 },
    });
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.stale.price",
    })).rejects.toMatchObject({ code: "SESSION_TERMS_STALE" });

    expect(calls).toHaveLength(0);
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
  });

  it("rejects a disabled or currency-diverged Market before contact without payment residue", async () => {
    for (const data of [{ isActive: false }, { isActive: true, currency: "USD" }]) {
      const session = await submitSessionWithOneLine(ctx);
      await db.market.update({ where: { code: MarketCode.KR }, data });
      const calls: PaymentInitiateInput[] = [];

      await expect(initiatePaymentAttemptForTest(db, {
        sessionId: session.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, calls),
        mode: PaymentMode.SANDBOX,
        routingRuleId: "test.market.pre-contact",
      })).rejects.toMatchObject({ code: "SESSION_TERMS_STALE" });

      expect(calls).toHaveLength(0);
      await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
      await ensureMarkets();
    }
  });

  it("treats ordinary Market edits after persisted contact output as prospective", async () => {
    const session = await submitSessionWithOneLine(ctx);
    const calls: PaymentInitiateInput[] = [];
    const input = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready", providerRef: "persisted" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: "test.market.post-contact",
    };
    const first = await initiatePaymentAttemptForTest(db, input);
    await db.market.update({ where: { code: MarketCode.KR }, data: { isActive: false, currency: "USD" } });

    const second = await initiatePaymentAttemptForTest(db, input);

    expect(second).toMatchObject({ paymentId: first.paymentId, initiateResult: { kind: "ready", providerRef: "persisted" } });
    expect(calls).toHaveLength(1);
  });

  it("returns fresh Eximbay authority only after CONTACTED plus durable READY persistence", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.fresh");

    const execution = await initiatePaymentAttemptExecutionForTest(db, input);

    expect(execution.channel).toBe("FRESH_EXIMBAY_READY");
    if (execution.channel !== "FRESH_EXIMBAY_READY") throw new Error("Expected fresh authority");
    const persisted = await onlyPayment(session.sessionId);
    expect(persisted).toMatchObject({
      id: execution.durable.paymentId,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
    });
    expect(persisted.initiationCompletedAt?.getTime()).toBe(persisted.contactStartedAt?.getTime());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns durable-only on Eximbay READY re-entry without another fetch", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.ready-reentry");

    const first = await initiatePaymentAttemptExecutionForTest(db, input);
    const second = await initiatePaymentAttemptExecutionForTest(db, input);

    expect(first.channel).toBe("FRESH_EXIMBAY_READY");
    expect(second).toMatchObject({
      channel: "DURABLE_ONLY",
      durable: { initiateResult: { kind: "ready" } },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when compatible Eximbay reuse retains READY under OUTCOME_UNKNOWN", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const routingRuleId = "test.eximbay.transient.ready-outcome-unknown-reentry";
    const contactStartedAt = new Date();
    const existing = await createEximbayContactedPayment(session, routingRuleId, contactStartedAt);
    await db.payment.update({
      where: { id: existing.id },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        initiationOutputKind: PaymentInitiationOutputKind.READY,
        initiationCompletedAt: contactStartedAt,
      },
    });
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl, routingRuleId);

    await expect(initiatePaymentAttemptExecutionForTest(db, input))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });

    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(db.payment.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      initiationCompletedAt: contactStartedAt,
    });
  });

  it("fails a bounded observer closed when OUTCOME_UNKNOWN retains durable READY", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const routingRuleId = "test.eximbay.transient.ready-outcome-unknown-observer";
    const contactStartedAt = new Date();
    const existing = await createEximbayContactedPayment(session, routingRuleId, contactStartedAt);
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl, routingRuleId);
    const observerReads = vi.spyOn(db.payment, "findUnique");
    try {
      const contenderPending = initiatePaymentAttemptExecutionForTest(db, input);
      await vi.waitFor(() => expect(observerReads).toHaveBeenCalled());
      await db.payment.update({
        where: { id: existing.id },
        data: {
          attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
          initiationOutputKind: PaymentInitiationOutputKind.READY,
          initiationCompletedAt: contactStartedAt,
        },
      });

      await expect(contenderPending).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
      expect(fetchImpl).not.toHaveBeenCalled();
      await expect(db.payment.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        initiationOutputKind: PaymentInitiationOutputKind.READY,
      });
    } finally {
      observerReads.mockRestore();
    }
  });

  it("gives an active near-stale Eximbay contender a full observer-entry window", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchBarrier = coordinationBarrier();
    const fetchImpl = vi.fn(async () => {
      await fetchBarrier.wait();
      return syntheticReadyResponse();
    });
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.active-near-stale");
    const oldRemainingContactBudgetMs = 2_000;
    input.contactBoundaryNow = new Date(
      Date.now() - EXIMBAY_READY_TOTAL_DEADLINE_MS + oldRemainingContactBudgetMs,
    );
    const ownerPending = initiatePaymentAttemptExecutionForTest(db, input);
    await fetchBarrier.reached;
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      contactStartedAt: input.contactBoundaryNow,
      initiationOutputKind: null,
    });

    const findUnique = db.payment.findUnique.bind(db.payment);
    let observerReadCount = 0;
    let markThirdObserverRead: () => void = () => { throw new Error("Observer read signal was not initialized"); };
    const thirdObserverRead = new Promise<void>((resolve) => { markThirdObserverRead = resolve; });
    const observerReads = vi.spyOn(db.payment, "findUnique");
    observerReads.mockImplementation((args) => {
      const result = findUnique(args);
      void result.then(() => {
        observerReadCount += 1;
        if (observerReadCount === 3) markThirdObserverRead();
      });
      return result;
    });
    let monotonicReadCount = 0;
    const monotonicClock = vi.spyOn(performance, "now").mockImplementation(() => {
      monotonicReadCount += 1;
      return monotonicReadCount === 1 ? 0 : oldRemainingContactBudgetMs + 500;
    });
    let fetchReleased = false;
    try {
      const contenderPending = initiatePaymentAttemptExecutionForTest(db, input);
      await Promise.race([
        thirdObserverRead,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("Observer did not continue beyond the old remaining-age budget")), 2_000);
        }),
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      fetchBarrier.release();
      fetchReleased = true;

      const [owner, contender] = await Promise.all([ownerPending, contenderPending]);

      expect(owner.channel).toBe("FRESH_EXIMBAY_READY");
      expect(contender).toMatchObject({
        channel: "DURABLE_ONLY",
        durable: {
          paymentId: owner.durable.paymentId,
          initiateResult: { kind: "ready" },
        },
      });
      expect("freshAuthority" in contender).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      if (!fetchReleased) fetchBarrier.release();
      monotonicClock.mockRestore();
      observerReads.mockRestore();
    }
  });

  it("converges a contacted Eximbay contender to durable-only READY while preserving fresh owner authority", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchBarrier = coordinationBarrier();
    const fetchImpl = vi.fn(async () => {
      await fetchBarrier.wait();
      return syntheticReadyResponse();
    });
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.contacted-no-output");
    const ownerPending = initiatePaymentAttemptExecutionForTest(db, input);
    await fetchBarrier.reached;
    const observerReads = vi.spyOn(db.payment, "findUnique");
    let fetchReleased = false;
    try {
      const contenderPending = initiatePaymentAttemptExecutionForTest(db, input);
      await vi.waitFor(() => expect(observerReads).toHaveBeenCalled());
      fetchBarrier.release();
      fetchReleased = true;

      const [owner, contender] = await Promise.all([ownerPending, contenderPending]);

      expect(owner.channel).toBe("FRESH_EXIMBAY_READY");
      if (owner.channel !== "FRESH_EXIMBAY_READY") throw new Error("Expected fresh owner authority");
      expect(owner.freshAuthority).toBeDefined();
      expect(owner.durable.initiateResult.kind).toBe("ready");
      expect(contender).toMatchObject({
        channel: "DURABLE_ONLY",
        durable: {
          paymentId: owner.durable.paymentId,
          initiateResult: { kind: "ready" },
        },
      });
      expect("freshAuthority" in contender).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      if (!fetchReleased) fetchBarrier.release();
      observerReads.mockRestore();
    }
  });

  it("converges an observing Eximbay contender to OUTCOME_UNKNOWN without retry", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchBarrier = coordinationBarrier();
    const fetchImpl = vi.fn(async () => {
      await fetchBarrier.wait();
      return new Response(JSON.stringify({
        rescode: "9999",
        resmsg: "synthetic rejection",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.observed-outcome-unknown");
    const ownerPending = initiatePaymentAttemptExecutionForTest(db, input);
    await fetchBarrier.reached;
    const observerReads = vi.spyOn(db.payment, "findUnique");
    let fetchReleased = false;
    try {
      const contenderPending = initiatePaymentAttemptExecutionForTest(db, input);
      await vi.waitFor(() => expect(observerReads).toHaveBeenCalled());
      fetchBarrier.release();
      fetchReleased = true;

      await expect(ownerPending).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
      await expect(contenderPending).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        initiationOutputKind: null,
      });
    } finally {
      if (!fetchReleased) fetchBarrier.release();
      observerReads.mockRestore();
    }
  });

  it("returns stale Eximbay CONTACTED as inProgress promptly without a fresh observation budget", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const routingRuleId = "test.eximbay.transient.stale-contacted";
    const existing = await createEximbayContactedPayment(
      session,
      routingRuleId,
      new Date(Date.now() - EXIMBAY_READY_TOTAL_DEADLINE_MS - 1_000),
    );
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl, routingRuleId);
    const startedAt = performance.now();

    const execution = await initiatePaymentAttemptExecutionForTest(db, input);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(execution).toMatchObject({
      channel: "DURABLE_ONLY",
      durable: { paymentId: existing.id, initiateResult: { kind: "inProgress" } },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(db.payment.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(1);
  });

  it("returns no authority after OUTCOME_UNKNOWN and never fetches again", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      rescode: "9999",
      resmsg: "synthetic rejection",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.outcome-unknown");

    await expect(initiatePaymentAttemptExecutionForTest(db, input))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    await expect(initiatePaymentAttemptExecutionForTest(db, input))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not return authority when durable READY persistence fails and never refetches", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.persistence-failure");
    const update = vi.spyOn(db.payment, "updateMany");
    update.mockRejectedValueOnce(new Error("synthetic READY persistence failure"));

    await expect(initiatePaymentAttemptExecutionForTest(db, input))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    await expect(initiatePaymentAttemptExecutionForTest(db, input))
      .rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    update.mockRestore();
  });

  it("lets the legacy durable-only API discard authority without recovery or recontact", async () => {
    const session = await submitUsSessionWithOneLine(ctx);
    const fetchImpl = vi.fn(() => Promise.resolve(syntheticReadyResponse()));
    const input = transientEximbayInput(session.sessionId, ctx.userId, fetchImpl,
      "test.eximbay.transient.legacy-drop");

    const legacy = await initiatePaymentAttemptForTest(db, input);
    const reentry = await initiatePaymentAttemptExecutionForTest(db, input);

    expect(legacy.initiateResult).toEqual({ kind: "ready" });
    expect(reentry).toMatchObject({
      channel: "DURABLE_ONLY",
      durable: { paymentId: legacy.paymentId, initiateResult: { kind: "ready" } },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([PaymentProvider.MOCK, PaymentProvider.TOSS, PaymentProvider.PAYPAL])(
    "keeps %s initiation on the baseline durable-only channel",
    async (providerCode) => {
      const session = await submitSessionWithOneLine(ctx);
      const calls: PaymentInitiateInput[] = [];
      const execution = await initiatePaymentAttemptExecutionForTest(db, {
        sessionId: session.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, calls, providerCode),
        mode: PaymentMode.SANDBOX,
        routingRuleId: `test.transient.baseline.${providerCode.toLowerCase()}`,
      });

      expect(execution).toMatchObject({
        channel: "DURABLE_ONLY",
        durable: { provider: providerCode, status: PaymentAttemptStatus.INITIATED, initiateResult: { kind: "ready" } },
      });
      expect(calls).toHaveLength(1);
      await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
        provider: providerCode,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        initiationOutputKind: PaymentInitiationOutputKind.READY,
      });
    },
  );

  it("rejects a SIGNUP coupon at the contact boundary after a prior financial order without provider contact", async () => {
    const now = new Date("2026-08-28T02:00:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const session = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    await createFinanciallyCompletedPriorOrder(ctx, now);
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.first-order.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    })).rejects.toMatchObject({ code: "SESSION_TERMS_STALE" });

    expect(calls).toHaveLength(0);
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: null,
      redeemedAt: null,
    });
    await expect(db.payment.findFirstOrThrow({ where: { checkoutSessionId: session.sessionId } })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      contactStartedAt: null,
    });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: null,
    });
  });

  it("allows only one cross-program SIGNUP checkout to claim and cross first provider contact", async () => {
    const now = new Date("2026-08-28T02:10:00.000Z");
    const grantA = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const grantB = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const sessionA = await submitPromotedSessionWithOneLine(ctx, grantA.id, now);
    const sessionB = await submitPromotedSessionWithOneLine(ctx, grantB.id, now);
    const calls: PaymentInitiateInput[] = [];

    const settled = await Promise.allSettled([
      initiatePaymentAttemptForTest(db, {
        sessionId: sessionA.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, calls),
        mode: PaymentMode.SANDBOX,
        routingRuleId: `promo.first-order.program-a.${randomUUID()}`,
        now,
        contactBoundaryNow: now,
      }),
      initiatePaymentAttemptForTest(db, {
        sessionId: sessionB.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, calls),
        mode: PaymentMode.SANDBOX,
        routingRuleId: `promo.first-order.program-b.${randomUUID()}`,
        now,
        contactBoundaryNow: now,
      }),
    ]);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(settled.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "SESSION_TERMS_STALE" },
    });
    expect(calls).toHaveLength(1);
    const sessions = await db.checkoutSession.findMany({
      where: { id: { in: [sessionA.sessionId, sessionB.sessionId] } },
      select: { firstOrderPromotionClaimedAt: true },
    });
    expect(sessions.filter((session) => session.firstOrderPromotionClaimedAt !== null)).toHaveLength(1);
    await expect(db.promotionGrant.count({
      where: { id: { in: [grantA.id, grantB.id] }, reservedCheckoutSessionId: { not: null } },
    })).resolves.toBe(1);
    await expect(db.payment.count({
      where: {
        checkoutSessionId: { in: [sessionA.sessionId, sessionB.sessionId] },
        contactStartedAt: { not: null },
      },
    })).resolves.toBe(1);
  });

  it("blocks a contender begun before the winner Order when released only after winner completion", async () => {
    const now = new Date("2026-08-28T02:20:00.000Z");
    const grantA = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const grantB = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const sessionA = await submitPromotedSessionWithOneLine(ctx, grantA.id, now);
    const sessionB = await submitPromotedSessionWithOneLine(ctx, grantB.id, now);
    const winnerCalls: PaymentInitiateInput[] = [];
    const loserCalls: PaymentInitiateInput[] = [];
    const winner = await initiatePaymentAttemptForTest(db, {
      sessionId: sessionA.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, winnerCalls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.delayed-winner.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    });
    const winnerClaim = await db.checkoutSession.findUniqueOrThrow({
      where: { id: sessionA.sessionId },
      select: { firstOrderPromotionClaimedAt: true },
    });
    const delayed = coordinationBarrier();
    const contender = initiatePaymentAttemptForTest(db, {
      sessionId: sessionB.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, loserCalls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.delayed-loser.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    }, coordinationAt("AFTER_AUTHORIZATION_COMMIT", delayed));
    await delayed.reached;
    expect(await db.order.count({ where: { userId: ctx.userId } })).toBe(0);

    await completeFromCapture(db, {
      ...captureFacts(sessionA),
      paymentId: winner.paymentId,
      capturedAt: now,
      receivedAt: now,
    });
    delayed.release();

    await expect(contender).rejects.toMatchObject({ code: "SESSION_TERMS_STALE" });
    expect(loserCalls).toHaveLength(0);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: sessionA.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: winnerClaim.firstOrderPromotionClaimedAt,
    });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: sessionB.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: null,
    });
  });

  it("rolls back a first-order claim when exact policy revalidation fails before contact", async () => {
    const now = new Date("2026-08-28T02:30:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const session = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    await db.promotionGrant.update({
      where: { id: grant.id },
      data: { revokedAt: now },
    });
    const calls: PaymentInitiateInput[] = [];

    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.claim-rollback.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    })).rejects.toMatchObject({ code: "SESSION_TERMS_STALE" });

    expect(calls).toHaveLength(0);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: null,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: null,
      reservedAt: null,
    });
    await expect(onlyPayment(session.sessionId)).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      contactStartedAt: null,
    });

    await db.promotionGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null },
    });
    const later = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: later.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.claim-rollback-reacquire.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    })).resolves.toMatchObject({ initiateResult: { kind: "ready" } });
    expect(calls).toHaveLength(1);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: later.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: now,
    });
  });

  it("serializes two first-contact attempts for one grant and delegates only for the reservation winner", async () => {
    const now = new Date("2026-08-28T03:00:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.BIRTHDAY, now });
    const first = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    const second = await createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.KR,
      communicationLocale: "ko",
      shipping: validShipping(),
      promotionGrantId: grant.id,
      now,
    });
    const calls: PaymentInitiateInput[] = [];
    const routingA = `promo.race.a.${randomUUID()}`;
    const routingB = `promo.race.b.${randomUUID()}`;
    const lock = await openPromotionGrantLock(grant.id);
    try {
      const attempts = [first, second].map((candidate, index) => initiatePaymentAttemptForTest(db, {
        sessionId: candidate.sessionId,
        userId: ctx.userId,
        provider: fakeProvider({ kind: "ready" }, calls),
        mode: PaymentMode.SANDBOX,
        routingRuleId: index === 0 ? routingA : routingB,
        now,
        contactBoundaryNow: now,
      }));
      await lock.query("COMMIT");
      const settled = await Promise.allSettled(attempts);

      expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(settled.find((result) => result.status === "rejected")).toMatchObject({
        reason: { code: "SESSION_TERMS_STALE" },
      });
      expect(calls).toHaveLength(1);
      const reserved = await db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } });
      expect([first.sessionId, second.sessionId]).toContain(reserved.reservedCheckoutSessionId);
      await expect(db.payment.count({
        where: { checkoutSessionId: { in: [first.sessionId, second.sessionId] }, contactStartedAt: { not: null } },
      })).resolves.toBe(1);
    } finally {
      await lock.end();
    }
  });

  it("expires only a safely uncontacted reservation owner and never clears another session's reservation", async () => {
    const now = new Date("2026-08-28T04:00:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const owner = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    await db.promotionGrant.update({
      where: { id: grant.id },
      data: { reservedCheckoutSessionId: owner.sessionId, reservedAt: now },
    });
    await db.checkoutSession.update({
      where: { id: owner.sessionId },
      data: {
        expiresAt: new Date("2026-08-27T00:00:00.000Z"),
        firstOrderPromotionClaimedAt: now,
      },
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: owner.sessionId,
    });

    await expect(expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") })).resolves.toBeGreaterThanOrEqual(1);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: owner.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.EXPIRED,
      firstOrderPromotionClaimedAt: null,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: null,
      reservedAt: null,
    });

    const reacquiredGrant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const reacquired = await submitPromotedSessionWithOneLine(ctx, reacquiredGrant.id, now);
    const reacquiredCalls: PaymentInitiateInput[] = [];
    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: reacquired.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, reacquiredCalls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.expiry.reacquire.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    })).resolves.toMatchObject({ initiateResult: { kind: "ready" } });
    expect(reacquiredCalls).toHaveLength(1);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: reacquired.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: now,
    });

    const secondGrant = await createTestPromotionGrant(ctx, { kind: PromotionKind.BIRTHDAY, now });
    const contacted = await submitPromotedSessionWithOneLine(ctx, secondGrant.id, now);
    const calls: PaymentInitiateInput[] = [];
    await initiatePaymentAttemptForTest(db, {
      sessionId: contacted.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.expiry.contacted.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    });
    await db.checkoutSession.update({
      where: { id: contacted.sessionId },
      data: { expiresAt: new Date("2026-08-27T00:00:00.000Z") },
    });
    await expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: contacted.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.SUBMITTED,
      firstOrderPromotionClaimedAt: null,
    });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: reacquired.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: now,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: secondGrant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: contacted.sessionId,
    });

    const thirdGrant = await createTestPromotionGrant(ctx, { kind: PromotionKind.BIRTHDAY, now });
    const reservationOwner = await submitPromotedSessionWithOneLine(ctx, thirdGrant.id, now);
    const staleNonOwner = await createCheckoutSession(db, {
      userId: ctx.userId,
      marketCode: MarketCode.KR,
      communicationLocale: "ko",
      shipping: validShipping(),
      promotionGrantId: thirdGrant.id,
      now,
    });
    await db.promotionGrant.update({
      where: { id: thirdGrant.id },
      data: { reservedCheckoutSessionId: reservationOwner.sessionId, reservedAt: now },
    });
    await db.checkoutSession.update({
      where: { id: reservationOwner.sessionId },
      data: { expiresAt: new Date("2026-08-30T00:00:00.000Z") },
    });
    await db.checkoutSession.update({
      where: { id: staleNonOwner.sessionId },
      data: { expiresAt: new Date("2026-08-27T00:00:00.000Z") },
    });
    await expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: staleNonOwner.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.EXPIRED,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: thirdGrant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: reservationOwner.sessionId,
    });
  });

  it("preserves a first-order claim for same-session replay and CONTACTED expiry exposure", async () => {
    const now = new Date("2026-08-28T04:10:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const session = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    const calls: PaymentInitiateInput[] = [];
    const input: TestInitiationInput = {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.same-session.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    };

    const first = await initiatePaymentAttemptForTest(db, input);
    const claimed = await db.checkoutSession.findUniqueOrThrow({
      where: { id: session.sessionId },
      select: { firstOrderPromotionClaimedAt: true },
    });
    const replay = await initiatePaymentAttemptForTest(db, input);

    expect(replay.paymentId).toBe(first.paymentId);
    expect(calls).toHaveLength(1);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: claimed.firstOrderPromotionClaimedAt,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      reservedCheckoutSessionId: session.sessionId,
    });

    await db.checkoutSession.update({
      where: { id: session.sessionId },
      data: { expiresAt: new Date("2026-08-27T00:00:00.000Z") },
    });
    await expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.SUBMITTED,
      firstOrderPromotionClaimedAt: claimed.firstOrderPromotionClaimedAt,
    });
  });

  it("retains a first-order claim for OUTCOME_UNKNOWN exposure", async () => {
    const now = new Date("2026-08-28T04:20:00.000Z");
    const unknownGrant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const unknownSession = await submitPromotedSessionWithOneLine(ctx, unknownGrant.id, now);
    const unknownCalls: PaymentInitiateInput[] = [];
    await expect(initiatePaymentAttemptForTest(db, {
      sessionId: unknownSession.sessionId,
      userId: ctx.userId,
      provider: failingProvider(unknownCalls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.outcome-unknown.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    })).rejects.toMatchObject({ code: "ATTEMPT_OUTCOME_UNKNOWN" });
    expect(unknownCalls).toHaveLength(1);
    const unknownClaim = await db.checkoutSession.findUniqueOrThrow({
      where: { id: unknownSession.sessionId },
      select: { firstOrderPromotionClaimedAt: true },
    });
    expect(unknownClaim.firstOrderPromotionClaimedAt).not.toBeNull();
    await db.checkoutSession.update({
      where: { id: unknownSession.sessionId },
      data: { expiresAt: new Date("2026-08-27T00:00:00.000Z") },
    });
    await expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: unknownSession.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.SUBMITTED,
      firstOrderPromotionClaimedAt: unknownClaim.firstOrderPromotionClaimedAt,
    });
  });

  it("retains a first-order claim for captured completion-pending exposure", async () => {
    const now = new Date("2026-08-28T04:30:00.000Z");
    const capturedGrant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const capturedSession = await submitPromotedSessionWithOneLine(ctx, capturedGrant.id, now);
    const initiated = await initiatePaymentAttemptForTest(db, {
      sessionId: capturedSession.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.capture-pending.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    });
    await recordCapture(db, {
      ...captureFacts(capturedSession),
      paymentId: initiated.paymentId,
      capturedAt: now,
      receivedAt: now,
    });
    const capturedClaim = await db.checkoutSession.findUniqueOrThrow({
      where: { id: capturedSession.sessionId },
      select: { firstOrderPromotionClaimedAt: true },
    });
    expect(capturedClaim.firstOrderPromotionClaimedAt).not.toBeNull();
    await db.checkoutSession.update({
      where: { id: capturedSession.sessionId },
      data: { expiresAt: new Date("2026-08-27T00:00:00.000Z") },
    });
    await expireStale(db, { now: new Date("2026-08-29T00:00:00.000Z") });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: capturedSession.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.SUBMITTED,
      firstOrderPromotionClaimedAt: capturedClaim.firstOrderPromotionClaimedAt,
    });
  });

  it("completes and replays a promoted capture with exact frozen order and line discounts", async () => {
    const now = new Date("2026-08-28T05:00:00.000Z");
    const grant = await createTestPromotionGrant(ctx, {
      kind: PromotionKind.SIGNUP,
      now,
      rateBps: 1_500,
      expiresAt: new Date("2026-08-28T05:45:00.000Z"),
    });
    const session = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    const calls: PaymentInitiateInput[] = [];
    const initiated = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }, calls),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.complete.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    });
    const capturedAt = new Date("2026-08-28T05:30:00.000Z");
    await db.promotionPolicyVersion.update({
      where: { id: grant.policyVersionId },
      data: { status: PromotionPolicyStatus.RETIRED },
    });
    const facts: CaptureFacts = {
      checkoutSessionId: session.sessionId,
      paymentId: initiated.paymentId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerPaymentKey: `promo_capture_${randomUUID()}`,
      amount: session.totalAmount,
      currency: session.currency,
      receivedAt: new Date("2026-08-29T00:00:00.000Z"),
      capturedAt,
    };

    const completed = await completeFromCapture(db, facts);
    const claimedAfterCompletion = await db.checkoutSession.findUniqueOrThrow({
      where: { id: session.sessionId },
      select: { firstOrderPromotionClaimedAt: true },
    });
    const redeemedAfterFirst = await db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } });
    const replay = await completeFromCapture(db, facts);
    const order = await db.order.findUniqueOrThrow({
      where: { checkoutSessionId: session.sessionId },
      include: { items: true, payment: true },
    });

    expect(completed).toMatchObject({ kind: "completed", orderId: order.id });
    expect(replay).toMatchObject({ orderId: order.id });
    expect(order).toMatchObject({
      promotionGrantId: grant.id,
      subtotalAmount: session.subtotalAmount,
      discountAmount: session.discountAmount,
      totalAmount: session.totalAmount,
      payment: { amount: session.totalAmount },
    });
    expect(order.items.reduce((sum, item) => sum + item.discountAmount, 0)).toBe(session.discountAmount);
    await expect(createPrismaTransactionalEmailProjectionSource(db).loadOrderPaid(order.id)).resolves.toMatchObject({
      ok: true,
      value: {
        discountAmount: session.discountAmount,
        totalPaidAmount: session.totalAmount,
      },
    });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.COMPLETED,
      firstOrderPromotionClaimedAt: claimedAfterCompletion.firstOrderPromotionClaimedAt,
    });
    expect(claimedAfterCompletion.firstOrderPromotionClaimedAt).not.toBeNull();
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      redeemedAt: redeemedAfterFirst.redeemedAt,
      reservedCheckoutSessionId: null,
      reservedAt: null,
    });
    expect(redeemedAfterFirst.redeemedAt).toEqual(capturedAt);
    await expect(db.order.count({ where: { promotionGrantId: grant.id } })).resolves.toBe(1);

    await db.order.update({ where: { id: order.id }, data: { status: OrderStatus.REFUNDED } });
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      firstOrderPromotionClaimedAt: claimedAfterCompletion.firstOrderPromotionClaimedAt,
    });
  });

  it("rolls back Order creation when the exact promotion reservation cannot be consumed", async () => {
    const now = new Date("2026-08-28T06:00:00.000Z");
    const grant = await createTestPromotionGrant(ctx, { kind: PromotionKind.SIGNUP, now });
    const session = await submitPromotedSessionWithOneLine(ctx, grant.id, now);
    const initiated = await initiatePaymentAttemptForTest(db, {
      sessionId: session.sessionId,
      userId: ctx.userId,
      provider: fakeProvider({ kind: "ready" }),
      mode: PaymentMode.SANDBOX,
      routingRuleId: `promo.atomicity.${randomUUID()}`,
      now,
      contactBoundaryNow: now,
    });
    const conflictingSession = await db.checkoutSession.create({
      data: {
        userId: ctx.userId,
        marketCode: MarketCode.KR,
        communicationLocale: "ko",
        currency: "KRW",
        subtotalAmount: 1,
        shippingAmount: 0,
        totalAmount: 1,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });
    await db.promotionGrant.update({
      where: { id: grant.id },
      data: { reservedCheckoutSessionId: conflictingSession.id, reservedAt: now },
    });

    const result = await completeFromCapture(db, {
      checkoutSessionId: session.sessionId,
      paymentId: initiated.paymentId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      providerPaymentKey: `promo_atomicity_capture_${randomUUID()}`,
      amount: session.totalAmount,
      currency: session.currency,
      capturedAt: now,
      receivedAt: now,
    });

    expect(result).toMatchObject({
      kind: "compensationEnqueued",
      failure: { code: "PROMOTION_REDEMPTION_INVALID" },
    });
    await expect(db.order.count({ where: { checkoutSessionId: session.sessionId } })).resolves.toBe(0);
    await expect(db.checkoutSession.findUniqueOrThrow({ where: { id: session.sessionId } })).resolves.toMatchObject({
      status: CheckoutSessionStatus.FAILED,
      firstOrderPromotionClaimedAt: now,
    });
    await expect(db.promotionGrant.findUniqueOrThrow({ where: { id: grant.id } })).resolves.toMatchObject({
      redeemedAt: null,
      reservedCheckoutSessionId: conflictingSession.id,
    });
  });
});

async function initiatePaymentAttemptForTest(
  client: typeof db,
  input: TestInitiationInput,
  coordination?: PaymentAttemptTestCoordination,
) {
  initiationProviders.set(input.routingRuleId, input.provider);
  await coordination?.waitAt("BEFORE_AUTHORIZATION_LOCK");
  const coordinatedAfterCommit = coordinatePaymentTransactions(client, coordination);
  try {
    const contactBoundaryNow = input.contactBoundaryNow;
    return await initiatePaymentAttempt(client, {
      sessionId: input.sessionId,
      userId: input.userId,
      adapterContext: testAdapterContext(input),
      now: input.now,
      contactBoundaryClock: contactBoundaryNow
        ? () => new Date(contactBoundaryNow.getTime())
        : undefined,
      eximbayReady: input.provider.code === PaymentProvider.EXIMBAY
        ? input.eximbayReady ?? syntheticEximbayReadyDependencies(input.provider)
        : undefined,
    });
  } finally {
    coordinatedAfterCommit?.mockRestore();
  }
}

async function initiatePaymentAttemptExecutionForTest(
  client: typeof db,
  input: TestInitiationInput,
) {
  initiationProviders.set(input.routingRuleId, input.provider);
  const contactBoundaryNow = input.contactBoundaryNow;
  return initiatePaymentAttemptWithTransientAuthority(client, {
    sessionId: input.sessionId,
    userId: input.userId,
    adapterContext: testAdapterContext(input),
    now: input.now,
    contactBoundaryClock: contactBoundaryNow
      ? () => new Date(contactBoundaryNow.getTime())
      : undefined,
    eximbayReady: input.provider.code === PaymentProvider.EXIMBAY
      ? input.eximbayReady ?? syntheticEximbayReadyDependencies(input.provider)
      : undefined,
  });
}

function coordinatePaymentTransactions(
  client: typeof db,
  coordination: PaymentAttemptTestCoordination | undefined,
) {
  if (!coordination) return null;
  const coordinatesAuthorization = coordinationIncludesAny(coordination, [
    "BEFORE_AUTHORIZATION_COMMIT",
    "AFTER_AUTHORIZATION_LOCK",
    "AFTER_AUTHORIZATION_COMMIT",
  ]);
  const coordinatesContactClaim = coordinationIncludesAny(coordination, [
    "BEFORE_CONTACT_CLAIM_COMMIT",
    "AFTER_CONTACT_CLAIM_COMMIT",
  ]);
  if (!coordinatesAuthorization && !coordinatesContactClaim) return null;
  const transaction = client.$transaction.bind(client);
  const transactionSpy = vi.spyOn(client, "$transaction");
  transactionSpy.mockImplementation(transaction);
  if (!coordinatesAuthorization && coordinatesContactClaim) {
    transactionSpy.mockImplementationOnce(transaction);
  }
  if (coordinatesAuthorization) {
    transactionSpy.mockImplementationOnce(async (operation) => {
      const result = coordination.includes("BEFORE_AUTHORIZATION_COMMIT")
        ? await transaction(async (tx) => {
          const pending = await operation(tx);
          await coordination.waitAt("BEFORE_AUTHORIZATION_COMMIT");
          return pending;
        })
        : await transaction(operation);
      await coordination.waitAt("AFTER_AUTHORIZATION_LOCK");
      await coordination.waitAt("AFTER_AUTHORIZATION_COMMIT");
      return result;
    });
  }
  if (coordinatesContactClaim) {
    transactionSpy.mockImplementationOnce(async (operation) => {
      const result = coordination.includes("BEFORE_CONTACT_CLAIM_COMMIT")
        ? await transaction(async (tx) => {
          const pending = await operation(tx);
          await coordination.waitAt("BEFORE_CONTACT_CLAIM_COMMIT");
          return pending;
        })
        : await transaction(operation);
      await coordination.waitAt("AFTER_CONTACT_CLAIM_COMMIT");
      return result;
    });
  }
  return transactionSpy;
}

function coordinationIncludesAny(
  coordination: PaymentAttemptTestCoordination,
  points: readonly PaymentAttemptCoordinationPoint[],
): boolean {
  return points.some((point) => coordination.includes(point));
}

function testAdapterContext(input: TestInitiationInput): ProviderFactoryContext {
  return {
    provider: input.provider.code,
    mode: input.mode,
    market: MarketCode.KR,
    method: PaymentMethod.CARD,
    currency: "KRW",
    ruleId: input.routingRuleId,
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "test-owned provider" },
  };
}

function fakeProvider(
  initiateResult: PaymentInitiateResult,
  calls: PaymentInitiateInput[] = [],
  code: PaymentProvider = PaymentProvider.TOSS,
  adapterExecutionKind: PaymentAdapterExecutionKind = code === PaymentProvider.EXIMBAY
    ? PaymentAdapterExecutionKind.EXTERNAL
    : PaymentAdapterExecutionKind.MOCK,
): PaymentInitiationProvider {
  const provider: PaymentInitiationProvider = {
    code,
    adapterExecutionKind,
    initiate: (input: PaymentInitiateInput) => {
      calls.push(input);
      return Promise.resolve(initiateResult);
    },
  };
  if (code === PaymentProvider.EXIMBAY) eximbayCallRecords.set(provider, calls);
  return provider;
}

function syntheticEximbayReadyDependencies(provider: PaymentInitiationProvider) {
  return {
    env: {
      EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
      EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
      PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
    },
    fetchImpl: () => {
      const calls = eximbayCallRecords.get(provider);
      calls?.push({
        checkoutSessionId: "s2-owned",
        paymentId: "s2-owned",
        provider: PaymentProvider.EXIMBAY,
        amount: 0,
        currency: "USD",
        idempotencyKey: "s2-owned",
      });
      return Promise.resolve(new Response(JSON.stringify({
        rescode: "0000",
        resmsg: "synthetic",
        fgkey: "synthetic-ready-fgkey",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    },
  };
}

function transientEximbayInput(
  sessionId: string,
  userId: string,
  fetchImpl: TestEximbayReadyFetch,
  routingRuleId: string,
): TestInitiationInput {
  return {
    sessionId,
    userId,
    provider: fakeProvider({ kind: "ready" }, [], PaymentProvider.EXIMBAY),
    mode: PaymentMode.SANDBOX,
    routingRuleId,
    eximbayReady: {
      env: {
        EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG",
        EXIMBAY_SANDBOX_MID: "synthetic-sandbox-mid",
        PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
      },
      fetchImpl,
    },
  };
}

function syntheticReadyResponse(): Response {
  return new Response(JSON.stringify({
    rescode: "0000",
    resmsg: "synthetic",
    fgkey: "synthetic-ready-fgkey",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function entropyChunk(byte: number): Uint8Array {
  return Uint8Array.from({ length: 48 }, () => byte);
}

function failingProvider(calls: PaymentInitiateInput[]): PaymentInitiationProvider {
  return {
    code: PaymentProvider.TOSS,
    adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
    initiate: (input: PaymentInitiateInput) => {
      calls.push(input);
      return Promise.reject(new Error("Fake provider initiate failure"));
    },
  };
}

interface CoordinationBarrier {
  reached: Promise<void>;
  wait(): Promise<void>;
  release(): void;
}

function coordinationBarrier(): CoordinationBarrier {
  let markReached: () => void = () => { throw new Error("Coordination barrier was not initialized"); };
  let releaseWait: () => void = () => { throw new Error("Coordination barrier was not initialized"); };
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  const released = new Promise<void>((resolve) => { releaseWait = resolve; });
  return {
    reached,
    wait: async () => {
      markReached();
      await released;
    },
    release: releaseWait,
  };
}

function coordinationAt(
  point: PaymentAttemptCoordinationPoint,
  barrier: CoordinationBarrier,
): PaymentAttemptTestCoordination {
  return coordinationAtMany([{ point, barrier }]);
}

function coordinationAtMany(
  entries: ReadonlyArray<{ point: PaymentAttemptCoordinationPoint; barrier: CoordinationBarrier }>,
): PaymentAttemptTestCoordination {
  return {
    waitAt: (point) => entries.find((entry) => entry.point === point)?.barrier.wait() ?? Promise.resolve(),
    includes: (point) => entries.some((entry) => entry.point === point),
  };
}

function barrierProvider(
  calls: PaymentInitiateInput[],
  barrier: CoordinationBarrier,
): PaymentInitiationProvider {
  return {
    code: PaymentProvider.TOSS,
    adapterExecutionKind: PaymentAdapterExecutionKind.MOCK,
    initiate: async (input) => {
      calls.push(input);
      await barrier.wait();
      return { kind: "ready" };
    },
  };
}

async function paymentRaceRows(checkoutSessionId: string) {
  return db.payment.findMany({
    where: { checkoutSessionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      attemptLifecycle: true,
      contactIntentAt: true,
      contactStartedAt: true,
      blockingEndedAt: true,
    },
  });
}

async function openContactOwners(checkoutSessionId: string): Promise<string[]> {
  const payments = await db.payment.findMany({
    where: { checkoutSessionId, blockingEndedAt: null },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return payments.map((payment) => payment.id);
}

async function paymentIdForRoutingRule(
  checkoutSessionId: string,
  routingRuleId: string,
): Promise<string> {
  const payment = await db.payment.findFirst({
    where: { checkoutSessionId, routingRuleId },
    select: { id: true },
  });
  if (!payment) throw new Error(`Missing payment for routing rule ${routingRuleId}`);
  return payment.id;
}

async function expectNoCommerceWrites(checkoutSessionId: string): Promise<void> {
  await expect(db.order.count({ where: { checkoutSessionId } })).resolves.toBe(0);
  await expect(db.manufacturingRequest.count({
    where: { orderItem: { order: { checkoutSessionId } } },
  })).resolves.toBe(0);
  await expect(hasUnresolvedSessionExposure(db, checkoutSessionId)).resolves.toBe(false);
}

async function expectNoRejectedPaymentSideEffects(checkoutSessionId: string): Promise<void> {
  await expectNoCommerceWrites(checkoutSessionId);
  const paymentIds = await db.payment.findMany({
    where: { checkoutSessionId },
    select: { id: true },
  });
  const outboxCounts = await Promise.all(paymentIds.map((payment) => db.paymentOutbox.count({
    where: { payload: { path: ["paymentId"], equals: payment.id } },
  })));
  expect(outboxCounts.every((count) => count === 0)).toBe(true);
  await expect(db.payment.count({
    where: {
      checkoutSessionId,
      OR: [
        { providerPaymentKey: { not: null } },
        { financialSucceededAt: { not: null } },
        { remediationStatus: { not: PaymentRemediationStatus.NONE } },
      ],
    },
  })).resolves.toBe(0);
}

function makeContext(): TestContext {
  return { userId: `d1b_initiate_${randomUUID()}`, styleIds: [], variantIds: [] };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function submitSessionWithOneLine(context: TestContext) {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    communicationLocale: "ko",
    shipping: validShipping(),
  });
}

async function submitUsSessionWithOneLine(context: TestContext) {
  await db.market.upsert({
    where: { code: MarketCode.US },
    update: {
      currency: "USD",
      shippableCountries: [ShippingCountry.US],
      defaultLocale: "en",
      isActive: true,
    },
    create: {
      code: MarketCode.US,
      currency: "USD",
      shippableCountries: [ShippingCountry.US],
      defaultLocale: "en",
      isActive: true,
    },
  });
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await db.wigStyleMarket.create({
    data: { wigStyleId: variant.styleId, marketCode: MarketCode.US, isActive: true },
  });
  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.US, amount: 100 },
  });
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.US,
    communicationLocale: "en",
    shipping: validUsShipping(),
  });
}

async function submitJpSessionWithOneLine(context: TestContext) {
  await db.market.upsert({
    where: { code: MarketCode.JP },
    update: {
      currency: "JPY",
      shippableCountries: [ShippingCountry.JP],
      defaultLocale: "ja",
      isActive: true,
    },
    create: {
      code: MarketCode.JP,
      currency: "JPY",
      shippableCountries: [ShippingCountry.JP],
      defaultLocale: "ja",
      isActive: true,
    },
  });
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await db.wigStyleMarket.create({
    data: { wigStyleId: variant.styleId, marketCode: MarketCode.JP, isActive: true },
  });
  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.JP, amount: 100 },
  });
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.JP,
    communicationLocale: "ja",
    shipping: validJpShipping(),
  });
}

async function moveSessionExpiryIntoPast<T extends { sessionId: string; expiresAt: Date }>(session: T): Promise<T> {
  const expiresAt = new Date("2026-07-06T00:00:00.000Z");
  await db.checkoutSession.update({
    where: { id: session.sessionId },
    data: { expiresAt },
  });
  return { ...session, expiresAt };
}

interface SessionLockWaitEvidence {
  state: string;
  waitEventType: string | null;
  blockingPids: number[];
  query: string;
}

async function openSessionLockObserver(label: string): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for lock-wait verification");
  const observer = new Client({
    connectionString,
    application_name: `wig_c2j_initiate_observer_${label}`,
  });
  await observer.connect();
  return observer;
}

async function waitForSessionLockWait(observer: Client): Promise<SessionLockWaitEvidence> {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const result = await observer.query<SessionLockWaitEvidence>(`
      SELECT a.state,
             a.wait_event_type AS "waitEventType",
             pg_blocking_pids(a.pid) AS "blockingPids",
             a.query
      FROM pg_stat_activity a
      WHERE a.datname = current_database()
        AND a.state = 'active'
        AND a.wait_event_type = 'Lock'
        AND a.query LIKE '%CheckoutSession%FOR UPDATE%'
        AND cardinality(pg_blocking_pids(a.pid)) > 0
    `);
    const waiting = result.rows[0];
    if (waiting) return waiting;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for CheckoutSession row-lock evidence");
}

async function waitForPaymentInsertLockWait(observer: Client): Promise<SessionLockWaitEvidence> {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const result = await observer.query<SessionLockWaitEvidence>(`
      SELECT a.state,
             a.wait_event_type AS "waitEventType",
             pg_blocking_pids(a.pid) AS "blockingPids",
             a.query
      FROM pg_stat_activity a
      WHERE a.datname = current_database()
        AND a.pid <> pg_backend_pid()
        AND a.state = 'active'
        AND a.wait_event_type = 'Lock'
        AND cardinality(pg_blocking_pids(a.pid)) > 0
    `);
    const waiting = result.rows[0];
    if (waiting) return waiting;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for Payment unique-index lock evidence");
}

async function createUncontactedAuthorizedPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
  routingRuleId: string,
  contactAuthorizedAt: Date = new Date(),
  adapterExecutionKind: PaymentAdapterExecutionKind | null = PaymentAdapterExecutionKind.MOCK,
): Promise<{ paymentId: string; idempotencyKey: string }> {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      adapterExecutionKind,
      routingRuleId,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `authorized:${session.sessionId}:${randomUUID()}`,
      contactIntentAt: contactAuthorizedAt,
    },
    select: { id: true, idempotencyKey: true },
  });
  return { paymentId: payment.id, idempotencyKey: payment.idempotencyKey };
}

async function createEximbayContactedPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
  routingRuleId: string,
  contactStartedAt: Date,
) {
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
      routingRuleId,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId: `c${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      idempotencyKey: `eximbay-contacted:${session.sessionId}:${randomUUID()}`,
      contactIntentAt: contactStartedAt,
      contactStartedAt,
    },
  });
}

async function createOrdinarySupersededPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
  label: string,
) {
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `${label}:${randomUUID()}`,
      contactIntentAt: new Date(),
      supersededAt: new Date(),
      blockingEndedAt: new Date(),
    },
    select: { id: true },
  });
}

async function recordCaptureOnly(
  session: { sessionId: string; totalAmount: number; currency: string },
  paymentId: string,
): Promise<void> {
  await recordCapture(db, { ...captureFacts(session), paymentId });
}

async function createCatalogVariant(context: TestContext, options: VariantOptions) {
  const style = await db.wigStyle.create({
    data: {
      name: `D1B Initiate Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/d1b-initiate-cover.png",
      availableMarkets: { create: { marketCode: MarketCode.KR, isActive: true } },
    },
    select: { id: true },
  });
  context.styleIds.push(style.id);
  return createVariant(context, style.id, options);
}

async function createVariant(context: TestContext, styleId: string, options: VariantOptions) {
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: styleId,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: 88_000,
      stock: options.stock ?? 10,
      sku: `D1B-INIT-${randomUUID()}`,
      fulfillmentType: options.fulfillmentType ?? FulfillmentType.MTO,
    },
    select: { id: true },
  });
  context.variantIds.push(variant.id);
  await db.variantMarketPrice.create({
    data: { variantId: variant.id, marketCode: MarketCode.KR, amount: options.amount ?? 12_000 },
  });
  return { id: variant.id, styleId };
}

function validShipping(): CheckoutShippingInput {
  return {
    recipientName: "홍길동",
    phone: "010-1234-5678",
    country: ShippingCountry.KR,
    postalCode: "12345",
    administrativeArea: "서울특별시",
    city: "강남구",
    addressLine1: "테헤란로 1",
  };
}

function validUsShipping(): CheckoutShippingInput {
  return {
    recipientName: "Synthetic Buyer",
    phone: "+1-202-555-0100",
    country: ShippingCountry.US,
    postalCode: "10001",
    administrativeArea: "NY",
    city: "New York",
    addressLine1: "1 Test Avenue",
  };
}

function validJpShipping(): CheckoutShippingInput {
  return {
    recipientName: "Synthetic Buyer",
    phone: "+81-3-1234-5678",
    country: ShippingCountry.JP,
    postalCode: "100-0001",
    administrativeArea: "Tokyo",
    city: "Chiyoda",
    addressLine1: "1 Test Avenue",
  };
}

function captureFacts(
  session: { sessionId: string; totalAmount: number; currency: string },
): CaptureFacts {
  return {
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey: `capture_${randomUUID()}`,
    amount: session.totalAmount,
    currency: session.currency,
    receivedAt: new Date(),
  };
}

interface TestPromotionOptions {
  readonly kind: PromotionKind;
  readonly now: Date;
  readonly status?: PromotionPolicyStatus;
  readonly rateBps?: number;
  readonly maximumDiscountMinor?: bigint;
  readonly minimumEligibleSubtotalMinor?: bigint | null;
  readonly validFrom?: Date;
  readonly expiresAt?: Date | null;
  readonly originMarketCode?: string;
}

async function createTestPromotionGrant(context: TestContext, options: TestPromotionOptions) {
  const policy = await db.promotionPolicyVersion.create({
    data: testPromotionPolicyData(options),
  });
  const status = options.status ?? PromotionPolicyStatus.ACTIVE;
  if (status !== PromotionPolicyStatus.DRAFT) {
    await db.promotionPolicyVersion.update({ where: { id: policy.id }, data: { status } });
  }
  return db.promotionGrant.create({
    data: testPromotionGrantData(context.userId, policy.id, options),
  });
}

function testPromotionPolicyData(options: TestPromotionOptions) {
  const birthday = options.kind === PromotionKind.BIRTHDAY;
  return {
    programKey: `promo_c1_${randomUUID()}`,
    version: 1,
    kind: options.kind,
    startsAt: new Date(options.now.getTime() - 86_400_000),
    endsAt: new Date(options.now.getTime() + 86_400_000),
    firstOrderOnly: options.kind === PromotionKind.SIGNUP,
    requiresQualifyingPurchase: birthday,
    birthdayWindowBeforeDays: birthday ? 0 : null,
    birthdayWindowAfterDays: birthday ? 0 : null,
    birthdayLeapDayObservation: birthday ? "FEB_28" as const : null,
    marketRules: {
      create: {
        marketCode: MarketCode.KR,
        currency: "KRW",
        rateBps: options.rateBps ?? 1_000,
        maximumDiscountMinor: options.maximumDiscountMinor ?? BigInt(100_000),
        minimumEligibleSubtotalMinor: options.minimumEligibleSubtotalMinor ?? null,
        eligibilityTimeZone: birthday ? "Asia/Seoul" : null,
      },
    },
  };
}

function testPromotionGrantData(userId: string, policyVersionId: string, options: TestPromotionOptions) {
  return {
    userId,
    policyVersionId,
    grantKey: `promo_c1_grant_${randomUUID()}`,
    originMarketCode: options.originMarketCode ?? MarketCode.KR,
    issuedAt: options.now,
    validFrom: options.validFrom ?? new Date(options.now.getTime() - 1_000),
    expiresAt: options.expiresAt === undefined
      ? new Date(options.now.getTime() + 3_600_000)
      : options.expiresAt,
  };
}

async function submitPromotedSessionWithOneLine(
  context: TestContext,
  promotionGrantId: string,
  now: Date,
) {
  const variant = await createCatalogVariant(context, { amount: 12_000, stock: 5 });
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: context.userId,
    marketCode: MarketCode.KR,
    communicationLocale: "ko",
    shipping: validShipping(),
    promotionGrantId,
    now,
  });
}

async function openPromotionGrantLock(promotionGrantId: string): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for promotion lock verification");
  const client = new Client({ connectionString, application_name: "promo_c1_grant_race_barrier" });
  await client.connect();
  await client.query("BEGIN");
  await client.query('SELECT "id" FROM "PromotionGrant" WHERE "id" = $1 FOR UPDATE', [promotionGrantId]);
  return client;
}

async function createFinanciallyCompletedPriorOrder(context: TestContext, now: Date): Promise<void> {
  const label = randomUUID();
  const session = await db.checkoutSession.create({
    data: {
      id: `promo_c1_prior_session_${label}`,
      userId: context.userId,
      marketCode: MarketCode.KR,
      communicationLocale: "ko",
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      expiresAt: new Date(now.getTime() + 60_000),
      completedAt: now,
    },
  });
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `promo_c1_prior_payment_${label}`,
      idempotencyKey: `promo_c1_prior_idempotency_${label}`,
      financialSucceededAt: now,
      blockingEndedAt: now,
    },
  });
  await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      paidAt: now,
    },
  });
}

async function onlyPayment(checkoutSessionId: string) {
  const payment = await db.payment.findFirst({ where: { checkoutSessionId } });
  if (!payment) throw new Error(`Missing payment for ${checkoutSessionId}`);
  return payment;
}

async function cleanup(context: TestContext): Promise<void> {
  await deleteOrders(context.userId);
  await db.promotionGrant.updateMany({
    where: { userId: context.userId },
    data: { reservedCheckoutSessionId: null, reservedAt: null },
  });
  await deletePaymentsAndSessions(context.userId);
  await db.cartItem.deleteMany({ where: { userId: context.userId } });
  const grants = await db.promotionGrant.findMany({
    where: { userId: context.userId },
    select: { policyVersionId: true },
  });
  const policyVersionIds = [...new Set(grants.map((grant) => grant.policyVersionId))];
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await tx.promotionGrant.deleteMany({ where: { userId: context.userId } });
    await tx.promotionMarketRule.deleteMany({ where: { policyVersionId: { in: policyVersionIds } } });
    await tx.promotionPolicyVersion.deleteMany({ where: { id: { in: policyVersionIds } } });
  });
  await deleteVariants(context);
  await db.user.deleteMany({ where: { id: context.userId } });
}

async function deleteOrders(userId: string): Promise<void> {
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) return;
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  await db.manufacturingRequest.deleteMany({ where: { orderItemId: { in: items.map((item) => item.id) } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderShipping.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function deletePaymentsAndSessions(userId: string): Promise<void> {
  const sessions = await db.checkoutSession.findMany({ where: { userId }, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) return;
  const payments = await db.payment.findMany({
    where: { checkoutSessionId: { in: sessionIds }, providerPaymentKey: { not: null } },
    select: { provider: true, providerPaymentKey: true },
  });
  await db.paymentOutbox.deleteMany({
    where: {
      dedupKey: {
        in: payments.flatMap((payment) => payment.providerPaymentKey
          ? [
            `void:${payment.provider}:${payment.providerPaymentKey}`,
            `payment-remediation:${payment.provider}:${payment.providerPaymentKey}`,
          ]
          : []),
      },
    },
  });
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
}

async function deleteVariants(context: TestContext): Promise<void> {
  if (context.variantIds.length > 0) {
    await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
    await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  }
  if (context.styleIds.length > 0) {
    await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  }
}
