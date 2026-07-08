// ============================================================
// lib/catalog.types.ts — 카탈로그 공개 타입만 정의
// DB 코드 없음 — 클라이언트 컴포넌트도 안전하게 import 가능
// ============================================================

// Prisma 생성 enum과 동일한 값 집합 (const object + union type)
export const WigCategory = {
  HAIR_LOSS: "HAIR_LOSS",
  FASHION: "FASHION",
  COSPLAY: "COSPLAY",
  TOPPER: "TOPPER",
  MEDICAL: "MEDICAL",
} as const;

export type WigCategory = (typeof WigCategory)[keyof typeof WigCategory];

export const WIG_CATEGORIES: WigCategory[] = [
  WigCategory.HAIR_LOSS,
  WigCategory.FASHION,
  WigCategory.COSPLAY,
  WigCategory.TOPPER,
  WigCategory.MEDICAL,
];

export const CATEGORY_LABELS: Record<WigCategory, string> = {
  [WigCategory.HAIR_LOSS]: "탈모",
  [WigCategory.FASHION]: "패션",
  [WigCategory.COSPLAY]: "코스플레이",
  [WigCategory.TOPPER]: "토퍼",
  [WigCategory.MEDICAL]: "의료용",
};

export interface WigStyleSummary {
  id: string;
  name: string;
  category: WigCategory;
  tags: string[];
  coverImageKey: string | null;
  basePrice: number | null;
}

export interface GetWigStylesParams {
  category?: WigCategory;
  query?: string;
}

export interface WigVariantDetail {
  id: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  price: number | null;
  stock: number;
  sku: string;
}

export interface WigStyleDetail {
  id: string;
  name: string;
  description: string | null;
  category: WigCategory;
  tags: string[];
  coverImageKey: string | null;
  imageKeys: string[];
  basePrice: number | null;
  variants: WigVariantDetail[];
}
