import type { Prisma } from "@prisma/client";

export type CommerceIntegrityFailureCode =
  | "VARIANT_PARENT_MISMATCH"
  | "STYLE_UNPUBLISHED"
  | "VARIANT_UNAVAILABLE"
  | "VARIANT_PRICE_UNAVAILABLE"
  | "STOCK_INSUFFICIENT";

export interface VariantPurchasabilityFacts {
  selectedStyleId: string;
  canonicalStyleId: string;
  styleActive: boolean;
  stylePublishedInMarket: boolean;
  variantActive: boolean;
  hasMarketPrice: boolean;
  stock: number;
  quantity: number;
}

export function stylePublishedInMarketWhere(marketCode: string): Prisma.WigStyleWhereInput {
  return {
    isActive: true,
    availableMarkets: { some: { marketCode, isActive: true } },
  };
}

// Canonical VARIANT_PURCHASABLE_IN_MARKET decision. Display surfaces may show
// unavailable variants, but every commercial admission uses this exact result.
export function variantPurchasableInMarketFailure(
  facts: VariantPurchasabilityFacts,
): CommerceIntegrityFailureCode | null {
  if (facts.selectedStyleId !== facts.canonicalStyleId) return "VARIANT_PARENT_MISMATCH";
  if (!facts.styleActive || !facts.stylePublishedInMarket) return "STYLE_UNPUBLISHED";
  if (!facts.variantActive) return "VARIANT_UNAVAILABLE";
  if (!facts.hasMarketPrice) return "VARIANT_PRICE_UNAVAILABLE";
  if (!Number.isInteger(facts.quantity) || facts.quantity < 1 || facts.stock < facts.quantity) {
    return "STOCK_INSUFFICIENT";
  }
  return null;
}

export function commerceIntegrityMessage(code: CommerceIntegrityFailureCode): string {
  if (code === "VARIANT_PARENT_MISMATCH") return "선택한 스타일과 옵션이 일치하지 않습니다. 상품을 제거한 뒤 다시 담아주세요.";
  if (code === "STYLE_UNPUBLISHED") return "현재 마켓에서 판매하지 않는 스타일입니다. 상품을 제거해주세요.";
  if (code === "VARIANT_UNAVAILABLE") return "현재 구매할 수 없는 옵션입니다. 상품을 제거한 뒤 다시 선택해주세요.";
  if (code === "VARIANT_PRICE_UNAVAILABLE") return "현재 마켓 가격이 없습니다. 상품을 제거한 뒤 다시 선택해주세요.";
  return "선택한 수량을 구매할 수 없습니다. 수량을 조정하거나 상품을 제거해주세요.";
}
