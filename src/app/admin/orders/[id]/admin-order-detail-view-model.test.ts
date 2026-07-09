import {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildAdminOrderDetailViewModel,
  refundAttemptStatusLabel,
} from "./admin-order-detail-view-model";
import type { AdminOrderDetailSource } from "./admin-order-detail-types";

describe("admin order detail view model", () => {
  it("uses stored minor-unit amounts and refund invariant summaries", () => {
    const order = source({
      refundAttempts: [
        attempt("refund_succeeded", 2_000, RefundAttemptStatus.SUCCEEDED),
        attempt("refund_requested", 1_000, RefundAttemptStatus.REQUESTED),
        attempt("refund_cancelled", 9_000, RefundAttemptStatus.CANCELLED),
      ],
    });

    const view = buildAdminOrderDetailViewModel(order);

    expect(view.refundReview).toMatchObject({
      succeededAmount: "₩2,000",
      guardedAmount: "₩3,000",
      remainingRefundableAmount: "₩8,000",
      remainingRequestableAmount: "₩7,000",
      openAttempt: "진행 중인 환불 요청 있음",
      guardedAttempt: "보호 중인 환불 금액 있음",
    });
  });

  it("falls back safely when snapshotData is malformed", () => {
    const order = source();
    order.items[0].snapshotData = "raw-json-is-not-renderable";

    const view = buildAdminOrderDetailViewModel(order);

    expect(view.items[0]).toMatchObject({
      name: "상품 정보 확인 중",
      options: "옵션 정보 확인 중",
      quantity: 2,
      unitAmount: "₩5,000",
      lineTotal: "₩10,000",
    });
    expect(JSON.stringify(view)).not.toContain("must-not-leak.jpg");
  });

  it("exposes only a safe execution-reference label", () => {
    const order = source();
    order.payment.providerPaymentKeyPresent = false;

    const view = buildAdminOrderDetailViewModel(order);

    expect(view.refundReview.executionReference).toBe("환불 실행 정보: 확인 필요");
    expect(JSON.stringify(view)).not.toContain("providerPaymentKey");
    expect(JSON.stringify(view)).not.toContain("idempotencyKey");
  });

  it("marks mismatched refund currencies for review instead of combining them", () => {
    const order = source({ refundAttempts: [attempt("refund_usd", 100, RefundAttemptStatus.SUCCEEDED, "USD")] });

    const view = buildAdminOrderDetailViewModel(order);

    expect(view.refundReview.succeededAmount).toBe("금액 확인 필요");
    expect(view.refundReview.remainingRequestableAmount).toBe("금액 확인 필요");
  });
});

describe("refund attempt labels", () => {
  it.each([
    [RefundAttemptStatus.REQUESTED, "환불 요청됨"],
    [RefundAttemptStatus.PROCESSING, "환불 처리 중"],
    [RefundAttemptStatus.SUCCEEDED, "환불 완료"],
    [RefundAttemptStatus.FAILED_RETRYABLE, "재시도 필요"],
    [RefundAttemptStatus.FAILED_TERMINAL, "환불 실패"],
    [RefundAttemptStatus.MANUAL_REVIEW, "수동 확인 필요"],
    [RefundAttemptStatus.CANCELLED, "요청 취소"],
  ])("maps %s to safe Korean copy", (status, label) => {
    expect(refundAttemptStatusLabel(status)).toBe(label);
  });
});

function source(
  overrides: Partial<AdminOrderDetailSource> = {},
): AdminOrderDetailSource {
  const now = new Date("2026-07-10T08:00:00.000Z");
  return {
    id: "order_12345678",
    status: OrderStatus.PAID,
    disputeStatus: null,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
    marketCode: "KR",
    currency: "KRW",
    subtotalAmount: 10_000,
    shippingAmount: 0,
    totalAmount: 10_000,
    user: { id: "user_123", email: "buyer@example.test", name: "구매자" },
    shipping: {
      recipientName: "구매자",
      phone: "010-0000-0000",
      country: ShippingCountry.KR,
      postalCode: "00000",
      administrativeArea: "서울특별시",
      city: "중구",
      addressLine1: "테스트로 1",
      addressLine2: null,
      memo: null,
      updatedAt: now,
    },
    items: [{
      id: "item_123",
      quantity: 2,
      unitAmount: 5_000,
      fulfillmentType: FulfillmentType.MTO,
      snapshotData: {
        styleName: "테스트 스타일",
        color: "Black",
        colorHex: "#000000",
        length: "MEDIUM",
        curl: "STRAIGHT",
        coverImageKey: "must-not-leak.jpg",
        currencyCode: "KRW",
      },
      mr: { status: MrStatus.RECEIVED, startedAt: null, createdAt: now, updatedAt: now },
    }],
    payment: {
      id: "payment_123",
      status: PaymentAttemptStatus.SUCCEEDED,
      amount: 10_000,
      currency: "KRW",
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      createdAt: now,
      updatedAt: now,
      providerPaymentKeyPresent: true,
    },
    refundAttempts: [],
    ...overrides,
  };
}

function attempt(
  id: string,
  amount: number,
  status: RefundAttemptStatus,
  currency = "KRW",
): AdminOrderDetailSource["refundAttempts"][number] {
  const now = new Date("2026-07-10T08:00:00.000Z");
  return {
    id,
    amount,
    currency,
    status,
    reason: "고객 요청",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: "admin_123",
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    requestedAt: now,
    processedAt: status === RefundAttemptStatus.SUCCEEDED ? now : null,
    failedAt: null,
    safeFailureMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}
