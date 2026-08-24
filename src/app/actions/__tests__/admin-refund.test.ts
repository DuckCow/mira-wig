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
const claimMocks = vi.hoisted(() => ({
  claim: vi.fn<(
    client: unknown,
    input: { orderId: string; refundAttemptId: string; actorUserId: string; now: Date },
  ) => Promise<unknown>>(),
  classify: vi.fn(),
  enabled: vi.fn(),
}));

vi.mock("crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/payment/refund/close", () => ({ closeRefundRequest: vi.fn() }));
vi.mock("@/lib/payment/refund/request", () => ({ requestRefundAttempt: vi.fn() }));
vi.mock("@/lib/payment/refund/claim", () => ({
  claimRefundAttemptForAdminSandboxExecution: claimMocks.claim,
  classifyExistingRefundExecutionClaim: claimMocks.classify,
}));
vi.mock("@/lib/payment/refund/execution-activation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/refund/execution-activation")>();
  return { ...actual, isRefundExecutionClaimEnabled: claimMocks.enabled };
});

import { requireAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
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
import {
  type ClaimRefundAttemptForExecutionFailureCode,
  type ClaimRefundAttemptForExecutionResult,
} from "@/lib/payment/refund/claim";
import { RefundExecutionActivationConfigError } from "@/lib/payment/refund/execution-activation";
import {
  claimRefundExecutionAction,
  closeRefundRequestAction,
  requestRefundAttemptAction,
} from "../admin/refund";

const NOW = new Date("2026-07-10T08:00:00.000Z");
const GENERATED_ID = "11111111-1111-4111-8111-111111111111";
const TRANSITION_ID = "transition_123";
const ADMIN_ID = "admin_123";
const VALID_INPUT = { orderId: "order_123", amount: 4_000, reason: "Customer request" };
const VALID_CLOSE_INPUT = {
  orderId: "order_123",
  refundAttemptId: "refund_123",
};
const VALID_CLAIM_INPUT = {
  orderId: "order_123",
  refundAttemptId: "refund_123",
};
const ADMIN_CLOSE_REASON = "관리자가 처리 전 환불 요청을 철회함";
const CLOSE_REVALIDATION_PATHS = [
  "/admin/orders/order_123",
  "/orders/order_123",
  "/orders",
  "/admin/refunds/intakes",
] as const;
const CLAIM_REVALIDATION_PATHS = [
  "/admin/orders/order_123",
  "/admin/refunds/execution",
] as const;

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockCloseRefundRequest = vi.mocked(closeRefundRequest);
const mockRequestRefundAttempt = vi.mocked(requestRefundAttempt);
const mockRandomUUID = vi.mocked(randomUUID);
const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockRandomUUID.mockReturnValue(GENERATED_ID);
  mockRequireAdmin.mockResolvedValue(adminGuard());
  mockCloseRefundRequest.mockResolvedValue(closeSuccessResult());
  mockRequestRefundAttempt.mockResolvedValue(successResult());
  claimMocks.enabled.mockReturnValue(true);
  claimMocks.claim.mockResolvedValue(claimSuccessResult());
  claimMocks.classify.mockResolvedValue("UNPROVEN");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("requestRefundAttemptAction authorization", () => {
  it.each([
    ["UNAUTHENTICATED", { success: false, errorCode: "UNAUTHENTICATED" }],
    ["FORBIDDEN", { success: false, errorCode: "FORBIDDEN" }],
  ] as const)("returns %s without calling the core", async (errorCode, guard) => {
    mockRequireAdmin.mockResolvedValue(guard);

    const result = await requestRefundAttemptAction(VALID_INPUT);

    expect(result).toEqual({ success: false, errorCode });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("requestRefundAttemptAction input boundary", () => {
  class HostileInput {}

  const malformedInputs: ReadonlyArray<readonly [string, unknown]> = [
    ["null", null],
    ["array", Object.assign([], VALID_INPUT)],
    ["Date", Object.assign(new Date(), VALID_INPUT)],
    ["class instance", Object.assign(new HostileInput(), VALID_INPUT)],
    ["custom prototype", Object.setPrototypeOf({ ...VALID_INPUT }, { inherited: true })],
    ["function", Object.assign(() => undefined, VALID_INPUT)],
    ["empty object", {}],
    ["blank order id", { ...VALID_INPUT, orderId: "   " }],
    ["non-string reason", { ...VALID_INPUT, reason: 123 }],
  ];

  it.each(malformedInputs)("rejects malformed %s input", async (_label, input) => {
    // @ts-expect-error Runtime validation intentionally covers untrusted action payloads.
    const result = await requestRefundAttemptAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a null-prototype object", async () => {
    const input = { ...VALID_INPUT };
    Object.setPrototypeOf(input, null);

    const result = await requestRefundAttemptAction(input);

    expect(result).toEqual({
      success: true,
      refundAttemptId: GENERATED_ID,
      orderStatus: OrderStatus.REFUND_PENDING,
    });
    expect(mockRequestRefundAttempt).toHaveBeenCalledOnce();
  });

  it("returns REASON_REQUIRED for a blank reason", async () => {
    const result = await requestRefundAttemptAction({ ...VALID_INPUT, reason: "  " });

    expect(result).toEqual({ success: false, errorCode: "REASON_REQUIRED" });
    expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "returns INVALID_AMOUNT for %s",
    async (amount) => {
      const result = await requestRefundAttemptAction({ ...VALID_INPUT, amount });

      expect(result).toEqual({ success: false, errorCode: "INVALID_AMOUNT" });
      expect(mockRequestRefundAttempt).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
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
    expect(mockRevalidatePath).toHaveBeenCalledOnce();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/orders/order_123");
  });

  it("does not inherit the customer Eximbay approval capability", async () => {
    vi.stubEnv("CUSTOMER_REFUND_INTAKE_EXIMBAY_APPROVE_ENABLED", "ENABLED");

    await requestRefundAttemptAction(VALID_INPUT);

    expect(mockRequestRefundAttempt).toHaveBeenCalledWith(mockDb, {
      refundAttemptId: GENERATED_ID,
      ...VALID_INPUT,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
  });

  it("revalidates the validated detail path for an exact core replay", async () => {
    mockRequestRefundAttempt.mockResolvedValue(successResult({ replayed: true }));

    await requestRefundAttemptAction({ ...VALID_INPUT, orderId: "  order_123  " });

    expect(mockRevalidatePath).toHaveBeenCalledOnce();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/orders/order_123");
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
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("requestRefundAttemptAction failure mapping", () => {
  it.each([
    ["INVALID_REASON", "REASON_REQUIRED"],
    ["REASON_TOO_LONG", "REASON_TOO_LONG"],
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
    ["REFUND_LEDGER_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"],
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
    expect(mockRevalidatePath).not.toHaveBeenCalled();
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
    expect(mockRevalidatePath).not.toHaveBeenCalled();
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
    Object.assign(new (class HostileInput {})(), VALID_CLOSE_INPUT),
  ])("rejects malformed input without generating operation identity: %j", async (input) => {
    // @ts-expect-error Runtime validation intentionally covers untrusted action payloads.
    const result = await closeRefundRequestAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockCloseRefundRequest).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

});

describe("closeRefundRequestAction delegation", () => {
  it("uses normalized input and server-owned identity, time, and admin provenance", async () => {
    const result = await closeRefundRequestAction({
      orderId: "  order_123  ",
      refundAttemptId: "  refund_123  ",
    });

    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockCloseRefundRequest).toHaveBeenCalledTimes(1);
    expect(mockCloseRefundRequest).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      refundAttemptId: "refund_123",
      closeOperationId: GENERATED_ID,
      reason: ADMIN_CLOSE_REASON,
      actorType: RefundAttemptActorType.ADMIN,
      actorUserId: ADMIN_ID,
      now: NOW,
    });
    expect(result).toEqual(closeActionSuccess());
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(CLOSE_REVALIDATION_PATHS);
    expect(mockRevalidatePath).not.toHaveBeenCalledWith("/admin/orders");
  });

  it("discards hostile caller context and forwards exactly seven trusted fields", async () => {
    const hostileInput = {
      ...VALID_CLOSE_INPUT,
      reason: "caller-controlled rationale",
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
      reason: ADMIN_CLOSE_REASON,
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
    expect(Object.keys(VALID_CLOSE_INPUT).sort()).toEqual(["orderId", "refundAttemptId"]);
  });

  it("rethrows unexpected core errors", async () => {
    mockCloseRefundRequest.mockRejectedValue(new Error("database unavailable"));

    await expect(closeRefundRequestAction(VALID_CLOSE_INPUT)).rejects.toThrow("database unavailable");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
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
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(CLOSE_REVALIDATION_PATHS);
    expect(mockRevalidatePath).not.toHaveBeenCalledWith("/admin/orders");
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
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("claimRefundExecutionAction authorization and activation", () => {
  it.each([
    ["UNAUTHENTICATED", { success: false, errorCode: "UNAUTHENTICATED" }],
    ["FORBIDDEN", { success: false, errorCode: "FORBIDDEN" }],
  ] as const)("returns %s before gate evaluation or parsing", async (errorCode, guard) => {
    mockRequireAdmin.mockResolvedValue(guard);

    const result = await claimRefundExecutionAction(null);

    expect(result).toEqual({ success: false, errorCode });
    expect(claimMocks.enabled).not.toHaveBeenCalled();
    expect(claimMocks.claim).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed before input parsing when the gate is disabled", async () => {
    claimMocks.enabled.mockReturnValue(false);

    const result = await claimRefundExecutionAction(null);

    expect(result).toEqual({ success: false, errorCode: "FEATURE_DISABLED" });
    expect(claimMocks.claim).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed on typed invalid gate configuration", async () => {
    claimMocks.enabled.mockImplementation(() => {
      throw new RefundExecutionActivationConfigError("REFUND_EXECUTION_CLAIM_ENABLED");
    });

    const result = await claimRefundExecutionAction(VALID_CLAIM_INPUT);

    expect(result).toEqual({ success: false, errorCode: "FEATURE_DISABLED" });
    expect(claimMocks.claim).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("claimRefundExecutionAction exact input boundary", () => {
  const hostileContext = {
    actorType: RefundAttemptActorType.SYSTEM,
    actorUserId: "caller_actor",
    rationale: "caller rationale",
    now: new Date("2000-01-01T00:00:00.000Z"),
    provider: PaymentProvider.TOSS,
    mode: PaymentMode.LIVE,
    amount: 1,
    currency: "USD",
    commandId: "caller_command",
    operationKey: "caller_key",
  };

  it.each([
    null,
    [],
    {},
    { ...VALID_CLAIM_INPUT, orderId: "   " },
    { ...VALID_CLAIM_INPUT, refundAttemptId: "   " },
    { ...VALID_CLAIM_INPUT, ...hostileContext },
    Object.assign(new (class HostileInput {})(), VALID_CLAIM_INPUT),
  ])("rejects malformed or extra-key input: %j", async (input) => {
    const result = await claimRefundExecutionAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(claimMocks.claim).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects symbol keys and accepts an exact null-prototype object", async () => {
    const symbolInput = { ...VALID_CLAIM_INPUT, [Symbol("hidden")]: "value" };
    const nullPrototypeInput = { ...VALID_CLAIM_INPUT };
    Object.setPrototypeOf(nullPrototypeInput, null);

    await expect(claimRefundExecutionAction(symbolInput)).resolves.toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    await expect(claimRefundExecutionAction(nullPrototypeInput)).resolves.toEqual({
      success: true,
      outcome: "CLAIMED",
    });
    expect(claimMocks.claim).toHaveBeenCalledOnce();
  });
});

describe("claimRefundExecutionAction delegation and revalidation", () => {
  it("supplies only normalized identity, authenticated admin, and server time", async () => {
    const result = await claimRefundExecutionAction({
      orderId: "  order_123  ",
      refundAttemptId: "  refund_123  ",
    });

    expect(claimMocks.claim).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      refundAttemptId: "refund_123",
      actorUserId: ADMIN_ID,
      now: NOW,
    });
    expect(Object.keys(claimMocks.claim.mock.calls[0][1]).sort()).toEqual([
      "actorUserId", "now", "orderId", "refundAttemptId",
    ]);
    expect(result).toEqual({ success: true, outcome: "CLAIMED" });
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(CLAIM_REVALIDATION_PATHS);
  });

  it.each([
    [false, "CLAIMED"],
    [true, "REPLAYED"],
  ] as const)("maps replayed=%s to %s with the exact two admin paths", async (replayed, outcome) => {
    claimMocks.claim.mockResolvedValue(claimSuccessResult({ replayed }));

    const result = await claimRefundExecutionAction(VALID_CLAIM_INPUT);

    expect(result).toEqual({ success: true, outcome });
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(CLAIM_REVALIDATION_PATHS);
    for (const excluded of [
      "/orders/order_123", "/orders", "/admin/refunds/intakes", "/admin/orders", "/",
    ]) {
      expect(mockRevalidatePath).not.toHaveBeenCalledWith(excluded);
    }
  });

  it("rethrows unexpected wrapper errors without revalidation", async () => {
    claimMocks.claim.mockRejectedValue(new Error("database unavailable"));

    await expect(claimRefundExecutionAction(VALID_CLAIM_INPUT)).rejects.toThrow("database unavailable");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when the provider-specific claim gate is malformed", async () => {
    claimMocks.claim.mockRejectedValue(new RefundExecutionActivationConfigError(
      "REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED",
    ));

    await expect(claimRefundExecutionAction(VALID_CLAIM_INPUT)).resolves.toEqual({
      success: false,
      errorCode: "FEATURE_DISABLED",
    });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("claimRefundExecutionAction result taxonomy", () => {
  it.each([
    ["CLAIM_CAPABILITY_UNSUPPORTED", "CAPABILITY_UNSUPPORTED"],
    ["REFUND_ATTEMPT_NOT_CLAIMABLE", "NOT_CLAIMABLE"],
    ["ORDER_STATUS_CONFLICT", "NOT_CLAIMABLE"],
    ["PAYMENT_NOT_REFUNDABLE", "NOT_CLAIMABLE"],
    ["ORDER_NOT_FOUND", "NOT_FOUND"],
    ["REFUND_ATTEMPT_NOT_FOUND", "NOT_FOUND"],
    ["REFUND_LEDGER_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"],
    ["INVALID_ORDER_ID", "CONFLICT"],
    ["INVALID_REFUND_ATTEMPT_ID", "CONFLICT"],
    ["INVALID_ACTOR_TYPE", "CONFLICT"],
    ["INVALID_ACTOR_USER_ID", "CONFLICT"],
    ["INVALID_CLAIM_TIMESTAMP", "CONFLICT"],
  ] as const)("maps %s to %s without internal evidence", async (code, errorCode) => {
    claimMocks.claim.mockResolvedValue(claimCoreFailure(code));

    const result = await claimRefundExecutionAction(VALID_CLAIM_INPUT);

    expect(result).toEqual({ success: false, errorCode });
    expect(claimMocks.classify).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("maps a healthy foreign-admin conflict to calm ALREADY_CLAIMED without server revalidation", async () => {
    claimMocks.claim.mockResolvedValue(claimCoreFailure("CLAIM_ARTIFACT_CONFLICT"));
    claimMocks.classify.mockResolvedValue("HEALTHY_EXISTING_CLAIM");

    const result = await claimRefundExecutionAction(VALID_CLAIM_INPUT);

    expect(claimMocks.classify).toHaveBeenCalledWith(mockDb, VALID_CLAIM_INPUT);
    expect(result).toEqual({ success: true, outcome: "ALREADY_CLAIMED" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("retains malformed conflict evidence as manual review", async () => {
    claimMocks.claim.mockResolvedValue(claimCoreFailure("CLAIM_ARTIFACT_CONFLICT"));
    claimMocks.classify.mockResolvedValue("UNPROVEN");

    const result = await claimRefundExecutionAction(VALID_CLAIM_INPUT);

    expect(result).toEqual({ success: false, errorCode: "MANUAL_REVIEW_REQUIRED" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
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

function successResult(
  overrides: Partial<Extract<RequestRefundAttemptResult, { ok: true }>> = {},
): RequestRefundAttemptResult {
  return {
    ok: true,
    refundAttempt: refundAttempt(),
    orderStatus: OrderStatus.REFUND_PENDING,
    replayed: false,
    ...overrides,
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

function claimSuccessResult(
  overrides: Partial<Extract<ClaimRefundAttemptForExecutionResult, { ok: true }>> = {},
): ClaimRefundAttemptForExecutionResult {
  return {
    ok: true,
    refundAttemptId: VALID_CLAIM_INPUT.refundAttemptId,
    commandId: "private_command_id",
    replayed: false,
    ...overrides,
  };
}

function claimCoreFailure(
  code: ClaimRefundAttemptForExecutionFailureCode,
): ClaimRefundAttemptForExecutionResult {
  return { ok: false, code, message: "private claim evidence" };
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
