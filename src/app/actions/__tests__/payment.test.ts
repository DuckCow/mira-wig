import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import type { OrderView } from "@/lib/order/types";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOrderById: vi.fn(),
  processPayment: vi.fn(),
  confirmPayment: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/order", () => ({ getOrderById: mocks.getOrderById }));
vi.mock("@/lib/payment/process", () => ({
  processPayment: mocks.processPayment,
  confirmPayment: mocks.confirmPayment,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { capturePayPalOrderAction } from "../payment";

const SESSION: Session = {
  user: { id: "user-1", email: "buyer@test.com", name: "Buyer" },
  expires: "2099-01-01",
};

const ORDER: OrderView = {
  id: "order-1",
  status: "PENDING_PAYMENT",
  marketCode: "US",
  currency: "USD",
  totalAmount: 7799,
  shippingFee: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  recipientName: "Buyer",
  phone: "010-0000-0000",
  country: "US",
  postalCode: "94105",
  administrativeArea: "CA",
  city: "San Francisco",
  addressLine1: "1 Market St",
  addressLine2: null,
  memo: null,
  items: [],
};

describe("capturePayPalOrderAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("입력 형식이 틀리면 실패하고 DB/confirm을 호출하지 않는다", async () => {
    const result = await capturePayPalOrderAction({ orderId: "order-1" });
    expect(result.status).toBe("failed");
    expect(mocks.getOrderById).not.toHaveBeenCalled();
    expect(mocks.confirmPayment).not.toHaveBeenCalled();
  });

  it("세션 없으면 실패한다", async () => {
    mocks.getSession.mockResolvedValue(null);
    const result = await capturePayPalOrderAction({ orderId: "order-1", paypalOrderId: "paypal-order-1" });
    expect(result.status).toBe("failed");
    expect(mocks.getOrderById).not.toHaveBeenCalled();
  });

  it("소유 주문이 아니면 실패한다", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOrderById.mockResolvedValue(null);
    const result = await capturePayPalOrderAction({ orderId: "order-1", paypalOrderId: "paypal-order-1" });
    expect(result.status).toBe("failed");
    expect(mocks.getOrderById).toHaveBeenCalledWith("order-1", "user-1");
    expect(mocks.confirmPayment).not.toHaveBeenCalled();
  });

  it("주문 금액을 redirectAmount로 넣어 confirmPayment를 호출한다", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOrderById.mockResolvedValue(ORDER);
    mocks.confirmPayment.mockResolvedValue({ status: "success", success: true, paymentId: "payment-1" });
    const result = await capturePayPalOrderAction({ orderId: "order-1", paypalOrderId: "paypal-order-1" });
    expect(result).toEqual({ status: "success", success: true, orderId: "order-1" });
    expect(mocks.confirmPayment).toHaveBeenCalledWith({
      orderId: "order-1",
      userId: "user-1",
      paymentKey: "paypal-order-1",
      redirectAmount: 7799,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
  });

  it("unconfirmed 결과는 재시도 가능한 failed와 구분해 반환한다", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOrderById.mockResolvedValue(ORDER);
    mocks.confirmPayment.mockResolvedValue({
      status: "unconfirmed",
      success: false,
      error: "처리 중",
      orderId: "order-1",
      providerTransactionId: "capture-1",
    });
    const result = await capturePayPalOrderAction({ orderId: "order-1", paypalOrderId: "paypal-order-1" });
    expect(result).toEqual({ status: "unconfirmed", success: false, error: "처리 중", orderId: "order-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order-1/payment");
  });
});
