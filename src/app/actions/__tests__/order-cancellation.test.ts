import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { kind: "order-cancellation-action-db" },
  requireAdmin: vi.fn(),
  getSession: vi.fn(),
  cancellationEnabled: vi.fn(),
  productionStartEnabled: vi.fn(),
  cancel: vi.fn(),
  start: vi.fn(),
  replace: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/order-cancellation/activation", () => ({
  isCustomerMtoOrderCancellationEnabled: mocks.cancellationEnabled,
  isMtoProductionStartEnabled: mocks.productionStartEnabled,
}));
vi.mock("@/lib/order-cancellation/cancel", () => ({ cancelEligibleMtoOrder: mocks.cancel }));
vi.mock("@/lib/order-cancellation/production-start", () => ({ startMtoProduction: mocks.start }));
vi.mock("@/lib/order-cancellation/replacement", () => ({
  replaceOutstandingCancellationRefund: mocks.replace,
}));

import {
  cancelMtoOrderAction,
  replaceCancellationRefundAction,
  startMtoProductionAction,
} from "../order-cancellation";

const CUSTOMER_ID = "customer_1";
const ADMIN_ID = "admin_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: CUSTOMER_ID } });
  mocks.requireAdmin.mockResolvedValue({ success: true, session: { user: { id: ADMIN_ID, role: "ADMIN" } } });
  mocks.cancellationEnabled.mockReturnValue(true);
  mocks.productionStartEnabled.mockReturnValue(true);
});

describe("order cancellation action authorization and activation", () => {
  it("rejects unauthenticated cancellation before activation or core work", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(cancelMtoOrderAction({ orderId: "order_1", requestKey: randomUUID() }))
      .resolves.toEqual({ success: false, errorCode: "UNAUTHENTICATED" });
    expect(mocks.cancellationEnabled).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("keeps customer cancellation fail-closed when its gate is disabled", async () => {
    mocks.cancellationEnabled.mockReturnValue(false);
    await expect(cancelMtoOrderAction({ orderId: "order_1", requestKey: randomUUID() }))
      .resolves.toEqual({ success: false, errorCode: "FEATURE_DISABLED" });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "rejects production start with %s before activation or core work",
    async (errorCode) => {
      mocks.requireAdmin.mockResolvedValue({ success: false, errorCode });
      await expect(startMtoProductionAction({
        orderId: "order_1",
        orderItemId: "item_1",
        requestKey: randomUUID(),
      })).resolves.toEqual({ success: false, errorCode });
      expect(mocks.productionStartEnabled).not.toHaveBeenCalled();
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );

  it("keeps production start fail-closed when its gate is disabled", async () => {
    mocks.productionStartEnabled.mockReturnValue(false);
    await expect(startMtoProductionAction({
      orderId: "order_1",
      orderItemId: "item_1",
      requestKey: randomUUID(),
    })).resolves.toEqual({ success: false, errorCode: "FEATURE_DISABLED" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("derives the production-start actor exclusively from the administrator guard", async () => {
    const startedAt = new Date("2026-08-28T12:30:00.000Z");
    const requestKey = randomUUID();
    mocks.start.mockResolvedValue({
      ok: true,
      replayed: false,
      orderId: "order_1",
      orderItemId: "item_1",
      manufacturingRequestId: "mr_1",
      startedAt,
    });
    await expect(startMtoProductionAction({ orderId: "order_1", orderItemId: "item_1", requestKey }))
      .resolves.toMatchObject({ success: true, outcome: "STARTED", startedAt: startedAt.toISOString() });
    expect(mocks.start).toHaveBeenCalledWith(mocks.db, {
      orderId: "order_1",
      orderItemId: "item_1",
      requestKey,
      startedByUserId: ADMIN_ID,
    });
  });

  it.each([
    "DISPUTE_REVIEW_REQUIRED",
    "PAYMENT_NOT_REFUNDABLE",
    "REFUND_LEDGER_INCONSISTENT",
  ] as const)("maps replacement %s to bounded manual review copy", async (code) => {
    mocks.replace.mockResolvedValue({ ok: false, code, message: "private core detail" });

    await expect(replaceCancellationRefundAction({
      orderId: "order_1",
      requestKey: randomUUID(),
    })).resolves.toEqual({ success: false, errorCode: "MANUAL_REVIEW_REQUIRED" });
  });
});
