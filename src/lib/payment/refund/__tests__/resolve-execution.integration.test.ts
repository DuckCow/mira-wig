import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildRefundExecutionClaimOperationKey } from "../claim";
import {
  buildRefundExecutionApplyOperationKey,
  type ResolveRefundAdapterResponseInput,
  type ResolveRefundAdapterResponseResult,
} from "../execution-result-contract";
import { resolveRefundAdapterResponse } from "../resolve-execution";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-11T05:00:00.000Z");
const OBSERVED_AT = new Date("2026-07-11T04:59:59.000Z");

interface TestContext {
  userIds: string[];
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

interface Fixture {
  orderId: string;
  paymentId: string;
  refundAttemptId: string;
  commandId: string;
  totalAmount: number;
  targetAmount: number;
}

describe("resolveRefundAdapterResponse", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = { userIds: [], orderIds: [], paymentIds: [], sessionIds: [] };
    await ensureMarket();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it.each([
    { targetAmount: 400, expectedOrder: OrderStatus.PARTIALLY_REFUNDED, providerRefundId: null },
    { targetAmount: 1_000, expectedOrder: OrderStatus.REFUNDED, providerRefundId: "provider_refund_success" },
  ])("applies authoritative success atomically %#", async ({ targetAmount, expectedOrder, providerRefundId }) => {
    const fixture = await createFixture(ctx, { targetAmount });
    const beforePayment = await paymentState(fixture.paymentId);
    const result = success(await resolveRefundAdapterResponse(db, input(fixture, {
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      observedProviderRefundId: providerRefundId,
      reportedAmount: targetAmount,
      reportedCurrency: "krw",
    })));
    const state = await resolutionState(fixture);

    expect(result).toMatchObject({ application: RefundExecutionEvidenceApplication.APPLIED, replayed: false });
    expect(state.order.status).toBe(expectedOrder);
    expect(state.attempt).toMatchObject({
      status: RefundAttemptStatus.SUCCEEDED,
      processedAt: NOW,
      failedAt: null,
      providerRefundId,
      failureCode: null,
      safeFailureMessage: null,
    });
    expect(state.command).toMatchObject({ status: RefundExecutionCommandStatus.DONE, leaseOwner: null, leaseUntil: null });
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]).toMatchObject({
      application: RefundExecutionEvidenceApplication.APPLIED,
      reportedAmount: targetAmount,
      reportedCurrency: "KRW",
    });
    expect(state.resultTransitions).toHaveLength(1);
    expect(state.resultTransitions[0].operationKey).toBe(buildRefundExecutionApplyOperationKey(result.evidenceId));
    await expect(paymentState(fixture.paymentId)).resolves.toEqual(beforePayment);
  });

  it.each([null, "provider_pending_1"])(
    "applies accepted-pending with provider identity %s without an Attempt self-transition",
    async (providerRefundId) => {
    const fixture = await createFixture(ctx);
    const request = input(fixture, {
      outcome: RefundExecutionEvidenceOutcome.ACCEPTED_PENDING,
      observedProviderRefundId: providerRefundId,
      reportedAmount: null,
      reportedCurrency: null,
    });
    const result = success(await resolveRefundAdapterResponse(db, request));
    const replay = success(await resolveRefundAdapterResponse(db, request));
    const state = await resolutionState(fixture);

    expect(result.application).toBe(RefundExecutionEvidenceApplication.APPLIED);
    expect(replay).toEqual({ ...result, replayed: true });
    expect(state.attempt).toMatchObject({
      status: RefundAttemptStatus.PROCESSING,
      providerRefundId,
      failureCode: null,
      safeFailureMessage: null,
    });
    expect(state.command).toMatchObject({
      status: RefundExecutionCommandStatus.WAITING_EVIDENCE,
      leaseOwner: null,
      leaseUntil: null,
      lastSafeErrorCode: null,
      lastSafeErrorMessage: null,
    });
    expect(state.resultTransitions).toHaveLength(0);
    },
  );

  it.each([
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_RETRYABLE,
      attemptStatus: RefundAttemptStatus.FAILED_RETRYABLE,
      commandStatus: RefundExecutionCommandStatus.PARKED,
      orderStatus: OrderStatus.REFUND_PENDING,
      failedAt: null,
      safeCode: "PROVIDER_NOT_EXECUTED_RETRYABLE",
    },
    {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      attemptStatus: RefundAttemptStatus.FAILED_TERMINAL,
      commandStatus: RefundExecutionCommandStatus.DONE,
      orderStatus: OrderStatus.PAID,
      failedAt: NOW,
      safeCode: "PROVIDER_NOT_EXECUTED_TERMINAL",
    },
    {
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      attemptStatus: RefundAttemptStatus.MANUAL_REVIEW,
      commandStatus: RefundExecutionCommandStatus.PARKED,
      orderStatus: OrderStatus.REFUND_PENDING,
      failedAt: null,
      safeCode: "PROVIDER_OUTCOME_UNKNOWN",
    },
  ])("applies normalized non-success outcome $outcome", async (scenario) => {
    const fixture = await createFixture(ctx);
    await resolveRefundAdapterResponse(db, input(fixture, {
      outcome: scenario.outcome,
      reportedAmount: null,
      reportedCurrency: null,
    }));
    const state = await resolutionState(fixture);

    expect(state.order.status).toBe(scenario.orderStatus);
    expect(state.attempt).toMatchObject({
      status: scenario.attemptStatus,
      processedAt: null,
      failedAt: scenario.failedAt,
      failureCode: scenario.safeCode,
    });
    expect(state.command).toMatchObject({
      status: scenario.commandStatus,
      leaseOwner: null,
      leaseUntil: null,
      lastSafeErrorCode: scenario.safeCode,
    });
    expect(state.evidence[0]).toMatchObject({
      application: RefundExecutionEvidenceApplication.APPLIED,
      safeCode: scenario.safeCode,
    });
    expect(state.resultTransitions).toHaveLength(1);
  });

  it("restores PARTIALLY_REFUNDED after terminal non-execution follows prior success", async () => {
    const fixture = await createFixture(ctx, { priorSucceededAmount: 300, targetAmount: 400 });
    await resolveRefundAdapterResponse(db, input(fixture, {
      outcome: RefundExecutionEvidenceOutcome.NOT_EXECUTED_TERMINAL,
      reportedAmount: null,
      reportedCurrency: null,
    }));
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.PARTIALLY_REFUNDED);
  });

  it("parks success without money evidence and records one manual-review transition", async () => {
    const fixture = await createFixture(ctx);
    const result = success(await resolveRefundAdapterResponse(db, input(fixture, {
      outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
      reportedAmount: null,
      reportedCurrency: null,
    })));
    const state = await resolutionState(fixture);

    expect(result.application).toBe(RefundExecutionEvidenceApplication.PARKED);
    expect(state.attempt).toMatchObject({
      status: RefundAttemptStatus.MANUAL_REVIEW,
      providerRefundId: null,
      failureCode: "REFUND_SUCCESS_EVIDENCE_INCOMPLETE",
    });
    expect(state.command.status).toBe(RefundExecutionCommandStatus.PARKED);
    expect(state.order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(state.resultTransitions).toHaveLength(1);
  });

  it.each([
    { label: "amount", override: { reportedAmount: 399, reportedCurrency: "KRW" } },
    { label: "currency", override: { reportedAmount: 400, reportedCurrency: "USD" } },
  ])("records $label identity mismatch as CONFLICT", async ({ override }) => {
    const fixture = await createFixture(ctx);
    const result = success(await resolveRefundAdapterResponse(db, input(fixture, override)));
    const state = await resolutionState(fixture);

    expect(result.application).toBe(RefundExecutionEvidenceApplication.CONFLICT);
    expect(state.evidence[0].safeCode).toBe("REFUND_EVIDENCE_IDENTITY_CONFLICT");
    expect(state.attempt).toMatchObject({
      status: RefundAttemptStatus.MANUAL_REVIEW,
      failureCode: "REFUND_EVIDENCE_IDENTITY_CONFLICT",
    });
    expect(state.command.status).toBe(RefundExecutionCommandStatus.PARKED);
  });

  it("records provider-refund identity ownership collision without overwriting either Attempt", async () => {
    const owner = await createFixture(ctx, { targetProviderRefundId: "provider_owned" });
    const fixture = await createFixture(ctx);
    const result = success(await resolveRefundAdapterResponse(db, input(fixture, {
      observedProviderRefundId: "provider_owned",
    })));

    expect(result.application).toBe(RefundExecutionEvidenceApplication.CONFLICT);
    await expect(providerRefundId(fixture.refundAttemptId)).resolves.toBeNull();
    await expect(providerRefundId(owner.refundAttemptId)).resolves.toBe("provider_owned");
  });

  it("returns exact historical replay and rejects changed immutable observation", async () => {
    const fixture = await createFixture(ctx);
    const request = input(fixture);
    const first = success(await resolveRefundAdapterResponse(db, request));
    const before = await resolutionState(fixture);

    const replay = success(await resolveRefundAdapterResponse(db, request));
    const conflict = await resolveRefundAdapterResponse(db, { ...request, safeMessage: "changed" });

    expect(replay).toEqual({ ...first, replayed: true });
    expect(conflict).toMatchObject({ ok: false, code: "EVIDENCE_IDEMPOTENCY_CONFLICT" });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it("replays conflict evidence exactly and rejects a changed conflict safe message", async () => {
    const fixture = await createFixture(ctx);
    const request = input(fixture, { reportedAmount: 399, safeMessage: "Safe conflict context" });
    const first = success(await resolveRefundAdapterResponse(db, request));
    const replay = success(await resolveRefundAdapterResponse(db, request));
    const changed = await resolveRefundAdapterResponse(db, { ...request, safeMessage: "Changed context" });

    expect(first.application).toBe(RefundExecutionEvidenceApplication.CONFLICT);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(changed).toMatchObject({ ok: false, code: "EVIDENCE_IDEMPOTENCY_CONFLICT" });
  });

  it.each([
    {
      label: "outcome",
      change: { outcome: RefundExecutionEvidenceOutcome.UNKNOWN },
    },
    {
      label: "observedAt",
      change: { observedAt: new Date(OBSERVED_AT.getTime() + 1) },
    },
    { label: "safeCode", change: { safeCode: "DIFFERENT_CODE" } },
    { label: "safeMessage", change: { safeMessage: "Different safe message" } },
    { label: "money", change: { reportedAmount: 399 } },
    { label: "provider id", change: { observedProviderRefundId: "different_provider_refund" } },
  ])("rejects changed $label under an existing dedup identity", async ({ change }) => {
    const fixture = await createFixture(ctx);
    const request = input(fixture);
    await resolveRefundAdapterResponse(db, request);
    const before = await resolutionState(fixture);

    const conflict = await resolveRefundAdapterResponse(db, { ...request, ...change });

    expect(conflict).toMatchObject({ ok: false, code: "EVIDENCE_IDEMPOTENCY_CONFLICT" });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it.each([
    RefundExecutionCommandStatus.READY,
    RefundExecutionCommandStatus.WAITING_EVIDENCE,
    RefundExecutionCommandStatus.WAITING_RETRY,
    RefundExecutionCommandStatus.PARKED,
    RefundExecutionCommandStatus.DONE,
  ])("rejects a fresh adapter response from command state %s", async (status) => {
    const fixture = await createFixture(ctx);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { status, leaseOwner: null, leaseUntil: null },
    });
    const before = await resolutionState(fixture);

    const result = await resolveRefundAdapterResponse(db, input(fixture));

    expect(result).toMatchObject({ ok: false, code: "COMMAND_STATE_CONFLICT" });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it.each([0, 2])("rejects non-equal persisted ordinal %s without writes", async (dispatchAttempt) => {
    const fixture = await createFixture(ctx);
    const before = await resolutionState(fixture);
    const result = await resolveRefundAdapterResponse(db, input(fixture, { dispatchAttempt }));

    expect(result).toMatchObject({
      ok: false,
      code: dispatchAttempt === 0 ? "INVALID_DISPATCH_ATTEMPT" : "COMMAND_STATE_CONFLICT",
    });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it("rejects a lower positive ordinal without writes", async () => {
    const fixture = await createFixture(ctx);
    await db.refundExecutionCommand.update({
      where: { id: fixture.commandId },
      data: { dispatchAttempt: 2 },
    });
    const before = await resolutionState(fixture);

    const result = await resolveRefundAdapterResponse(db, input(fixture));

    expect(result).toMatchObject({ ok: false, code: "COMMAND_STATE_CONFLICT" });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it("rejects a fresh response when the Attempt is not PROCESSING", async () => {
    const fixture = await createFixture(ctx);
    await db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { status: RefundAttemptStatus.MANUAL_REVIEW },
    });
    const before = await resolutionState(fixture);

    const result = await resolveRefundAdapterResponse(db, input(fixture));

    expect(result).toMatchObject({ ok: false, code: "COMMAND_STATE_CONFLICT" });
    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it("fails aggregate corruption before writing evidence", async () => {
    const fixture = await createFixture(ctx);
    await db.payment.update({ where: { id: fixture.paymentId }, data: { status: PaymentAttemptStatus.FAILED } });

    const result = await resolveRefundAdapterResponse(db, input(fixture));

    expect(result).toMatchObject({ ok: false, code: "REFUND_LEDGER_INCONSISTENT" });
    await expect(db.refundExecutionEvidence.count({ where: { commandId: fixture.commandId } })).resolves.toBe(0);
  });

  it("rolls back evidence and every projection when transition persistence fails", async () => {
    const fixture = await createFixture(ctx);
    const before = await resolutionState(fixture);
    const outOfRangePostgresDate = new Date(-8_640_000_000_000_000);

    await expect(resolveRefundAdapterResponse(db, input(fixture, {
      outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
      reportedAmount: null,
      reportedCurrency: null,
      now: outOfRangePostgresDate,
    }))).rejects.toBeDefined();

    await expect(resolutionState(fixture)).resolves.toEqual(before);
  });

  it("serializes identical concurrent persistence into one apply and one replay", async () => {
    const fixture = await createFixture(ctx);
    const request = input(fixture);
    const firstSession = createNamedDbSession("result_same_first");
    const secondSession = createNamedDbSession("result_same_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => resolveRefundAdapterResponse(firstSession.client, request),
        secondSession,
        () => resolveRefundAdapterResponse(secondSession.client, request),
      );
      const results = await Promise.all([queued.first, queued.second]);
      expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
      expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
      const state = await resolutionState(fixture);
      expect(state.evidence).toHaveLength(1);
      expect(state.resultTransitions).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("serializes conflicting same-key observations into one apply and one idempotency conflict", async () => {
    const fixture = await createFixture(ctx);
    const firstSession = createNamedDbSession("result_conflict_first");
    const secondSession = createNamedDbSession("result_conflict_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => resolveRefundAdapterResponse(firstSession.client, input(fixture)),
        secondSession,
        () => resolveRefundAdapterResponse(secondSession.client, input(fixture, { safeMessage: "different" })),
      );
      const [first, second] = await Promise.all([queued.first, queued.second]);
      expect(first).toMatchObject({ ok: true, replayed: false });
      expect(second).toMatchObject({ ok: false, code: "EVIDENCE_IDEMPOTENCY_CONFLICT" });
      const state = await resolutionState(fixture);
      expect(state.evidence).toHaveLength(1);
      expect(state.resultTransitions).toHaveLength(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });
});

function input(
  fixture: Fixture,
  override: Partial<ResolveRefundAdapterResponseInput> = {},
): ResolveRefundAdapterResponseInput {
  return {
    commandId: fixture.commandId,
    dispatchAttempt: 1,
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: null,
    reportedAmount: fixture.targetAmount,
    reportedCurrency: "KRW",
    safeCode: null,
    safeMessage: null,
    observedAt: OBSERVED_AT,
    now: NOW,
    ...override,
  };
}

function success(
  result: ResolveRefundAdapterResponseResult,
): Extract<ResolveRefundAdapterResponseResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected resolution success, received ${result.code}.`);
  return result;
}

async function createFixture(
  context: TestContext,
  options: {
    totalAmount?: number;
    targetAmount?: number;
    priorSucceededAmount?: number;
    targetProviderRefundId?: string | null;
  } = {},
): Promise<Fixture> {
  const identity = randomUUID();
  const totalAmount = options.totalAmount ?? 1_000;
  const targetAmount = options.targetAmount ?? 400;
  const userId = `refund_resolution_${identity}`;
  context.userIds.push(userId);
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const session = await createSession(context, userId, totalAmount);
  const paymentId = await createPayment(context, session.id, totalAmount, identity);
  const orderId = await createOrder(context, session.id, paymentId, userId, totalAmount);
  if (options.priorSucceededAmount) {
    await createPriorSucceeded(orderId, paymentId, options.priorSucceededAmount, identity);
  }
  const refundAttemptId = await createTarget(
    orderId,
    paymentId,
    targetAmount,
    identity,
    options.priorSucceededAmount ?? 0,
    options.targetProviderRefundId ?? null,
  );
  const commandId = await createLeasedCommand(refundAttemptId);
  await createClaimTransition(refundAttemptId, commandId);
  return { orderId, paymentId, refundAttemptId, commandId, totalAmount, targetAmount };
}

async function createSession(context: TestContext, userId: string, totalAmount: number) {
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  context.sessionIds.push(session.id);
  return session;
}

async function createPayment(context: TestContext, sessionId: string, amount: number, identity: string) {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount,
      currency: "KRW",
      providerPaymentKey: `provider_payment_${identity}`,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
  context.paymentIds.push(payment.id);
  return payment.id;
}

async function createOrder(
  context: TestContext,
  sessionId: string,
  paymentId: string,
  userId: string,
  totalAmount: number,
) {
  const order = await db.order.create({
    data: {
      checkoutSessionId: sessionId,
      paymentId,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      status: OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
  });
  context.orderIds.push(order.id);
  return order.id;
}

async function createPriorSucceeded(
  orderId: string,
  paymentId: string,
  amount: number,
  identity: string,
): Promise<void> {
  await db.refundAttempt.create({
    data: {
      id: `prior_${identity}`,
      orderId,
      paymentId,
      amount,
      currency: "KRW",
      status: RefundAttemptStatus.SUCCEEDED,
      reason: "Prior verified refund",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${paymentId}:prior_${identity}`,
      requestedAt: new Date(NOW.getTime() - 10_000),
      processedAt: new Date(NOW.getTime() - 5_000),
    },
  });
}

async function createTarget(
  orderId: string,
  paymentId: string,
  amount: number,
  identity: string,
  priorSucceededAmount: number,
  providerRefundId: string | null,
): Promise<string> {
  const id = `target_${identity}`;
  await db.refundAttempt.create({
    data: {
      id,
      orderId,
      paymentId,
      amount,
      currency: "KRW",
      status: RefundAttemptStatus.PROCESSING,
      reason: "Approved refund request",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      providerRefundId,
      idempotencyKey: `refund:${paymentId}:${id}`,
      requestedAt: NOW,
    },
  });
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId: id,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: priorSucceededAmount > 0 ? OrderStatus.PARTIALLY_REFUNDED : OrderStatus.PAID,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      reason: "Approved refund request",
      operationKey: `refund-request:${id}`,
      createdAt: NOW,
    },
  });
  return id;
}

async function createLeasedCommand(refundAttemptId: string): Promise<string> {
  const command = await db.refundExecutionCommand.create({
    data: {
      refundAttemptId,
      status: RefundExecutionCommandStatus.LEASED,
      availableAt: NOW,
      leaseOwner: "worker-1",
      leaseUntil: new Date(NOW.getTime() + 60_000),
      dispatchAttempt: 1,
    },
  });
  return command.id;
}

async function createClaimTransition(refundAttemptId: string, commandId: string): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.PROCESSING,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
      reason: "Refund execution claimed.",
      operationKey: buildRefundExecutionClaimOperationKey(commandId),
      createdAt: NOW,
    },
  });
}

async function resolutionState(fixture: Fixture) {
  const [order, attempt, command, evidence, resultTransitions] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId }, orderBy: { createdAt: "asc" } }),
    db.refundAttemptTransition.findMany({
      where: { refundAttemptId: fixture.refundAttemptId, operationKey: { startsWith: "refund-exec-apply:" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { order, attempt, command, evidence, resultTransitions };
}

function paymentState(paymentId: string) {
  return db.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

function orderStatus(orderId: string): Promise<OrderStatus> {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    .then((order) => order.status);
}

function providerRefundId(refundAttemptId: string): Promise<string | null> {
  return db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId }, select: { providerRefundId: true } })
    .then((attempt) => attempt.providerRefundId);
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MARKET_CODE, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  const attempts = await db.refundAttempt.findMany({
    where: { orderId: { in: context.orderIds } },
    select: { id: true },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: { in: attemptIds } },
    select: { id: true },
  });
  const commandIds = commands.map((command) => command.id);
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: context.userIds } } });
}
