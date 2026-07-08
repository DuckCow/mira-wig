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
  INVALID_TRANSITION: "현재 상태에서는 이 전이를 할 수 없습니다.",
  MARKET_NOT_FOUND: "유효하지 않은 마켓 코드입니다.",
  REASON_REQUIRED: "환불 사유를 입력해주세요.",
  INVALID_AMOUNT: "금액은 1 이상의 정수여야 합니다.",
  INSUFFICIENT_REFUNDABLE: "환불 가능 금액을 초과했습니다.",
  REFUND_IN_PROGRESS: "처리 중인 환불이 있습니다. 운영 확인 후 다시 시도해주세요.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  ALREADY: "이미 처리된 요청입니다.",
  PROVIDER_FAILED: "결제사 환불 처리에 실패했습니다. 운영 로그를 확인해주세요.",
  CONFLICT: "상태가 이미 바뀌었습니다. 새로고침 후 다시 확인하세요.",
  UNSUPPORTED_TYPE: "지원하지 않는 파일 형식입니다. (JPEG/PNG/WEBP만 허용)",
};

export function getAdminErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] ?? `오류가 발생했습니다. (${errorCode})`;
}
