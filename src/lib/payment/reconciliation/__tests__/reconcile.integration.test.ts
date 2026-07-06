import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OutboxStatus,
  PaymentAttemptStatus,
  PaymentEventFailureStage,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentProvider,
  ShippingCountry,
  WebhookIngressRejectionStage,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox";
import { reconcilePaymentCore, type ReconciliationFinding } from "@/lib/payment/reconciliation";

const C2_NOW = new Date("2026-08-03T00:00:00.000Z");
const C2_OLD = new Date("2026-08-02T23:00:00.000Z");
const STALE_MS = 10_000;

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  sessionIds: string[];
  paymentIds: string[];
  orderIds: string[];
  outboxIds: string[];
  eventIds: string[];
  rejectionIds: string[];
}

interface SessionInput {
  status?: CheckoutSessionStatus;
  totalAmount?: number;
  currency?: string;
}

interface PaymentInput {
  status?: PaymentAttemptStatus;
  amount?: number;
  currency?: string;
  providerPaymentKey?: string;
  updatedAt?: Date;
}

describe("payment reconciliation C2-v0", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("classifies recent and stale SUCCEEDED payments without orders without repair", async () => {
    const recentSession = await createSession(ctx);
    const staleSession = await createSession(ctx);
    const recent = await createPayment(ctx, recentSession.id, { updatedAt: C2_NOW });
    const stale = await createPayment(ctx, staleSession.id, { updatedAt: C2_OLD });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    const recentFinding = findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", recent.id);
    const staleFinding = findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", stale.id);
    expect(recentFinding.recommendedAction).toBe("NORMAL_IN_FLIGHT");
    expect(recentFinding.details.voidPathStatus).toBe("absent");
    expect(staleFinding.recommendedAction).toBe("AUTO_REENTRY_CANDIDATE");
    expect(staleFinding.details.voidPathStatus).toBe("absent");
    await expect(db.order.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
  });

  it("classifies missing-order payments by active and failed void path state", async () => {
    const pending = await paymentWithVoidPath(ctx, OutboxStatus.PENDING, 0);
    const processing = await paymentWithVoidPath(ctx, OutboxStatus.PROCESSING, 1);
    const failed = await paymentWithVoidPath(ctx, OutboxStatus.FAILED, OUTBOX_MAX_ATTEMPTS);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", pending.payment.id))
      .toMatchObject({ recommendedAction: "VOID_PENDING" });
    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", processing.payment.id))
      .toMatchObject({ recommendedAction: "VOID_PENDING" });
    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", failed.payment.id))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
    expect(findingFor(findings, "PG_VOID_MAX_ATTEMPTS", "paymentOutbox", failed.outboxId))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
  });

  it("detects order payment status, amount, and session-state inconsistencies", async () => {
    const badStatus = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const badStatusPayment = await createPayment(ctx, badStatus.id, { status: PaymentAttemptStatus.FAILED });
    const badStatusOrder = await createOrder(ctx, badStatus, badStatusPayment);
    const amountSession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const amountPayment = await createPayment(ctx, amountSession.id, { amount: amountSession.totalAmount + 1 });
    const amountOrder = await createOrder(ctx, amountSession, amountPayment);
    const stateSession = await createSession(ctx, { status: CheckoutSessionStatus.FAILED });
    const statePayment = await createPayment(ctx, stateSession.id);
    const stateOrder = await createOrder(ctx, stateSession, statePayment);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "ORDER_BAD_PAYMENT_STATUS", "order", badStatusOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
    expect(findingFor(findings, "AMOUNT_CURRENCY_MISMATCH", "order", amountOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
    expect(findingFor(findings, "SESSION_STATE_MISMATCH", "order", stateOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
  });

  it("detects structurally obvious partial local completion anomalies", async () => {
    const emptySession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const emptyPayment = await createPayment(ctx, emptySession.id);
    const emptyOrder = await createOrder(ctx, emptySession, emptyPayment);
    const mtoSession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const mtoPayment = await createPayment(ctx, mtoSession.id);
    const mtoOrder = await createOrder(ctx, mtoSession, mtoPayment);
    await createMtoOrderItem(ctx, mtoOrder.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(partialReason(findings, emptyOrder.id, "order has no items")).toBeTruthy();
    expect(partialReason(findings, emptyOrder.id, "order missing shipping snapshot")).toBeTruthy();
    expect(partialReason(findings, mtoOrder.id, "MTO order item missing manufacturing request")).toBeTruthy();
  });

  it("classifies pg.void max attempts and structural payload mismatch", async () => {
    const session = await createSession(ctx);
    const payment = await createPayment(ctx, session.id, { providerPaymentKey: `c2_void_${randomUUID()}` });
    const maxOutbox = await createVoidOutbox(ctx, payment, { status: OutboxStatus.FAILED, attempts: OUTBOX_MAX_ATTEMPTS });
    const mismatchOutbox = await createVoidOutbox(ctx, payment, {
      status: OutboxStatus.FAILED,
      attempts: 1,
      providerPaymentKey: `wrong_${randomUUID()}`,
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "PG_VOID_MAX_ATTEMPTS", "paymentOutbox", maxOutbox.id))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
    expect(findingFor(findings, "PG_VOID_MISMATCH_TERMINAL", "paymentOutbox", mismatchOutbox.id))
      .toMatchObject({ recommendedAction: "VOID_MISMATCH_TERMINAL" });
  });

  it("classifies trusted webhook events and stale retryable states", async () => {
    const parse = await createPaymentEvent(ctx, PaymentEventStatus.FAILED, {
      failureStage: PaymentEventFailureStage.PARSE,
      failureCode: "PARSE.FIELD_MISSING",
    });
    const retryable = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      attemptCount: 1,
      lastAttemptAt: C2_OLD,
    });
    const received = await createPaymentEvent(ctx, PaymentEventStatus.RECEIVED, { receivedAt: C2_OLD });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "TRUSTED_EVENT_PARSE_FAILED", "paymentEvent", parse.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", "paymentEvent", retryable.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
    expect(findingFor(findings, "STALE_PAYMENT_EVENT_RECEIVED", "paymentEvent", received.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
    expect(findingFor(findings, "STALE_PAYMENT_EVENT_RETRYABLE_FAILED", "paymentEvent", retryable.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
  });

  it("classifies rejected inbound rows and simple spike thresholds", async () => {
    const verify = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.FAILED");
    const metadata = await createRejection(ctx, WebhookIngressRejectionStage.METADATA_EXTRACT, "METADATA.MISSING_EVENT_TYPE");
    const raw = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.RAW_MISMATCH");

    const findings = await reconcilePaymentCore(db, {
      ...reconcileOptions(),
      verifySpikeThreshold: 2,
      metadataSpikeThreshold: 1,
      rawMismatchSpikeThreshold: 1,
    });

    expect(findingFor(findings, "WEBHOOK_VERIFY_REJECTION", "webhookIngressRejection", verify.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
    expect(findingFor(findings, "WEBHOOK_METADATA_REJECTION", "webhookIngressRejection", metadata.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "WEBHOOK_RAW_MISMATCH", "webhookIngressRejection", raw.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
    expect(findings.some((finding) => finding.kind === "WEBHOOK_VERIFY_REJECTION_SPIKE")).toBe(true);
    expect(findings.some((finding) => finding.kind === "WEBHOOK_METADATA_REJECTION_SPIKE")).toBe(true);
    expect(findings.some((finding) => finding.kind === "WEBHOOK_RAW_MISMATCH_SPIKE")).toBe(true);
  });

  it("does not mutate payment, order, outbox, or event state", async () => {
    const session = await createSession(ctx);
    const payment = await createPayment(ctx, session.id, { updatedAt: C2_OLD });
    const event = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      attemptCount: 1,
      lastAttemptAt: C2_OLD,
    });
    const before = await mutationSnapshot(ctx.userId, payment.id, event.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());
    const after = await mutationSnapshot(ctx.userId, payment.id, event.id);

    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", payment.id))
      .toMatchObject({ recommendedAction: "AUTO_REENTRY_CANDIDATE" });
    expect(after).toEqual(before);
  });
});

function makeContext(): TestContext {
  return {
    userId: `c2_${randomUUID()}`,
    styleIds: [],
    variantIds: [],
    sessionIds: [],
    paymentIds: [],
    orderIds: [],
    outboxIds: [],
    eventIds: [],
    rejectionIds: [],
  };
}

function reconcileOptions() {
  return {
    now: C2_NOW,
    staleReceivedAfterMs: STALE_MS,
    staleRetryableFailedAfterMs: STALE_MS,
    staleSucceededPaymentAfterMs: STALE_MS,
    spikeWindowMs: 60_000,
    verifySpikeThreshold: 100,
    metadataSpikeThreshold: 100,
    rawMismatchSpikeThreshold: 100,
    parseFailureSpikeThreshold: 100,
    completeRetryableSpikeThreshold: 100,
  };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function createSession(context: TestContext, input: SessionInput = {}) {
  const totalAmount = input.totalAmount ?? 12_000;
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: input.currency ?? "KRW",
      status: input.status ?? CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      expiresAt: new Date(C2_NOW.getTime() + 30 * 60_000),
      submittedAt: C2_NOW,
      completedAt: input.status === CheckoutSessionStatus.COMPLETED ? C2_NOW : null,
    },
  });
  context.sessionIds.push(session.id);
  return session;
}

async function createPayment(context: TestContext, sessionId: string, input: PaymentInput = {}) {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider: PaymentProvider.TOSS,
      status: input.status ?? PaymentAttemptStatus.SUCCEEDED,
      amount: input.amount ?? 12_000,
      currency: input.currency ?? "KRW",
      providerPaymentKey: input.providerPaymentKey ?? `c2_pay_${randomUUID()}`,
      idempotencyKey: `c2_idem_${randomUUID()}`,
      createdAt: input.updatedAt ?? C2_NOW,
      updatedAt: input.updatedAt ?? C2_NOW,
    },
  });
  context.paymentIds.push(payment.id);
  return payment;
}

async function createOrder(context: TestContext, session: Awaited<ReturnType<typeof createSession>>, payment: Awaited<ReturnType<typeof createPayment>>) {
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: session.currency,
      subtotalAmount: session.subtotalAmount,
      shippingAmount: session.shippingAmount,
      totalAmount: session.totalAmount,
      paidAt: C2_NOW,
    },
  });
  context.orderIds.push(order.id);
  return order;
}

async function createMtoOrderItem(context: TestContext, orderId: string): Promise<void> {
  const variant = await createVariant(context);
  await db.orderItem.create({
    data: {
      orderId,
      variantId: variant.id,
      quantity: 1,
      unitAmount: 12_000,
      fulfillmentType: "MTO",
      snapshotData: { name: "C2 test" },
    },
  });
}

async function createVariant(context: TestContext) {
  const style = await db.wigStyle.create({
    data: {
      name: `C2 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
  context.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "C",
      price: 12_000,
      stock: 5,
      sku: `C2-${randomUUID()}`,
    },
  });
  context.variantIds.push(variant.id);
  return variant;
}

async function paymentWithVoidPath(context: TestContext, status: OutboxStatus, attempts: number) {
  const session = await createSession(context);
  const payment = await createPayment(context, session.id, { updatedAt: C2_OLD });
  const outbox = await createVoidOutbox(context, payment, { status, attempts });
  return { payment, outboxId: outbox.id };
}

async function createVoidOutbox(
  context: TestContext,
  payment: Awaited<ReturnType<typeof createPayment>>,
  input: { status: OutboxStatus; attempts: number; providerPaymentKey?: string },
) {
  const providerPaymentKey = input.providerPaymentKey ?? requireProviderKey(payment.providerPaymentKey);
  const outbox = await db.paymentOutbox.create({
    data: {
      topic: "pg.void",
      payload: { paymentId: payment.id, provider: payment.provider, providerPaymentKey, reason: "C2_TEST" },
      status: input.status,
      attempts: input.attempts,
      dedupKey: `void:${payment.provider}:${providerPaymentKey}`,
      updatedAt: C2_NOW,
    },
  });
  context.outboxIds.push(outbox.id);
  return outbox;
}

async function createPaymentEvent(
  context: TestContext,
  status: PaymentEventStatus,
  input: Partial<{
    receivedAt: Date;
    failureStage: PaymentEventFailureStage;
    failureCode: string;
    attemptCount: number;
    lastAttemptAt: Date;
  }> = {},
) {
  const event = await db.paymentEvent.create({
    data: {
      provider: PaymentProvider.TOSS,
      source: PaymentEventSource.WEBHOOK,
      transmissionId: `c2_tx_${randomUUID()}`,
      eventType: "PAYMENT.CAPTURED",
      raw: JSON.stringify({ c2: true }),
      status,
      receivedAt: input.receivedAt ?? C2_NOW,
      failureStage: input.failureStage,
      failureCode: input.failureCode,
      attemptCount: input.attemptCount ?? 0,
      lastAttemptAt: input.lastAttemptAt,
    },
  });
  context.eventIds.push(event.id);
  return event;
}

async function createRejection(
  context: TestContext,
  stage: WebhookIngressRejectionStage,
  code: string,
) {
  const rejection = await db.webhookIngressRejection.create({
    data: {
      provider: PaymentProvider.TOSS,
      stage,
      code,
      candidateTransmissionId: `c2_reject_${randomUUID()}`,
      candidateEventType: "PAYMENT.CAPTURED",
      rawBodyBytes: 10,
      rawBodyHash: "a".repeat(64),
      rawBodyPrefix: "c2",
      receivedAt: C2_NOW,
    },
  });
  context.rejectionIds.push(rejection.id);
  return rejection;
}

async function mutationSnapshot(userId: string, paymentId: string, eventId: string) {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { status: true, provider: true, providerPaymentKey: true },
  });
  const event = await db.paymentEvent.findUniqueOrThrow({ where: { id: eventId }, select: { status: true, attemptCount: true } });
  const dedupKey = payment.providerPaymentKey ? `void:${payment.provider}:${payment.providerPaymentKey}` : "missing";
  return {
    payment,
    event,
    orderCount: await db.order.count({ where: { userId } }),
    outboxCount: await db.paymentOutbox.count({ where: { dedupKey } }),
  };
}

function findingFor(
  findings: ReconciliationFinding[],
  kind: ReconciliationFinding["kind"],
  source: keyof ReconciliationFinding["sourceIds"],
  id: string,
) {
  const found = findings.find((finding) => finding.kind === kind && finding.sourceIds[source]?.includes(id));
  if (!found) throw new Error(`Missing ${kind} for ${source}:${id}`);
  return found;
}

function partialReason(findings: ReconciliationFinding[], orderId: string, reason: string): ReconciliationFinding | undefined {
  return findings.find((finding) => (
    finding.kind === "PARTIAL_LOCAL_COMPLETION"
    && finding.sourceIds.order?.includes(orderId)
    && finding.details.reason === reason
  ));
}

function requireProviderKey(providerPaymentKey: string | null): string {
  if (providerPaymentKey) return providerPaymentKey;
  throw new Error("Missing providerPaymentKey");
}

async function cleanup(context: TestContext): Promise<void> {
  await db.webhookIngressRejection.deleteMany({ where: { id: { in: context.rejectionIds } } });
  await db.paymentEvent.deleteMany({ where: { id: { in: context.eventIds } } });
  await db.paymentOutbox.deleteMany({ where: { id: { in: context.outboxIds } } });
  await db.manufacturingRequest.deleteMany({ where: { orderItem: { orderId: { in: context.orderIds } } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.orderShipping.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
