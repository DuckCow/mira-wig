// STRICT -- admin order mutation action behavior
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const mockTransitionOrderStatus = vi.fn();

vi.mock("@/lib/order/status-transition", () => ({
  transitionOrderStatus: (...a: unknown[]): unknown => mockTransitionOrderStatus(...a),
}));

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { transitionOrderStatusAction } from "../admin/orders";

const mockGetSession = vi.mocked(getSession);
const mockRevalidatePath = vi.mocked(revalidatePath);

function makeSession(role: string): Session {
  return { user: { id: "admin-1", email: "admin@test.com", name: "Admin", role }, expires: "2099-01-01" };
}

const ADMIN_SESSION = makeSession("ADMIN");
const CUSTOMER_SESSION = makeSession("CUSTOMER");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transitionOrderStatusAction -- auth guard", () => {
  it("세션 없으면 UNAUTHENTICATED를 반환하고 코어를 호출하지 않는다", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await transitionOrderStatusAction("order-1", "CONFIRMED", "PAID");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("UNAUTHENTICATED");
    expect(mockTransitionOrderStatus).not.toHaveBeenCalled();
  });

  it("CUSTOMER이면 FORBIDDEN을 반환하고 코어를 호출하지 않는다", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    const result = await transitionOrderStatusAction("order-1", "CONFIRMED", "PAID");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
    expect(mockTransitionOrderStatus).not.toHaveBeenCalled();
  });
});

describe("transitionOrderStatusAction -- ADMIN", () => {
  it("성공하면 전이 결과를 반환하고 관리자/사용자 주문 경로를 revalidate한다", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockTransitionOrderStatus.mockResolvedValue({
      success: true,
      orderId: "order-1",
      previousStatus: "PAID",
      status: "CONFIRMED",
      idempotent: false,
    });
    const result = await transitionOrderStatusAction("order-1", "CONFIRMED", "PAID");
    expect(result).toEqual({ success: true, previousStatus: "PAID", status: "CONFIRMED", idempotent: false });
    expect(mockTransitionOrderStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      targetStatus: "CONFIRMED",
      expectedCurrentStatus: "PAID",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/orders");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/orders/[id]", "page");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/orders/[id]", "page");
  });

  it("코어 실패는 errorCode로 반환하고 revalidate하지 않는다", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockTransitionOrderStatus.mockResolvedValue({ success: false, errorCode: "INVALID_TRANSITION" });
    const result = await transitionOrderStatusAction("order-1", "SHIPPED", "PAID");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("INVALID_TRANSITION");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
