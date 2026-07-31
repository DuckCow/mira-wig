import { describe, expect, it } from "vitest";
import {
  getAdminCustomerRefundIntakeErrorMessage,
  getAdminErrorMessage,
} from "./admin-messages";

describe("administrator customer refund intake messages", () => {
  it.each([
    ["REJECTION_REASON_REQUIRED", "거절 사유를 입력해 주세요."],
    ["ORDER_NOT_FOUND", "주문을 찾을 수 없습니다. 최신 상태를 확인해 주세요."],
    ["FEATURE_DISABLED", "환불 승인 기능이 현재 비활성화되어 있습니다."],
    ["INTAKE_INCONSISTENT", "요청과 주문의 소유 관계를 확인해야 합니다. 최신 상태를 확인해 주세요."],
    ["MANUAL_REVIEW_REQUIRED", "주문·결제·환불 장부의 정합성을 수동으로 확인해야 합니다."],
  ] as const)("maps %s to safe administrator copy", (code, expected) => {
    expect(getAdminCustomerRefundIntakeErrorMessage(code)).toBe(expected);
  });

  it("uses the existing safe administrator fallback without raw diagnostics", () => {
    expect(getAdminCustomerRefundIntakeErrorMessage("UNAUTHENTICATED")).toBe("로그인이 필요합니다.");
  });
});

describe("manual item relation administrator messages", () => {
  it("maps invalid active state to exact Korean administrator copy", () => {
    expect(getAdminErrorMessage("INVALID_ACTIVE_STATE")).toBe(
      "활성 상태 값이 올바르지 않습니다.",
    );
  });

  it.each([
    "RELATION_DUPLICATE",
    "SELF_RELATION",
    "INVALID_RELATION_PURPOSE",
    "INVALID_PRIORITY",
    "RATIONALE_REQUIRED",
    "RATIONALE_TOO_LONG",
    "RATIONALE_INVALID",
    "SOURCE_STYLE_NOT_FOUND",
    "TARGET_STYLE_NOT_FOUND",
    "SOURCE_NOT_PUBLISHED",
    "TARGET_NOT_PUBLISHED",
    "TARGET_NO_ACTIVE_PRICED_VARIANT",
  ])("provides central Korean copy for %s", (code) => {
    expect(getAdminErrorMessage(code)).not.toContain(`(${code})`);
  });
});
