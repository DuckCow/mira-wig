import { randomUUID } from "crypto";
import {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  type RefundAttempt,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ kind: "mock-db" }));

vi.mock("crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/payment/refund/request", () => ({ requestRefundAttempt: vi.fn() }));

import { requireAdmin } from "@/lib/admin";
import {
  requestRefundAttempt,
  type RequestRefundAttemptFailureCode,
  type RequestRefundAttemptResult,
} from "@/lib/payment/refund/request";
import { requestRefundAttemptAction } from "../admin/refund";

const NOW = new Date("2026-07-10T08:00:00.000Z");
const GENERATED_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "admin_123";
const VALID_INPUT = { orderId: "order_123", amount: 4_000, reason: "Customer request" };

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequestRefundAttempt = vi.mocked(requestRefundAttempt);
const mockRandomUUID = vi.mocked(randomUUID);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockRandomUUID.mockReturnValue(GENERATED_ID);
  mockRequireAdmin.mockResolvedValue(adminGuard());
  mockRequestRefundAttempt.mockResolvedValue(successResult());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestRefundAttemptAction authorization", () => {
  it.each([
    ["UNAUTHENTICATED", { success: false, errorCode: "UNAUTHENTICATED" }],
    ["FORBIDDEN", { success: false, errorCode: "FORBIDDEN" }],
  ] as const)("returns %s without calling the core", async (errorCode, guard) => {
    mockRequireAdmin.mockResolvedValue(guard);

    const result = await requestRefundAttemptAction(VALID_INPUT);

    expect(result).toEqual({ success: false, errorCode });
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
  });
});

describe("requestRefundAttemptAction input boundary", () => {
  it.each([
    null,
    [],
    {},
    { ...VALID_INPUT, orderId: "   " },
    { ...VALID_INPUT, reason: 123 },
  ])("rejects malformed input", async (input) => {
    // @ts-expect-error Runtime validation intentionally covers untrusted action payloads.
    const result = await requestRefundAttemptAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
  });

  it("returns REASON_REQUIRED for a blank reason", async () => {
    const result = await requestRefundAttemptAction({ ...VALID_INPUT, reason: "  " });

    expect(result).toEqual({ success: false, errorCode: "REASON_REQUIRED" });
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "returns INVALID_AMOUNT for %s",
    async (amount) => {
      const result = await requestRefundAttemptAction({ ...VALID_INPUT, amount });

      expect(result).toEqual({ success: false, errorCode: "INVALID_AMOUNT" });
      expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
    },
  );
});

describe("requestRefundAttemptAction delegation", () => {
  it("uses server-generated identity, time, and authenticated admin provenance", async () => {
    const result = await requestRefundAttemptAction({
      orderId: "  order_123  ",
      amount: 4_000,
      reason: "  Customer request  ",
    });

    expect(mockRequestRefundAttempt).toHaveBeenCalledWith(mockDb, {
      refundAttemptId: GENERATED_ID,
      orderId: "order_123",
      amount: 4_000,
      reason: "Customer request",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
    expect(result).toEqual({
      success: true,
      refundAttemptId: GENERATED_ID,
      orderStatus: OrderStatus.REFUND_PENDING,
    });
  });

  it("returns only the minimal safe success fields", async () => {
    const result = await requestRefundAttemptAction(VALID_INPUT);

    expect(Object.keys(result).sort()).toEqual(["orderStatus", "refundAttemptId", "success"]);
  });

  it("discards caller-supplied payment, provider, and actor context", async () => {
    const untrustedInput = {
      ...VALID_INPUT,
      paymentId: "caller_payment",
      provider: "TOSS",
      mode: "LIVE",
      currency: "USD",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: "caller_actor",
      idempotencyKey: "caller_key",
      now: new Date("2000-01-01T00:00:00.000Z"),
    };

    await requestRefundAttemptAction(untrustedInput);

    expect(mockRequestRefundAttempt).toHaveBeenCalledWith(mockDb, {
      refundAttemptId: GENERATED_ID,
      ...VALID_INPUT,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
  });

  it("rethrows unexpected core errors", async () => {
    mockRequestRefundAttempt.mockRejectedValue(new Error("database unavailable"));

    await expect(requestRefundAttemptAction(VALID_INPUT)).rejects.toThrow("database unavailable");
  });
});

describe("requestRefundAttemptAction failure mapping", () => {
  it.each([
    ["INVALID_REASON", "REASON_REQUIRED"],
    ["INVALID_REQUEST_AMOUNT", "INVALID_AMOUNT"],
    ["INVALID_TOTAL_AMOUNT", "INVALID_TRANSITION"],
    ["OVER_REFUND", "INSUFFICIENT_REFUNDABLE"],
    ["ORDER_NOT_FOUND", "NOT_FOUND"],
    ["ORDER_STATUS_NOT_REFUNDABLE", "INVALID_TRANSITION"],
    ["REFUND_IN_PROGRESS", "REFUND_IN_PROGRESS"],
    ["PAYMENT_NOT_REFUNDABLE", "INVALID_TRANSITION"],
    ["CURRENCY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["EXISTING_ATTEMPT_CURRENCY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["INVALID_EXISTING_ATTEMPT_AMOUNT", "MANUAL_REVIEW_REQUIRED"],
    ["PAYMENT_IDENTITY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["DISPUTE_REVIEW_REQUIRED", "MANUAL_REVIEW_REQUIRED"],
    ["IDEMPOTENCY_CONFLICT", "CONFLICT"],
    ["ORDER_STATUS_CONFLICT", "CONFLICT"],
    ["INVALID_ORDER_ID", "INVALID_INPUT"],
    ["INVALID_REFUND_ATTEMPT_ID", "CONFLICT"],
    ["INVALID_PAYMENT_ID", "CONFLICT"],
    ["INVALID_ACTOR_USER_ID", "CONFLICT"],
    ["INVALID_REQUESTED_AT", "CONFLICT"],
  ] as const)("maps %s to %s without returning the core message", async (code, errorCode) => {
    mockRequestRefundAttempt.mockResolvedValue(coreFailure(code));

    const result = await requestRefundAttemptAction(VALID_INPUT);

    expect(result).toEqual({ success: false, errorCode });
  });
});

function adminGuard() {
  return {
    success: true as const,
    session: {
      user: { id: ADMIN_ID, role: "ADMIN", name: "Admin", email: "admin@example.test" },
      expires: "2099-01-01",
    },
  };
}

function successResult(): RequestRefundAttemptResult {
  return {
    ok: true,
    refundAttempt: refundAttempt(),
    orderStatus: OrderStatus.REFUND_PENDING,
    replayed: false,
  };
}

function coreFailure(code: RequestRefundAttemptFailureCode): RequestRefundAttemptResult {
  return { ok: false, code, message: "internal domain detail" };
}

function refundAttempt(): RefundAttempt {
  return {
    id: GENERATED_ID,
    orderId: VALID_INPUT.orderId,
    paymentId: "payment_internal",
    amount: VALID_INPUT.amount,
    currency: "KRW",
    status: RefundAttemptStatus.REQUESTED,
    reason: VALID_INPUT.reason,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: ADMIN_ID,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerRefundId: null,
    idempotencyKey: "internal_idempotency_key",
    requestedAt: NOW,
    processedAt: null,
    failedAt: null,
    failureCode: null,
    safeFailureMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
