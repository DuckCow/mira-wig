// ============================================================
// lib/admin-catalog.types.ts — 어드민 카탈로그 뷰 타입
// server-only 없음 — 클라이언트 컴포넌트도 import 가능.
// ============================================================

import type { WigCategory } from "@/lib/catalog.types";

export interface StyleRow {
  id: string;
  name: string;
  category: WigCategory;
  isActive: boolean;
  variantCount: number;
}

export interface VariantRow {
  id: string;
  color: string;
  length: string;
  curl: string;
  sku: string;
  stock: number;
  isActive: boolean;
}

export interface StyleDetail {
  id: string;
  name: string;
  description: string | null;
  category: WigCategory;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  variants: VariantRow[];
}

// ── 마켓 가격·가용성 뷰 타입 ──────────────────────────────────

export interface MarketAvailabilityRow {
  marketCode: string;
  isActive: boolean;
}

export interface VariantMarketPriceRow {
  marketCode: string;
  amount: number;
}

export interface VariantPriceRow {
  id: string;
  sku: string;
  prices: VariantMarketPriceRow[];
}

export interface StyleMarketData {
  markets: MarketAvailabilityRow[];
  variantPrices: VariantPriceRow[];
}
