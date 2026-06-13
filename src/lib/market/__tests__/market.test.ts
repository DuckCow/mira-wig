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

// ── MARKET_CONFIGS 메타데이터 검증 ────────────────────────────

describe("MARKET_CONFIGS 통화 메타데이터", () => {
  it("KR 마켓은 KRW zero-decimal이다", () => {
    expect(MARKET_CONFIGS.KR.currency.code).toBe("KRW");
    expect(MARKET_CONFIGS.KR.currency.decimals).toBe(0);
  });

  it("US 마켓은 USD 2-decimal이다", () => {
    expect(MARKET_CONFIGS.US.currency.code).toBe("USD");
    expect(MARKET_CONFIGS.US.currency.decimals).toBe(2);
  });

  it("JP 마켓은 JPY zero-decimal이다", () => {
    expect(MARKET_CONFIGS.JP.currency.code).toBe("JPY");
    expect(MARKET_CONFIGS.JP.currency.decimals).toBe(0);
  });
});
