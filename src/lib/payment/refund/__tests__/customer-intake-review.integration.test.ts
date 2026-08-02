import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
  type RefundAttempt,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  approveCustomerRefundIntake,
  CustomerIntakeReviewInvariantError,
  rejectCustomerRefundIntake,
  type CustomerIntakeReviewClient,
} from "../customer-intake-review";
import type {
  ApproveCustomerRefundIntakeInput,
  ApproveCustomerRefundIntakeResult,
  RejectCustomerRefundIntakeInput,
  RejectCustomerRefundIntakeResult,
} from "../customer-intake-review-contract";
import { withdrawCustomerRefundIntake } from "../customer-intake";
import {
  createNamedDbSession,
  disconnectSessions,
  queueBehindObservedOrderLock,
} from "./refund-order-lock-barrier";

const NOW = new Date("2026-07-15T03:00:00.000Z");
const MARKET_CODE = "KR";
const CUSTOMER_DETAIL = "customer private detail";

interface TestContext {
  ownerUserId: string;
  userIds: string[];
  orderIds: string[];
  paymentIds: string[];
  sessionIds: string[];
}

interface OrderOptions {
  userId?: string;
  orderStatus?: OrderStatus;
  orderAmount?: number;
  orderCurrency?: string;
  paymentStatus?: PaymentAttemptStatus;
  paymentAmount?: number;
  paymentCurrency?: string;
  providerPaymentKey?: string | null;
  disputeStatus?: string | null;
}

interface ReviewFixture {
  orderId: string;
  paymentId: string;
  sessionId: string;
  intakeId: string;
  customerUserId: string;
  amount: number;
  currency: string;
}

interface AttemptOptions {
  orderId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  status?: RefundAttemptStatus;
  actorType?: RefundAttemptActorType;
  actorUserId?: string | null;
  reason?: string;
  idempotencyKey?: string;
  createTransition?: boolean;
}

class ApprovalRollbackProbe extends Error {}

describe("CustomerRefundIntake administrator review core", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const ownerUserId = `intake_review_owner_${randomUUID()}`;
    ctx = { ownerUserId, userIds: [ownerUserId], orderIds: [], paymentIds: [], sessionIds: [] };
    await ensureMarket();
    await db.user.create({ data: { id: ownerUserId, email: `${ownerUserId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  describe("rejection", () => {
    it("rejects a submitted intake with normalized stored decision and no financial effects", async () => {
      const fixture = await createFixture(ctx);
      const before = await financialState(fixture);

      const result = rejectSuccess(await rejectCustomerRefundIntake(db, rejectInput(fixture, {
        reviewedByUserId: "  admin_reviewer  ",
        adminRejectionReason: "  Merchant cannot approve this request.  ",
      })));
      const stored = await db.customerRefundIntake.findUniqueOrThrow({ where: { id: fixture.intakeId } });

      expect(result).toEqual({
        ok: true,
        replayed: false,
        intake: {
          id: fixture.intakeId,
          orderId: fixture.orderId,
          status: CustomerRefundIntakeStatus.REJECTED,
          reviewedAt: NOW,
          reviewedByUserId: "admin_reviewer",
          adminRejectionReason: "Merchant cannot approve this request.",
        },
      });
      expect(stored).toMatchObject({
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: NOW,
        reviewedByUserId: "admin_reviewer",
        adminRejectionReason: "Merchant cannot approve this request.",
        withdrawnAt: null,
        approvedRefundAttemptId: null,
      });
      await expect(financialState(fixture)).resolves.toEqual(before);
    });

    it.each(Object.values(OrderStatus))("rejects while the Order is %s", async (orderStatus) => {
      const fixture = await createFixture(ctx, { orderStatus });

      const result = rejectSuccess(await rejectCustomerRefundIntake(db, rejectInput(fixture)));

      expect(result.intake.status).toBe(CustomerRefundIntakeStatus.REJECTED);
      await expect(orderStatusOf(fixture.orderId)).resolves.toBe(orderStatus);
    });

    it("closes an ownership-repair orphan without changing Order ownership", async () => {
      const orphanUserId = await createUser(ctx, "orphan_customer");
      const fixture = await createFixture(ctx, {}, orphanUserId);

      const result = rejectSuccess(await rejectCustomerRefundIntake(db, rejectInput(fixture)));

      expect(result.intake.status).toBe(CustomerRefundIntakeStatus.REJECTED);
      await expect(db.order.findUniqueOrThrow({
        where: { id: fixture.orderId },
        select: { userId: true },
      })).resolves.toEqual({ userId: ctx.ownerUserId });
    });

    it("returns the stored rejection on payload-agnostic replay", async () => {
      const fixture = await createFixture(ctx);
      const first = rejectSuccess(await rejectCustomerRefundIntake(db, rejectInput(fixture)));
      const before = await reviewState(fixture);

      const replay = rejectSuccess(await rejectCustomerRefundIntake(db, rejectInput(fixture, {
        reviewedByUserId: "other_admin",
        adminRejectionReason: "Different retry rationale",
        now: new Date(NOW.getTime() + 60_000),
      })));

      expect(replay).toEqual({ ...first, replayed: true });
      await expect(reviewState(fixture)).resolves.toEqual(before);
    });

    it("returns NOT_REJECTABLE for approved and withdrawn intakes", async () => {
      const approved = await createFixture(ctx);
      approveSuccess(await approveCustomerRefundIntake(db, approveInput(approved)));
      const withdrawn = await createFixture(ctx);
      await withdrawCustomerRefundIntake(db, withdrawInput(ctx, withdrawn));

      await expect(rejectCustomerRefundIntake(db, rejectInput(approved)))
        .resolves.toMatchObject({ ok: false, code: "NOT_REJECTABLE" });
      await expect(rejectCustomerRefundIntake(db, rejectInput(withdrawn)))
        .resolves.toMatchObject({ ok: false, code: "NOT_REJECTABLE" });
    });

    it("distinguishes missing Order, missing intake, and wrong-Order intake", async () => {
      const first = await createFixture(ctx);
      const second = await createFixture(ctx);

      await expect(rejectCustomerRefundIntake(db, rejectInput(first, {
        orderId: `missing_${randomUUID()}`,
      }))).resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND" });
      await expect(rejectCustomerRefundIntake(db, rejectInput(first, {
        intakeId: `missing_${randomUUID()}`,
      }))).resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND" });
      await expect(rejectCustomerRefundIntake(db, rejectInput(first, {
        intakeId: second.intakeId,
      }))).resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND" });
    });
  });

  describe("approval", () => {
    it("atomically approves a PAID Order through the existing request semantics", async () => {
      const fixture = await createFixture(ctx);
      const paymentBefore = await paymentState(fixture.paymentId);

      const result = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture, {
        reviewedByUserId: "  admin_approved  ",
        merchantRationale: "  Merchant approved bounded refund.  ",
      })));
      const [intake, attempt, transitions, payment, commandCount, evidenceCount] = await Promise.all([
        db.customerRefundIntake.findUniqueOrThrow({ where: { id: fixture.intakeId } }),
        db.refundAttempt.findUniqueOrThrow({ where: { id: result.attempt.id } }),
        db.refundAttemptTransition.findMany({ where: { refundAttemptId: result.attempt.id } }),
        paymentState(fixture.paymentId),
        db.refundExecutionCommand.count({ where: { refundAttemptId: result.attempt.id } }),
        db.refundExecutionEvidence.count({ where: { command: { refundAttemptId: result.attempt.id } } }),
      ]);

      expect(result.replayed).toBe(false);
      expect(Object.keys(result.intake).sort()).toEqual([
        "approvedRefundAttemptId", "id", "orderId", "reviewedAt", "reviewedByUserId", "status",
      ]);
      expect(Object.keys(result.attempt).sort()).toEqual([
        "amount", "currency", "id", "orderId", "requestedAt", "status",
      ]);
      expect(intake).toMatchObject({
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: NOW,
        reviewedByUserId: "admin_approved",
        adminRejectionReason: null,
        approvedRefundAttemptId: attempt.id,
      });
      expect(attempt).toMatchObject({
        orderId: fixture.orderId,
        paymentId: fixture.paymentId,
        status: RefundAttemptStatus.REQUESTED,
        amount: 400,
        currency: "KRW",
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "admin_approved",
        reason: "Merchant approved bounded refund.",
        requestedAt: NOW,
        idempotencyKey: `refund:${fixture.paymentId}:${attempt.id}`,
      });
      expect(attempt.reason).not.toContain(CUSTOMER_DETAIL);
      expect(transitions).toEqual([
        expect.objectContaining({
          fromStatus: null,
          toStatus: RefundAttemptStatus.REQUESTED,
          actorType: RefundAttemptActorType.ADMIN,
          actorUserId: "admin_approved",
          reason: "Merchant approved bounded refund.",
          operationKey: `refund-request:${attempt.id}`,
          createdAt: NOW,
        }),
      ]);
      expect(payment).toEqual(paymentBefore);
      expect(commandCount).toBe(0);
      expect(evidenceCount).toBe(0);
      await expect(orderStatusOf(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    });

    it("approves the remaining amount after a previous partial refund", async () => {
      const fixture = await createFixture(ctx, { orderStatus: OrderStatus.PARTIALLY_REFUNDED });
      await seedAttempt(fixture, { status: RefundAttemptStatus.SUCCEEDED, amount: 400 });

      const result = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture, { amount: 600 })));

      expect(result.attempt.amount).toBe(600);
      await expect(db.refundAttempt.count({ where: { orderId: fixture.orderId } })).resolves.toBe(2);
      await expect(orderStatusOf(fixture.orderId)).resolves.toBe(OrderStatus.REFUND_PENDING);
    });

    it("rejects an ownership-repair orphan without financial writes", async () => {
      const orphanUserId = await createUser(ctx, "approval_orphan");
      const fixture = await createFixture(ctx, {}, orphanUserId);
      const before = await reviewState(fixture);

      const result = await approveCustomerRefundIntake(db, approveInput(fixture));

      expect(result).toMatchObject({ ok: false, code: "INTAKE_INCONSISTENT" });
      await expect(reviewState(fixture)).resolves.toEqual(before);
    });

    it("returns NOT_APPROVABLE for rejected and withdrawn intakes", async () => {
      const rejected = await createFixture(ctx);
      await rejectCustomerRefundIntake(db, rejectInput(rejected));
      const withdrawn = await createFixture(ctx);
      await withdrawCustomerRefundIntake(db, withdrawInput(ctx, withdrawn));

      await expect(approveCustomerRefundIntake(db, approveInput(rejected)))
        .resolves.toMatchObject({ ok: false, code: "NOT_APPROVABLE" });
      await expect(approveCustomerRefundIntake(db, approveInput(withdrawn)))
        .resolves.toMatchObject({ ok: false, code: "NOT_APPROVABLE" });
    });

    it("distinguishes missing Order, missing intake, and wrong-Order intake", async () => {
      const first = await createFixture(ctx);
      const second = await createFixture(ctx);

      await expect(approveCustomerRefundIntake(db, approveInput(first, {
        orderId: `missing_${randomUUID()}`,
      }))).resolves.toMatchObject({ ok: false, code: "ORDER_NOT_FOUND" });
      await expect(approveCustomerRefundIntake(db, approveInput(first, {
        intakeId: `missing_${randomUUID()}`,
      }))).resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND" });
      await expect(approveCustomerRefundIntake(db, approveInput(first, {
        intakeId: second.intakeId,
      }))).resolves.toMatchObject({ ok: false, code: "INTAKE_NOT_FOUND" });
    });

    it("prevalidates invalid amount and rationale without opening a write path", async () => {
      const fixture = await createFixture(ctx);
      const before = await reviewState(fixture);

      await expect(approveCustomerRefundIntake(db, approveInput(fixture, { amount: 0 })))
        .resolves.toMatchObject({ ok: false, code: "INVALID_REQUEST_AMOUNT" });
      await expect(approveCustomerRefundIntake(db, approveInput(fixture, { merchantRationale: " " })))
        .resolves.toMatchObject({ ok: false, code: "INVALID_REASON" });
      await expect(reviewState(fixture)).resolves.toEqual(before);
    });

    it("propagates representative financial eligibility failures with no writes", async () => {
      const terminal = await createFixture(ctx, { orderStatus: OrderStatus.REFUNDED });
      await seedAttempt(terminal, { status: RefundAttemptStatus.SUCCEEDED, amount: 1_000 });
      await expectApprovalFailure(terminal, "ORDER_STATUS_NOT_REFUNDABLE");

      const unusablePayment = await createFixture(ctx, {
        paymentStatus: PaymentAttemptStatus.INITIATED,
        providerPaymentKey: null,
      });
      await expectApprovalFailure(unusablePayment, "PAYMENT_NOT_REFUNDABLE");

      const failedPayment = await createFixture(ctx, { paymentStatus: PaymentAttemptStatus.FAILED });
      await expectApprovalFailure(failedPayment, "PAYMENT_NOT_REFUNDABLE");

      const identityMismatch = await createFixture(ctx, { orderAmount: 900, paymentAmount: 1_000 });
      await expectApprovalFailure(identityMismatch, "PAYMENT_IDENTITY_MISMATCH");

      const disputed = await createFixture(ctx, { disputeStatus: "OPEN" });
      await expectApprovalFailure(disputed, "DISPUTE_REVIEW_REQUIRED");

      const overRefund = await createFixture(ctx);
      await seedAttempt(overRefund, { status: RefundAttemptStatus.SUCCEEDED, amount: 800 });
      await expectApprovalFailure(overRefund, "OVER_REFUND", { amount: 201 });

      const open = await createFixture(ctx);
      await seedAttempt(open, { status: RefundAttemptStatus.PROCESSING, amount: 100 });
      await expectApprovalFailure(open, "REFUND_IN_PROGRESS");

      const malformed = await createFixture(ctx);
      await seedAttempt(malformed, { status: RefundAttemptStatus.FAILED_TERMINAL, currency: "USD" });
      await expectApprovalFailure(malformed, "REFUND_LEDGER_INCONSISTENT");
    });

    it("does not adopt an open direct-admin Attempt", async () => {
      const fixture = await createFixture(ctx, { orderStatus: OrderStatus.REFUND_PENDING });
      const existingId = await seedAttempt(fixture, { status: RefundAttemptStatus.REQUESTED });
      const before = await reviewState(fixture);

      const result = await approveCustomerRefundIntake(db, approveInput(fixture));

      expect(result).toMatchObject({ ok: false, code: "REFUND_IN_PROGRESS" });
      await expect(reviewState(fixture)).resolves.toEqual(before);
      await expect(db.customerRefundIntake.findUniqueOrThrow({
        where: { id: fixture.intakeId },
        select: { approvedRefundAttemptId: true },
      })).resolves.toEqual({ approvedRefundAttemptId: null });
      await expect(db.refundAttempt.findUnique({ where: { id: existingId } })).resolves.not.toBeNull();
    });

    it("returns stored approval replay despite changed caller payload", async () => {
      const fixture = await createFixture(ctx);
      const first = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture)));
      const before = await reviewState(fixture);

      const replay = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture, {
        amount: 1,
        merchantRationale: "Different retry rationale",
        reviewedByUserId: "different_admin",
        now: new Date(NOW.getTime() + 120_000),
      })));

      expect(replay).toEqual({ ...first, replayed: true });
      await expect(reviewState(fixture)).resolves.toEqual(before);
    });

    it.each(Object.values(RefundAttemptStatus))("replays linked Attempt in current status %s", async (status) => {
      const fixture = await createFixture(ctx);
      const approved = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture)));
      await db.refundAttempt.update({ where: { id: approved.attempt.id }, data: { status } });
      const beforeCount = await db.refundAttempt.count({ where: { orderId: fixture.orderId } });

      const replay = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture)));

      expect(replay.replayed).toBe(true);
      expect(replay.attempt).toMatchObject({ id: approved.attempt.id, status });
      await expect(db.refundAttempt.count({ where: { orderId: fixture.orderId } })).resolves.toBe(beforeCount);
    });

    it("rolls back all approval writes when the caller-owned transaction aborts", async () => {
      const fixture = await createFixture(ctx);
      const before = await reviewState(fixture);
      const rollbackClient: CustomerIntakeReviewClient = {
        $transaction: rollbackApprovalTransaction,
      };

      await expect(approveCustomerRefundIntake(rollbackClient, approveInput(fixture)))
        .rejects.toBeInstanceOf(ApprovalRollbackProbe);

      await expect(reviewState(fixture)).resolves.toEqual(before);
      await expect(db.customerRefundIntake.findUniqueOrThrow({
        where: { id: fixture.intakeId },
        select: { status: true, approvedRefundAttemptId: true },
      })).resolves.toEqual({ status: CustomerRefundIntakeStatus.SUBMITTED, approvedRefundAttemptId: null });
    });
  });

  describe("approval replay integrity", () => {
    it("rejects a cross-Order linked Attempt", async () => {
      const fixture = await createFixture(ctx);
      await approveCustomerRefundIntake(db, approveInput(fixture));
      const other = await createFixture(ctx);
      const otherAttemptId = await seedAttempt(other);
      await db.customerRefundIntake.update({
        where: { id: fixture.intakeId },
        data: { approvedRefundAttemptId: otherAttemptId },
      });

      await expect(approveCustomerRefundIntake(db, approveInput(fixture)))
        .rejects.toBeInstanceOf(CustomerIntakeReviewInvariantError);
    });

    it.each([
      ["attempt actor mismatch", async (attempt: RefundAttempt) => {
        await db.refundAttempt.update({ where: { id: attempt.id }, data: { actorUserId: "other_admin" } });
      }],
      ["non-admin attempt actor", async (attempt: RefundAttempt) => {
        await db.refundAttempt.update({
          where: { id: attempt.id },
          data: { actorType: RefundAttemptActorType.SYSTEM, actorUserId: null },
        });
      }],
      ["missing creation transition", async (attempt: RefundAttempt) => {
        await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: attempt.id } });
      }],
      ["incorrect operation key", async (attempt: RefundAttempt) => {
        await db.refundAttemptTransition.updateMany({
          where: { refundAttemptId: attempt.id },
          data: { operationKey: `wrong-operation:${attempt.id}` },
        });
      }],
      ["incorrect transition actor", async (attempt: RefundAttempt) => {
        await db.refundAttemptTransition.updateMany({
          where: { refundAttemptId: attempt.id },
          data: { actorUserId: "other_admin" },
        });
      }],
      ["incorrect transition reason", async (attempt: RefundAttempt) => {
        await db.refundAttemptTransition.updateMany({
          where: { refundAttemptId: attempt.id },
          data: { reason: "Different stored reason" },
        });
      }],
      ["incorrect transition edge", async (attempt: RefundAttempt) => {
        await db.refundAttemptTransition.updateMany({
          where: { refundAttemptId: attempt.id },
          data: { fromStatus: RefundAttemptStatus.REQUESTED, toStatus: RefundAttemptStatus.PROCESSING },
        });
      }],
      ["incorrect idempotency identity", async (attempt: RefundAttempt) => {
        await db.refundAttempt.update({ where: { id: attempt.id }, data: { idempotencyKey: `wrong:${attempt.id}` } });
      }],
    ] as const)("throws typed invariant for %s without repair", async (_label, mutate) => {
      const fixture = await createFixture(ctx);
      const approved = approveSuccess(await approveCustomerRefundIntake(db, approveInput(fixture)));
      const attempt = await db.refundAttempt.findUniqueOrThrow({ where: { id: approved.attempt.id } });
      await mutate(attempt);
      const before = await reviewState(fixture);

      await expect(approveCustomerRefundIntake(db, approveInput(fixture)))
        .rejects.toBeInstanceOf(CustomerIntakeReviewInvariantError);

      await expect(reviewState(fixture)).resolves.toEqual(before);
    });
  });

  describe("serialized terminal races", () => {
    it("serializes different double-approval payloads into one creation and one stored replay", async () => {
      const fixture = await createFixture(ctx);
      const firstSession = createNamedDbSession("intake_approve_first");
      const secondSession = createNamedDbSession("intake_approve_second");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          () => approveCustomerRefundIntake(firstSession.client, approveInput(fixture, { amount: 300 })),
          secondSession,
          () => approveCustomerRefundIntake(secondSession.client, approveInput(fixture, {
            amount: 700,
            merchantRationale: "Different contender rationale",
          })),
        );
        const [first, second] = await Promise.all([queued.first, queued.second]);

        expect(first).toMatchObject({ ok: true, replayed: false, attempt: { amount: 300 } });
        expect(second).toMatchObject({ ok: true, replayed: true, attempt: { amount: 300 } });
        await expect(attemptAndTransitionCounts(fixture.orderId)).resolves.toEqual({ attempts: 1, transitions: 1 });
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("serializes different double-rejection payloads into one decision and one stored replay", async () => {
      const fixture = await createFixture(ctx);
      const firstSession = createNamedDbSession("intake_reject_first");
      const secondSession = createNamedDbSession("intake_reject_second");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          firstSession,
          () => rejectCustomerRefundIntake(firstSession.client, rejectInput(fixture, {
            reviewedByUserId: "first_admin",
            adminRejectionReason: "First rationale",
          })),
          secondSession,
          () => rejectCustomerRefundIntake(secondSession.client, rejectInput(fixture, {
            reviewedByUserId: "second_admin",
            adminRejectionReason: "Second rationale",
          })),
        );
        const [first, second] = await Promise.all([queued.first, queued.second]);

        expect(first).toMatchObject({ ok: true, replayed: false, intake: { reviewedByUserId: "first_admin" } });
        expect(second).toMatchObject({ ok: true, replayed: true, intake: { reviewedByUserId: "first_admin" } });
        await expect(attemptAndTransitionCounts(fixture.orderId)).resolves.toEqual({ attempts: 0, transitions: 0 });
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });

    it("makes approval win ahead of rejection with no losing write", async () => {
      const fixture = await createFixture(ctx);
      const approveSession = createNamedDbSession("approve_before_reject");
      const rejectSession = createNamedDbSession("reject_after_approve");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          approveSession,
          () => approveCustomerRefundIntake(approveSession.client, approveInput(fixture)),
          rejectSession,
          () => rejectCustomerRefundIntake(rejectSession.client, rejectInput(fixture)),
        );
        const [approval, rejection] = await Promise.all([queued.first, queued.second]);

        expect(approval).toMatchObject({ ok: true, replayed: false });
        expect(rejection).toMatchObject({ ok: false, code: "NOT_REJECTABLE" });
        await expect(intakeStatus(fixture.intakeId)).resolves.toBe(CustomerRefundIntakeStatus.APPROVED);
        await expect(attemptAndTransitionCounts(fixture.orderId)).resolves.toEqual({ attempts: 1, transitions: 1 });
      } finally {
        await disconnectSessions(approveSession, rejectSession);
      }
    });

    it("makes rejection win ahead of approval without financial writes", async () => {
      const fixture = await createFixture(ctx);
      const rejectSession = createNamedDbSession("reject_before_approve");
      const approveSession = createNamedDbSession("approve_after_reject");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          rejectSession,
          () => rejectCustomerRefundIntake(rejectSession.client, rejectInput(fixture)),
          approveSession,
          () => approveCustomerRefundIntake(approveSession.client, approveInput(fixture)),
        );
        const [rejection, approval] = await Promise.all([queued.first, queued.second]);

        expect(rejection).toMatchObject({ ok: true, replayed: false });
        expect(approval).toMatchObject({ ok: false, code: "NOT_APPROVABLE" });
        await expect(intakeStatus(fixture.intakeId)).resolves.toBe(CustomerRefundIntakeStatus.REJECTED);
        await expect(attemptAndTransitionCounts(fixture.orderId)).resolves.toEqual({ attempts: 0, transitions: 0 });
        await expect(orderStatusOf(fixture.orderId)).resolves.toBe(OrderStatus.PAID);
      } finally {
        await disconnectSessions(rejectSession, approveSession);
      }
    });

    it("serializes approval before customer withdrawal", async () => {
      const fixture = await createFixture(ctx);
      const approveSession = createNamedDbSession("approve_before_withdraw");
      const withdrawSession = createNamedDbSession("withdraw_after_approve");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          approveSession,
          () => approveCustomerRefundIntake(approveSession.client, approveInput(fixture)),
          withdrawSession,
          () => withdrawCustomerRefundIntake(withdrawSession.client, withdrawInput(ctx, fixture)),
        );
        const [approval, withdrawal] = await Promise.all([queued.first, queued.second]);

        expect(approval).toMatchObject({ ok: true, replayed: false });
        expect(withdrawal).toMatchObject({ ok: false, code: "NOT_WITHDRAWABLE" });
        await expect(intakeStatus(fixture.intakeId)).resolves.toBe(CustomerRefundIntakeStatus.APPROVED);
      } finally {
        await disconnectSessions(approveSession, withdrawSession);
      }
    });

    it("serializes customer withdrawal before approval", async () => {
      const fixture = await createFixture(ctx);
      const withdrawSession = createNamedDbSession("withdraw_before_approve");
      const approveSession = createNamedDbSession("approve_after_withdraw");
      try {
        const queued = await queueBehindObservedOrderLock(
          fixture.orderId,
          withdrawSession,
          () => withdrawCustomerRefundIntake(withdrawSession.client, withdrawInput(ctx, fixture)),
          approveSession,
          () => approveCustomerRefundIntake(approveSession.client, approveInput(fixture)),
        );
        const [withdrawal, approval] = await Promise.all([queued.first, queued.second]);

        expect(withdrawal).toMatchObject({ ok: true, replayed: false });
        expect(approval).toMatchObject({ ok: false, code: "NOT_APPROVABLE" });
        await expect(attemptAndTransitionCounts(fixture.orderId)).resolves.toEqual({ attempts: 0, transitions: 0 });
      } finally {
        await disconnectSessions(withdrawSession, approveSession);
      }
    });

    it("serializes rejection and customer withdrawal in either winner direction", async () => {
      const rejectFirst = await createFixture(ctx);
      const rejectSession = createNamedDbSession("reject_before_withdraw");
      const withdrawSession = createNamedDbSession("withdraw_after_reject");
      try {
        const queued = await queueBehindObservedOrderLock(
          rejectFirst.orderId,
          rejectSession,
          () => rejectCustomerRefundIntake(rejectSession.client, rejectInput(rejectFirst)),
          withdrawSession,
          () => withdrawCustomerRefundIntake(withdrawSession.client, withdrawInput(ctx, rejectFirst)),
        );
        const [rejection, withdrawal] = await Promise.all([queued.first, queued.second]);
        expect(rejection).toMatchObject({ ok: true, replayed: false });
        expect(withdrawal).toMatchObject({ ok: false, code: "NOT_WITHDRAWABLE" });
      } finally {
        await disconnectSessions(rejectSession, withdrawSession);
      }

      const withdrawFirst = await createFixture(ctx);
      const firstSession = createNamedDbSession("withdraw_before_reject");
      const secondSession = createNamedDbSession("reject_after_withdraw");
      try {
        const queued = await queueBehindObservedOrderLock(
          withdrawFirst.orderId,
          firstSession,
          () => withdrawCustomerRefundIntake(firstSession.client, withdrawInput(ctx, withdrawFirst)),
          secondSession,
          () => rejectCustomerRefundIntake(secondSession.client, rejectInput(withdrawFirst)),
        );
        const [withdrawal, rejection] = await Promise.all([queued.first, queued.second]);
        expect(withdrawal).toMatchObject({ ok: true, replayed: false });
        expect(rejection).toMatchObject({ ok: false, code: "NOT_REJECTABLE" });
      } finally {
        await disconnectSessions(firstSession, secondSession);
      }
    });
  });
});

function rejectInput(
  fixture: ReviewFixture,
  override: Partial<RejectCustomerRefundIntakeInput> = {},
): RejectCustomerRefundIntakeInput {
  return {
    orderId: fixture.orderId,
    intakeId: fixture.intakeId,
    reviewedByUserId: "admin_reviewer",
    adminRejectionReason: "Administrator rejected this customer intake.",
    now: new Date(NOW),
    ...override,
  };
}

function approveInput(
  fixture: ReviewFixture,
  override: Partial<ApproveCustomerRefundIntakeInput> = {},
): ApproveCustomerRefundIntakeInput {
  return {
    orderId: fixture.orderId,
    intakeId: fixture.intakeId,
    reviewedByUserId: "admin_reviewer",
    amount: 400,
    merchantRationale: "Merchant approved this refund request.",
    now: new Date(NOW),
    ...override,
  };
}

function withdrawInput(ctx: TestContext, fixture: ReviewFixture) {
  return { orderId: fixture.orderId, customerUserId: ctx.ownerUserId, now: new Date(NOW) };
}

async function createFixture(
  context: TestContext,
  options: OrderOptions = {},
  intakeCustomerUserId = options.userId ?? context.ownerUserId,
): Promise<ReviewFixture> {
  const order = await createOrder(context, options);
  const intake = await db.customerRefundIntake.create({
    data: {
      orderId: order.orderId,
      customerUserId: intakeCustomerUserId,
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
      reasonDetail: CUSTOMER_DETAIL,
      submittedAt: NOW,
    },
  });
  return { ...order, intakeId: intake.id, customerUserId: intakeCustomerUserId };
}

async function createOrder(context: TestContext, options: OrderOptions) {
  const userId = options.userId ?? context.ownerUserId;
  const amount = options.orderAmount ?? 1_000;
  const currency = options.orderCurrency ?? "KRW";
  const session = await db.checkoutSession.create({
    data: {
      userId,
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
  const paymentFixture = normalizePaymentFixture(options);
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      ...paymentFixture,
      idempotencyKey: `payment_idem_${randomUUID()}`,
    },
  });
  context.paymentIds.push(payment.id);
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency,
      subtotalAmount: amount,
      shippingAmount: 0,
      totalAmount: amount,
      status: options.orderStatus ?? OrderStatus.PAID,
      disputeStatus: options.disputeStatus ?? null,
      paidAt: NOW,
    },
  });
  context.orderIds.push(order.id);
  return {
    orderId: order.id,
    paymentId: payment.id,
    sessionId: session.id,
    amount,
    currency,
  };
}

function normalizePaymentFixture(options: OrderOptions) {
  const status = options.paymentStatus ?? PaymentAttemptStatus.SUCCEEDED;
  const providerPaymentKey = options.providerPaymentKey === undefined
    ? `provider_payment_${randomUUID()}`
    : options.providerPaymentKey;
  return {
    status,
    amount: options.paymentAmount ?? 1_000,
    currency: options.paymentCurrency ?? "KRW",
    providerPaymentKey,
    ...paymentLifecycleFields(status),
  };
}

function paymentLifecycleFields(status: PaymentAttemptStatus) {
  if (status === PaymentAttemptStatus.SUCCEEDED) {
    return {
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
    };
  }
  if (status === PaymentAttemptStatus.FAILED) {
    return { attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE, blockingEndedAt: NOW };
  }
  return {
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    contactIntentAt: NOW,
    contactStartedAt: NOW,
  };
}

async function seedAttempt(fixture: ReviewFixture, options: AttemptOptions = {}): Promise<string> {
  const id = `refund_seed_${randomUUID()}`;
  const identity = seedAttemptIdentity(fixture, options, id);
  const reason = options.reason ?? "Seed direct-admin refund request";
  const attempt = await db.refundAttempt.create({
    data: {
      id,
      orderId: identity.orderId,
      paymentId: identity.paymentId,
      amount: options.amount ?? 100,
      currency: identity.currency,
      status: options.status ?? RefundAttemptStatus.REQUESTED,
      reason,
      actorType: options.actorType ?? RefundAttemptActorType.ADMIN,
      actorUserId: options.actorUserId === undefined ? "direct_admin" : options.actorUserId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: identity.idempotencyKey,
      requestedAt: NOW,
    },
  });
  if (options.createTransition !== false) {
    await db.refundAttemptTransition.create({
      data: {
        refundAttemptId: attempt.id,
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: attempt.actorType,
        actorUserId: attempt.actorUserId,
        reason: attempt.reason,
        operationKey: `refund-request:${attempt.id}`,
        createdAt: attempt.requestedAt,
      },
    });
  }
  return attempt.id;
}

function seedAttemptIdentity(fixture: ReviewFixture, options: AttemptOptions, id: string) {
  const orderId = options.orderId ?? fixture.orderId;
  const paymentId = options.paymentId ?? fixture.paymentId;
  return {
    orderId,
    paymentId,
    currency: options.currency ?? fixture.currency,
    idempotencyKey: options.idempotencyKey ?? `refund:${paymentId}:${id}`,
  };
}

async function expectApprovalFailure(
  fixture: ReviewFixture,
  code: string,
  override: Partial<ApproveCustomerRefundIntakeInput> = {},
): Promise<void> {
  const before = await reviewState(fixture);
  const result = await approveCustomerRefundIntake(db, approveInput(fixture, override));
  expect(result).toMatchObject({ ok: false, code });
  await expect(reviewState(fixture)).resolves.toEqual(before);
}

async function reviewState(fixture: ReviewFixture) {
  const [order, payment, intake, attempts, transitions, commands, evidence] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: fixture.orderId }, select: { status: true } }),
    paymentState(fixture.paymentId),
    db.customerRefundIntake.findUniqueOrThrow({
      where: { id: fixture.intakeId },
      select: {
        status: true,
        withdrawnAt: true,
        reviewedAt: true,
        reviewedByUserId: true,
        adminRejectionReason: true,
        approvedRefundAttemptId: true,
      },
    }),
    db.refundAttempt.count({ where: { orderId: fixture.orderId } }),
    db.refundAttemptTransition.count({ where: { refundAttempt: { orderId: fixture.orderId } } }),
    db.refundExecutionCommand.count({ where: { refundAttempt: { orderId: fixture.orderId } } }),
    db.refundExecutionEvidence.count({ where: { command: { refundAttempt: { orderId: fixture.orderId } } } }),
  ]);
  return { order, payment, intake, attempts, transitions, commands, evidence };
}

async function financialState(fixture: ReviewFixture) {
  const state = await reviewState(fixture);
  return {
    order: state.order,
    payment: state.payment,
    attempts: state.attempts,
    transitions: state.transitions,
    commands: state.commands,
    evidence: state.evidence,
  };
}

function paymentState(paymentId: string) {
  return db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { status: true, amount: true, currency: true, providerPaymentKey: true },
  });
}

function orderStatusOf(orderId: string): Promise<OrderStatus> {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    .then((order) => order.status);
}

function intakeStatus(intakeId: string): Promise<CustomerRefundIntakeStatus> {
  return db.customerRefundIntake.findUniqueOrThrow({ where: { id: intakeId }, select: { status: true } })
    .then((intake) => intake.status);
}

async function attemptAndTransitionCounts(orderId: string) {
  const [attempts, transitions] = await Promise.all([
    db.refundAttempt.count({ where: { orderId } }),
    db.refundAttemptTransition.count({ where: { refundAttempt: { orderId } } }),
  ]);
  return { attempts, transitions };
}

function rejectSuccess(
  result: RejectCustomerRefundIntakeResult,
): Extract<RejectCustomerRefundIntakeResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected rejection success, received ${result.code}.`);
  return result;
}

function approveSuccess(
  result: ApproveCustomerRefundIntakeResult,
): Extract<ApproveCustomerRefundIntakeResult, { ok: true }> {
  if (!result.ok) throw new Error(`Expected approval success, received ${result.code}.`);
  return result;
}

function rollbackApprovalTransaction<Result>(
  callback: (tx: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
  return db.$transaction(async (tx) => {
    await callback(tx);
    throw new ApprovalRollbackProbe();
  });
}

async function createUser(context: TestContext, prefix: string): Promise<string> {
  const id = `${prefix}_${randomUUID()}`;
  context.userIds.push(id);
  await db.user.create({ data: { id, email: `${id}@example.test` } });
  return id;
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
  await db.customerRefundIntake.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: { in: attemptIds } } });
  await db.refundAttempt.deleteMany({ where: { id: { in: attemptIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: context.userIds } } });
}
