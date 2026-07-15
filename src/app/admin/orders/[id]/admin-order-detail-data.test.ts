import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockFindUniqueArgs {
  where: { id: string };
  select: {
    refundAttempts: { select: Record<string, unknown> };
    customerRefundIntakes: {
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }];
      select: Record<string, boolean>;
    };
  };
}

const mockFindUnique = vi.hoisted(() => vi.fn<(args: MockFindUniqueArgs) => Promise<unknown>>());

vi.mock("@/lib/db", () => ({
  db: { order: { findUnique: mockFindUnique } },
}));

import { loadAdminOrderDetail } from "./admin-order-detail-data";

const NOW = new Date("2026-07-15T10:00:00.000Z");

describe("admin Order-detail intake history query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
  });

  it("extends the single Order query with deterministic minimal intake history", async () => {
    await loadAdminOrderDetail("order_123");

    expect(mockFindUnique).toHaveBeenCalledOnce();
    const [query] = mockFindUnique.mock.calls[0];
    expect(query.where).toEqual({ id: "order_123" });
    expect(query.select.customerRefundIntakes).toEqual({
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        customerUserId: true,
        status: true,
        reasonCode: true,
        reasonDetail: true,
        submittedAt: true,
        withdrawnAt: true,
        reviewedAt: true,
        adminRejectionReason: true,
        approvedRefundAttemptId: true,
      },
    });
    expect(query.select.customerRefundIntakes.select).not.toHaveProperty("reviewedByUserId");
    expect(query.select.refundAttempts.select).toMatchObject({
      id: true,
      status: true,
      amount: true,
      currency: true,
      requestedAt: true,
      executionCommand: { select: { id: true } },
    });
  });

  it("preserves an empty intake history as an additive empty field", async () => {
    mockFindUnique.mockResolvedValue(orderRecord());

    const result = await loadAdminOrderDetail("order_123");

    expect(result?.customerRefundIntakes).toEqual([]);
  });

  it("projects every lifecycle status newest-first with permitted detail only", async () => {
    const record = orderRecord();
    record.customerRefundIntakes = [
      intakeRecord("intake_approved", CustomerRefundIntakeStatus.APPROVED, {
        approvedRefundAttemptId: "attempt_approved",
        reviewedAt: NOW,
      }),
      intakeRecord("intake_rejected", CustomerRefundIntakeStatus.REJECTED, {
        reviewedAt: new Date(NOW.getTime() - 1_000),
        adminRejectionReason: "Administrator-only rejection rationale",
      }),
      intakeRecord("intake_withdrawn", CustomerRefundIntakeStatus.WITHDRAWN, {
        withdrawnAt: new Date(NOW.getTime() - 2_000),
      }),
      intakeRecord("intake_submitted", CustomerRefundIntakeStatus.SUBMITTED),
    ];
    record.refundAttempts = [refundAttempt("attempt_approved", RefundAttemptStatus.SUCCEEDED)];
    mockFindUnique.mockResolvedValue(record);

    const result = await loadAdminOrderDetail("order_123");
    const intakes = result?.customerRefundIntakes ?? [];

    expect(intakes.map((intake) => intake.status)).toEqual([
      CustomerRefundIntakeStatus.APPROVED,
      CustomerRefundIntakeStatus.REJECTED,
      CustomerRefundIntakeStatus.WITHDRAWN,
      CustomerRefundIntakeStatus.SUBMITTED,
    ]);
    expect(intakes[1]).toMatchObject({
      reasonDetail: "customer detail intake_rejected",
      adminRejectionReason: "Administrator-only rejection rationale",
      ownershipConsistent: true,
    });
    expect(Object.keys(intakes[0]).sort()).toEqual([
      "adminRejectionReason", "approvedRefundAttempt", "approvedRefundAttemptId", "id",
      "ownershipConsistent", "reasonCode", "reasonDetail", "reviewedAt", "status",
      "submittedAt", "withdrawnAt",
    ]);
  });

  it("returns a narrow same-Order linked Attempt summary with its current status", async () => {
    const record = orderRecord();
    record.refundAttempts = [refundAttempt("attempt_approved", RefundAttemptStatus.MANUAL_REVIEW)];
    record.customerRefundIntakes = [intakeRecord("intake_approved", CustomerRefundIntakeStatus.APPROVED, {
      approvedRefundAttemptId: "attempt_approved",
      reviewedAt: NOW,
    })];
    mockFindUnique.mockResolvedValue(record);

    const result = await loadAdminOrderDetail("order_123");

    expect(result?.customerRefundIntakes[0].approvedRefundAttempt).toEqual({
      id: "attempt_approved",
      status: RefundAttemptStatus.MANUAL_REVIEW,
      amount: 2_500,
      currency: "KRW",
      requestedAt: NOW,
    });
  });

  it("preserves a missing approved ID while refusing a cross-Order Attempt summary", async () => {
    const record = orderRecord();
    record.refundAttempts = [refundAttempt("same_order_attempt", RefundAttemptStatus.REQUESTED)];
    record.customerRefundIntakes = [intakeRecord("intake_approved", CustomerRefundIntakeStatus.APPROVED, {
      approvedRefundAttemptId: "cross_order_attempt",
      reviewedAt: NOW,
    })];
    mockFindUnique.mockResolvedValue(record);

    const result = await loadAdminOrderDetail("order_123");

    expect(result?.customerRefundIntakes[0]).toMatchObject({
      approvedRefundAttemptId: "cross_order_attempt",
      approvedRefundAttempt: null,
    });
  });

  it("returns ownership consistency without either raw actor identity", async () => {
    const record = orderRecord();
    record.customerRefundIntakes = [intakeRecord("intake_orphan", CustomerRefundIntakeStatus.REJECTED, {
      customerUserId: "historical_owner",
      reviewedAt: NOW,
      adminRejectionReason: "Reject ownership-repair orphan",
    })];
    mockFindUnique.mockResolvedValue(record);

    const result = await loadAdminOrderDetail("order_123");
    const serialized = JSON.stringify(result?.customerRefundIntakes);

    expect(result?.customerRefundIntakes[0].ownershipConsistent).toBe(false);
    for (const forbidden of [
      "customerUserId", "reviewedByUserId", "historical_owner", "private_admin_actor",
      "provider", "paymentId", "providerPaymentKey", "providerRefundId", "idempotencyKey",
      "operationKey", "executionCommand", "leaseOwner",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("projects command existence to close advice without exposing the command id", async () => {
    const record = orderRecord(OrderStatus.REFUND_PENDING);
    const requested = refundAttempt("attempt_with_command", RefundAttemptStatus.REQUESTED, {
      providerRefundId: null,
      executionCommand: { id: "private_execution_command_id" },
    });
    record.refundAttempts = [requested];
    mockFindUnique.mockResolvedValue(record);

    const result = await loadAdminOrderDetail("order_123");
    const serialized = JSON.stringify(result);

    expect(result?.refundAttempts[0]).toMatchObject({
      canCloseRequest: false,
      closeWarning: "환불 실행 명령 기록이 있어 이 요청의 철회를 제공하지 않습니다. 수동 확인이 필요합니다.",
    });
    expect(serialized).not.toContain("private_execution_command_id");
    expect(serialized).not.toContain("executionCommand");
    expect(serialized).not.toContain("hasExecutionCommand");
  });

  it("leaves the existing financial readout unchanged", async () => {
    const withoutIntake = orderRecord();
    const withIntake = orderRecord();
    withIntake.customerRefundIntakes = [intakeRecord("intake_1", CustomerRefundIntakeStatus.SUBMITTED)];
    mockFindUnique.mockResolvedValueOnce(withoutIntake).mockResolvedValueOnce(withIntake);

    const before = await loadAdminOrderDetail("order_123");
    const after = await loadAdminOrderDetail("order_123");

    expect(after?.refundReview).toEqual(before?.refundReview);
    expect(after?.payment).toEqual(before?.payment);
    expect(after?.refundAttempts).toEqual(before?.refundAttempts);
  });
});

function orderRecord(status: OrderStatus = OrderStatus.PAID) {
  const refundAttempts: ReturnType<typeof refundAttempt>[] = [];
  const customerRefundIntakes: ReturnType<typeof intakeRecord>[] = [];
  return {
    id: "order_123",
    status,
    disputeStatus: null,
    paidAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    marketCode: "KR",
    currency: "KRW",
    subtotalAmount: 10_000,
    shippingAmount: 0,
    totalAmount: 10_000,
    user: { id: "current_owner", email: "owner@example.test", name: "Owner" },
    shipping: null,
    items: [],
    payment: {
      id: "payment_123",
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 10_000,
      currency: "KRW",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      createdAt: NOW,
      updatedAt: NOW,
      providerPaymentKey: "private_provider_payment_key",
    },
    refundAttempts,
    customerRefundIntakes,
  };
}

function refundAttempt(
  id: string,
  status: RefundAttemptStatus,
  options: {
    providerRefundId?: string | null;
    executionCommand?: { id: string } | null;
  } = {},
) {
  return {
    id,
    amount: 2_500,
    currency: "KRW",
    status,
    reason: "Merchant rationale",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "private_admin_actor",
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    requestedAt: NOW,
    processedAt: null,
    failedAt: null,
    safeFailureMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    providerRefundId: options.providerRefundId === undefined
      ? "private_provider_refund_id"
      : options.providerRefundId,
    executionCommand: options.executionCommand ?? null,
    transitions: [],
  };
}

function intakeRecord(
  id: string,
  status: CustomerRefundIntakeStatus,
  override: Partial<{
    customerUserId: string;
    submittedAt: Date;
    withdrawnAt: Date | null;
    reviewedAt: Date | null;
    adminRejectionReason: string | null;
    approvedRefundAttemptId: string | null;
  }> = {},
) {
  return {
    id,
    customerUserId: override.customerUserId ?? "current_owner",
    status,
    reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
    reasonDetail: `customer detail ${id}`,
    submittedAt: override.submittedAt ?? NOW,
    withdrawnAt: override.withdrawnAt ?? null,
    reviewedAt: override.reviewedAt ?? null,
    adminRejectionReason: override.adminRejectionReason ?? null,
    approvedRefundAttemptId: override.approvedRefundAttemptId ?? null,
  };
}
