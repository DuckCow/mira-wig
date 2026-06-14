// ============================================================
// lib/order/validation.ts — 주소 폼 검증 순수 함수
// server-only 없음 — 클라이언트·테스트 모두 import 가능
// ============================================================

import type { CountryFormConfig } from "./address-config";
import type { CheckoutAddressInput } from "./types";

export type AddressFieldKey = keyof CheckoutAddressInput;

// 제출 시 검증할 필수 필드 목록 (국가무관 공통)
export const REQUIRED_FIELDS: AddressFieldKey[] = [
  "recipientName", "phone", "postalCode", "administrativeArea",
  "city", "addressLine1",
];

// ── 필드별 단순 헬퍼 ──────────────────────────────────────────

export function checkSimpleRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label}을(를) 입력해주세요.`;
}

export function checkPatternField(
  value: string,
  emptyMsg: string,
  pattern: RegExp,
  formatMsg: string,
): string | null {
  if (!value.trim()) return emptyMsg;
  return pattern.test(value) ? null : formatMsg;
}

// ── 필드별 에러 계산 ──────────────────────────────────────────
// empty와 wrong-format을 명확히 구분한다.

export function getFieldError(
  field: AddressFieldKey,
  value: string,
  config: CountryFormConfig,
): string | null {
  if (field === "recipientName") return checkSimpleRequired(value, "이름");
  if (field === "phone") {
    return checkPatternField(
      value, "전화번호를 입력해주세요.",
      config.phonePattern, `형식이 올바르지 않습니다. 예: ${config.phonePlaceholder}`,
    );
  }
  if (field === "postalCode") {
    return checkPatternField(
      value, `${config.postalCodeLabel}을 입력해주세요.`,
      config.postalCodePattern, `형식이 올바르지 않습니다. 예: ${config.postalCodePlaceholder}`,
    );
  }
  if (field === "administrativeArea") {
    return config.administrativeAreaRequired
      ? checkSimpleRequired(value, config.administrativeAreaLabel)
      : null;
  }
  if (field === "city") return checkSimpleRequired(value, config.cityLabel);
  if (field === "addressLine1") return checkSimpleRequired(value, "주소");
  return null;
}

// ── FormData 수집 ─────────────────────────────────────────────
// 제출 시점 DOM 실제 값을 기준으로 CheckoutAddressInput을 구성한다.
// 브라우저 자동완성이 onChange를 건너뛰어 state가 비어 있어도 정확히 수집된다.
// country는 마켓 설정에서 결정되므로 state 값을 그대로 사용한다(외부 주입).

export function collectFromFormData(
  formData: FormData,
  country: string,
): CheckoutAddressInput {
  function str(key: string): string {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  }
  return {
    recipientName: str("recipientName"),
    phone: str("phone"),
    country,
    postalCode: str("postalCode"),
    administrativeArea: str("administrativeArea"),
    city: str("city"),
    addressLine1: str("addressLine1"),
    addressLine2: str("addressLine2"),
    memo: str("memo"),
  };
}

// ── 제출 전 전체 에러 유무 확인 ───────────────────────────────

export function hasSubmitError(
  address: CheckoutAddressInput,
  config: CountryFormConfig,
): boolean {
  return REQUIRED_FIELDS.some(
    (f) => getFieldError(f, address[f], config) !== null,
  );
}
