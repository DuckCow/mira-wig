// ============================================================
// lib/market/types.ts — 마켓 타입·상수·순수 함수
// DB 코드 없음 — 클라이언트 컴포넌트도 안전하게 import 가능
// ============================================================

// ── 마켓 코드 ─────────────────────────────────────────────────

export const MarketCode = {
  KR: "KR",
  US: "US",
  JP: "JP",
} as const;

export type MarketCode = (typeof MarketCode)[keyof typeof MarketCode];

export const MARKET_CODES: readonly MarketCode[] = ["KR", "US", "JP"];
export const DEFAULT_MARKET_CODE: MarketCode = "KR";
export const MARKET_COOKIE = "mira-market";

// ── 통화 메타데이터 ───────────────────────────────────────────
//
// decimals: 최소단위에서 표시 단위로 변환하는 소수점 자릿수
//   KRW = 0 (zero-decimal): 30000 → ₩30,000  (÷1)
//   USD = 2 (2-decimal):    2999  → $29.99    (÷100)
//   JPY = 0 (zero-decimal): 1500  → ¥1,500   (÷1)

export interface CurrencyMeta {
  /** ISO 4217 통화 코드 */
  code: string;
  /** 표시 기호 */
  symbol: string;
  /** 소수 자릿수 (0=zero-decimal, 2=센트 기반) */
  decimals: number;
  /** Intl.NumberFormat 로케일 */
  locale: string;
}

export const CURRENCY_META: Record<string, CurrencyMeta> = {
  KRW: { code: "KRW", symbol: "₩", decimals: 0, locale: "ko-KR" },
  USD: { code: "USD", symbol: "$", decimals: 2, locale: "en-US" },
  JPY: { code: "JPY", symbol: "¥", decimals: 0, locale: "ja-JP" },
};

// ── 마켓 설정 ─────────────────────────────────────────────────

export interface MarketConfig {
  code: MarketCode;
  /** UI 선택자에 표시할 레이블 */
  label: string;
  currency: CurrencyMeta;
  shippableCountries: string[];
  defaultLocale: string;
}

export const MARKET_CONFIGS: Record<MarketCode, MarketConfig> = {
  KR: {
    code: "KR",
    label: "한국 (₩)",
    currency: CURRENCY_META.KRW,
    shippableCountries: ["KR"],
    defaultLocale: "ko",
  },
  US: {
    code: "US",
    label: "United States ($)",
    currency: CURRENCY_META.USD,
    shippableCountries: ["US"],
    defaultLocale: "en",
  },
  JP: {
    code: "JP",
    label: "日本 (¥)",
    currency: CURRENCY_META.JPY,
    shippableCountries: ["JP"],
    defaultLocale: "ja",
  },
};

// ── 타입가드 ──────────────────────────────────────────────────

export function isMarketCode(value: string): value is MarketCode {
  return MARKET_CODES.some((c) => c === value);
}

// ── 금액 포맷팅 ───────────────────────────────────────────────
//
// amount: 최소단위 정수 (float 아님)
// currency.decimals 기준으로 표시 단위로 나눈 뒤 Intl 포맷 적용
// 절대 규칙: zero-decimal 통화에 소수점이 붙지 않아야 한다

export function formatPrice(amount: number, currency: CurrencyMeta): string {
  const divisor = Math.pow(10, currency.decimals);
  const value = amount / divisor;
  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value);
}

// ── 마켓 결정 순수 함수 (테스트 가능, 서버 의존성 없음) ─────────
//
// 우선순위: (1) 명시 쿠키 > (2) geo 국가코드 > (3) 폴백 기본 마켓

const GEO_TO_MARKET: Partial<Record<string, MarketCode>> = {
  KR: "KR",
  US: "US",
  JP: "JP",
};

export function resolveMarketCode(
  cookieValue: string | undefined,
  geoCountry: string | undefined,
): MarketCode {
  if (cookieValue !== undefined && isMarketCode(cookieValue)) return cookieValue;
  if (geoCountry !== undefined) {
    const mapped = GEO_TO_MARKET[geoCountry.toUpperCase()];
    if (mapped) return mapped;
  }
  return DEFAULT_MARKET_CODE;
}
