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

  it("projects transition history in loader order with safe Korean audit labels", () => {
    const transitions = [
      transition({
        id: "transition_z",
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.ADMIN,
        reason: "  고객 요청: 상담 기록 확인  ",
      }),
      transition({
        id: "transition_a",
        fromStatus: RefundAttemptStatus.REQUESTED,
        toStatus: RefundAttemptStatus.CANCELLED,
        orderStatusBefore: OrderStatus.REFUND_PENDING,
        orderStatusAfter: OrderStatus.PAID,
        actorType: RefundAttemptActorType.SYSTEM,
        reason: "   ",
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
      }),
    ];
    const order = source({
      refundAttempts: [attempt("refund_requested", 1_000, RefundAttemptStatus.REQUESTED, "KRW", transitions)],
    });

    const history = buildAdminOrderDetailViewModel(order).refundAttempts[0].transitionHistory;

    expect(history.emptyState).toBeNull();
    expect(history.entries.every((entry) => entry.timestamp.length > 0)).toBe(true);
    expect(history.entries).toMatchObject([
      {
        key: "transition_z",
        attemptStatusChange: "생성 → 환불 요청됨",
        orderStatusChange: "결제 완료 → 환불 처리 중",
        actor: "관리자 작업",
        auditReason: "고객 요청: 상담 기록 확인",
      },
      {
        key: "transition_a",
        attemptStatusChange: "환불 요청됨 → 요청 취소",
        orderStatusChange: "환불 처리 중 → 결제 완료",
        actor: "시스템 작업",
        auditReason: "기록 사유 확인 필요",
      },
    ]);
  });

  it("uses a neutral transition-history empty state for attempts without evidence", () => {
    const order = source({
      refundAttempts: [attempt("refund_legacy", 1_000, RefundAttemptStatus.CANCELLED)],
    });

    const history = buildAdminOrderDetailViewModel(order).refundAttempts[0].transitionHistory;

    expect(history).toEqual({
      entries: [],
      emptyState: "상태 변경 기록이 없습니다. 이전 데이터이거나 기록 확인이 필요합니다.",
    });
  });

  it("omits private exact property keys from the final admin view model", () => {
    const transitions = [transition({ id: "transition_private_boundary" })];
    const order = source({
      refundAttempts: [attempt("refund_private_boundary", 1_000, RefundAttemptStatus.REQUESTED, "KRW", transitions)],
    });

    const keys = collectObjectKeys(buildAdminOrderDetailViewModel(order));

    expect(keys.has("providerContext")).toBe(true);
    for (const forbidden of [
      "operationKey",
      "actorUserId",
      "providerRefundId",
      "idempotencyKey",
      "providerPaymentKey",
      "rawPayload",
      "rawError",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
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
  transitions: AdminOrderDetailSource["refundAttempts"][number]["transitions"] = [],
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
    transitions,
  };
}

function transition(
  overrides: Partial<AdminOrderDetailSource["refundAttempts"][number]["transitions"][number]> = {},
): AdminOrderDetailSource["refundAttempts"][number]["transitions"][number] {
  const now = new Date("2026-07-10T08:00:00.000Z");
  return {
    id: "transition_123",
    fromStatus: null,
    toStatus: RefundAttemptStatus.REQUESTED,
    orderStatusBefore: OrderStatus.PAID,
    orderStatusAfter: OrderStatus.REFUND_PENDING,
    actorType: RefundAttemptActorType.ADMIN,
    reason: "고객 요청",
    createdAt: now,
    ...overrides,
  };
}

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (typeof value !== "object" || value === null) return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}
