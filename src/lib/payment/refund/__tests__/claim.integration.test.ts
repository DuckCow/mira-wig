import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  ShippingCountry,
  type RefundAttemptTransition,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import {
  buildRefundExecutionClaimOperationKey,
  claimRefundAttemptForAdminSandboxExecution,
  claimRefundAttemptForExecution,
  claimRefundAttemptForManualSandboxExecution,
  classifyExistingRefundExecutionClaim,
  type ClaimRefundAttemptForExecutionInput,
  type ClaimRefundAttemptForExecutionResult,
  type ClaimRefundAttemptForManualSandboxExecutionInput,
} from "../claim";
import {
  REFUND_EXECUTION_CLAIM_ENABLED,
  REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED,
  RefundExecutionActivationConfigError,
} from "../execution-activation";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const NOW = new Date("2026-07-11T04:00:00.000Z");
const MARKET_CODE = "KR";

interface TestContext {
  userId: string;
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

interface OrderOptions {
  orderStatus?: OrderStatus;
  orderAmount?: number;
  orderCurrency?: string;
  paymentStatus?: PaymentAttemptStatus;
  paymentAmount?: number;
  paymentCurrency?: string;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  providerPaymentKey?: string | null;
  paymentAdapterExecutionKind?: PaymentAdapterExecutionKind | null;
  paymentAttemptLifecycle?: PaymentAttemptLifecycle;
}

interface OrderFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
}

interface AttemptOptions {
  id?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  status?: RefundAttemptStatus;
  provider?: PaymentProvider;
  mode?: PaymentMode;
  providerRefundId?: string | null;
  idempotencyKey?: string;
  createRequestTransition?: boolean;
  transitionReason?: string;
  actorType?: RefundAttemptActorType;
  actorUserId?: string | null;
}

const EXIMBAY_APPROVER_ID = "eximbay_refund_approver";
const BOTH_EXIMBAY_CLAIM_GATES = Object.freeze({
  [REFUND_EXECUTION_CLAIM_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED]: "ENABLED",
});

describe("claimRefundAttemptForExecution", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = { userId: `refund_claim_${randomUUID()}`, orderIds: [], paymentIds: [], sessionIds: [] };
    await ensureMarket();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("atomically claims REQUESTED with one READY command and one transition", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const beforePayment = await paymentState(fixture.paymentId);

    const result = success(await claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId)));
    const [attempt, order, payment, command, transitions, evidenceCount] = await Promise.all([
      db.refundAttempt.findUniqueOrThrow({ where: { id: targetId } }),
      db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
      paymentState(fixture.paymentId),
      db.refundExecutionCommand.findUniqueOrThrow({ where: { refundAttemptId: targetId } }),
      claimTransitions(targetId),
      db.refundExecutionEvidence.count({ where: { command: { refundAttemptId: targetId } } }),
    ]);

    expect(result).toEqual({ ok: true, refundAttemptId: targetId, commandId: command.id, replayed: false });
    expect(Object.keys(result).sort()).toEqual(["commandId", "ok", "refundAttemptId", "replayed"]);
    expect(attempt.status).toBe(RefundAttemptStatus.PROCESSING);
    expect(order.status).toBe(OrderStatus.REFUND_PENDING);
    expect(payment).toEqual(beforePayment);
    expect(command).toMatchObject({
      status: RefundExecutionCommandStatus.READY,
      availableAt: NOW,
      dispatchAttempt: 0,
      leaseOwner: null,
      leaseUntil: null,
      lastSafeErrorCode: null,
      lastSafeErrorMessage: null,
    });
    expect(transitions).toEqual([
      expect.objectContaining({
        refundAttemptId: targetId,
        fromStatus: RefundAttemptStatus.REQUESTED,
        toStatus: RefundAttemptStatus.PROCESSING,
        orderStatusBefore: OrderStatus.REFUND_PENDING,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "admin_123",
        reason: "Refund execution claimed.",
        operationKey: buildRefundExecutionClaimOperationKey(command.id),
        createdAt: NOW,
      }),
    ]);
    expect(evidenceCount).toBe(0);
  });

  it("returns exact replay without another command, transition, or aggregate mutation", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = claimInput(fixture.orderId, targetId);
    const first = success(await claimRefundAttemptForExecution(db, request));
    const before = await persistenceState(fixture, targetId);

    const replay = success(await claimRefundAttemptForExecution(db, request));

    expect(replay).toEqual({ ...first, replayed: true });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
    await expect(commandCount(targetId)).resolves.toBe(1);
    await expect(claimTransitionCount(targetId)).resolves.toBe(1);
  });

  it("recognizes historical claim replay after coherent later projections", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = claimInput(fixture.orderId, targetId, {
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    });
    const first = success(await claimRefundAttemptForExecution(db, request));
    await db.$transaction([
      db.refundAttempt.update({
        where: { id: targetId },
        data: { status: RefundAttemptStatus.SUCCEEDED, processedAt: NOW },
      }),
      db.refundExecutionCommand.update({
        where: { id: first.commandId },
        data: { status: RefundExecutionCommandStatus.DONE },
      }),
      db.order.update({ where: { id: fixture.orderId }, data: { status: OrderStatus.REFUNDED } }),
      db.refundAttemptTransition.create({
        data: {
          refundAttemptId: targetId,
          fromStatus: RefundAttemptStatus.PROCESSING,
          toStatus: RefundAttemptStatus.SUCCEEDED,
          orderStatusBefore: OrderStatus.REFUND_PENDING,
          orderStatusAfter: OrderStatus.REFUNDED,
          actorType: RefundAttemptActorType.SYSTEM,
          actorUserId: null,
          reason: "Seed verified success",
          operationKey: `refund-resolve:${targetId}:success`,
          createdAt: new Date(NOW.getTime() + 1_000),
        },
      }),
    ]);

    const replay = success(await claimRefundAttemptForExecution(db, request));

    expect(replay).toEqual({ ...first, replayed: true });
    await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUNDED);
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.SUCCEEDED);
    await expect(commandCount(targetId)).resolves.toBe(1);
    await expect(claimTransitionCount(targetId)).resolves.toBe(1);
  });

  it.each([
    RefundAttemptStatus.CANCELLED,
  ])("rejects an unclaimed target in state %s without writes", async (status) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status });
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId));

    expect(result).toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_CLAIMABLE" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("rejects PROCESSING without durable claim artifacts", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
  });

  it("rejects a target owned by another Order", async () => {
    const suppliedOrder = await createOrder(ctx);
    const actualOrder = await createOrder(ctx);
    const targetId = await seedAttempt(actualOrder);
    const before = await persistenceState(actualOrder, targetId);

    const result = await claimRefundAttemptForExecution(db, claimInput(suppliedOrder.orderId, targetId));

    expect(result).toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_FOUND" });
    await expect(persistenceState(actualOrder, targetId)).resolves.toEqual(before);
  });

  it("rejects an Order outside REFUND_PENDING", async () => {
    const fixture = await createOrder(ctx, { orderStatus: OrderStatus.PAID });
    const targetId = await seedAttempt(fixture);
    await expectNoWriteFailure(fixture, targetId, "ORDER_STATUS_CONFLICT");
  });

  it("distinguishes missing Order and missing attempt", async () => {
    await expect(claimRefundAttemptForExecution(db, claimInput("missing_order", "missing_attempt")))
      .resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND" });

    const fixture = await createOrder(ctx);
    const before = await orderAndPaymentState(fixture);
    await expect(claimRefundAttemptForExecution(db, claimInput(fixture.orderId, "missing_attempt")))
      .resolves.toMatchObject({ ok: false, code: "REFUND_ATTEMPT_NOT_FOUND" });
    await expect(orderAndPaymentState(fixture)).resolves.toEqual(before);
  });

  it("rejects a non-SUCCEEDED Payment without writes", async () => {
    const fixture = await createOrder(ctx, { paymentStatus: PaymentAttemptStatus.FAILED });
    const targetId = await seedAttempt(fixture);
    await expectNoWriteFailure(fixture, targetId, "PAYMENT_NOT_REFUNDABLE");
  });

  it("does not claim a seeded Eximbay refund attempt or create execution artifacts", async () => {
    const fixture = await createOrder(ctx, { provider: PaymentProvider.EXIMBAY });
    const targetId = await seedAttempt(fixture);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForExecution(
      db,
      claimInput(fixture.orderId, targetId),
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
    await expect(commandCount(targetId)).resolves.toBe(0);
    await expect(claimTransitionCount(targetId)).resolves.toBe(0);
  });

  it.each([
    ["all claim gates OFF", {}],
    ["generic claim gate alone", { [REFUND_EXECUTION_CLAIM_ENABLED]: "ENABLED" }],
  ] as const)("keeps an approved Eximbay attempt blocked with %s", async (_label, env) => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      env,
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("keeps the provider-specific Eximbay gate insufficient without the generic claim gate", async () => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      { [REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED]: "ENABLED" },
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("claims one authorized finalized external Eximbay SANDBOX attempt and replays exactly", async () => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx);
    const input = manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID);

    const first = success(await claimRefundAttemptForAdminSandboxExecution(
      db,
      input,
      BOTH_EXIMBAY_CLAIM_GATES,
    ));
    const beforeReplay = await persistenceState(fixture, targetId);
    const replay = success(await claimRefundAttemptForAdminSandboxExecution(
      db,
      input,
      BOTH_EXIMBAY_CLAIM_GATES,
    ));

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.PROCESSING);
    await expect(commandCount(targetId)).resolves.toBe(1);
    await expect(claimTransitionCount(targetId)).resolves.toBe(1);
    await expect(db.refundExecutionCommand.findUniqueOrThrow({
      where: { refundAttemptId: targetId },
      select: { status: true },
    })).resolves.toEqual({ status: RefundExecutionCommandStatus.READY });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(beforeReplay);
  });

  it("rejects approved Eximbay provenance with a mismatched creation-transition timestamp", async () => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx);
    const mismatchedCreationAt = new Date(NOW.getTime() + 1_000);
    await db.refundAttemptTransition.update({
      where: { operationKey: `refund-request:${targetId}` },
      data: { createdAt: mismatchedCreationAt },
    });
    const [attempt, intake, creation] = await Promise.all([
      db.refundAttempt.findUniqueOrThrow({
        where: { id: targetId },
        select: { requestedAt: true },
      }),
      db.customerRefundIntake.findUniqueOrThrow({
        where: { approvedRefundAttemptId: targetId },
        select: { reviewedAt: true },
      }),
      db.refundAttemptTransition.findUniqueOrThrow({
        where: { operationKey: `refund-request:${targetId}` },
        select: { createdAt: true },
      }),
    ]);
    expect(attempt.requestedAt).toEqual(NOW);
    expect(intake.reviewedAt).toEqual(NOW);
    expect(creation.createdAt).toEqual(mismatchedCreationAt);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      BOTH_EXIMBAY_CLAIM_GATES,
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
    await expect(commandCount(targetId)).resolves.toBe(0);
    await expect(claimTransitionCount(targetId)).resolves.toBe(0);
    await expect(db.refundExecutionDispatchAttempt.count({
      where: { command: { refundAttemptId: targetId } },
    })).resolves.toBe(0);
  });

  it("fails closed on a malformed provider-specific Eximbay claim gate without writes", async () => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx);
    const before = await persistenceState(fixture, targetId);

    await expect(claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      {
        [REFUND_EXECUTION_CLAIM_ENABLED]: "ENABLED",
        [REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED]: "true",
      },
    )).rejects.toBeInstanceOf(RefundExecutionActivationConfigError);
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it.each([
    ["LIVE mode", { mode: PaymentMode.LIVE }],
    ["unsupported currency", { orderCurrency: "EUR" }],
  ] as const)("keeps approved Eximbay %s unsupported", async (_label, options) => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx, options);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      BOTH_EXIMBAY_CLAIM_GATES,
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it.each([
    ["missing external adapter identity", { paymentAdapterExecutionKind: null }],
    ["non-finalized payment lifecycle", { paymentAttemptLifecycle: PaymentAttemptLifecycle.CONTACTED }],
  ] as const)("rejects Eximbay payment authority with %s", async (_label, options) => {
    const { fixture, targetId } = await seedApprovedEximbayAttempt(ctx, options);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      BOTH_EXIMBAY_CLAIM_GATES,
    );

    expect(result).toMatchObject({ ok: false, code: "PAYMENT_NOT_REFUNDABLE" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("does not admit a direct admin Eximbay attempt without approved customer-intake provenance", async () => {
    const fixture = await createOrder(ctx, {
      provider: PaymentProvider.EXIMBAY,
      orderCurrency: "USD",
      paymentAdapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    });
    const targetId = await seedAttempt(fixture, {
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: EXIMBAY_APPROVER_ID,
    });
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForAdminSandboxExecution(
      db,
      manualClaimInput(fixture.orderId, targetId, EXIMBAY_APPROVER_ID),
      BOTH_EXIMBAY_CLAIM_GATES,
    );

    expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it.each([
    ["currency", { currency: "USD" }],
    ["provider", { provider: PaymentProvider.PAYPAL }],
    ["mode", { mode: PaymentMode.LIVE }],
  ] as const)("rejects target %s identity mismatch", async (_label, options) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, options);
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects target Payment identity mismatch", async () => {
    const fixture = await createOrder(ctx);
    const other = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { paymentId: other.paymentId });
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects an existing provider refund identity", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { providerRefundId: `provider_refund_${randomUUID()}` });
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects invalid or over-total reservations", async () => {
    const invalidFixture = await createOrder(ctx);
    const invalidId = await seedAttempt(invalidFixture, { amount: 0 });
    await expectNoWriteFailure(invalidFixture, invalidId, "REFUND_LEDGER_INCONSISTENT");

    const overFixture = await createOrder(ctx);
    await seedAttempt(overFixture, { status: RefundAttemptStatus.SUCCEEDED, amount: 700 });
    const overId = await seedAttempt(overFixture, { amount: 400 });
    await expectNoWriteFailure(overFixture, overId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects conflicting active attempts", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it.each([
    ["missing", { createRequestTransition: false }],
    ["inconsistent", { transitionReason: "Different request reason" }],
  ] as const)("rejects %s request-creation history", async (_label, options) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, options);
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects an inconsistent provider operation identity", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { idempotencyKey: "wrong_refund_identity" });
    await expectNoWriteFailure(fixture, targetId, "REFUND_LEDGER_INCONSISTENT");
  });

  it("rejects REQUESTED with an existing command and does not repair it", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    await seedCommand(targetId);
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
    await expect(commandCount(targetId)).resolves.toBe(1);
  });

  it("rejects a PROCESSING command without a matching claim transition", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    await seedCommand(targetId);
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
  });

  it("rejects a claim transition without a command", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    await seedClaimTransition(targetId, `missing_command_${randomUUID()}`);
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
  });

  it("rejects mismatched derived operation identity", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    const commandId = await seedCommand(targetId);
    await seedClaimTransition(targetId, commandId, {
      operationKey: buildRefundExecutionClaimOperationKey(`other_${commandId}`),
    });
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
  });

  it("rejects a claim-key transition with the wrong direction", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
    const commandId = await seedCommand(targetId);
    await seedClaimTransition(targetId, commandId, {
      toStatus: RefundAttemptStatus.CANCELLED,
    });
    await expectNoWriteFailure(fixture, targetId, "CLAIM_ARTIFACT_CONFLICT");
  });

  it("rolls back the REQUESTED CAS when command persistence fails", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const before = await persistenceState(fixture, targetId);
    const outOfRangePostgresDate = new Date(-8_640_000_000_000_000);

    await expect(claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId, {
      now: outOfRangePostgresDate,
    }))).rejects.toBeDefined();

    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
    await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
    await expect(commandCount(targetId)).resolves.toBe(0);
    await expect(claimTransitionCount(targetId)).resolves.toBe(0);
  });

  it("serializes duplicate claims into one fresh success and one exact replay", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const request = claimInput(fixture.orderId, targetId);
    const firstSession = createNamedDbSession("claim_duplicate_first");
    const secondSession = createNamedDbSession("claim_duplicate_second");

    try {
      const queued = await queueBehindObservedOrderLock(
        fixture.orderId,
        firstSession,
        () => claimRefundAttemptForExecution(firstSession.client, request),
        secondSession,
        () => claimRefundAttemptForExecution(secondSession.client, request),
      );
      const [first, second] = await Promise.all([queued.first, queued.second]);

      expect(first).toMatchObject({ ok: true, replayed: false });
      expect(second).toMatchObject({ ok: true, replayed: true });
      expect(queued.firstWait.blockingPids).toContain(queued.holderPid);
      expect(queued.secondWait.blockingPids).toContain(queued.firstWait.pid);
      await expect(commandCount(targetId)).resolves.toBe(1);
      await expect(claimTransitionCount(targetId)).resolves.toBe(1);
    } finally {
      await disconnectSessions(firstSession, secondSession);
    }
  });

  it("accepts SYSTEM with null actor identity", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);

    const result = success(await claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId, {
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: null,
    })));
    const transition = (await claimTransitions(targetId))[0];

    expect(result.replayed).toBe(false);
    expect(transition).toMatchObject({ actorType: RefundAttemptActorType.SYSTEM, actorUserId: null });
  });

  it.each([
    [RefundAttemptActorType.ADMIN, null, "INVALID_ACTOR_USER_ID"],
    [RefundAttemptActorType.ADMIN, "   ", "INVALID_ACTOR_USER_ID"],
  ] as const)("rejects invalid actor combination %s / %j", async (actorType, actorUserId, code) => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const before = await persistenceState(fixture, targetId);

    const result = await claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId, {
      actorType,
      actorUserId,
    }));

    expect(result).toMatchObject({ ok: false, code });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("rejects a runtime CUSTOMER actor before writes", async () => {
    const fixture = await createOrder(ctx);
    const targetId = await seedAttempt(fixture);
    const before = await persistenceState(fixture, targetId);
    const request = claimInput(fixture.orderId, targetId);
    Object.defineProperty(request, "actorType", { value: "CUSTOMER" });

    const result = await claimRefundAttemptForExecution(db, request);

    expect(result).toMatchObject({ ok: false, code: "INVALID_ACTOR_TYPE" });
    await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
  });

  it("validates identifiers and timestamp before writes", async () => {
    await expect(claimRefundAttemptForExecution(db, claimInput(" ", "attempt")))
      .resolves.toMatchObject({ ok: false, code: "INVALID_ORDER_ID" });
    await expect(claimRefundAttemptForExecution(db, claimInput("order", " ")))
      .resolves.toMatchObject({ ok: false, code: "INVALID_REFUND_ATTEMPT_ID" });
    await expect(claimRefundAttemptForExecution(db, claimInput("order", "attempt", {
      now: new Date(Number.NaN),
    }))).resolves.toMatchObject({ ok: false, code: "INVALID_CLAIM_TIMESTAMP" });
  });

  it("manual wrapper claims fresh without changing Order, Payment, evidence, events, or outbox", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture);
      const beforePayment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
      const beforeEvents = await db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } });
      const beforeOutbox = await db.paymentOutbox.count({ where: { dedupKey: { contains: targetId } } });

      const result = success(await claimRefundAttemptForManualSandboxExecution(
        db,
        manualClaimInput(fixture.orderId, targetId),
      ));
      const command = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: result.commandId } });
      const transitions = await claimTransitions(targetId);

      expect(result.replayed).toBe(false);
      await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.PROCESSING);
      await expect(orderStatus(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
      await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } })).resolves.toEqual(beforePayment);
      expect(command.status).toBe(RefundExecutionCommandStatus.READY);
      expect(transitions).toEqual([
        expect.objectContaining({
          actorType: RefundAttemptActorType.ADMIN,
          actorUserId: "manual_admin_1",
          reason: "Refund execution claimed.",
          operationKey: buildRefundExecutionClaimOperationKey(result.commandId),
        }),
      ]);
      await expect(db.refundExecutionEvidence.count({ where: { commandId: result.commandId } })).resolves.toBe(0);
      await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(beforeEvents);
      await expect(db.paymentOutbox.count({ where: { dedupKey: { contains: targetId } } })).resolves.toBe(beforeOutbox);
    });

    it("returns exact same-admin replay with no write", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture);
      const input = manualClaimInput(fixture.orderId, targetId);
      const first = success(await claimRefundAttemptForManualSandboxExecution(db, input));
      const before = await persistenceState(fixture, targetId);

      const replay = success(await claimRefundAttemptForManualSandboxExecution(db, input));

      expect(replay).toEqual({ ...first, replayed: true });
      await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
    });

    it.each([
      [PaymentProvider.TOSS, PaymentMode.SANDBOX],
      [PaymentProvider.EXIMBAY, PaymentMode.SANDBOX],
      [PaymentProvider.MOCK, PaymentMode.LIVE],
    ])("rejects unsupported capability %s / %s before writes", async (provider, mode) => {
      const fixture = await createOrder(ctx, { provider, mode });
      const targetId = await seedAttempt(fixture);
      const before = await persistenceState(fixture, targetId);

      const result = await claimRefundAttemptForManualSandboxExecution(
        db,
        manualClaimInput(fixture.orderId, targetId),
      );

      expect(result).toMatchObject({ ok: false, code: "CLAIM_CAPABILITY_UNSUPPORTED" });
      await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
      await expect(commandCount(targetId)).resolves.toBe(0);
      await expect(claimTransitionCount(targetId)).resolves.toBe(0);
    });

    it("serializes same-admin claims into one fresh result and one exact replay", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture);
      const input = manualClaimInput(fixture.orderId, targetId);
      const firstSession = createNamedDbSession("manual_claim_same_first");
      const secondSession = createNamedDbSession("manual_claim_same_second");

      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          () => claimRefundAttemptForManualSandboxExecution(firstSession.client, input),
          secondSession,
          () => claimRefundAttemptForManualSandboxExecution(secondSession.client, input),
        );
        const [first, second] = await Promise.all([queued.first, queued.second]);

        expect(first).toMatchObject({ ok: true, replayed: false });
        expect(second).toMatchObject({ ok: true, replayed: true });
        await expect(commandCount(targetId)).resolves.toBe(1);
        await expect(claimTransitionCount(targetId)).resolves.toBe(1);
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("keeps strict core identity for a foreign-admin race and classifies healthy evidence safely", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture);
      const firstSession = createNamedDbSession("manual_claim_foreign_first");
      const secondSession = createNamedDbSession("manual_claim_foreign_second");

      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          () => claimRefundAttemptForManualSandboxExecution(
            firstSession.client,
            manualClaimInput(fixture.orderId, targetId, "manual_admin_a"),
          ),
          secondSession,
          () => claimRefundAttemptForManualSandboxExecution(
            secondSession.client,
            manualClaimInput(fixture.orderId, targetId, "manual_admin_b"),
          ),
        );
        const [first, second] = await Promise.all([queued.first, queued.second]);

        expect(first).toMatchObject({ ok: true, replayed: false });
        expect(second).toMatchObject({ ok: false, code: "CLAIM_ARTIFACT_CONFLICT" });
        await expect(classifyExistingRefundExecutionClaim(db, {
          orderId: fixture.orderId,
          refundAttemptId: targetId,
        })).resolves.toBe("HEALTHY_EXISTING_CLAIM");
        await expect(commandCount(targetId)).resolves.toBe(1);
        await expect(claimTransitionCount(targetId)).resolves.toBe(1);
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("classifies malformed existing claim artifacts as unproven", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture, { status: RefundAttemptStatus.PROCESSING });
      const commandId = await seedCommand(targetId);
      await seedClaimTransition(targetId, commandId, { operationKey: `wrong-claim-key:${commandId}` });

      await expect(classifyExistingRefundExecutionClaim(db, {
        orderId: fixture.orderId,
        refundAttemptId: targetId,
      })).resolves.toBe("UNPROVEN");
    });

    it("rolls back every wrapper write after an injected persistence failure", async () => {
      const fixture = await createOrder(ctx);
      const targetId = await seedAttempt(fixture);
      const before = await persistenceState(fixture, targetId);

      await expect(claimRefundAttemptForManualSandboxExecution(db, {
        ...manualClaimInput(fixture.orderId, targetId),
        now: new Date(-8_640_000_000_000_000),
      })).rejects.toBeDefined();

      await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
      await expect(attemptStatus(targetId)).resolves.toBe(RefundAttemptStatus.REQUESTED);
      await expect(commandCount(targetId)).resolves.toBe(0);
      await expect(claimTransitionCount(targetId)).resolves.toBe(0);
    });
});

function claimInput(
  orderId: string,
  refundAttemptId: string,
  override: Partial<ClaimRefundAttemptForExecutionInput> = {},
): ClaimRefundAttemptForExecutionInput {
  return {
    orderId,
    refundAttemptId,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    now: NOW,
    ...override,
  };
}

function manualClaimInput(
  orderId: string,
  refundAttemptId: string,
  actorUserId = "manual_admin_1",
): ClaimRefundAttemptForManualSandboxExecutionInput {
  return { orderId, refundAttemptId, actorUserId, now: NOW };
}

async function createOrder(context: TestContext, options: OrderOptions = {}): Promise<OrderFixture> {
  const amount = options.orderAmount ?? 1_000;
  const currency = options.orderCurrency ?? "KRW";
  const provider = options.provider ?? PaymentProvider.MOCK;
  const mode = options.mode ?? PaymentMode.SANDBOX;
  const sessionId = await createSession(context, amount, currency);
  const paymentId = await createPayment(context, sessionId, amount, currency, provider, mode, options);
  const orderId = await createOrderRow(context, sessionId, paymentId, amount, currency, options);
  return { orderId, paymentId, sessionId, amount, currency, provider, mode };
}

async function createSession(context: TestContext, amount: number, currency: string): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency,
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  context.sessionIds.push(session.id);
  return session.id;
}

async function createPayment(
  context: TestContext,
  sessionId: string,
  amount: number,
  currency: string,
  provider: PaymentProvider,
  mode: PaymentMode,
  options: OrderOptions,
): Promise<string> {
  const status = options.paymentStatus ?? PaymentAttemptStatus.SUCCEEDED;
  const attemptLifecycle = resolvePaymentAttemptLifecycle(options, status);
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider,
      mode,
      adapterExecutionKind: options.paymentAdapterExecutionKind,
      status,
      attemptLifecycle,
      amount: options.paymentAmount ?? amount,
      currency: options.paymentCurrency ?? currency,
      providerOrderId: provider === PaymentProvider.EXIMBAY
        ? syntheticEximbayProviderOrderId()
        : null,
      providerPaymentKey: options.providerPaymentKey === undefined
        ? `provider_payment_${randomUUID()}`
        : options.providerPaymentKey,
      idempotencyKey: `payment_idem_${randomUUID()}`,
      financialSucceededAt: status === PaymentAttemptStatus.SUCCEEDED ? NOW : undefined,
      ...paymentLifecycleEvidence(attemptLifecycle),
    },
  });
  context.paymentIds.push(payment.id);
  return payment.id;
}

async function createOrderRow(
  context: TestContext,
  sessionId: string,
  paymentId: string,
  amount: number,
  currency: string,
  options: OrderOptions,
): Promise<string> {
  const order = await db.order.create({
    data: {
      checkoutSessionId: sessionId,
      paymentId,
      userId: context.userId,
      marketCode: MARKET_CODE,
      currency,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      status: options.orderStatus ?? OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
  });
  context.orderIds.push(order.id);
  return order.id;
}

async function seedAttempt(fixture: OrderFixture, options: AttemptOptions = {}): Promise<string> {
  const id = options.id ?? `refund_${randomUUID()}`;
  const identity = attemptIdentity(fixture, options);
  const actor = attemptActor(options);
  const reason = "Seed refund request";
  await db.refundAttempt.create({
    data: {
      id,
      orderId: fixture.orderId,
      paymentId: identity.paymentId,
      amount: identity.amount,
      currency: identity.currency,
      status: options.status ?? RefundAttemptStatus.REQUESTED,
      reason,
      provider: identity.provider,
      mode: identity.mode,
      providerRefundId: options.providerRefundId ?? null,
      idempotencyKey: options.idempotencyKey ?? `refund:${identity.paymentId}:${id}`,
      requestedAt: NOW,
      actorType: actor.type,
      actorUserId: actor.userId,
    },
  });
  if (options.createRequestTransition !== false) {
    await seedRequestTransition(
      id,
      options.transitionReason ?? reason,
      actor.type,
      actor.userId,
    );
  }
  return id;
}

function attemptIdentity(fixture: OrderFixture, options: AttemptOptions) {
  return {
    paymentId: options.paymentId ?? fixture.paymentId,
    amount: options.amount ?? 400,
    currency: options.currency ?? fixture.currency,
    provider: options.provider ?? fixture.provider,
    mode: options.mode ?? fixture.mode,
  };
}

function attemptActor(options: AttemptOptions) {
  return {
    type: options.actorType ?? RefundAttemptActorType.SYSTEM,
    userId: options.actorUserId ?? null,
  };
}

function resolvePaymentAttemptLifecycle(
  options: OrderOptions,
  status: PaymentAttemptStatus,
): PaymentAttemptLifecycle {
  if (options.paymentAttemptLifecycle) return options.paymentAttemptLifecycle;
  return status === PaymentAttemptStatus.SUCCEEDED
    ? PaymentAttemptLifecycle.FINALIZED
    : PaymentAttemptLifecycle.TERMINAL_FAILURE;
}

function paymentLifecycleEvidence(attemptLifecycle: PaymentAttemptLifecycle) {
  const hasOpenContact = attemptLifecycle === PaymentAttemptLifecycle.CONTACTED
    || attemptLifecycle === PaymentAttemptLifecycle.OUTCOME_UNKNOWN;
  return {
    contactIntentAt: hasOpenContact ? NOW : undefined,
    contactStartedAt: hasOpenContact ? NOW : undefined,
    blockingEndedAt: hasOpenContact ? undefined : NOW,
  };
}

async function seedApprovedEximbayAttempt(
  context: TestContext,
  options: OrderOptions = {},
): Promise<{ fixture: OrderFixture; targetId: string }> {
  const fixture = await createOrder(context, {
    provider: PaymentProvider.EXIMBAY,
    orderCurrency: "USD",
    paymentAdapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    paymentAttemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    ...options,
  });
  const targetId = await seedAttempt(fixture, {
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: EXIMBAY_APPROVER_ID,
  });
  await db.customerRefundIntake.create({
    data: {
      orderId: fixture.orderId,
      customerUserId: context.userId,
      status: CustomerRefundIntakeStatus.APPROVED,
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      submittedAt: NOW,
      reviewedAt: NOW,
      reviewedByUserId: EXIMBAY_APPROVER_ID,
      approvedRefundAttemptId: targetId,
    },
  });
  return { fixture, targetId };
}

async function seedRequestTransition(
  refundAttemptId: string,
  reason: string,
  actorType: RefundAttemptActorType = RefundAttemptActorType.SYSTEM,
  actorUserId: string | null = null,
): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: null,
      toStatus: RefundAttemptStatus.REQUESTED,
      orderStatusBefore: OrderStatus.PAID,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType,
      actorUserId,
      reason,
      operationKey: `refund-request:${refundAttemptId}`,
      createdAt: NOW,
    },
  });
}

async function seedCommand(refundAttemptId: string): Promise<string> {
  const command = await db.refundExecutionCommand.create({
    data: { refundAttemptId, availableAt: NOW },
  });
  return command.id;
}

async function seedClaimTransition(
  refundAttemptId: string,
  commandId: string,
  override: Partial<Pick<RefundAttemptTransition, "operationKey" | "toStatus">> = {},
): Promise<void> {
  await db.refundAttemptTransition.create({
    data: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: override.toStatus ?? RefundAttemptStatus.PROCESSING,
      orderStatusBefore: OrderStatus.REFUND_PENDING,
      orderStatusAfter: OrderStatus.REFUND_PENDING,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: "admin_123",
      reason: "Refund execution claimed.",
      operationKey: override.operationKey ?? buildRefundExecutionClaimOperationKey(commandId),
      createdAt: NOW,
    },
  });
}

async function expectNoWriteFailure(
  fixture: OrderFixture,
  targetId: string,
  code: string,
): Promise<void> {
  const before = await persistenceState(fixture, targetId);
  const result = await claimRefundAttemptForExecution(db, claimInput(fixture.orderId, targetId));
  expect(result).toMatchObject({ ok: false, code });
  await expect(persistenceState(fixture, targetId)).resolves.toEqual(before);
}

function success(
  result: ClaimRefundAttemptForExecutionResult,
): Extract<ClaimRefundAttemptForExecutionResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected claim success, received ${result.code}.`);
  return result;
}

async function persistenceState(fixture: OrderFixture, refundAttemptId: string) {
  const [order, payment, attempt, commands, transitions, evidence] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    paymentState(fixture.paymentId),
    db.refundAttempt.findUniqueOrThrow({ where: { id: refundAttemptId }, select: { status: true } }),
    db.refundExecutionCommand.count({ where: { refundAttemptId } }),
    db.refundAttemptTransition.count({ where: { refundAttemptId } }),
    db.refundExecutionEvidence.count({ where: { command: { refundAttemptId } } }),
  ]);
  return { order, payment, attempt, commands, transitions, evidence };
}

function orderAndPaymentState(fixture: OrderFixture) {
  return Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    paymentState(fixture.paymentId),
  ]);
}

function paymentState(paymentId: string) {
  return db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      provider: true,
      mode: true,
      providerPaymentKey: true,
      idempotencyKey: true,
    },
  });
}

function attemptStatus(refundAttemptId: string): Promise<RefundAttemptStatus> {
  return db.refundAttempt.findUniqueOrThrow({
    where: { id: refundAttemptId },
    select: { status: true },
  }).then((attempt) => attempt.status);
}

function orderStatus(orderId: string): Promise<OrderStatus> {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    .then((order) => order.status);
}

function commandCount(refundAttemptId: string): Promise<number> {
  return db.refundExecutionCommand.count({ where: { refundAttemptId } });
}

function claimTransitions(refundAttemptId: string) {
  return db.refundAttemptTransition.findMany({
    where: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.PROCESSING,
    },
    orderBy: { createdAt: "asc" },
  });
}

function claimTransitionCount(refundAttemptId: string): Promise<number> {
  return db.refundAttemptTransition.count({
    where: {
      refundAttemptId,
      fromStatus: RefundAttemptStatus.REQUESTED,
      toStatus: RefundAttemptStatus.PROCESSING,
    },
  });
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
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
