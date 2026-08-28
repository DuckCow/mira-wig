import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminGuardResult } from "@/lib/admin";
import type { AdminOrderDetailReadModel } from "./admin-order-detail-data";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn<() => Promise<AdminGuardResult>>(),
  loadOrder: vi.fn<(id: string, claimState: "enabled" | "disabled" | "misconfigured") => Promise<AdminOrderDetailReadModel | null>>(),
  approveEnabled: vi.fn<() => boolean>(),
  claimEnabled: vi.fn<() => boolean>(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./admin-order-detail-data", () => ({ loadAdminOrderDetail: mocks.loadOrder }));
vi.mock("./CancellationRefundReplacementControl", () => ({ CancellationRefundReplacementControl: () => null }));
vi.mock("./CustomerRefundIntakeSection", () => ({ CustomerRefundIntakeSection: () => null }));
vi.mock("./ProductionStartControl", () => ({ ProductionStartControl: () => null }));
vi.mock("./RefundExecutionClaimControl", () => ({ RefundExecutionClaimControl: () => null }));
vi.mock("./RefundRequestCloseControl", () => ({ RefundRequestCloseControl: () => null }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/payment/refund/customer-intake-activation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/customer-intake-activation")>();
  return { ...actual, isCustomerRefundIntakeApproveEnabled: mocks.approveEnabled };
});
vi.mock("@/lib/payment/refund/execution-activation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/execution-activation")>();
  return { ...actual, isRefundExecutionClaimEnabled: mocks.claimEnabled };
});

import {
  CustomerRefundIntakeActivationConfigError,
} from "@/lib/payment/refund/customer-intake-activation";
import { RefundExecutionActivationConfigError } from "@/lib/payment/refund/execution-activation";
import AdminOrderDetailPage, { AdminOrderDetailView } from "./page";

describe("administrator Order-detail page authorization and intake gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(adminGuard());
    mocks.loadOrder.mockResolvedValue(orderDetail());
    mocks.approveEnabled.mockReturnValue(true);
    mocks.claimEnabled.mockReturnValue(true);
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "redirects %s before consuming params or loading",
    async (errorCode) => {
      const params = new Promise<{ id: string }>(() => undefined);
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });

      await expect(AdminOrderDetailPage({ params })).rejects.toThrow("REDIRECT:/");

      expect(mocks.redirect).toHaveBeenCalledWith("/");
      expect(mocks.loadOrder).not.toHaveBeenCalled();
      expect(mocks.approveEnabled).not.toHaveBeenCalled();
      expect(mocks.claimEnabled).not.toHaveBeenCalled();
    },
  );

  it("authorizes before resolving params and loads the authorized Order once", async () => {
    const order: string[] = [];
    mocks.requireAdmin.mockImplementation(() => {
      order.push("guard");
      return Promise.resolve(adminGuard());
    });
    mocks.loadOrder.mockImplementation(() => {
      order.push("loader");
      return Promise.resolve(orderDetail());
    });
    const params = new TrackedParams({ id: "order_1" }, () => order.push("params"));

    const element = await AdminOrderDetailPage({ params });

    expect(order).toEqual(["guard", "params", "loader"]);
    expect(mocks.loadOrder).toHaveBeenCalledWith("order_1", "enabled");
    expect(mocks.loadOrder).toHaveBeenCalledOnce();
    expect(isValidElement(element) && element.type).toBe(AdminOrderDetailView);
  });

  it.each([
    [true, "enabled"],
    [false, "disabled"],
  ] as const)("presents approve gate value %s as %s", async (enabled, expected) => {
    mocks.approveEnabled.mockReturnValue(enabled);

    const element = await AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(approveStateOf(element)).toBe(expected);
  });

  it("degrades only the typed activation configuration error", async () => {
    mocks.approveEnabled.mockImplementation(() => {
      throw new CustomerRefundIntakeActivationConfigError("CUSTOMER_REFUND_INTAKE_APPROVE_ENABLED");
    });

    const element = await AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(approveStateOf(element)).toBe("misconfigured");
  });

  it("rethrows unrelated activation failures", async () => {
    const error = new Error("activation subsystem unavailable");
    mocks.approveEnabled.mockImplementation(() => { throw error; });

    await expect(AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) })).rejects.toBe(error);
  });

  it("does not evaluate the approve gate without a SUBMITTED target", async () => {
    mocks.loadOrder.mockResolvedValue(orderDetail({
      customerRefundIntakes: [intake({ status: CustomerRefundIntakeStatus.REJECTED })],
    }));

    const element = await AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.approveEnabled).not.toHaveBeenCalled();
    expect(approveStateOf(element)).toBe("disabled");
  });

  it.each([
    [true, "enabled"],
    [false, "disabled"],
  ] as const)("threads claim gate value %s into the safe loader as %s", async (enabled, expected) => {
    mocks.claimEnabled.mockReturnValue(enabled);

    await AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.loadOrder).toHaveBeenCalledWith("order_1", expected);
  });

  it("degrades the typed claim activation error to a misconfigured presentation state", async () => {
    mocks.claimEnabled.mockImplementation(() => {
      throw new RefundExecutionActivationConfigError("REFUND_EXECUTION_CLAIM_ENABLED");
    });

    await AdminOrderDetailPage({ params: Promise.resolve({ id: "order_1" }) });

    expect(mocks.loadOrder).toHaveBeenCalledWith("order_1", "misconfigured");
  });

  it("renders an inconsistent cancellation as manual ledger review, never refund complete", () => {
    const html = renderToStaticMarkup(AdminOrderDetailView({
      order: orderDetail({
        cancellation: {
          acceptedAt: "2026. 8. 28.",
          requestedBy: "Customer",
          requestedByUserId: "customer_1",
          initialRefundAttemptId: "attempt_initial",
          capturedObligation: "금액 확인 필요",
          succeededAmount: "금액 확인 필요",
          outstandingAmount: "금액 확인 필요",
          obligationState: "INCONSISTENT",
          hasOutstandingAmount: false,
          canReplaceRefund: false,
        },
      }),
      approveState: "disabled",
    }));

    expect(html).toContain("환불 원장 확인 필요");
    expect(html).toContain("수동 검토가 필요합니다.");
    expect(html).not.toContain("주문 취소와 전체 환불이 완료되었습니다.");
    expect(html).not.toContain("실패한 전체 환불 다시 요청");
  });
});

class TrackedParams extends Promise<{ id: string }> {
  private readonly onConsumed: () => void;

  static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  constructor(value: { id: string }, onConsumed: () => void) {
    super((resolve) => resolve(value));
    this.onConsumed = onConsumed;
  }

  override then<TResult1 = { id: string }, TResult2 = never>(
    onfulfilled?: ((value: { id: string }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.onConsumed();
    return super.then(onfulfilled, onrejected);
  }
}

function adminGuard() {
  return {
    success: true as const,
    session: {
      user: { id: "admin_1", role: "ADMIN", name: "Admin", email: "admin@example.test" },
      expires: "2099-01-01",
    },
  };
}

function approveStateOf(element: unknown): unknown {
  return isValidElement<{ approveState: unknown }>(element) ? element.props.approveState : null;
}

function orderDetail(
  overrides: Partial<AdminOrderDetailReadModel> = {},
): AdminOrderDetailReadModel {
  return {
    id: "order_1",
    statusLabel: "결제 완료",
    paidAt: "2026. 7. 15.",
    createdAt: "2026. 7. 15.",
    updatedAt: "2026. 7. 15.",
    marketCode: "KR",
    currency: "KRW",
    customer: { id: "customer_1", name: "Customer", email: "customer@example.test" },
    amounts: { subtotal: "₩10,000", shipping: "₩0", total: "₩10,000" },
    shipping: null,
    items: [],
    payment: {
      id: "payment_1",
      status: "성공",
      amount: "₩10,000",
      providerContext: "TOSS / LIVE",
      createdAt: "2026. 7. 15.",
      updatedAt: "2026. 7. 15.",
    },
    refundReview: {
      orderTotal: "₩10,000",
      paymentAmount: "₩10,000",
      succeededAmount: "₩0",
      guardedAmount: "₩0",
      remainingRefundableAmount: "₩10,000",
      remainingRequestableAmount: "₩10,000",
      openAttempt: "없음",
      guardedAttempt: "없음",
      paymentStatus: "정상",
      executionReference: "없음",
      paymentIdentityMatch: "일치",
      orderStatusRefundable: "가능",
      disputeReview: "없음",
    },
    refundAttempts: [],
    customerRefundIntakes: [intake()],
    ...overrides,
  };
}

function intake(
  overrides: Partial<AdminOrderDetailReadModel["customerRefundIntakes"][number]> = {},
): AdminOrderDetailReadModel["customerRefundIntakes"][number] {
  return {
    id: "intake_1",
    status: CustomerRefundIntakeStatus.SUBMITTED,
    reasonCode: CustomerRefundIntakeReasonCode.OTHER,
    reasonDetail: "customer detail",
    submittedAt: new Date("2026-07-15T00:00:00.000Z"),
    withdrawnAt: null,
    reviewedAt: null,
    adminRejectionReason: null,
    approvedRefundAttemptId: null,
    ownershipConsistent: true,
    approvedRefundAttempt: null,
    ...overrides,
  };
}
