// ============================================================
// STRICT 존 행동 검증 테스트 — lib/order/core.ts
// 외부 의존성(DB) 없음; 순수 함수만 테스트한다.
// ============================================================
import { describe, expect, it } from "vitest";
import { OrderException } from "../types";
import { computeTotal, buildSnapshotData, validateAndBuildLines } from "../core";
import type { CartItemForValidation } from "../types";

// ── 테스트 픽스처 헬퍼 ───────────────────────────────────────

function makeItem(overrides: {
  quantity?: number;
  stock?: number;
  marketPrices?: { amount: number }[];
  isStyleActive?: boolean;
}): CartItemForValidation {
  return {
    variantId: "v1",
    wigStyleId: "s1",
    quantity: overrides.quantity ?? 1,
    variant: {
      stock: overrides.stock ?? 50,
      color: "블랙",
      colorHex: "#1A1A1A",
      length: "long",
      curl: "straight",
      sku: "TEST-BLK-L-ST",
      marketPrices: overrides.marketPrices ?? [{ amount: 85000 }],
      wigStyle: {
        id: "s1",
        name: "실크 스트레이트",
        coverImageKey: null,
        availableMarkets: [{ isActive: overrides.isStyleActive ?? true }],
      },
    },
  };
}

// ── computeTotal ─────────────────────────────────────────────

describe("computeTotal", () => {
  it("단가 × 수량 합산 + 배송비를 계산한다", () => {
    expect(
      computeTotal([
        { unitPrice: 85000, quantity: 2 },
        { unitPrice: 75000, quantity: 1 },
      ], 0),
    ).toBe(245000);
  });

  it("배송비가 더해진다", () => {
    expect(computeTotal([{ unitPrice: 85000, quantity: 1 }], 5000)).toBe(90000);
  });

  it("항목이 없으면 배송비만 반환한다", () => {
    expect(computeTotal([], 0)).toBe(0);
  });

  it("USD 센트 단위도 정수 계산으로 정확하다 ($77.99 × 3 + 0)", () => {
    expect(
      computeTotal([{ unitPrice: 7799, quantity: 3 }], 0),
    ).toBe(23397);
  });
});

// ── buildSnapshotData ─────────────────────────────────────────

describe("buildSnapshotData", () => {
  it("스타일명·색상·통화코드를 동결한다", () => {
    const item = makeItem({});
    const snapshot = buildSnapshotData(item, "KRW");
    expect(snapshot.styleName).toBe("실크 스트레이트");
    expect(snapshot.color).toBe("블랙");
    expect(snapshot.currencyCode).toBe("KRW");
    expect(snapshot.colorHex).toBe("#1A1A1A");
    expect(snapshot.length).toBe("long");
    expect(snapshot.curl).toBe("straight");
    expect(snapshot.coverImageKey).toBeNull();
  });

  it("USD 통화코드도 정확히 기록한다", () => {
    const snapshot = buildSnapshotData(makeItem({}), "USD");
    expect(snapshot.currencyCode).toBe("USD");
  });
});

// ── validateAndBuildLines — 정상 경로 ────────────────────────

describe("validateAndBuildLines — 정상 경로", () => {
  it("유효한 항목을 OrderLine으로 변환한다", () => {
    const items = [makeItem({ quantity: 2, marketPrices: [{ amount: 85000 }] })];
    const lines = validateAndBuildLines(items, "KRW");
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(85000);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].snapshotData.currencyCode).toBe("KRW");
  });

  it("unitPrice = VariantMarketPrice.amount 으로 동결된다 (variant.price 아님)", () => {
    const items = [makeItem({ marketPrices: [{ amount: 7799 }] })];
    const lines = validateAndBuildLines(items, "USD");
    // 마켓 가격(7799 센트)이 동결되어야 한다
    expect(lines[0].unitPrice).toBe(7799);
  });

  it("여러 항목을 모두 처리한다", () => {
    const items = [
      makeItem({ quantity: 1, marketPrices: [{ amount: 85000 }] }),
      { ...makeItem({ quantity: 3, marketPrices: [{ amount: 75000 }] }), variantId: "v2" },
    ];
    const lines = validateAndBuildLines(items, "KRW");
    expect(lines).toHaveLength(2);
  });
});

// ── validateAndBuildLines — CART_EMPTY ───────────────────────

describe("validateAndBuildLines — 빈 장바구니", () => {
  it("빈 배열이면 CART_EMPTY 예외를 던진다", () => {
    expect(() => validateAndBuildLines([], "KRW")).toThrow(OrderException);
    try {
      validateAndBuildLines([], "KRW");
    } catch (e) {
      expect(e instanceof OrderException && e.code).toBe("CART_EMPTY");
    }
  });
});

// ── validateAndBuildLines — STYLE_UNAVAILABLE ────────────────

describe("validateAndBuildLines — 스타일 마켓 비활성", () => {
  it("isActive=false 스타일이면 STYLE_UNAVAILABLE 예외를 던진다", () => {
    const items = [makeItem({ isStyleActive: false })];
    expect(() => validateAndBuildLines(items, "KRW")).toThrow(OrderException);
    try {
      validateAndBuildLines(items, "KRW");
    } catch (e) {
      expect(e instanceof OrderException && e.code).toBe("STYLE_UNAVAILABLE");
    }
  });

  it("availableMarkets 배열이 비어있으면(마켓 연결 없음) STYLE_UNAVAILABLE", () => {
    const item = makeItem({});
    item.variant.wigStyle.availableMarkets = [];
    expect(() => validateAndBuildLines([item], "KRW")).toThrow(OrderException);
  });
});

// ── validateAndBuildLines — VARIANT_PRICE_UNAVAILABLE ────────

describe("validateAndBuildLines — 마켓 가격 없음", () => {
  it("marketPrices가 빈 배열이면 VARIANT_PRICE_UNAVAILABLE 예외를 던진다", () => {
    const items = [makeItem({ marketPrices: [] })];
    expect(() => validateAndBuildLines(items, "KRW")).toThrow(OrderException);
    let caught: unknown;
    try { validateAndBuildLines(items, "KRW"); } catch (e) { caught = e; }
    if (caught instanceof OrderException) {
      expect(caught.code).toBe("VARIANT_PRICE_UNAVAILABLE");
    } else {
      expect.unreachable("OrderException이 던져져야 합니다");
    }
  });
});

// ── validateAndBuildLines — STOCK_INSUFFICIENT ───────────────

describe("validateAndBuildLines — 재고 부족", () => {
  it("수량이 재고를 초과하면 STOCK_INSUFFICIENT 예외를 던진다", () => {
    const items = [makeItem({ quantity: 10, stock: 5 })];
    expect(() => validateAndBuildLines(items, "KRW")).toThrow(OrderException);
    let caught: unknown;
    try { validateAndBuildLines(items, "KRW"); } catch (e) { caught = e; }
    if (caught instanceof OrderException) {
      expect(caught.code).toBe("STOCK_INSUFFICIENT");
    } else {
      expect.unreachable("OrderException이 던져져야 합니다");
    }
  });

  it("수량 = 재고 이면 통과한다 (경계값)", () => {
    const items = [makeItem({ quantity: 50, stock: 50 })];
    expect(() => validateAndBuildLines(items, "KRW")).not.toThrow();
  });

  it("수량 = 1, 재고 = 0 이면 STOCK_INSUFFICIENT", () => {
    const items = [makeItem({ quantity: 1, stock: 0 })];
    expect(() => validateAndBuildLines(items, "KRW")).toThrow(OrderException);
    let caught: unknown;
    try { validateAndBuildLines(items, "KRW"); } catch (e) { caught = e; }
    if (caught instanceof OrderException) {
      expect(caught.code).toBe("STOCK_INSUFFICIENT");
    } else {
      expect.unreachable("OrderException이 던져져야 합니다");
    }
  });
});

// ── status = PENDING_PAYMENT (순수 상수 검증) ─────────────────

describe("OrderErrorCode exhaustive check", () => {
  it("모든 예상 에러 코드를 생성할 수 있다", () => {
    const codes = [
      "CART_EMPTY",
      "VARIANT_PRICE_UNAVAILABLE",
      "STYLE_UNAVAILABLE",
      "STOCK_INSUFFICIENT",
      "SHIPPING_COUNTRY_INVALID",
    ] as const;
    codes.forEach((code) => {
      const ex = new OrderException(code, "test");
      expect(ex.code).toBe(code);
      expect(ex.name).toBe("OrderException");
    });
  });
});
