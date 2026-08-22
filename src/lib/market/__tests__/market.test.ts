// STRICT 존 행동 검증 테스트
// formatPrice: zero-decimal vs 2-decimal, zero에 소수점 없음
// resolveMarketCode: 쿠키 > geo > 폴백 우선순위
import { describe, expect, it } from "vitest";
import {
  CURRENCY_META,
  DEFAULT_MARKET_CODE,
  MARKET_CONFIGS,
  formatPrice,
  resolveMarketCode,
} from "../types";
import { formatPersistedMoney } from "../persisted-money";
import { Locale, preferredEnabledLocale } from "../locale";
import { resolveRootLocale, resolveRootMarket } from "../resolution";
import {
  ENABLED_SITE_VARIANTS,
  equivalentSiteVariantPath,
  resolveRouteSiteVariant,
  siteVariantPath,
} from "../site-variant";

// ── formatPrice ───────────────────────────────────────────────

describe("formatPrice — zero-decimal (KRW)", () => {
  it("₩ 기호와 천 단위 구분자를 포함한다", () => {
    const result = formatPrice(30000, CURRENCY_META.KRW);
    expect(result).toContain("30,000");
  });

  it("소수점이 절대 붙지 않는다", () => {
    const result = formatPrice(85000, CURRENCY_META.KRW);
    expect(result).not.toContain(".");
  });

  it("0원 표현 가능", () => {
    const result = formatPrice(0, CURRENCY_META.KRW);
    expect(result).toContain("0");
    expect(result).not.toContain(".");
  });
});

describe("formatPrice — 2-decimal (USD)", () => {
  it("센트를 달러로 올바르게 변환한다 (2999 → $29.99)", () => {
    const result = formatPrice(2999, CURRENCY_META.USD);
    expect(result).toContain("29.99");
  });

  it("정확히 2자리 소수를 표시한다 ($30.00)", () => {
    const result = formatPrice(3000, CURRENCY_META.USD);
    expect(result).toContain("30.00");
  });

  it("큰 금액도 올바르게 변환한다 (12999 → $129.99)", () => {
    const result = formatPrice(12999, CURRENCY_META.USD);
    expect(result).toContain("129.99");
  });
});

describe("formatPrice — locale is independent from currency", () => {
  it("keeps USD amount and currency while applying Korean formatting", () => {
    const english = formatPrice(123_456, CURRENCY_META.USD, Locale.EN);
    const korean = formatPrice(123_456, CURRENCY_META.USD, Locale.KO);

    expect(english).toContain("1,234.56");
    expect(korean).toContain("1,234.56");
    expect(english).toContain("$");
    expect(korean).toContain("US$");
  });
});

describe("formatPrice — zero-decimal (JPY)", () => {
  it("천 단위 구분자를 포함한다", () => {
    const result = formatPrice(1500, CURRENCY_META.JPY);
    expect(result).toContain("1,500");
  });

  it("소수점이 절대 붙지 않는다", () => {
    const result = formatPrice(9800, CURRENCY_META.JPY);
    expect(result).not.toContain(".");
  });
});

describe("formatPersistedMoney — persisted historical currency", () => {
  it("preserves the installed formatter for exact known currency codes", () => {
    expect(formatPersistedMoney(85_000, "KRW")).toBe(formatPrice(85_000, CURRENCY_META.KRW));
    expect(formatPersistedMoney(2_999, "USD")).toBe(formatPrice(2_999, CURRENCY_META.USD));
    expect(formatPersistedMoney(9_800, "JPY")).toBe(formatPrice(9_800, CURRENCY_META.JPY));
    expect(formatPersistedMoney(85_000, "KRW")).toContain("85,000");
    expect(formatPersistedMoney(2_999, "USD")).toContain("29.99");
    expect(formatPersistedMoney(9_800, "JPY")).toContain("9,800");
  });

  it("preserves unknown identity and raw integer without inventing a decimal scale", () => {
    const result = formatPersistedMoney(12_345, "XYZ");

    expect(result).toBe("XYZ · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가");
    expect(result).not.toMatch(/KRW|₩|123\.45/);
  });

  it.each(["toString", "constructor", "__proto__", "hasOwnProperty"])(
    "treats inherited object property name %s as an unknown persisted currency",
    (currencyCode) => {
      expect(formatPersistedMoney(12_345, currencyCode)).toBe(
        `${currencyCode} · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가`,
      );
    },
  );

  it("fails blank codes safely and does not normalize a spaced known code", () => {
    expect(formatPersistedMoney(12_345, " \t ")).toBe(
      "통화 코드 없음 · 저장된 최소 단위 12345 · 소수 자릿수 확인 불가",
    );
    expect(formatPersistedMoney(2_999, " USD ")).toBe(
      " USD  · 저장된 최소 단위 2999 · 소수 자릿수 확인 불가",
    );
  });
});

// ── resolveMarketCode — 우선순위 검증 ────────────────────────

describe("resolveMarketCode — 쿠키 최우선", () => {
  it("유효한 쿠키가 있으면 geo를 무시한다", () => {
    expect(resolveMarketCode("JP", "US")).toBe("JP");
  });

  it("모든 마켓 코드가 쿠키로 선택 가능하다", () => {
    expect(resolveMarketCode("KR", undefined)).toBe("KR");
    expect(resolveMarketCode("US", undefined)).toBe("US");
    expect(resolveMarketCode("JP", undefined)).toBe("JP");
  });

  it("대소문자 정확히 일치해야 유효하다 (소문자 'kr'는 무효)", () => {
    // 'kr'은 isMarketCode를 통과 못함 → geo로 내려감
    expect(resolveMarketCode("kr", "US")).toBe("US");
  });
});

describe("resolveMarketCode — geo 폴백", () => {
  it("쿠키 없을 때 geo 국가코드를 마켓으로 매핑한다", () => {
    expect(resolveMarketCode(undefined, "KR")).toBe("KR");
    expect(resolveMarketCode(undefined, "US")).toBe("US");
    expect(resolveMarketCode(undefined, "JP")).toBe("JP");
  });

  it("geo 국가코드는 대소문자 무관 처리된다", () => {
    expect(resolveMarketCode(undefined, "us")).toBe("US");
    expect(resolveMarketCode(undefined, "jp")).toBe("JP");
  });

  it("알 수 없는 geo → 기본 마켓으로 폴백", () => {
    expect(resolveMarketCode(undefined, "XX")).toBe(DEFAULT_MARKET_CODE);
    expect(resolveMarketCode(undefined, "DE")).toBe(DEFAULT_MARKET_CODE);
  });
});

describe("resolveMarketCode — 폴백 보장", () => {
  it("쿠키도 geo도 없으면 항상 기본 마켓을 반환한다", () => {
    expect(resolveMarketCode(undefined, undefined)).toBe(DEFAULT_MARKET_CODE);
  });

  it("잘못된 쿠키 + 알 수 없는 geo → 기본 마켓 (에러 없음)", () => {
    expect(resolveMarketCode("INVALID", "XX")).toBe(DEFAULT_MARKET_CODE);
  });

  it("빈 문자열 쿠키 → 기본 마켓 (에러 없음)", () => {
    expect(resolveMarketCode("", undefined)).toBe(DEFAULT_MARKET_CODE);
  });
});

// ── MARKET_CONFIGS presentation 메타데이터 검증 ───────────────

describe("MARKET_CONFIGS presentation metadata", () => {
  it("keeps labels currency-neutral and retains locale defaults", () => {
    expect(MARKET_CONFIGS).toEqual({
      KR: { code: "KR", label: "한국", defaultLocale: "ko" },
      US: { code: "US", label: "United States", defaultLocale: "en" },
      JP: { code: "JP", label: "日本", defaultLocale: "ja" },
    });
  });

  it("does not expose mutable commercial facts", () => {
    for (const config of Object.values(MARKET_CONFIGS)) {
      expect(config).not.toHaveProperty("currency");
      expect(config).not.toHaveProperty("shippableCountries");
    }
  });
});

describe("Market × Locale resolution", () => {
  it("contains exactly the six explicitly enabled variants", () => {
    expect(ENABLED_SITE_VARIANTS).toEqual([
      { marketCode: "KR", locale: "ko" },
      { marketCode: "KR", locale: "en" },
      { marketCode: "US", locale: "en" },
      { marketCode: "US", locale: "ko" },
      { marketCode: "JP", locale: "ja" },
      { marketCode: "JP", locale: "en" },
    ]);
  });

  it("preserves market and deterministically falls back for a disabled pair", () => {
    expect(resolveRouteSiteVariant("jp", "ko")).toEqual({
      kind: "FALLBACK",
      variant: { marketCode: "JP", locale: "ja" },
    });
    expect(resolveRouteSiteVariant("xx", "en")).toEqual({ kind: "INVALID" });
  });

  it("explicit market cookie beats GeoIP and GeoIP remains inference", () => {
    expect(resolveRootMarket("JP", "US")).toEqual({ marketCode: "JP", source: "EXPLICIT_COOKIE" });
    expect(resolveRootMarket(undefined, "KR")).toEqual({ marketCode: "KR", source: "GEO" });
  });

  it("skips inactive cookie and Geo candidates and fails when no Market is active", () => {
    expect(resolveRootMarket("US", "JP", ["KR"])).toEqual({ marketCode: "KR", source: "DEFAULT" });
    expect(resolveRootMarket("US", "JP", ["JP"])).toEqual({ marketCode: "JP", source: "GEO" });
    expect(() => resolveRootMarket("US", "JP", [])).toThrow("No active Market");
  });

  it("locale cookie beats Accept-Language and language is restricted to the market allowlist", () => {
    expect(resolveRootLocale("ko", "en;q=1", "US")).toEqual({ locale: "ko", source: "EXPLICIT_COOKIE" });
    expect(resolveRootLocale(undefined, "ja;q=1,en;q=0.8", "US")).toEqual({ locale: "en", source: "ACCEPT_LANGUAGE" });
    expect(preferredEnabledLocale("ja;q=1,ko;q=0.8", ["en", "ko"])).toBe("ko");
  });

  it("builds and switches only the explicit public prefix", () => {
    expect(siteVariantPath({ marketCode: "US", locale: "ko" }, "/styles/a")).toBe("/us/ko/styles/a");
    expect(equivalentSiteVariantPath("/kr/ko/styles/a", { marketCode: "JP", locale: "ja" }))
      .toBe("/jp/ja/styles/a");
    expect(equivalentSiteVariantPath("/checkout/return/id", { marketCode: "JP", locale: "ja" }))
      .toBe("/checkout/return/id");
  });
});
