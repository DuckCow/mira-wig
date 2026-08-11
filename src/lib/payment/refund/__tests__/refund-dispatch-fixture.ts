import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionDispatchAttemptState,
  ShippingCountry,
} from "@prisma/client";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { claimRefundAttemptForExecution } from "../claim";
import { requestRefundAttempt } from "../request";

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

export enum DispatchFixtureConstructionStep {
  USER_CREATED = "USER_CREATED",
  CHECKOUT_SESSION_CREATED = "CHECKOUT_SESSION_CREATED",
  PAYMENT_CREATED = "PAYMENT_CREATED",
  ORDER_CREATED = "ORDER_CREATED",
  REFUND_ATTEMPT_CREATED = "REFUND_ATTEMPT_CREATED",
  REQUEST_TRANSITION_CREATED = "REQUEST_TRANSITION_CREATED",
  CLAIM_CREATED = "CLAIM_CREATED",
}

export enum DispatchFixtureCleanupStep {
  BEFORE_DEPENDENT_ROWS = "BEFORE_DEPENDENT_ROWS",
}

interface DispatchFixtureOptions {
  totalAmount?: number;
  targetAmount?: number;
  availableAt?: Date;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  requestThroughProduction?: boolean;
  useSchemaGeneratedRefundAttemptId?: boolean;
  refundAttemptId?: string;
  fixtureIdentity?: string;
  afterConstructionStep?: (step: DispatchFixtureConstructionStep) => void;
  beforeCleanupStep?: (step: DispatchFixtureCleanupStep) => void;
}

interface DispatchFixtureCleanupAuthority {
  userIds: string[];
  sessionIds: string[];
  paymentIds: string[];
  orderIds: string[];
  refundAttemptIds: string[];
  commandIds: string[];
}

interface DispatchFixtureCleanupJournal {
  userId?: string;
  sessionId?: string;
  paymentId?: string;
  orderId?: string;
  refundAttemptId?: string;
  commandId?: string;
}

export async function createDispatchFixture(
  options: DispatchFixtureOptions = {},
): Promise<DispatchFixture> {
  const journal: DispatchFixtureCleanupJournal = {};
  try {
    return await constructDispatchFixture(options, journal);
  } catch (constructionError) {
    const cleanupErrors = await cleanupDispatchAuthorities(
      cleanupAuthorityFromJournal(journal),
      options.beforeCleanupStep,
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [constructionError, ...cleanupErrors],
        "Dispatch fixture construction and cleanup both failed.",
        { cause: constructionError },
      );
    }
    throw constructionError;
  }
}

async function constructDispatchFixture(
  options: DispatchFixtureOptions,
  journal: DispatchFixtureCleanupJournal,
): Promise<DispatchFixture> {
  await ensureMarket();
  const identity = options.fixtureIdentity ?? randomUUID();
  const totalAmount = options.totalAmount ?? 1_000;
  const targetAmount = options.targetAmount ?? 400;
  const provider = options.provider ?? PaymentProvider.MOCK;
  const mode = options.mode ?? PaymentMode.SANDBOX;
  const userId = `dispatch_user_${identity}`;
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "Dispatch test" } });
  journal.userId = userId;
  observeConstructionStep(options, DispatchFixtureConstructionStep.USER_CREATED);
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
  journal.sessionId = session.id;
  observeConstructionStep(options, DispatchFixtureConstructionStep.CHECKOUT_SESSION_CREATED);
  const providerRef = `provider_ref_initial_${identity}`;
  const providerPaymentKey = `provider_payment_final_${identity}`;
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider,
      mode,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: totalAmount,
      currency: "KRW",
      providerOrderId: provider === PaymentProvider.EXIMBAY
        ? syntheticEximbayProviderOrderId()
        : null,
      providerRef,
      providerPaymentKey,
      financialSucceededAt: DISPATCH_NOW,
      blockingEndedAt: DISPATCH_NOW,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
  journal.paymentId = payment.id;
  observeConstructionStep(options, DispatchFixtureConstructionStep.PAYMENT_CREATED);
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
      status: options.requestThroughProduction ? OrderStatus.PAID : OrderStatus.REFUND_PENDING,
      paidAt: DISPATCH_NOW,
    },
  });
  journal.orderId = order.id;
  observeConstructionStep(options, DispatchFixtureConstructionStep.ORDER_CREATED);
  const attemptIdentity = refundAttemptFixtureIdentity(options, payment.id, identity);
  const requestedAttempt = await createRequestedAttempt({
    requestThroughProduction: options.requestThroughProduction === true,
    refundAttemptId: attemptIdentity.configuredId,
    orderId: order.id,
    paymentId: payment.id,
    targetAmount,
    reason: "Dispatch fixture refund request",
    provider,
    mode,
    operationKey: attemptIdentity.operationKey,
  }, journal, options);
  const claim = await claimRefundAttemptForExecution(db, {
    orderId: order.id,
    refundAttemptId: requestedAttempt.id,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "dispatch_admin",
    now: options.availableAt ?? DISPATCH_NOW,
  });
  if (!claim.ok) throw new Error(`Dispatch fixture claim failed: ${claim.code}`);
  journal.commandId = claim.commandId;
  observeConstructionStep(options, DispatchFixtureConstructionStep.CLAIM_CREATED);
  return {
    userId,
    sessionId: session.id,
    paymentId: payment.id,
    orderId: order.id,
    refundAttemptId: requestedAttempt.id,
    commandId: claim.commandId,
    totalAmount,
    targetAmount,
    providerRef,
    providerPaymentKey,
    operationKey: requestedAttempt.operationKey,
  };
}

function observeConstructionStep(
  options: DispatchFixtureOptions,
  step: DispatchFixtureConstructionStep,
): void {
  options.afterConstructionStep?.(step);
}

function refundAttemptFixtureIdentity(
  options: Readonly<{
    requestThroughProduction?: boolean;
    useSchemaGeneratedRefundAttemptId?: boolean;
    refundAttemptId?: string;
  }>,
  paymentId: string,
  identity: string,
): Readonly<{ configuredId: string | undefined; operationKey: string }> {
  if (options.useSchemaGeneratedRefundAttemptId
    && (options.requestThroughProduction || options.refundAttemptId !== undefined)) {
    throw new Error("Schema-generated refund attempt fixtures cannot set an explicit ID.");
  }
  const configuredId = options.useSchemaGeneratedRefundAttemptId
    ? undefined
    : options.refundAttemptId ?? `refund_${identity}`;
  const operationIdentity = configuredId ?? `refund_${identity}`;
  return Object.freeze({
    configuredId,
    operationKey: `refund:${paymentId}:${operationIdentity}`,
  });
}

async function createRequestedAttempt(input: Readonly<{
  requestThroughProduction: boolean;
  refundAttemptId: string | undefined;
  orderId: string;
  paymentId: string;
  targetAmount: number;
  reason: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  operationKey: string;
}>, journal: DispatchFixtureCleanupJournal, options: DispatchFixtureOptions): Promise<Readonly<{
  id: string;
  operationKey: string;
}>> {
  if (input.requestThroughProduction) {
    if (!input.refundAttemptId) throw new Error("Explicit refund attempt ID required.");
    const requested = await requestRefundAttempt(db, {
      refundAttemptId: input.refundAttemptId,
      orderId: input.orderId,
      amount: input.targetAmount,
      reason: input.reason,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "dispatch_admin",
      now: DISPATCH_NOW,
    });
    if (!requested.ok) throw new Error(`Dispatch fixture request failed: ${requested.code}`);
    journal.refundAttemptId = requested.refundAttempt.id;
    observeConstructionStep(options, DispatchFixtureConstructionStep.REFUND_ATTEMPT_CREATED);
    observeConstructionStep(options, DispatchFixtureConstructionStep.REQUEST_TRANSITION_CREATED);
    return Object.freeze({
      id: requested.refundAttempt.id,
      operationKey: requested.refundAttempt.idempotencyKey,
    });
  } else {
    const attempt = await db.refundAttempt.create({
      data: {
        ...(input.refundAttemptId ? { id: input.refundAttemptId } : {}),
        orderId: input.orderId,
        paymentId: input.paymentId,
        amount: input.targetAmount,
        currency: "KRW",
        status: RefundAttemptStatus.REQUESTED,
        reason: input.reason,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "dispatch_admin",
        provider: input.provider,
        mode: input.mode,
        idempotencyKey: input.operationKey,
        requestedAt: DISPATCH_NOW,
      },
    });
    journal.refundAttemptId = attempt.id;
    observeConstructionStep(options, DispatchFixtureConstructionStep.REFUND_ATTEMPT_CREATED);
    const operationKey = `refund:${input.paymentId}:${attempt.id}`;
    if (operationKey !== input.operationKey) {
      await db.refundAttempt.update({
        where: { id: attempt.id },
        data: { idempotencyKey: operationKey },
      });
    }
    await db.refundAttemptTransition.create({
      data: {
        refundAttemptId: attempt.id,
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "dispatch_admin",
        reason: input.reason,
        operationKey: `refund-request:${attempt.id}`,
        createdAt: DISPATCH_NOW,
      },
    });
    observeConstructionStep(options, DispatchFixtureConstructionStep.REQUEST_TRANSITION_CREATED);
    return Object.freeze({ id: attempt.id, operationKey });
  }
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
  const cleanupErrors = await cleanupDispatchAuthorities({
    orderIds: fixtures.map((fixture) => fixture.orderId),
    paymentIds: fixtures.map((fixture) => fixture.paymentId),
    sessionIds: fixtures.map((fixture) => fixture.sessionId),
    userIds: fixtures.map((fixture) => fixture.userId),
    refundAttemptIds: fixtures.map((fixture) => fixture.refundAttemptId),
    commandIds: fixtures.map((fixture) => fixture.commandId),
  });
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Dispatch fixture cleanup failed.");
  }
}

function cleanupAuthorityFromJournal(
  journal: DispatchFixtureCleanupJournal,
): DispatchFixtureCleanupAuthority {
  return {
    userIds: journal.userId ? [journal.userId] : [],
    sessionIds: journal.sessionId ? [journal.sessionId] : [],
    paymentIds: journal.paymentId ? [journal.paymentId] : [],
    orderIds: journal.orderId ? [journal.orderId] : [],
    refundAttemptIds: journal.refundAttemptId ? [journal.refundAttemptId] : [],
    commandIds: journal.commandId ? [journal.commandId] : [],
  };
}

async function cleanupDispatchAuthorities(
  authority: DispatchFixtureCleanupAuthority,
  beforeCleanupStep?: (step: DispatchFixtureCleanupStep) => void,
): Promise<unknown[]> {
  const cleanupErrors: unknown[] = [];
  try {
    beforeCleanupStep?.(DispatchFixtureCleanupStep.BEFORE_DEPENDENT_ROWS);
  } catch (error) {
    cleanupErrors.push(error);
  }
  const attemptRows = await collectCleanupQuery(
    cleanupErrors,
    () => db.refundAttempt.findMany({
      where: {
        OR: [
          { id: { in: authority.refundAttemptIds } },
          { orderId: { in: authority.orderIds } },
        ],
      },
      select: { id: true },
    }),
  );
  const attemptIds = uniqueStrings([
    ...authority.refundAttemptIds,
    ...attemptRows.map((attempt) => attempt.id),
  ]);
  const commandRows = await collectCleanupQuery(
    cleanupErrors,
    () => db.refundExecutionCommand.findMany({
      where: { refundAttemptId: { in: attemptIds } },
      select: { id: true },
    }),
  );
  const commandIds = uniqueStrings([
    ...authority.commandIds,
    ...commandRows.map((command) => command.id),
  ]);
  const bindings = await collectCleanupQuery(
    cleanupErrors,
    () => db.refundExecutionProviderOperationBinding.findMany({
      where: { refundAttemptId: { in: attemptIds } },
      select: { id: true },
    }),
  );
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionProviderContactEligibilityProof.deleteMany({
      where: { dispatchAttempt: { commandId: { in: commandIds } } },
    })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionProviderEligibilityProof.deleteMany({
      where: { bindingId: { in: bindings.map((binding) => binding.id) } },
    })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionProviderOperationBinding.deleteMany({
      where: { id: { in: bindings.map((binding) => binding.id) } },
    })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: { in: commandIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionCommandEvent.deleteMany({ where: { commandId: { in: commandIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.order.deleteMany({ where: { id: { in: authority.orderIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.payment.deleteMany({ where: { id: { in: authority.paymentIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.checkoutSession.deleteMany({ where: { id: { in: authority.sessionIds } } })
  ));
  await collectCleanupMutation(cleanupErrors, () => (
    db.user.deleteMany({ where: { id: { in: authority.userIds } } })
  ));
  return cleanupErrors;
}

async function collectCleanupQuery<T>(
  errors: unknown[],
  query: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    errors.push(error);
    return [];
  }
}

async function collectCleanupMutation(
  errors: unknown[],
  mutation: () => Promise<unknown>,
): Promise<void> {
  try {
    await mutation();
  } catch (error) {
    errors.push(error);
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MARKET_CODE, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}
