import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ kind: "customer-intake-db" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/payment/refund/customer-intake-activation", () => ({
  isCustomerRefundIntakeSubmitEnabled: vi.fn(),
}));
vi.mock("@/lib/payment/refund/customer-intake", () => ({
  submitCustomerRefundIntake: vi.fn(),
  withdrawCustomerRefundIntake: vi.fn(),
}));
vi.mock("@/lib/payment/refund/customer-intake-contract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payment/refund/customer-intake-contract")>(
    "@/lib/payment/refund/customer-intake-contract",
  );
  return {
    ...actual,
    normalizeSubmitCustomerRefundIntakeInput: vi.fn(actual.normalizeSubmitCustomerRefundIntakeInput),
    normalizeWithdrawCustomerRefundIntakeInput: vi.fn(actual.normalizeWithdrawCustomerRefundIntakeInput),
  };
});

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { isCustomerRefundIntakeSubmitEnabled } from "@/lib/payment/refund/customer-intake-activation";
import {
  normalizeSubmitCustomerRefundIntakeInput,
  normalizeWithdrawCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeFailureCode,
  type SubmitCustomerRefundIntakeResult,
  type WithdrawCustomerRefundIntakeFailureCode,
  type WithdrawCustomerRefundIntakeResult,
} from "@/lib/payment/refund/customer-intake-contract";
import {
  submitCustomerRefundIntake,
  withdrawCustomerRefundIntake,
} from "@/lib/payment/refund/customer-intake";
import {
  submitCustomerRefundIntakeAction,
  withdrawCustomerRefundIntakeAction,
} from "../customer-refund-intake";

const NOW = new Date("2026-07-15T02:00:00.000Z");
const CUSTOMER_ID = "customer_123";
const VALID_SUBMIT = {
  orderId: "order_123",
  reasonCode: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE,
  reasonDetail: "Delivery was delayed",
};
const VALID_WITHDRAW = { orderId: "order_123" };

const mockGetSession = vi.mocked(getSession);
const mockSubmitEnabled = vi.mocked(isCustomerRefundIntakeSubmitEnabled);
const mockNormalizeSubmit = vi.mocked(normalizeSubmitCustomerRefundIntakeInput);
const mockNormalizeWithdraw = vi.mocked(normalizeWithdrawCustomerRefundIntakeInput);
const mockSubmit = vi.mocked(submitCustomerRefundIntake);
const mockWithdraw = vi.mocked(withdrawCustomerRefundIntake);
const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockGetSession.mockResolvedValue(customerSession());
  mockSubmitEnabled.mockReturnValue(true);
  mockSubmit.mockResolvedValue(submitSuccess());
  mockWithdraw.mockResolvedValue(withdrawSuccess());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("customer authentication and submit activation ordering", () => {
  it.each([
    ["submit", () => submitCustomerRefundIntakeAction(VALID_SUBMIT)],
    ["withdraw", () => withdrawCustomerRefundIntakeAction(VALID_WITHDRAW)],
  ] as const)("returns UNAUTHENTICATED before invoking the %s core", async (_label, invoke) => {
    mockGetSession.mockResolvedValue(null);

    await expect(invoke()).resolves.toEqual({ success: false, errorCode: "UNAUTHENTICATED" });

    expect(mockSubmitEnabled).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it("throws for a malformed authenticated actor before gate evaluation", async () => {
    mockGetSession.mockResolvedValue(customerSession("   "));

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).rejects.toThrow(
      "Customer refund intake action invariant failed.",
    );
    expect(mockSubmitEnabled).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("returns FEATURE_DISABLED without parsing or normalizing browser input", async () => {
    mockSubmitEnabled.mockReturnValue(false);

    const result = await submitCustomerRefundIntakeAction(null);

    expect(result).toEqual({ success: false, errorCode: "FEATURE_DISABLED" });
    expect(mockNormalizeSubmit).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("propagates malformed activation configuration", async () => {
    mockSubmitEnabled.mockImplementation(() => {
      throw new Error("activation configuration failed");
    });

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).rejects.toThrow(
      "activation configuration failed",
    );
    expect(mockNormalizeSubmit).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe("submit exact structural boundary", () => {
  class HostileInput {}

  const symbolInput = { ...VALID_SUBMIT, [Symbol("spoof")]: true };
  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ["null", null],
    ["array", [VALID_SUBMIT]],
    ["Date", Object.assign(new Date(), VALID_SUBMIT)],
    ["class instance", Object.assign(new HostileInput(), VALID_SUBMIT)],
    ["custom prototype", Object.setPrototypeOf({ ...VALID_SUBMIT }, { inherited: true })],
    ["primitive", "order_123"],
    ["symbol key", symbolInput],
    ["missing orderId", { reasonCode: VALID_SUBMIT.reasonCode }],
    ["missing reasonCode", { orderId: VALID_SUBMIT.orderId }],
    ["extra key", { ...VALID_SUBMIT, extra: true }],
    ["spoofed customer", { ...VALID_SUBMIT, customerUserId: "attacker" }],
    ["spoofed timestamp", { ...VALID_SUBMIT, submittedAt: NOW }],
    ["spoofed status", { ...VALID_SUBMIT, status: "APPROVED" }],
    ["spoofed intake id", { ...VALID_SUBMIT, intakeId: "intake_123" }],
    ["invalid reason enum", { ...VALID_SUBMIT, reasonCode: "CANCELLED" }],
    ["invalid reason detail type", { ...VALID_SUBMIT, reasonDetail: 123 }],
  ];

  it.each(malformed)("rejects %s", async (_label, input) => {
    const result = await submitCustomerRefundIntakeAction(input);

    expect(result).toEqual({ success: false, errorCode: "INVALID_INPUT" });
    expect(mockNormalizeSubmit).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("accepts a valid null-prototype object", async () => {
    const input = { ...VALID_SUBMIT };
    Reflect.setPrototypeOf(input, null);

    await expect(submitCustomerRefundIntakeAction(input)).resolves.toMatchObject({ success: true });
    expect(mockSubmit).toHaveBeenCalledOnce();
  });
});

describe("submit normalization, replay classification, and serialization", () => {
  it("uses the committed normalizer and one server-owned timestamp for the core", async () => {
    await submitCustomerRefundIntakeAction({
      orderId: "  order_123  ",
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      reasonDetail: "  first\r\nsecond  ",
    });

    expect(mockNormalizeSubmit).toHaveBeenCalledWith({
      orderId: "  order_123  ",
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      reasonDetail: "  first\r\nsecond  ",
      customerUserId: CUSTOMER_ID,
      now: NOW,
    });
    expect(mockSubmit).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      customerUserId: CUSTOMER_ID,
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      reasonDetail: "first\nsecond",
      now: NOW,
    });
  });

  it("uses normalized blank-to-null detail semantics", async () => {
    await submitCustomerRefundIntakeAction({ ...VALID_SUBMIT, reasonDetail: " \r\n " });

    expect(mockSubmit).toHaveBeenCalledWith(mockDb, expect.objectContaining({ reasonDetail: null }));
  });

  it.each([
    [false, VALID_SUBMIT.reasonCode, VALID_SUBMIT.reasonDetail, "CREATED"],
    [true, VALID_SUBMIT.reasonCode, VALID_SUBMIT.reasonDetail, "REPLAYED_SAME_PAYLOAD"],
    [true, CustomerRefundIntakeReasonCode.OTHER, "stored detail", "REPLAYED_DIFFERENT_PAYLOAD"],
  ] as const)("classifies replay=%s as %s payload outcome", async (replayed, reasonCode, reasonDetail, outcome) => {
    mockSubmit.mockResolvedValue(submitSuccess({ replayed, reasonCode, reasonDetail }));

    const result = await submitCustomerRefundIntakeAction(VALID_SUBMIT);

    expect(result).toEqual({
      success: true,
      outcome,
      intake: {
        orderId: "stored_order_123",
        status: CustomerRefundIntakeStatus.SUBMITTED,
        reasonCode,
        reasonDetail,
        submittedAt: "2026-07-14T03:00:00.000Z",
      },
    });
    expect(JSON.stringify(result)).not.toContain(CUSTOMER_ID);
    expect(JSON.stringify(result)).not.toContain("intake_123");
  });
});

describe("submit exhaustive failure ownership", () => {
  it.each([
    ["INVALID_ORDER_ID", "INVALID_INPUT"],
    ["INVALID_REASON_CODE", "INVALID_INPUT"],
    ["INVALID_REASON_DETAIL_TYPE", "INVALID_INPUT"],
    ["REASON_DETAIL_CONTROL_CHARACTER", "REASON_DETAIL_INVALID"],
    ["REASON_DETAIL_FORMAT_CHARACTER", "REASON_DETAIL_INVALID"],
    ["REASON_DETAIL_TOO_LONG", "REASON_DETAIL_TOO_LONG"],
  ] as const)("maps normalizer %s to %s", async (code, errorCode) => {
    mockNormalizeSubmit.mockReturnValueOnce(submitFailure(code));

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).resolves.toEqual({ success: false, errorCode });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it.each(["INVALID_CUSTOMER_USER_ID", "INVALID_SUBMITTED_AT"] as const)(
    "throws for server-owned normalizer failure %s",
    async (code) => {
      mockNormalizeSubmit.mockReturnValueOnce(submitFailure(code));

      await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).rejects.toThrow(
        "Customer refund intake action invariant failed.",
      );
    },
  );

  it.each([
    ["ORDER_NOT_FOUND_OR_NOT_OWNED", "NOT_FOUND"],
    ["ORDER_NOT_ELIGIBLE", "NOT_AVAILABLE"],
    ["INTAKE_INCONSISTENT", "CONFLICT"],
  ] as const)("maps core %s to %s", async (code, errorCode) => {
    mockSubmit.mockResolvedValue(submitFailure(code));

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).resolves.toEqual({ success: false, errorCode });
  });

  it.each([
    "INVALID_ORDER_ID",
    "INVALID_CUSTOMER_USER_ID",
    "INVALID_REASON_CODE",
    "INVALID_REASON_DETAIL_TYPE",
    "REASON_DETAIL_CONTROL_CHARACTER",
    "REASON_DETAIL_FORMAT_CHARACTER",
    "REASON_DETAIL_TOO_LONG",
    "INVALID_SUBMITTED_AT",
  ] as const)("throws if normalized core returns impossible validation %s", async (code) => {
    mockSubmit.mockResolvedValue(submitFailure(code));

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).rejects.toThrow(
      "Customer refund intake action invariant failed.",
    );
  });
});

describe("withdraw action", () => {
  it.each([
    [null],
    [[VALID_WITHDRAW]],
    [{ ...VALID_WITHDRAW, intakeId: "spoof" }],
    [{ ...VALID_WITHDRAW, customerUserId: "spoof" }],
    [{ ...VALID_WITHDRAW, withdrawnAt: NOW }],
    [{ orderId: 123 }],
  ] as const)("rejects malformed or overposted input", async (input) => {
    await expect(withdrawCustomerRefundIntakeAction(input)).resolves.toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
    });
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it.each([
    [false, "WITHDRAWN"],
    [true, "ALREADY_WITHDRAWN"],
  ] as const)("serializes stored replay=%s as %s", async (replayed, outcome) => {
    mockWithdraw.mockResolvedValue(withdrawSuccess({ replayed }));

    const result = await withdrawCustomerRefundIntakeAction({ orderId: "  order_123  " });

    expect(mockNormalizeWithdraw).toHaveBeenCalledWith({
      orderId: "  order_123  ",
      customerUserId: CUSTOMER_ID,
      now: NOW,
    });
    expect(mockWithdraw).toHaveBeenCalledWith(mockDb, {
      orderId: "order_123",
      customerUserId: CUSTOMER_ID,
      now: NOW,
    });
    expect(result).toEqual({
      success: true,
      outcome,
      intake: {
        orderId: "stored_order_123",
        status: CustomerRefundIntakeStatus.WITHDRAWN,
        withdrawnAt: "2026-07-14T04:00:00.000Z",
      },
    });
  });

  it.each([
    ["INTAKE_NOT_FOUND_OR_NOT_OWNED", "NOT_FOUND"],
    ["NOT_WITHDRAWABLE", "NOT_WITHDRAWABLE"],
  ] as const)("maps core %s to %s", async (code, errorCode) => {
    mockWithdraw.mockResolvedValue(withdrawFailure(code));

    await expect(withdrawCustomerRefundIntakeAction(VALID_WITHDRAW)).resolves.toEqual({
      success: false,
      errorCode,
    });
  });

  it.each(["INVALID_CUSTOMER_USER_ID", "INVALID_WITHDRAWN_AT"] as const)(
    "throws for server-owned normalizer failure %s",
    async (code) => {
      mockNormalizeWithdraw.mockReturnValueOnce(withdrawFailure(code));
      await expect(withdrawCustomerRefundIntakeAction(VALID_WITHDRAW)).rejects.toThrow(
        "Customer refund intake action invariant failed.",
      );
    },
  );

  it("maps invalid browser order through the committed normalizer", async () => {
    await expect(withdrawCustomerRefundIntakeAction({ orderId: "   " })).resolves.toEqual({
      success: false,
      errorCode: "INVALID_INPUT",
    });
  });
});

describe("customer action exception and side-effect boundary", () => {
  it("propagates core exceptions without logging or revalidation", async () => {
    const error = new Error("database unavailable");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockSubmit.mockRejectedValue(error);

    await expect(submitCustomerRefundIntakeAction(VALID_SUBMIT)).rejects.toBe(error);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "revalidates the exact admin dependencies after submit replay=%s",
    async (replayed) => {
      mockSubmit.mockResolvedValue(submitSuccess({ replayed }));
      await submitCustomerRefundIntakeAction(VALID_SUBMIT);

      expect(mockRevalidatePath.mock.calls).toEqual([
        ["/admin/orders/stored_order_123"],
        ["/admin/refunds/intakes"],
        ["/orders/stored_order_123"],
      ]);
    },
  );

  it.each([false, true])(
    "revalidates the exact admin dependencies after withdraw replay=%s",
    async (replayed) => {
      mockWithdraw.mockResolvedValue(withdrawSuccess({ replayed }));
      await withdrawCustomerRefundIntakeAction(VALID_WITHDRAW);

      expect(mockRevalidatePath.mock.calls).toEqual([
        ["/admin/orders/stored_order_123"],
        ["/admin/refunds/intakes"],
        ["/orders/stored_order_123"],
      ]);
    },
  );
});

function customerSession(id = CUSTOMER_ID) {
  return {
    user: { id, role: "CUSTOMER", name: "Customer", email: "customer@example.test" },
    expires: "2099-01-01",
  };
}

function submitSuccess(overrides: {
  replayed?: boolean;
  reasonCode?: CustomerRefundIntakeReasonCode;
  reasonDetail?: string | null;
} = {}): SubmitCustomerRefundIntakeResult {
  return {
    ok: true,
    replayed: overrides.replayed ?? false,
    intake: {
      orderId: "stored_order_123",
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: overrides.reasonCode ?? VALID_SUBMIT.reasonCode,
      reasonDetail: overrides.reasonDetail === undefined ? VALID_SUBMIT.reasonDetail : overrides.reasonDetail,
      submittedAt: new Date("2026-07-14T03:00:00.000Z"),
    },
  };
}

function withdrawSuccess(overrides: { replayed?: boolean } = {}): WithdrawCustomerRefundIntakeResult {
  return {
    ok: true,
    replayed: overrides.replayed ?? false,
    intake: {
      orderId: "stored_order_123",
      status: CustomerRefundIntakeStatus.WITHDRAWN,
      withdrawnAt: new Date("2026-07-14T04:00:00.000Z"),
    },
  };
}

function submitFailure(
  code: SubmitCustomerRefundIntakeFailureCode,
): Extract<SubmitCustomerRefundIntakeResult, { ok: false }> {
  return { ok: false, code, message: "sensitive core message" };
}

function withdrawFailure(
  code: WithdrawCustomerRefundIntakeFailureCode,
): Extract<WithdrawCustomerRefundIntakeResult, { ok: false }> {
  return { ok: false, code, message: "sensitive core message" };
}
