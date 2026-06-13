// ============================================================
// lib/order/core.ts — 주문 생성 순수 함수 (STRICT 존)
// server-only 없음 — 테스트·클라이언트도 import 가능
// ============================================================

import {
  OrderException,
  type CartItemForValidation,
  type OrderLine,
  type SnapshotData,
} from "./types";

// ── 총액 계산 ────────────────────────────────────────────────
// 서버에서만 호출되어야 하며, 클라이언트 입력 금액은 절대 신뢰하지 않는다.

export function computeTotal(
  lines: { unitPrice: number; quantity: number }[],
  shippingFee: number,
): number {
  const itemsTotal = lines.reduce(
    (sum, { unitPrice, quantity }) => sum + unitPrice * quantity,
    0,
  );
  return itemsTotal + shippingFee;
}

// ── 스냅샷 데이터 생성 ────────────────────────────────────────
// variant 삭제·변경 후에도 과거 주문을 표시할 수 있도록 동결한다.

export function buildSnapshotData(
  item: CartItemForValidation,
  currencyCode: string,
): SnapshotData {
  return {
    styleName: item.variant.wigStyle.name,
    color: item.variant.color,
    colorHex: item.variant.colorHex,
    length: item.variant.length,
    curl: item.variant.curl,
    coverImageKey: item.variant.wigStyle.coverImageKey,
    currencyCode,
  };
}

// ── 검증 + 라인 빌드 ─────────────────────────────────────────
// 검증 실패 시 OrderException을 던진다. 조용히 통과시키지 않는다.

export function validateAndBuildLines(
  cartItems: CartItemForValidation[],
  currencyCode: string,
): OrderLine[] {
  if (cartItems.length === 0) {
    throw new OrderException("CART_EMPTY", "장바구니가 비어있습니다.");
  }

  return cartItems.map((item) => {
    const { variant } = item;
    const marketAvailable = variant.wigStyle.availableMarkets[0]?.isActive === true;
    if (!marketAvailable) {
      throw new OrderException(
        "STYLE_UNAVAILABLE",
        `"${variant.wigStyle.name}" 스타일은 현재 마켓에서 판매되지 않습니다.`,
      );
    }

    const marketPrice = variant.marketPrices[0];
    if (!marketPrice) {
      throw new OrderException(
        "VARIANT_PRICE_UNAVAILABLE",
        `"${variant.wigStyle.name}" (${variant.color}) 옵션의 현재 마켓 가격이 없습니다.`,
      );
    }

    if (variant.stock < item.quantity) {
      throw new OrderException(
        "STOCK_INSUFFICIENT",
        `"${variant.wigStyle.name}" (${variant.color}) 재고 부족 (남은 재고: ${variant.stock}개)`,
      );
    }

    return {
      variantId: item.variantId,
      wigStyleId: item.wigStyleId,
      quantity: item.quantity,
      unitPrice: marketPrice.amount,
      snapshotData: buildSnapshotData(item, currencyCode),
    };
  });
}
