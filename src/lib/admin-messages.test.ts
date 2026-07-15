import { describe, expect, it } from "vitest";
import { getAdminCustomerRefundIntakeErrorMessage } from "./admin-messages";

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
