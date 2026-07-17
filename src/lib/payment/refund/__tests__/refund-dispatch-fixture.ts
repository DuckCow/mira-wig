import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionDispatchAttemptState,
  ShippingCountry,
} from "@prisma/client";
import { db } from "@/lib/db";
import { claimRefundAttemptForExecution } from "../claim";

export const DISPATCH_NOW = new Date("2026-07-11T07:00:00.000Z");
export const LEASE_UNTIL = new Date("2026-07-11T07:05:00.000Z");
export const DISPATCH_TEST_LEASE_GENERATION = 1;
export const DISPATCH_TEST_LEASE_TOKEN_HASH = "b".repeat(64);
const MARKET_CODE = "KR";

export interface DispatchFixture {
  userId: string;
  sessionId: string;
  paymentId: string;
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  totalAmount: number;
  targetAmount: number;
  providerRef: string;
  providerPaymentKey: string;
  operationKey: string;
}

export async function createDispatchFixture(
  options: { totalAmount?: number; targetAmount?: number; availableAt?: Date } = {},
): Promise<DispatchFixture> {
  await ensureMarket();
  const identity = randomUUID();
  const totalAmount = options.totalAmount ?? 1_000;
  const targetAmount = options.targetAmount ?? 400;
  const userId = `dispatch_user_${identity}`;
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "Dispatch test" } });
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      expiresAt: new Date(DISPATCH_NOW.getTime() + 30 * 60_000),
      completedAt: DISPATCH_NOW,
    },
  });
  const providerRef = `provider_ref_initial_${identity}`;
  const providerPaymentKey = `provider_payment_final_${identity}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: totalAmount,
      currency: "KRW",
      providerRef,
      providerPaymentKey,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      status: OrderStatus.REFUND_PENDING,
      paidAt: DISPATCH_NOW,
    },
  });
  const refundAttemptId = `refund_${identity}`;
  const operationKey = `refund:${payment.id}:${refundAttemptId}`;
  const reason = "Dispatch fixture refund request";
  await db.refundAttempt.create({
    data: {
      id: refundAttemptId,
      orderId: order.id,
      paymentId: payment.id,
      amount: targetAmount,
      currency: "KRW",
      status: RefundAttemptStatus.REQUESTED,
      reason,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "dispatch_admin",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: operationKey,
      requestedAt: DISPATCH_NOW,
    },
  });
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: OrderStatus.PAID,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "dispatch_admin",
      reason,
      operationKey: `refund-request:${refundAttemptId}`,
      createdAt: DISPATCH_NOW,
    },
  });
  const claim = await claimRefundAttemptForExecution(db, {
    orderId: order.id,
    refundAttemptId,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "dispatch_admin",
    now: options.availableAt ?? DISPATCH_NOW,
  });
  if (!claim.ok) throw new Error(`Dispatch fixture claim failed: ${claim.code}`);
  return {
    userId,
    sessionId: session.id,
    paymentId: payment.id,
    orderId: order.id,
    refundAttemptId,
    commandId: claim.commandId,
    totalAmount,
    targetAmount,
    providerRef,
    providerPaymentKey,
    operationKey,
  };
}

export async function dispatchState(fixture: DispatchFixture) {
  const [order, payment, attempt, command, commandEvents, evidence, transitions] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
    db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
    db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    db.refundExecutionCommandEvent.findMany({
      where: { commandId: fixture.commandId },
      orderBy: { occurredAt: "asc" },
    }),
    db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId }, orderBy: { createdAt: "asc" } }),
    db.refundAttemptTransition.findMany({
      where: { refundAttemptId: fixture.refundAttemptId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { order, payment, attempt, command, commandEvents, evidence, transitions };
}

export async function redactedDispatchAuthorizationState(fixture: DispatchFixture) {
  const [order, payment, attempt, command, commandEvents, evidence, transitions, dispatchAttempts] =
    await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
      db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
      db.refundExecutionCommandEvent.findMany({ where: { commandId: fixture.commandId } }),
      db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId } }),
      db.refundAttemptTransition.findMany({ where: { refundAttemptId: fixture.refundAttemptId } }),
      db.refundExecutionDispatchAttempt.findMany({ where: { commandId: fixture.commandId } }),
    ]);
  return {
    orderStatus: order.status,
    orderTotalAmount: order.totalAmount,
    orderCurrency: order.currency,
    orderUpdatedAt: order.updatedAt.getTime(),
    paymentStatus: payment.status,
    paymentAmount: payment.amount,
    paymentCurrency: payment.currency,
    paymentProvider: payment.provider,
    paymentMode: payment.mode,
    attemptStatus: attempt.status,
    attemptAmount: attempt.amount,
    attemptCurrency: attempt.currency,
    attemptProvider: attempt.provider,
    attemptMode: attempt.mode,
    providerRefundIdPresent: attempt.providerRefundId !== null,
    commandStatus: command.status,
    commandDispatchAttempt: command.dispatchAttempt,
    commandLeaseGeneration: command.leaseGeneration,
    commandLeaseUntilMs: command.leaseUntil?.getTime() ?? null,
    commandAvailableAtMs: command.availableAt.getTime(),
    commandLeaseOwnerPresent: Boolean(command.leaseOwner?.trim()),
    commandTokenHashPresent: command.leaseTokenHash !== null,
    commandTokenHashFormatValid: /^[0-9a-f]{64}$/.test(command.leaseTokenHash ?? ""),
    commandSafeErrorCodePresent: command.lastSafeErrorCode !== null,
    commandSafeErrorMessagePresent: command.lastSafeErrorMessage !== null,
    commandEventCount: commandEvents.length,
    evidenceCount: evidence.length,
    transitionCount: transitions.length,
    dispatchAttemptCount: dispatchAttempts.length,
    dispatchOrdinals: dispatchAttempts.map((row) => row.ordinal),
    dispatchGenerations: dispatchAttempts.map((row) => row.leaseGeneration),
    dispatchStates: dispatchAttempts.map((row) => row.state),
    dispatchContactMarked: dispatchAttempts.map((row) => row.contactMarkedAt !== null),
    dispatchAuthorizedAtMs: dispatchAttempts.map((row) => row.authorizedAt.getTime()),
    dispatchOperationKeysPresent: dispatchAttempts.map((row) => row.providerOperationKey.length > 0),
    dispatchFingerprintsValid: dispatchAttempts.map((row) => /^[0-9a-f]{64}$/.test(
      row.requestFingerprint,
    )),
  };
}

export async function addOpenAttempt(fixture: DispatchFixture): Promise<string> {
  const id = `refund_open_${randomUUID()}`;
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount: 100,
      currency: "KRW",
      status: RefundAttemptStatus.PROCESSING,
      reason: "Conflicting open attempt",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${fixture.paymentId}:${id}`,
      requestedAt: DISPATCH_NOW,
    },
  });
  return id;
}

export async function markDispatchContactForTest(
  fixture: DispatchFixture,
  ordinal = 1,
): Promise<void> {
  const database = await db.$queryRaw<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  if (database.length !== 1 || database[0].databaseName !== "wig_platform_test") {
    throw new Error("Refund dispatch contact fixture writes are restricted to wig_platform_test.");
  }
  const clock = await db.$queryRaw<{ capturedAt: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS "capturedAt"
  `;
  if (clock.length !== 1 || !(clock[0].capturedAt instanceof Date)) {
    throw new Error("Unable to capture refund dispatch contact fixture time.");
  }
  const updated = await db.refundExecutionDispatchAttempt.updateMany({
    where: {
      commandId: fixture.commandId,
      ordinal,
      state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      contactMarkedAt: null,
    },
    data: {
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      contactMarkedAt: clock[0].capturedAt,
    },
  });
  if (updated.count !== 1) throw new Error("Expected one authorized dispatch fixture row.");
}

export async function cleanupDispatchFixtures(...fixtures: readonly DispatchFixture[]): Promise<void> {
  const orderIds = fixtures.map((fixture) => fixture.orderId);
  const paymentIds = fixtures.map((fixture) => fixture.paymentId);
  const sessionIds = fixtures.map((fixture) => fixture.sessionId);
  const userIds = fixtures.map((fixture) => fixture.userId);
  const attempts = await db.refundAttempt.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const attemptIds = attempts.map((attempt) => attempt.id);
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: { in: attemptIds } },
    select: { id: true },
  });
  const commandIds = commands.map((command) => command.id);
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: { in: attemptIds } },
    select: { id: true },
  });
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionProviderContactEligibilityProof.deleteMany({
    where: { dispatchAttempt: { commandId: { in: commandIds } } },
  });
  await db.refundExecutionProviderEligibilityProof.deleteMany({
    where: { bindingId: { in: bindings.map((binding) => binding.id) } },
  });
  await db.refundExecutionProviderOperationBinding.deleteMany({
    where: { id: { in: bindings.map((binding) => binding.id) } },
  });
  await db.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommandEvent.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MARKET_CODE, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}
