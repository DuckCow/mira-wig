import {
  CustomerRefundIntakeReasonCode,
  CustomerRefundIntakeStatus,
  OrderStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type {
  SubmitCustomerRefundIntakeActionResult,
  WithdrawCustomerRefundIntakeActionResult,
} from "@/app/actions/customer-refund-intake";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";

vi.mock("@/app/actions/customer-refund-intake", () => ({
  submitCustomerRefundIntakeAction: vi.fn(),
  withdrawCustomerRefundIntakeAction: vi.fn(),
}));

import {
  buildSubmitCustomerRefundIntakePayload,
  buildWithdrawCustomerRefundIntakePayload,
  customerRefundIntakeAvailabilityCopy,
  customerRefundIntakeControlMode,
  customerRefundIntakeControlProps,
  customerRefundIntakeLifecycleCopy,
  customerRefundIntakeReasonLabel,
  customerRefundIntakeStatusLabel,
  presentSubmitCustomerRefundIntakeResult,
  presentWithdrawCustomerRefundIntakeResult,
  unexpectedCustomerRefundIntakeFailurePresentation,
} from "./customer-intake-presentation";

describe("customer refund intake lifecycle presentation", () => {
  it.each(["en", "ja"] as const)("does not fall back to Korean for %s customer copy", (locale) => {
    const visible = [
      customerRefundIntakeReasonLabel(CustomerRefundIntakeReasonCode.PRODUCT_DEFECT, locale),
      customerRefundIntakeStatusLabel(CustomerRefundIntakeStatus.SUBMITTED, locale),
      ...customerRefundIntakeLifecycleCopy(CustomerRefundIntakeStatus.SUBMITTED, locale),
      ...(customerRefundIntakeAvailabilityCopy("FEATURE_DISABLED", locale) ?? []),
      presentSubmitCustomerRefundIntakeResult({ success: false, errorCode: "INVALID_INPUT" }, locale).message,
      presentWithdrawCustomerRefundIntakeResult({ success: false, errorCode: "INVALID_INPUT" }, locale).message,
      unexpectedCustomerRefundIntakeFailurePresentation(locale).message,
    ].join("\n");
    expect(visible).not.toMatch(/[가-힣]/u);
  });

  it("owns the exact customer reason labels", () => {
    expect(customerRefundIntakeReasonLabel(CustomerRefundIntakeReasonCode.CHANGE_OF_MIND)).toBe("단순 변심");
    expect(customerRefundIntakeReasonLabel(CustomerRefundIntakeReasonCode.PRODUCT_DEFECT)).toBe("상품 하자");
    expect(customerRefundIntakeReasonLabel(CustomerRefundIntakeReasonCode.DELIVERY_ISSUE)).toBe("배송 문제·지연");
    expect(customerRefundIntakeReasonLabel(CustomerRefundIntakeReasonCode.OTHER)).toBe("기타");
  });

  it("owns the four broad lifecycle labels and locked copy", () => {
    expect(customerRefundIntakeStatusLabel(CustomerRefundIntakeStatus.SUBMITTED)).toBe("접수됨");
    expect(customerRefundIntakeStatusLabel(CustomerRefundIntakeStatus.WITHDRAWN)).toBe("철회됨");
    expect(customerRefundIntakeStatusLabel(CustomerRefundIntakeStatus.REJECTED)).toBe("온라인 진행 불가");
    expect(customerRefundIntakeStatusLabel(CustomerRefundIntakeStatus.APPROVED)).toBe("승인됨");

    expect(customerRefundIntakeLifecycleCopy(CustomerRefundIntakeStatus.SUBMITTED)).toEqual([
      "환불 검토 요청이 접수되었습니다.",
      "환불 가능 여부 확인 후 안내드립니다.",
    ]);
    expect(customerRefundIntakeLifecycleCopy(CustomerRefundIntakeStatus.WITHDRAWN)).toEqual([
      "환불 검토 요청이 철회되었습니다.",
    ]);
    expect(customerRefundIntakeLifecycleCopy(CustomerRefundIntakeStatus.REJECTED)).toEqual([
      "온라인 환불 요청을 진행할 수 없습니다.",
      "자세한 내용은 고객센터로 문의해주세요.",
    ]);
  });

  it("keeps APPROVED copy as an Order-status reference without success or payment language", () => {
    const copy = customerRefundIntakeLifecycleCopy(CustomerRefundIntakeStatus.APPROVED).join(" ");

    expect(copy).toBe("환불 검토 요청이 승인되었습니다. 진행 상황은 위 주문 상태에서 확인할 수 있습니다.");
    expect(copy).not.toMatch(/완료|성공|지급|결제/);
  });

  it("maps unavailable states without duplicating OPEN_INTAKE or disclosing foreign provenance", () => {
    expect(customerRefundIntakeAvailabilityCopy("FEATURE_DISABLED")).toEqual([
      "온라인 환불 검토 요청은 현재 제공되지 않습니다.",
      "고객센터로 문의해주세요.",
    ]);
    expect(customerRefundIntakeAvailabilityCopy("ORDER_STATE_UNAVAILABLE")).toEqual([
      "현재 주문 상태에서는 환불 검토 요청을 접수할 수 없습니다.",
      "자세한 내용은 고객센터로 문의해주세요.",
    ]);
    expect(customerRefundIntakeAvailabilityCopy("OPEN_INTAKE")).toBeNull();
    const unavailable = customerRefundIntakeAvailabilityCopy("UNAVAILABLE")?.join(" ") ?? "";
    expect(unavailable).toBe("현재 이 주문에서는 온라인 환불 검토 요청을 이용할 수 없습니다. 고객센터로 문의해주세요.");
    expect(unavailable).not.toMatch(/다른|타인|소유|이전|충돌|복구|foreign|owner|conflict|repair/i);
  });

  it("derives submit and withdrawal controls from the committed advisory flags", () => {
    expect(customerRefundIntakeControlMode(readModel())).toBe("submit");
    expect(customerRefundIntakeControlMode(readModel({
      latestIntake: latest(CustomerRefundIntakeStatus.SUBMITTED),
      canSubmit: false,
      canWithdraw: true,
      submissionUnavailableReason: "FEATURE_DISABLED",
    }))).toBe("withdraw");
    expect(customerRefundIntakeControlMode(readModel({
      canSubmit: false,
      submissionUnavailableReason: "UNAVAILABLE",
    }))).toBeNull();
  });

  it("passes only Order id and derived mode into the client island", () => {
    const submit = customerRefundIntakeControlProps(readModel());
    const withdraw = customerRefundIntakeControlProps(readModel({
      latestIntake: latest(CustomerRefundIntakeStatus.SUBMITTED),
      canSubmit: false,
      canWithdraw: true,
      submissionUnavailableReason: "OPEN_INTAKE",
    }));

    expect(submit).toEqual({ orderId: "order_1", mode: "submit" });
    expect(withdraw).toEqual({ orderId: "order_1", mode: "withdraw" });
    expect(Object.keys(submit ?? {}).sort()).toEqual(["mode", "orderId"]);
    expect(JSON.stringify(submit)).not.toMatch(
      /customerUserId|reviewedAt|reviewedByUserId|adminRejectionReason|approvedRefundAttemptId|payment|provider|idempotency|operation/i,
    );
  });
});

describe("customer refund intake control presentation", () => {
  it("builds exact action payloads with no identity or financial fields", () => {
    const submit = buildSubmitCustomerRefundIntakePayload(
      "order_1",
      CustomerRefundIntakeReasonCode.DELIVERY_ISSUE,
      "detail",
    );
    const withdraw = buildWithdrawCustomerRefundIntakePayload("order_1");

    expect(submit).toEqual({
      orderId: "order_1",
      reasonCode: CustomerRefundIntakeReasonCode.DELIVERY_ISSUE,
      reasonDetail: "detail",
    });
    expect(withdraw).toEqual({ orderId: "order_1" });
    expect(Object.keys(submit).sort()).toEqual(["orderId", "reasonCode", "reasonDetail"]);
    expect(Object.keys(withdraw)).toEqual(["orderId"]);
  });

  it.each([
    ["CREATED", "환불 검토 요청이 접수되었습니다.", "success"],
    ["REPLAYED_SAME_PAYLOAD", "동일한 환불 검토 요청이 이미 접수되어 있습니다.", "success"],
    ["REPLAYED_DIFFERENT_PAYLOAD", "이미 접수된 요청이 유지됩니다. 새로 입력한 내용은 저장되지 않았습니다.", "warning"],
  ] as const)("clears fields without refreshing after %s", (outcome, message, variant) => {
    expect(presentSubmitCustomerRefundIntakeResult(submitSuccess(outcome))).toEqual({
      message,
      variant,
      field: null,
      clearInputs: true,
      refresh: false,
    });
  });

  it.each([
    ["UNAUTHENTICATED", null, false],
    ["FEATURE_DISABLED", null, true],
    ["INVALID_INPUT", null, false],
    ["REASON_DETAIL_INVALID", "reasonDetail", false],
    ["REASON_DETAIL_TOO_LONG", "reasonDetail", false],
    ["NOT_FOUND", null, true],
    ["NOT_AVAILABLE", null, true],
    ["CONFLICT", null, true],
  ] as const)("maps submit failure %s to field %s and refresh=%s", (errorCode, field, refresh) => {
    expect(presentSubmitCustomerRefundIntakeResult({ success: false, errorCode })).toMatchObject({
      field,
      clearInputs: false,
      refresh,
    });
  });

  it.each([
    ["WITHDRAWN", "환불 검토 요청이 철회되었습니다."],
    ["ALREADY_WITHDRAWN", "이미 철회된 요청입니다."],
  ] as const)("presents %s without a client refresh", (outcome, message) => {
    expect(presentWithdrawCustomerRefundIntakeResult(withdrawSuccess(outcome))).toEqual({
      message,
      variant: "success",
      field: null,
      clearInputs: true,
      refresh: false,
    });
  });

  it.each([
    ["UNAUTHENTICATED", false],
    ["INVALID_INPUT", false],
    ["NOT_FOUND", true],
    ["NOT_WITHDRAWABLE", true],
  ] as const)("maps withdraw failure %s to refresh=%s", (errorCode, refresh) => {
    expect(presentWithdrawCustomerRefundIntakeResult({ success: false, errorCode })).toMatchObject({
      field: null,
      clearInputs: false,
      refresh,
    });
  });

  it("refreshes once after an uncertain rejected action without clearing input", () => {
    expect(unexpectedCustomerRefundIntakeFailurePresentation()).toEqual({
      message: "처리 결과를 확인하지 못했습니다. 잠시 후 새로고침된 상태를 확인해 주세요.",
      variant: "error",
      field: null,
      clearInputs: false,
      refresh: true,
    });
  });
});

function readModel(
  overrides: Partial<CustomerRefundIntakeReadModel> = {},
): CustomerRefundIntakeReadModel {
  return {
    orderId: "order_1",
    orderStatus: OrderStatus.PAID,
    latestIntake: null,
    canSubmit: true,
    canWithdraw: false,
    submissionUnavailableReason: null,
    ...overrides,
  };
}

function latest(status: CustomerRefundIntakeStatus): NonNullable<CustomerRefundIntakeReadModel["latestIntake"]> {
  return {
    status,
    reasonCode: CustomerRefundIntakeReasonCode.PRODUCT_DEFECT,
    reasonDetail: "customer-safe detail",
    submittedAt: new Date("2026-07-15T00:00:00.000Z"),
    withdrawnAt: status === CustomerRefundIntakeStatus.WITHDRAWN
      ? new Date("2026-07-15T01:00:00.000Z")
      : null,
  };
}

function submitSuccess(
  outcome: Extract<SubmitCustomerRefundIntakeActionResult, { success: true }>["outcome"],
): Extract<SubmitCustomerRefundIntakeActionResult, { success: true }> {
  return {
    success: true,
    outcome,
    intake: {
      orderId: "order_1",
      status: CustomerRefundIntakeStatus.SUBMITTED,
      reasonCode: CustomerRefundIntakeReasonCode.OTHER,
      reasonDetail: "stored detail",
      submittedAt: "2026-07-15T00:00:00.000Z",
    },
  };
}

function withdrawSuccess(
  outcome: Extract<WithdrawCustomerRefundIntakeActionResult, { success: true }>["outcome"],
): Extract<WithdrawCustomerRefundIntakeActionResult, { success: true }> {
  return {
    success: true,
    outcome,
    intake: {
      orderId: "order_1",
      status: CustomerRefundIntakeStatus.WITHDRAWN,
      withdrawnAt: "2026-07-15T01:00:00.000Z",
    },
  };
}
