// ============================================================
// lib/catalog-admin/types.ts — 어드민 카탈로그 공개 타입
// server-only 없음 — 테스트·클라이언트 모두 import 가능.
// ------------------------------------------------------------
// 참고: isActive는 "전역 활성" 축이다.
//       마켓별 노출(WigStyleMarket.isActive)은 작업 1b에서 다룬다.
// ============================================================

import type { WigCategory } from "@/lib/catalog.types";

// ── 에러 코드 ─────────────────────────────────────────────────

export type CatalogAdminErrorCode =
  | "STYLE_NOT_FOUND"
  | "VARIANT_NOT_FOUND"
  | "SKU_DUPLICATE"
  | "INVALID_CATEGORY"
  | "INVALID_INPUT"
  | "MARKET_NOT_FOUND"
  | "INVALID_AMOUNT";

export class CatalogAdminException extends Error {
  constructor(
    public readonly code: CatalogAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CatalogAdminException";
  }
}

// ── 입력 타입 ─────────────────────────────────────────────────

export interface CreateStyleInput {
  name: string;
  description?: string;
  category: WigCategory;
  tags?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateStyleInput {
  name?: string;
  description?: string;
  category?: WigCategory;
  tags?: string[];
  sortOrder?: number;
  isActive?: boolean;
  /** S3 key (URL 아님 — 규칙 4-4). null이면 커버 이미지 제거. */
  coverImageKey?: string | null;
}

export interface CreateVariantInput {
  wigStyleId: string;
  color: string;
  colorHex?: string;
  length: string;
  curl: string;
  /** KRW 하위호환 필드. 실 마켓 가격은 VariantMarketPrice가 담당(작업 1b). */
  price?: number;
  stock?: number;
  sku: string;
  isActive?: boolean;
}

export interface UpdateVariantInput {
  color?: string;
  colorHex?: string;
  length?: string;
  curl?: string;
  /** KRW 하위호환 필드. 실 마켓 가격은 VariantMarketPrice가 담당(작업 1b). */
  price?: number;
  stock?: number;
  sku?: string;
  isActive?: boolean;
}

// ── 마켓 가격 타입 ────────────────────────────────────────────

/** setVariantPrices 배열 항목 — 마켓 코드 + 최소단위 정수 금액 */
export interface SetVariantPriceEntry {
  marketCode: string;
  /** 최소단위 정수. KRW/JPY(zero-decimal): 85000=₩85,000. USD(센트): 7799=$77.99 */
  amount: number;
}

/** setStyleMarketAvailability 반환 — 가격이 없는 variant 경고 */
export interface PriceWarning {
  variantId: string;
  sku: string;
  marketCode: string;
}

/** findMarketPriceGaps 반환 항목 */
export interface PriceGapItem {
  wigStyleId: string;
  styleName: string;
  marketCode: string;
  variantId: string;
  sku: string;
}
