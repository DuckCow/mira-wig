import { describe, expect, it } from "vitest";
import { orderStatusLabel } from "./order-status";

describe("orderStatusLabel", () => {
  it("maps paid and cancellation/refund states to customer-facing Korean labels", () => {
    expect(orderStatusLabel("PAID")).toBe("결제 완료");
    expect(orderStatusLabel("CANCELLED")).toBe("주문 취소");
    expect(orderStatusLabel("REFUND_PENDING")).toBe("환불 요청 처리 중");
    expect(orderStatusLabel("PARTIALLY_REFUNDED")).toBe("부분 환불");
    expect(orderStatusLabel("REFUNDED")).toBe("환불 완료");
  });

  it("falls back safely for unknown future statuses", () => {
    expect(orderStatusLabel("UNKNOWN_FUTURE_STATUS")).toBe("상태 확인 중");
  });
});
