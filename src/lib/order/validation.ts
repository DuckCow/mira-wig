// ============================================================
// lib/order/validation.ts — 주소 폼 검증 순수 함수
// server-only 없음 — 클라이언트·테스트 모두 import 가능
// ============================================================

import { COUNTRY_FORM_CONFIGS, type CountryFormConfig } from "./address-config";

export interface CheckoutAddress<TCountry extends string = string> {
  recipientName: string;
  phone: string;
  country: TCountry;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  memo?: string;
}

interface NormalizedShippingAddress {
  recipientName: string;
  phone: string;
  country: string;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
}

type NormalizedCommonAddress = Omit<NormalizedShippingAddress, "country" | "administrativeArea">;

export type ShippingAddressNormalizationResult =
  | { kind: "valid"; address: NormalizedShippingAddress }
  | { kind: "invalidCountry" }
  | { kind: "invalidAddress" };

export type AddressFieldKey = keyof CheckoutAddress;

// 제출 시 검증할 필수 필드 목록 (국가무관 공통)
export const REQUIRED_FIELDS: AddressFieldKey[] = [
  "recipientName", "phone", "postalCode", "administrativeArea",
  "city", "addressLine1",
];

export function normalizeShippingAddress(input: unknown): ShippingAddressNormalizationResult {
  if (!isRecord(input)) return { kind: "invalidAddress" };
  const country = input.country;
  if (typeof country !== "string") return { kind: "invalidCountry" };
  if (!Object.prototype.hasOwnProperty.call(COUNTRY_FORM_CONFIGS, country)) {
    return { kind: "invalidCountry" };
  }
  const config = COUNTRY_FORM_CONFIGS[country];
  const common = readCommonAddress(input);
  if (!common) return { kind: "invalidAddress" };
  if (!Object.prototype.hasOwnProperty.call(input, "administrativeArea")) {
    return { kind: "invalidAddress" };
  }
  const rawAdministrativeArea = input.administrativeArea;
  if (typeof rawAdministrativeArea !== "string") return { kind: "invalidAddress" };
  const administrativeArea = rawAdministrativeArea.trim().length === 0 ? "" : rawAdministrativeArea;
  if (config.administrativeAreaRequired && administrativeArea.length === 0) {
    return { kind: "invalidAddress" };
  }
  return {
    kind: "valid",
    address: { ...common, country, administrativeArea },
  };
}

function readCommonAddress(input: Record<string, unknown>): NormalizedCommonAddress | null {
  const { recipientName, phone, postalCode, city, addressLine1 } = input;
  if (
    !isNonblankString(recipientName)
    || !isNonblankString(phone)
    || !isNonblankString(postalCode)
    || !isNonblankString(city)
    || !isNonblankString(addressLine1)
  ) {
    return null;
  }
  return { recipientName, phone, postalCode, city, addressLine1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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
// 제출 시점 DOM 실제 값을 기준으로 CheckoutShippingInput을 구성한다.
// 브라우저 자동완성이 onChange를 건너뛰어 state가 비어 있어도 정확히 수집된다.
// country는 마켓 설정에서 결정되므로 state 값을 그대로 사용한다(외부 주입).

export function collectFromFormData<TCountry extends string>(
  formData: FormData,
  country: TCountry,
): CheckoutAddress<TCountry> {
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
  address: CheckoutAddress,
  config: CountryFormConfig,
): boolean {
  return REQUIRED_FIELDS.some(
    (f) => getFieldError(f, address[f] ?? "", config) !== null,
  );
}
