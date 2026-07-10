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
vi.mock("@/lib/payment/refund/close", () => ({ closeRefundRequest: vi.fn() }));
vi.mock("@/lib/payment/refund/request", () => ({ requestRefundAttempt: vi.fn() }));

import { requireAdmin } from "@/lib/admin";
import {
  closeRefundRequest,
  type CloseRefundRequestFailureCode,
  type CloseRefundRequestResult,
} from "@/lib/payment/refund/close";
import {
  requestRefundAttempt,
  type RequestRefundAttemptFailureCode,
  type RequestRefundAttemptResult,
} from "@/lib/payment/refund/request";
import { closeRefundRequestAction, requestRefundAttemptAction } from "../admin/refund";

const NOW = new Date("2026-07-10T08:00:00.000Z");
const GENERATED_ID = "11111111-1111-4111-8111-111111111111";
const TRANSITION_ID = "transition_123";
const ADMIN_ID = "admin_123";
const VALID_INPUT = { orderId: "order_123", amount: 4_000, reason: "Customer request" };
const VALID_CLOSE_INPUT = {
  orderId: "order_123",
  refundAttemptId: "refund_123",
  reason: "Withdraw unexecuted request",
};

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockCloseRefundRequest = vi.mocked(closeRefundRequest);
const mockRequestRefundAttempt = vi.mocked(requestRefundAttempt);
const mockRandomUUID = vi.mocked(randomUUID);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockRandomUUID.mockReturnValue(GENERATED_ID);
  mockRequireAdmin.mockResolvedValue(adminGuard());
  mockCloseRefundRequest.mockResolvedValue(closeSuccessResult());
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

describe("closeRefundRequestAction authorization", () => {
  it.each([
    ["UNAUTHENTICATED", { success: false, errorCode: "UNAUTHENTICATED" }],
    ["FORBIDDEN", { success: false, errorCode: "FORBIDDEN" }],
  ] as const)("returns %s before validation or server value generation", async (errorCode, guard) => {
    mockRequireAdmin.mockResolvedValue(guard);

    // @ts-expect-error Authorization must short-circuit even malformed runtime payloads.
    const result = await closeRefundRequestAction(null);

    expect(result).toEqual({ success: false, errorCode });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockCloseRefundRequest).not.toHaveBeenCalled();
  });
});

describe("closeRefundRequestAction input boundary", () => {
  it.each([
    null,
    "invalid",
    42,
    [],
    {},
    { ...VALID_CLOSE_INPUT, orderId: "   " },
    { ...VALID_CLOSE_INPUT, refundAttemptId: "   " },
    { ...VALID_CLOSE_INPUT, reason: 123 },
    Object.assign(new (class HostileInput {})(), VALID_CLOSE_INPUT),
  ])("rejects malformed input without generating operation identity: %j", async (input) => {
    // @ts-expect-error Runtime validation intentionally covers untrusted action payloads.
    const result = await closeRefundRequestAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockCloseRefundRequest).not.toHaveBeenCalled();
  });

  it("returns REASON_REQUIRED for a blank reason", async () => {
    const result = await closeRefundRequestAction({ ...VALID_CLOSE_INPUT, reason: "  " });

    expect(result).toEqual({ success: false, errorCode: "REASON_REQUIRED" });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockCloseRefundRequest).not.toHaveBeenCalled();
  });
});

describe("closeRefundRequestAction delegation", () => {
  it("uses normalized input and server-owned identity, time, and admin provenance", async () => {
    const result = await closeRefundRequestAction({
      orderId: "  order_123  ",
      refundAttemptId: "  refund_123  ",
      reason: "  Withdraw unexecuted request  ",
    });

    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockCloseRefundRequest).toHaveBeenCalledTimes(1);
    expect(mockCloseRefundRequest).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      refundAttemptId: "refund_123",
      closeOperationId: GENERATED_ID,
      reason: "Withdraw unexecuted request",
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
    expect(result).toEqual(closeActionSuccess());
  });

  it("discards hostile caller context and forwards exactly seven trusted fields", async () => {
    const hostileInput = {
      ...VALID_CLOSE_INPUT,
      closeOperationId: "caller_operation",
      operationKey: "caller_key",
      actorType: RefundAttemptActorType.SYSTEM,
      actorUserId: "caller_actor",
      now: new Date("2000-01-01T00:00:00.000Z"),
      paymentId: "caller_payment",
      provider: PaymentProvider.PAYPAL,
      mode: PaymentMode.LIVE,
      currency: "USD",
      providerRefundId: "caller_refund",
      fromStatus: RefundAttemptStatus.PROCESSING,
      toStatus: RefundAttemptStatus.SUCCEEDED,
      orderStatusBefore: OrderStatus.REFUNDED,
      orderStatusAfter: OrderStatus.CANCELLED,
    };

    await closeRefundRequestAction(hostileInput);

    expect(mockCloseRefundRequest).toHaveBeenCalledWith(mockDb, {
      orderId: VALID_CLOSE_INPUT.orderId,
      refundAttemptId: VALID_CLOSE_INPUT.refundAttemptId,
      closeOperationId: GENERATED_ID,
      reason: VALID_CLOSE_INPUT.reason,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
    expect(Object.keys(mockCloseRefundRequest.mock.calls[0][1]).sort()).toEqual([
      "actorType",
      "actorUserId",
      "closeOperationId",
      "now",
      "orderId",
      "reason",
      "refundAttemptId",
    ]);
  });

  it("rethrows unexpected core errors", async () => {
    mockCloseRefundRequest.mockRejectedValue(new Error("database unavailable"));

    await expect(closeRefundRequestAction(VALID_CLOSE_INPUT)).rejects.toThrow("database unavailable");
  });
});

describe("closeRefundRequestAction success result", () => {
  it.each([
    [OrderStatus.PAID, false],
    [OrderStatus.PARTIALLY_REFUNDED, true],
  ] as const)("preserves safe result fields for %s replayed=%s", async (restoredOrderStatus, replayed) => {
    mockCloseRefundRequest.mockResolvedValue(closeSuccessResult({ restoredOrderStatus, replayed }));

    const result = await closeRefundRequestAction(VALID_CLOSE_INPUT);

    expect(result).toEqual(closeActionSuccess({ restoredOrderStatus, replayed }));
    expect(Object.keys(result).sort()).toEqual([
      "refundAttemptId",
      "refundAttemptStatus",
      "replayed",
      "restoredOrderStatus",
      "success",
      "transitionId",
    ]);
  });
});

describe("closeRefundRequestAction failure mapping", () => {
  it.each([
    ["INVALID_ORDER_ID", "INVALID_INPUT"],
    ["INVALID_REFUND_ATTEMPT_ID", "INVALID_INPUT"],
    ["INVALID_CLOSE_OPERATION_ID", "CONFLICT"],
    ["INVALID_REASON", "REASON_REQUIRED"],
    ["INVALID_ACTOR_USER_ID", "CONFLICT"],
    ["INVALID_CLOSE_TIMESTAMP", "CONFLICT"],
    ["ORDER_NOT_FOUND", "NOT_FOUND"],
    ["REFUND_ATTEMPT_NOT_FOUND", "NOT_FOUND"],
    ["REFUND_ATTEMPT_NOT_CANCELLABLE", "INVALID_TRANSITION"],
    ["PROVIDER_CONTACT_ALREADY_STARTED", "PROVIDER_CONTACT_ALREADY_STARTED"],
    ["ORDER_STATUS_CONFLICT", "CONFLICT"],
    ["IDEMPOTENCY_CONFLICT", "CONFLICT"],
    ["REFUND_LEDGER_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"],
  ] as const)("maps %s to %s without returning the core message", async (code, errorCode) => {
    mockCloseRefundRequest.mockResolvedValue(closeCoreFailure(code));

    const result = await closeRefundRequestAction(VALID_CLOSE_INPUT);

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

function closeSuccessResult(
  overrides: Partial<Extract<CloseRefundRequestResult, { ok: true }>> = {},
): CloseRefundRequestResult {
  return {
    ok: true,
    transitionId: TRANSITION_ID,
    refundAttemptId: VALID_CLOSE_INPUT.refundAttemptId,
    refundAttemptStatus: RefundAttemptStatus.CANCELLED,
    restoredOrderStatus: OrderStatus.PAID,
    createdAt: NOW,
    replayed: false,
    ...overrides,
  };
}

function closeActionSuccess(
  overrides: Partial<{
    restoredOrderStatus: typeof OrderStatus.PAID | typeof OrderStatus.PARTIALLY_REFUNDED;
    replayed: boolean;
  }> = {},
) {
  return {
    success: true,
    transitionId: TRANSITION_ID,
    refundAttemptId: VALID_CLOSE_INPUT.refundAttemptId,
    refundAttemptStatus: RefundAttemptStatus.CANCELLED,
    restoredOrderStatus: OrderStatus.PAID,
    replayed: false,
    ...overrides,
  };
}

function closeCoreFailure(code: CloseRefundRequestFailureCode): CloseRefundRequestResult {
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
