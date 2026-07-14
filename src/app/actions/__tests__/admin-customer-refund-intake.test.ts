import {
  CustomerRefundIntakeStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ kind: "admin-intake-db" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/payment/refund/customer-intake-activation", () => ({
  isCustomerRefundIntakeApproveEnabled: vi.fn(),
}));
vi.mock("@/lib/payment/refund/customer-intake-review", () => ({
  approveCustomerRefundIntake: vi.fn(),
  rejectCustomerRefundIntake: vi.fn(),
}));
vi.mock("@/lib/payment/refund/customer-intake-review-contract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payment/refund/customer-intake-review-contract")>(
    "@/lib/payment/refund/customer-intake-review-contract",
  );
  return {
    ...actual,
    normalizeApproveCustomerRefundIntakeInput: vi.fn(actual.normalizeApproveCustomerRefundIntakeInput),
    normalizeRejectCustomerRefundIntakeInput: vi.fn(actual.normalizeRejectCustomerRefundIntakeInput),
  };
});

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { isCustomerRefundIntakeApproveEnabled } from "@/lib/payment/refund/customer-intake-activation";
import {
  normalizeApproveCustomerRefundIntakeInput,
  normalizeRejectCustomerRefundIntakeInput,
  type ApproveCustomerRefundIntakeFailureCode,
  type ApproveCustomerRefundIntakeResult,
  type RejectCustomerRefundIntakeFailureCode,
  type RejectCustomerRefundIntakeResult,
} from "@/lib/payment/refund/customer-intake-review-contract";
import {
  approveCustomerRefundIntake,
  rejectCustomerRefundIntake,
} from "@/lib/payment/refund/customer-intake-review";
import {
  approveCustomerRefundIntakeAction,
  rejectCustomerRefundIntakeAction,
} from "../admin/customer-refund-intake";

const NOW = new Date("2026-07-15T05:00:00.000Z");
const ADMIN_ID = "admin_123";
const VALID_REJECT = {
  orderId: "order_123",
  intakeId: "intake_123",
  adminRejectionReason: "Not eligible after review",
};
const VALID_APPROVE = {
  orderId: "order_123",
  intakeId: "intake_123",
  amountMinor: "4000",
  merchantRationale: "Approved customer request",
};

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockApproveEnabled = vi.mocked(isCustomerRefundIntakeApproveEnabled);
const mockNormalizeReject = vi.mocked(normalizeRejectCustomerRefundIntakeInput);
const mockNormalizeApprove = vi.mocked(normalizeApproveCustomerRefundIntakeInput);
const mockReject = vi.mocked(rejectCustomerRefundIntake);
const mockApprove = vi.mocked(approveCustomerRefundIntake);
const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockRequireAdmin.mockResolvedValue(adminGuard());
  mockApproveEnabled.mockReturnValue(true);
  mockReject.mockResolvedValue(rejectSuccess());
  mockApprove.mockResolvedValue(approveSuccess());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("administrator authorization and actor ownership", () => {
  it.each([
    ["UNAUTHENTICATED", { success: false, errorCode: "UNAUTHENTICATED" }],
    ["FORBIDDEN", { success: false, errorCode: "FORBIDDEN" }],
  ] as const)("returns %s before gate, parsing, or cores", async (errorCode, guard) => {
    mockRequireAdmin.mockResolvedValue(guard);

    await expect(approveCustomerRefundIntakeAction(null)).resolves.toEqual({ success: false, errorCode });
    await expect(rejectCustomerRefundIntakeAction(null)).resolves.toEqual({ success: false, errorCode });

    expect(mockApproveEnabled).not.toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("accepts a null-prototype rejection input", async () => {
    const input = { ...VALID_REJECT };
    Reflect.setPrototypeOf(input, null);

    await expect(rejectCustomerRefundIntakeAction(input)).resolves.toMatchObject({ success: true });
    expect(mockReject).toHaveBeenCalledOnce();
  });

  it("throws for a malformed administrator actor before the gate", async () => {
    mockRequireAdmin.mockResolvedValue(adminGuard("   "));

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).rejects.toThrow(
      "Administrator customer refund intake action invariant failed.",
    );
    expect(mockApproveEnabled).not.toHaveBeenCalled();
  });

  it("derives the normalized reviewer from the guard session", async () => {
    mockRequireAdmin.mockResolvedValue(adminGuard("  admin_123  "));

    await rejectCustomerRefundIntakeAction(VALID_REJECT);

    expect(mockReject).toHaveBeenCalledWith(mockDb, expect.objectContaining({ reviewedByUserId: ADMIN_ID }));
  });
});

describe("administrator reject boundary", () => {
  class HostileInput {}

  it.each([
    ["null", null],
    ["array", [VALID_REJECT]],
    ["Date", Object.assign(new Date(), VALID_REJECT)],
    ["class instance", Object.assign(new HostileInput(), VALID_REJECT)],
    ["custom prototype", Object.setPrototypeOf({ ...VALID_REJECT }, { inherited: true })],
    ["symbol key", { ...VALID_REJECT, [Symbol("spoof")]: true }],
    ["missing key", { orderId: "order_123", intakeId: "intake_123" }],
    ["extra key", { ...VALID_REJECT, extra: true }],
    ["spoofed reviewer", { ...VALID_REJECT, reviewedByUserId: "attacker" }],
    ["spoofed timestamp", { ...VALID_REJECT, reviewedAt: NOW }],
    ["wrong reason type", { ...VALID_REJECT, adminRejectionReason: 123 }],
  ] as const)("rejects %s", async (_label, input) => {
    await expect(rejectCustomerRefundIntakeAction(input)).resolves.toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(mockReject).not.toHaveBeenCalled();
  });

  it.each([
    [false, "REJECTED"],
    [true, "ALREADY_REJECTED"],
  ] as const)("returns stored rejection replay=%s as %s", async (replayed, outcome) => {
    mockReject.mockResolvedValue(rejectSuccess({ replayed }));

    const result = await rejectCustomerRefundIntakeAction({
      orderId: "  order_123  ",
      intakeId: "  intake_123  ",
      adminRejectionReason: "  retry rationale  ",
    });

    expect(mockNormalizeReject).toHaveBeenCalledWith({
      orderId: "  order_123  ",
      intakeId: "  intake_123  ",
      adminRejectionReason: "  retry rationale  ",
      reviewedByUserId: ADMIN_ID,
      now: NOW,
    });
    expect(mockReject).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      intakeId: "intake_123",
      reviewedByUserId: ADMIN_ID,
      adminRejectionReason: "retry rationale",
      now: NOW,
    });
    expect(result).toEqual({
      success: true,
      outcome,
      intake: {
        id: "stored_intake_123",
        orderId: "stored_order_123",
        status: CustomerRefundIntakeStatus.REJECTED,
        reviewedAt: "2026-07-14T06:00:00.000Z",
        adminRejectionReason: "stored rejection rationale",
      },
    });
    expect(JSON.stringify(result)).not.toContain(ADMIN_ID);
    expect(JSON.stringify(result)).not.toContain("retry rationale");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["REJECTION_REASON_REQUIRED", "REJECTION_REASON_REQUIRED"],
    ["REJECTION_REASON_TOO_LONG", "REJECTION_REASON_TOO_LONG"],
  ] as const)("maps reject normalizer %s", async (code, errorCode) => {
    mockNormalizeReject.mockReturnValueOnce(rejectFailure(code));

    await expect(rejectCustomerRefundIntakeAction(VALID_REJECT)).resolves.toEqual({ success: false, errorCode });
    expect(mockReject).not.toHaveBeenCalled();
  });

  it.each([
    ["ORDER_NOT_FOUND", "ORDER_NOT_FOUND"],
    ["INTAKE_NOT_FOUND", "INTAKE_NOT_FOUND"],
    ["NOT_REJECTABLE", "NOT_REJECTABLE"],
  ] as const)("maps reject core %s", async (code, errorCode) => {
    mockReject.mockResolvedValue(rejectFailure(code));

    await expect(rejectCustomerRefundIntakeAction(VALID_REJECT)).resolves.toEqual({ success: false, errorCode });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    "INVALID_ORDER_ID",
    "INVALID_INTAKE_ID",
    "INVALID_REVIEWER_ID",
    "INVALID_REVIEWED_AT",
    "INVALID_REJECTION_REASON_TYPE",
    "REJECTION_REASON_REQUIRED",
    "REJECTION_REASON_TOO_LONG",
  ] as const)("throws if normalized reject core returns impossible %s", async (code) => {
    mockReject.mockResolvedValue(rejectFailure(code));

    await expect(rejectCustomerRefundIntakeAction(VALID_REJECT)).rejects.toThrow(
      "Administrator customer refund intake action invariant failed.",
    );
  });
});

describe("administrator approve gate and exact input", () => {
  it("returns FEATURE_DISABLED before parsing and blocks replay invocation", async () => {
    mockApproveEnabled.mockReturnValue(false);

    await expect(approveCustomerRefundIntakeAction(null)).resolves.toEqual({
      success: false,
      errorCode: "FEATURE_DISABLED",
    });
    expect(mockNormalizeApprove).not.toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("accepts a null-prototype approval input", async () => {
    const input = { ...VALID_APPROVE };
    Reflect.setPrototypeOf(input, null);

    await expect(approveCustomerRefundIntakeAction(input)).resolves.toMatchObject({ success: true });
    expect(mockApprove).toHaveBeenCalledOnce();
  });

  it("propagates malformed activation configuration", async () => {
    mockApproveEnabled.mockImplementation(() => {
      throw new Error("activation configuration failed");
    });

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).rejects.toThrow(
      "activation configuration failed",
    );
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["array", [VALID_APPROVE]],
    ["extra key", { ...VALID_APPROVE, extra: true }],
    ["spoofed reviewer", { ...VALID_APPROVE, reviewedByUserId: "attacker" }],
    ["spoofed currency", { ...VALID_APPROVE, currency: "USD" }],
    ["spoofed attempt", { ...VALID_APPROVE, approvedRefundAttemptId: "attempt" }],
    ["symbol key", { ...VALID_APPROVE, [Symbol("spoof")]: true }],
    ["non-string amount", { ...VALID_APPROVE, amountMinor: 4000 }],
    ["non-string rationale", { ...VALID_APPROVE, merchantRationale: 123 }],
  ] as const)("returns INVALID_INPUT for %s", async (_label, input) => {
    await expect(approveCustomerRefundIntakeAction(input)).resolves.toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(mockApprove).not.toHaveBeenCalled();
  });
});

describe("administrator approve canonical minor-unit parser", () => {
  it.each([
    "",
    " ",
    "0",
    "00",
    "01",
    "+1",
    "-1",
    "1,000",
    "1.0",
    "1e3",
    " 1",
    "1 ",
    String(Number.MAX_SAFE_INTEGER + 1),
  ])("rejects %j as INVALID_AMOUNT", async (amountMinor) => {
    await expect(approveCustomerRefundIntakeAction({ ...VALID_APPROVE, amountMinor })).resolves.toEqual({
      success: false,
      errorCode: "INVALID_AMOUNT",
    });
    expect(mockNormalizeApprove).not.toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it.each(["1", "100", String(Number.MAX_SAFE_INTEGER)])(
    "passes exact safe integer %s to normalizer and core",
    async (amountMinor) => {
      await approveCustomerRefundIntakeAction({ ...VALID_APPROVE, amountMinor });

      const amount = Number(amountMinor);
      expect(mockNormalizeApprove).toHaveBeenCalledWith(expect.objectContaining({ amount }));
      expect(mockApprove).toHaveBeenCalledWith(mockDb, expect.objectContaining({ amount }));
    },
  );
});

describe("administrator approve mapping, serialization, and revalidation", () => {
  it("preserves the linked Attempt's current stored status", async () => {
    mockApprove.mockResolvedValue(approveSuccess({ attemptStatus: RefundAttemptStatus.SUCCEEDED }));

    const result = await approveCustomerRefundIntakeAction(VALID_APPROVE);

    expect(result).toMatchObject({ success: true, attempt: { status: RefundAttemptStatus.SUCCEEDED } });
  });

  it.each([
    [false, "APPROVED"],
    [true, "ALREADY_APPROVED"],
  ] as const)("returns stored approval replay=%s as %s", async (replayed, outcome) => {
    mockApprove.mockResolvedValue(approveSuccess({ replayed }));

    const result = await approveCustomerRefundIntakeAction({
      orderId: "  order_123  ",
      intakeId: "  intake_123  ",
      amountMinor: "4000",
      merchantRationale: "  retry rationale  ",
    });

    expect(mockApprove).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      intakeId: "intake_123",
      reviewedByUserId: ADMIN_ID,
      amount: 4000,
      merchantRationale: "retry rationale",
      now: NOW,
    });
    expect(result).toEqual({
      success: true,
      outcome,
      intake: {
        id: "stored_intake_123",
        orderId: "stored_order_123",
        status: CustomerRefundIntakeStatus.APPROVED,
        reviewedAt: "2026-07-14T07:00:00.000Z",
        approvedRefundAttemptId: "stored_attempt_123",
      },
      attempt: {
        id: "stored_attempt_123",
        orderId: "stored_order_123",
        status: RefundAttemptStatus.REQUESTED,
        amount: 3500,
        currency: "KRW",
        requestedAt: "2026-07-14T07:00:00.000Z",
      },
    });
    expect(mockRevalidatePath.mock.calls).toEqual([
      ["/orders/stored_order_123"],
      ["/orders"],
      ["/admin/orders/stored_order_123"],
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ADMIN_ID);
    expect(serialized).not.toContain("retry rationale");
    expect(serialized).not.toContain("paymentId");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("idempotency");
  });

  it.each([
    ["ORDER_NOT_FOUND", "ORDER_NOT_FOUND"],
    ["INTAKE_NOT_FOUND", "INTAKE_NOT_FOUND"],
    ["INTAKE_INCONSISTENT", "INTAKE_INCONSISTENT"],
    ["NOT_APPROVABLE", "NOT_APPROVABLE"],
    ["ORDER_STATUS_NOT_REFUNDABLE", "INVALID_TRANSITION"],
    ["PAYMENT_NOT_REFUNDABLE", "INVALID_TRANSITION"],
    ["REFUND_IN_PROGRESS", "REFUND_IN_PROGRESS"],
    ["OVER_REFUND", "INSUFFICIENT_REFUNDABLE"],
    ["PAYMENT_IDENTITY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["REFUND_LEDGER_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"],
    ["DISPUTE_REVIEW_REQUIRED", "MANUAL_REVIEW_REQUIRED"],
    ["INVALID_TOTAL_AMOUNT", "MANUAL_REVIEW_REQUIRED"],
    ["CURRENCY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["EXISTING_ATTEMPT_CURRENCY_MISMATCH", "MANUAL_REVIEW_REQUIRED"],
    ["INVALID_EXISTING_ATTEMPT_AMOUNT", "MANUAL_REVIEW_REQUIRED"],
  ] as const)("maps approve core %s to %s", async (code, errorCode) => {
    mockApprove.mockResolvedValue(approveFailure(code));

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).resolves.toEqual({ success: false, errorCode });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_REASON", "REASON_REQUIRED"],
    ["REASON_TOO_LONG", "REASON_TOO_LONG"],
  ] as const)("maps approve normalizer %s", async (code, errorCode) => {
    mockNormalizeApprove.mockReturnValueOnce(approveFailure(code));

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).resolves.toEqual({ success: false, errorCode });
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it.each([
    "INVALID_ORDER_ID",
    "INVALID_INTAKE_ID",
    "INVALID_REVIEWER_ID",
    "INVALID_REVIEWED_AT",
    "INVALID_REQUEST_AMOUNT",
    "INVALID_REASON",
    "REASON_TOO_LONG",
  ] as const)("throws if normalized approve core returns impossible %s", async (code) => {
    mockApprove.mockResolvedValue(approveFailure(code));

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).rejects.toThrow(
      "Administrator customer refund intake action invariant failed.",
    );
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("administrator action exception and logging boundary", () => {
  it("propagates core exceptions without logging sensitive text", async () => {
    const error = new Error("database unavailable");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockApprove.mockRejectedValue(error);

    await expect(approveCustomerRefundIntakeAction(VALID_APPROVE)).rejects.toBe(error);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

function adminGuard(id = ADMIN_ID) {
  return {
    success: true as const,
    session: {
      user: { id, role: "ADMIN", name: "Admin", email: "admin@example.test" },
      expires: "2099-01-01",
    },
  };
}

function rejectSuccess(overrides: { replayed?: boolean } = {}): RejectCustomerRefundIntakeResult {
  return {
    ok: true,
    replayed: overrides.replayed ?? false,
    intake: {
      id: "stored_intake_123",
      orderId: "stored_order_123",
      status: CustomerRefundIntakeStatus.REJECTED,
      reviewedAt: new Date("2026-07-14T06:00:00.000Z"),
      reviewedByUserId: "stored_admin_123",
      adminRejectionReason: "stored rejection rationale",
    },
  };
}

function approveSuccess(overrides: {
  replayed?: boolean;
  attemptStatus?: RefundAttemptStatus;
} = {}): ApproveCustomerRefundIntakeResult {
  return {
    ok: true,
    replayed: overrides.replayed ?? false,
    intake: {
      id: "stored_intake_123",
      orderId: "stored_order_123",
      status: CustomerRefundIntakeStatus.APPROVED,
      reviewedAt: new Date("2026-07-14T07:00:00.000Z"),
      reviewedByUserId: "stored_admin_123",
      approvedRefundAttemptId: "stored_attempt_123",
    },
    attempt: {
      id: "stored_attempt_123",
      orderId: "stored_order_123",
      status: overrides.attemptStatus ?? RefundAttemptStatus.REQUESTED,
      amount: 3500,
      currency: "KRW",
      requestedAt: new Date("2026-07-14T07:00:00.000Z"),
    },
  };
}

function rejectFailure(
  code: RejectCustomerRefundIntakeFailureCode,
): Extract<RejectCustomerRefundIntakeResult, { ok: false }> {
  return { ok: false, code, message: "sensitive core message" };
}

function approveFailure(
  code: ApproveCustomerRefundIntakeFailureCode,
): Extract<ApproveCustomerRefundIntakeResult, { ok: false }> {
  return { ok: false, code, message: "sensitive core message" };
}
