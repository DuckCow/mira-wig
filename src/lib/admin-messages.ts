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
  INVALID_COVER_IMAGE: "커버 이미지를 확인할 수 없습니다. 이미지를 다시 업로드해 주세요.",
  INVALID_TRANSITION: "현재 상태에서는 이 전이를 할 수 없습니다.",
  MARKET_NOT_FOUND: "유효하지 않은 마켓 코드입니다.",
  INVALID_ACTOR: "인증된 관리자 정보를 확인할 수 없습니다.",
  RELATION_NOT_FOUND: "수동 스타일 관계를 찾을 수 없습니다.",
  RELATION_DUPLICATE: "이 마켓에는 같은 방향의 스타일 관계가 이미 있습니다.",
  SELF_RELATION: "같은 스타일끼리는 관계를 만들 수 없습니다.",
  INVALID_RELATION_PURPOSE: "유효하지 않은 관계 목적입니다.",
  INVALID_PRIORITY: "우선순위는 0부터 10000 사이의 정수여야 합니다.",
  INVALID_ACTIVE_STATE: "활성 상태 값이 올바르지 않습니다.",
  RATIONALE_REQUIRED: "활성화하려면 내부 근거를 입력해 주세요.",
  RATIONALE_TOO_LONG: "내부 근거는 유니코드 500자 이내로 입력해 주세요.",
  RATIONALE_INVALID: "내부 근거에 허용되지 않는 문자가 있습니다.",
  SOURCE_STYLE_NOT_FOUND: "출발 스타일을 찾을 수 없습니다.",
  TARGET_STYLE_NOT_FOUND: "대상 스타일을 찾을 수 없습니다.",
  SOURCE_NOT_PUBLISHED: "출발 스타일이 해당 마켓에 활성 공개되어 있지 않습니다.",
  TARGET_NOT_PUBLISHED: "대상 스타일이 해당 마켓에 활성 공개되어 있지 않습니다.",
  TARGET_NO_ACTIVE_PRICED_VARIANT:
    "대상 스타일에 해당 마켓 가격이 있는 활성 바리언트가 없습니다.",
  REASON_REQUIRED: "환불 사유를 입력해주세요.",
  REASON_TOO_LONG: "환불 사유는 500자 이내로 입력해 주세요.",
  INVALID_AMOUNT: "금액은 1 이상의 정수여야 합니다.",
  INSUFFICIENT_REFUNDABLE: "환불 가능 금액을 초과했습니다.",
  REFUND_IN_PROGRESS: "처리 중인 환불이 있습니다. 운영 확인 후 다시 시도해주세요.",
  NOT_FOUND: "대상을 찾을 수 없습니다.",
  ALREADY: "이미 처리된 요청입니다.",
  PROVIDER_FAILED: "결제사 환불 처리에 실패했습니다. 운영 로그를 확인해주세요.",
  CONFLICT: "상태가 이미 바뀌었습니다. 새로고침 후 다시 확인하세요.",
  UNSUPPORTED_TYPE: "지원하지 않는 파일 형식입니다. (JPEG/PNG/WEBP만 허용)",
};

const REFUND_CLOSE_ERROR_MESSAGES: Record<string, string> = {
  PROVIDER_CONTACT_ALREADY_STARTED:
    "결제 제공자 처리가 이미 시작되었을 수 있어 철회할 수 없습니다. 최신 상태를 확인해 주세요.",
  INVALID_TRANSITION:
    "현재 상태에서는 철회할 수 없습니다. 이미 철회되었거나 상태가 변경되었을 수 있습니다. 최신 상태를 확인해 주세요.",
  CONFLICT: "다른 작업과 겹쳐 처리하지 못했습니다. 최신 상태를 확인해 주세요.",
  MANUAL_REVIEW_REQUIRED: "환불 장부 상태에 확인이 필요합니다. 운영 검토 후 진행해 주세요.",
};

const REFUND_CLAIM_ERROR_MESSAGES: Record<string, string> = {
  FEATURE_DISABLED: "환불 실행 승인이 현재 비활성화되어 있습니다. 최신 상태를 확인해 주세요.",
  CAPABILITY_UNSUPPORTED: "수동 실행 승인은 MOCK / SANDBOX 결제에만 제공됩니다. 최신 상태를 확인해 주세요.",
  NOT_CLAIMABLE: "현재 상태에서는 환불 실행을 승인할 수 없습니다. 최신 상태를 확인해 주세요.",
  CONFLICT: "다른 작업과 겹쳐 실행 승인을 기록하지 못했습니다. 최신 상태를 확인해 주세요.",
  MANUAL_REVIEW_REQUIRED: "환불 실행 승인 기록의 정합성을 수동으로 확인해야 합니다.",
  NOT_FOUND: "환불 요청을 찾을 수 없습니다. 최신 상태를 확인해 주세요.",
  INVALID_INPUT: "실행 승인 요청이 올바르지 않습니다. 최신 상태를 확인해 주세요.",
};

const CUSTOMER_REFUND_INTAKE_ERROR_MESSAGES: Record<string, string> = {
  REJECTION_REASON_REQUIRED: "거절 사유를 입력해 주세요.",
  REJECTION_REASON_TOO_LONG: "거절 사유는 500자 이내로 입력해 주세요.",
  ORDER_NOT_FOUND: "주문을 찾을 수 없습니다. 최신 상태를 확인해 주세요.",
  INTAKE_NOT_FOUND: "환불 검토 요청을 찾을 수 없습니다. 최신 상태를 확인해 주세요.",
  NOT_REJECTABLE: "이미 철회되었거나 검토가 끝난 요청입니다. 최신 상태를 확인해 주세요.",
  FEATURE_DISABLED: "환불 승인 기능이 현재 비활성화되어 있습니다.",
  INTAKE_INCONSISTENT: "요청과 주문의 소유 관계를 확인해야 합니다. 최신 상태를 확인해 주세요.",
  NOT_APPROVABLE: "이미 철회되었거나 검토가 끝난 요청입니다. 최신 상태를 확인해 주세요.",
  INSUFFICIENT_REFUNDABLE: "현재 요청 가능한 환불 금액을 초과했습니다. 최신 금액을 확인해 주세요.",
  REFUND_IN_PROGRESS: "처리 중인 환불 요청이 있습니다. 최신 상태를 확인해 주세요.",
  INVALID_TRANSITION: "현재 주문 또는 결제 상태에서는 승인할 수 없습니다. 최신 상태를 확인해 주세요.",
  MANUAL_REVIEW_REQUIRED: "주문·결제·환불 장부의 정합성을 수동으로 확인해야 합니다.",
};

export function getAdminErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] ?? `오류가 발생했습니다. (${errorCode})`;
}

export function getAdminRefundCloseErrorMessage(errorCode: string): string {
  return REFUND_CLOSE_ERROR_MESSAGES[errorCode] ?? getAdminErrorMessage(errorCode);
}

export function getAdminRefundClaimErrorMessage(errorCode: string): string {
  return REFUND_CLAIM_ERROR_MESSAGES[errorCode] ?? getAdminErrorMessage(errorCode);
}

export function getAdminCustomerRefundIntakeErrorMessage(errorCode: string): string {
  return CUSTOMER_REFUND_INTAKE_ERROR_MESSAGES[errorCode] ?? getAdminErrorMessage(errorCode);
}
