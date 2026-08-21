// ============================================================
// STRICT 존 — lib/catalog-admin/market-price 행동 검증
// 금액 검증(zero-decimal + bare 0 차단)·마켓 유효성·갭 진단·가용성 경고를 검증한다.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogAdminException } from "../types";

// ── DB 모킹 ──────────────────────────────────────────────────

const mockVariantFindUnique = vi.fn();
const mockVariantFindMany = vi.fn();
const mockPriceUpsert = vi.fn();
const mockStyleFindUnique = vi.fn();
const mockStyleMarketUpsert = vi.fn();
const mockStyleMarketFindMany = vi.fn();
const mockMarketFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    wigVariant: {
      findUnique: (...a: unknown[]): unknown => mockVariantFindUnique(...a),
      findMany: (...a: unknown[]): unknown => mockVariantFindMany(...a),
    },
    variantMarketPrice: {
      upsert: (...a: unknown[]): unknown => mockPriceUpsert(...a),
    },
    wigStyle: {
      findUnique: (...a: unknown[]): unknown => mockStyleFindUnique(...a),
    },
    wigStyleMarket: {
      upsert: (...a: unknown[]): unknown => mockStyleMarketUpsert(...a),
      findMany: (...a: unknown[]): unknown => mockStyleMarketFindMany(...a),
    },
    market: {
      findMany: (...a: unknown[]): unknown => mockMarketFindMany(...a),
    },
  },
}));

import {
  setVariantPrices,
  setStyleMarketAvailability,
  findMarketPriceGaps,
} from "../market-price";

beforeEach(() => {
  vi.clearAllMocks();
  mockMarketFindMany.mockResolvedValue([
    { code: "KR", currency: "KRW", shippableCountries: ["KR"], isActive: true },
    { code: "US", currency: "USD", shippableCountries: ["US"], isActive: true },
    { code: "JP", currency: "JPY", shippableCountries: ["JP"], isActive: true },
  ]);
});

// ── setVariantPrices: variant 검증 ───────────────────────────

describe("setVariantPrices — variant 미존재", () => {
  it("존재하지 않는 variantId이면 VARIANT_NOT_FOUND를 던진다", async () => {
    mockVariantFindUnique.mockResolvedValue(null);
    await expect(
      setVariantPrices("no-variant", [{ marketCode: "KR", amount: 85000 }]),
    ).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
  });
});

// ── setVariantPrices: 마켓 코드 검증 ─────────────────────────

describe("setVariantPrices — 마켓 코드 검증", () => {
  beforeEach(() => {
    mockVariantFindUnique.mockResolvedValue({ id: "v-1" });
  });

  it("유효하지 않은 marketCode이면 MARKET_NOT_FOUND를 던진다", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "ZZ", amount: 10000 }]),
    ).rejects.toMatchObject({ code: "MARKET_NOT_FOUND" });
  });
});

// ── setVariantPrices: zero-decimal 금액 검증 (§4 핵심) ───────

describe("setVariantPrices — 금액 검증 (zero-decimal 규칙)", () => {
  beforeEach(() => {
    mockVariantFindUnique.mockResolvedValue({ id: "v-1" });
    mockPriceUpsert.mockResolvedValue({});
  });

  it("KRW 85000은 통과한다 — ×100 하지 않음, 정수로 그대로 저장", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "KR", amount: 85000 }]),
    ).resolves.toBeUndefined();
  });

  it("JPY 9800은 통과한다 — zero-decimal", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "JP", amount: 9800 }]),
    ).resolves.toBeUndefined();
  });

  it("USD 7799는 통과한다 — 센트 단위 정수", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "US", amount: 7799 }]),
    ).resolves.toBeUndefined();
  });

  it("최소 경계값 1은 통과한다", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "KR", amount: 1 }]),
    ).resolves.toBeUndefined();
  });

  it("음수 금액은 INVALID_AMOUNT를 던진다", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "KR", amount: -1 }]),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("비정수(float)는 INVALID_AMOUNT를 던진다", async () => {
    await expect(
      setVariantPrices("v-1", [{ marketCode: "KR", amount: 85000.5 }]),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("0은 INVALID_AMOUNT를 던진다 — total-0 주문 방지를 위한 승인된 정책 반전", async () => {
    // bare 0 가격은 subtotal 0 + shipping 0 = total 0 주문을 만들 수 있다.
    // 무료 상품은 나중에 할인/배송비 설계를 통해 명시적으로 재도입한다.
    await expect(
      setVariantPrices("v-1", [{ marketCode: "KR", amount: 0 }]),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("uses current DB Market currency when validating operator input", async () => {
    mockMarketFindMany.mockResolvedValue([
      { code: "US", currency: "JPY", shippableCountries: ["US"], isActive: true },
    ]);

    await expect(setVariantPrices("v-1", [{ marketCode: "US", amount: -1 }]))
      .rejects.toThrow("JPY 금액");
    expect(mockPriceUpsert).not.toHaveBeenCalled();
  });

  it("fails closed before price writes when current DB Market currency is unsupported", async () => {
    mockMarketFindMany.mockResolvedValue([
      { code: "US", currency: "EUR", shippableCountries: ["US"], isActive: true },
    ]);

    await expect(setVariantPrices("v-1", [{ marketCode: "US", amount: 7_799 }]))
      .rejects.toMatchObject({ name: "UnsupportedMarketCurrencyException" });
    expect(mockPriceUpsert).not.toHaveBeenCalled();
  });

  it("일괄 저장에 0 금액이 섞이면 쓰기 전에 INVALID_AMOUNT를 던진다", async () => {
    await expect(
      setVariantPrices("v-1", [
        { marketCode: "KR", amount: 85000 },
        { marketCode: "US", amount: 0 },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    expect(mockPriceUpsert).not.toHaveBeenCalled();
  });
});

// ── setVariantPrices: 성공 경로 ──────────────────────────────

describe("setVariantPrices — 성공 경로", () => {
  it("여러 마켓 일괄 upsert한다", async () => {
    mockVariantFindUnique.mockResolvedValue({ id: "v-1" });
    mockPriceUpsert.mockResolvedValue({});
    await setVariantPrices("v-1", [
      { marketCode: "KR", amount: 85000 },
      { marketCode: "US", amount: 7799 },
      { marketCode: "JP", amount: 9800 },
    ]);
    expect(mockPriceUpsert).toHaveBeenCalledTimes(3);
  });

  it("단일 마켓도 커버한다", async () => {
    mockVariantFindUnique.mockResolvedValue({ id: "v-1" });
    mockPriceUpsert.mockResolvedValue({});
    await setVariantPrices("v-1", [{ marketCode: "KR", amount: 30000 }]);
    expect(mockPriceUpsert).toHaveBeenCalledTimes(1);
  });
});

// ── setStyleMarketAvailability: 검증 ─────────────────────────

describe("setStyleMarketAvailability — 검증", () => {
  it("유효하지 않은 marketCode이면 MARKET_NOT_FOUND를 던진다", async () => {
    await expect(
      setStyleMarketAvailability("s-1", "XX", true),
    ).rejects.toMatchObject({ code: "MARKET_NOT_FOUND" });
  });

  it("존재하지 않는 wigStyleId이면 STYLE_NOT_FOUND를 던진다", async () => {
    mockStyleFindUnique.mockResolvedValue(null);
    await expect(
      setStyleMarketAvailability("no-style", "KR", true),
    ).rejects.toMatchObject({ code: "STYLE_NOT_FOUND" });
  });
});

// ── setStyleMarketAvailability: 성공 + 경고 ──────────────────

describe("setStyleMarketAvailability — 성공 경로", () => {
  beforeEach(() => {
    mockStyleFindUnique.mockResolvedValue({ id: "s-1" });
    mockStyleMarketUpsert.mockResolvedValue({});
  });

  it("모든 variant가 가격 있으면 warnings 빈 배열", async () => {
    mockVariantFindMany.mockResolvedValue([
      { id: "v-1", sku: "TST-BLK-L-ST", marketPrices: [{ marketCode: "KR" }] },
      { id: "v-2", sku: "TST-WH-L-ST", marketPrices: [{ marketCode: "KR" }] },
    ]);
    const warnings = await setStyleMarketAvailability("s-1", "KR", true);
    expect(warnings).toHaveLength(0);
  });

  it("가격 없는 variant는 warnings에 포함되고 토글은 성공한다", async () => {
    mockVariantFindMany.mockResolvedValue([
      { id: "v-1", sku: "TST-BLK-L-ST", marketPrices: [] },
      { id: "v-2", sku: "TST-WH-L-ST", marketPrices: [{ marketCode: "KR" }] },
    ]);
    const warnings = await setStyleMarketAvailability("s-1", "KR", true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ variantId: "v-1", sku: "TST-BLK-L-ST", marketCode: "KR" });
    expect(mockStyleMarketUpsert).toHaveBeenCalledOnce();
  });

  it("비활성화는 variant 조회 없이 빈 warnings 반환", async () => {
    const warnings = await setStyleMarketAvailability("s-1", "KR", false);
    expect(warnings).toHaveLength(0);
    expect(mockVariantFindMany).not.toHaveBeenCalled();
  });
});

// ── findMarketPriceGaps: 갭 없음 / 빈 상태 ───────────────────

describe("findMarketPriceGaps — 갭 없음", () => {
  it("활성 스타일이 없으면 빈 배열을 반환한다", async () => {
    mockStyleMarketFindMany.mockResolvedValue([]);
    expect(await findMarketPriceGaps()).toHaveLength(0);
  });

  it("모든 variant에 가격이 있으면 빈 배열을 반환한다", async () => {
    mockStyleMarketFindMany.mockResolvedValue([
      {
        wigStyleId: "s-1",
        marketCode: "KR",
        wigStyle: {
          name: "실크 스트레이트",
          variants: [{ id: "v-1", sku: "TST-BLK-L-ST", marketPrices: [{ marketCode: "KR" }] }],
        },
      },
    ]);
    expect(await findMarketPriceGaps()).toHaveLength(0);
  });
});

// ── findMarketPriceGaps: 갭 감지 ─────────────────────────────

describe("findMarketPriceGaps — 갭 감지", () => {
  it("가격이 없는 variant를 갭으로 반환한다", async () => {
    mockStyleMarketFindMany.mockResolvedValue([
      {
        wigStyleId: "s-1",
        marketCode: "KR",
        wigStyle: {
          name: "실크 스트레이트",
          variants: [{ id: "v-1", sku: "TST-BLK-L-ST", marketPrices: [] }],
        },
      },
    ]);
    const gaps = await findMarketPriceGaps();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      wigStyleId: "s-1", styleName: "실크 스트레이트",
      marketCode: "KR", variantId: "v-1", sku: "TST-BLK-L-ST",
    });
  });

  it("다른 마켓 가격은 있지만 해당 마켓 가격이 없으면 갭이다", async () => {
    mockStyleMarketFindMany.mockResolvedValue([
      {
        wigStyleId: "s-1",
        marketCode: "US",
        wigStyle: {
          name: "실크 스트레이트",
          variants: [{ id: "v-1", sku: "TST-BLK-L-ST", marketPrices: [{ marketCode: "KR" }] }],
        },
      },
    ]);
    const gaps = await findMarketPriceGaps();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ variantId: "v-1", marketCode: "US" });
  });
});

// ── findMarketPriceGaps: 갭 해소 ─────────────────────────────

describe("findMarketPriceGaps — 갭 해소", () => {
  it("가격 추가 후(두 번째 호출) 갭이 사라진다", async () => {
    const withGap = [{
      wigStyleId: "s-1", marketCode: "KR",
      wigStyle: { name: "스타일", variants: [{ id: "v-1", sku: "TST", marketPrices: [] }] },
    }];
    const withPrice = [{
      wigStyleId: "s-1", marketCode: "KR",
      wigStyle: {
        name: "스타일",
        variants: [{ id: "v-1", sku: "TST", marketPrices: [{ marketCode: "KR" }] }],
      },
    }];
    mockStyleMarketFindMany.mockResolvedValueOnce(withGap).mockResolvedValueOnce(withPrice);
    expect(await findMarketPriceGaps()).toHaveLength(1);
    expect(await findMarketPriceGaps()).toHaveLength(0);
  });
});

// ── CatalogAdminException 인스턴스 검증 ──────────────────────

describe("CatalogAdminException 인스턴스 타입 확인", () => {
  it("STYLE_NOT_FOUND 예외는 CatalogAdminException 인스턴스다", async () => {
    mockStyleFindUnique.mockResolvedValue(null);
    let caught: unknown;
    try {
      await setStyleMarketAvailability("no-style", "KR", true);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CatalogAdminException);
    if (caught instanceof CatalogAdminException) expect(caught.code).toBe("STYLE_NOT_FOUND");
  });
});
