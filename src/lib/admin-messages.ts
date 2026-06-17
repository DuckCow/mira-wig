// ============================================================
// lib/admin-messages.ts — 어드민 errorCode → 한국어 문구 중앙 맵
// 각 화면에서 인라인 하드코딩하지 말고 이 맵에서 조회한다.
// ============================================================

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "어드민 권한이 필요합니다.",
  STYLE_NOT_FOUND: "스타일을 찾을 수 없습니다.",
  VARIANT_NOT_FOUND: "바리언트를 찾을 수 없습니다.",
  SKU_DUPLICATE: "이미 존재하는 SKU입니다.",
  INVALID_CATEGORY: "유효하지 않은 카테고리입니다.",
  INVALID_INPUT: "입력값이 올바르지 않습니다.",
  MARKET_NOT_FOUND: "유효하지 않은 마켓 코드입니다.",
  INVALID_AMOUNT: "금액은 0 이상의 정수여야 합니다.",
};

export function getAdminErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] ?? `오류가 발생했습니다. (${errorCode})`;
}
