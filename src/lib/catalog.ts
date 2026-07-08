// ============================================================
// lib/catalog.ts — 카탈로그 데이터 계층 (서버 전용)
// 컴포넌트·페이지는 여기서만 가져다 쓴다. Prisma 직접 접근 금지.
// 가격은 항상 마켓의 최소단위 정수(VariantMarketPrice.amount)로 반환한다.
// ============================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  WigCategory,
  WIG_CATEGORIES,
  CATEGORY_LABELS,
  type WigStyleSummary,
  type GetWigStylesParams,
  type WigStyleDetail,
  type WigVariantDetail,
} from "./catalog.types";

export {
  WigCategory,
  WIG_CATEGORIES,
  CATEGORY_LABELS,
  type WigStyleSummary,
  type GetWigStylesParams,
  type WigStyleDetail,
  type WigVariantDetail,
};

// ── 타입가드 ─────────────────────────────────────────────────

export function isWigCategory(value: string): value is WigCategory {
  return WIG_CATEGORIES.some((c) => c === value);
}

// ── 목록 쿼리 ────────────────────────────────────────────────

function buildWhere(
  params: GetWigStylesParams,
  marketCode: string,
): Prisma.WigStyleWhereInput {
  const base: Prisma.WigStyleWhereInput = {
    isActive: true,
    availableMarkets: { some: { marketCode, isActive: true } },
  };
  if (params.category) base.category = params.category;
  if (params.query) {
    base.OR = [
      { name: { contains: params.query, mode: Prisma.QueryMode.insensitive } },
      { tags: { hasSome: [params.query] } },
    ];
  }
  return base;
}

async function fetchStyleRows(params: GetWigStylesParams, marketCode: string) {
  return db.wigStyle.findMany({
    where: buildWhere(params, marketCode),
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      tags: true,
      coverImageKey: true,
      variants: {
        where: { isActive: true },
        select: {
          marketPrices: {
            where: { marketCode },
            select: { amount: true },
          },
        },
      },
    },
  });
}

type StyleRow = Awaited<ReturnType<typeof fetchStyleRows>>[number];

function toSummary(row: StyleRow): WigStyleSummary {
  const prices = row.variants.flatMap((v) => v.marketPrices.map((p) => p.amount));
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags,
    coverImageKey: row.coverImageKey,
    basePrice: minPriceOrNull(prices),
  };
}

export async function getWigStyles(
  params: GetWigStylesParams,
  marketCode: string,
): Promise<WigStyleSummary[]> {
  const rows = await fetchStyleRows(params, marketCode);
  return rows.map(toSummary);
}

// ── 상세 쿼리 ────────────────────────────────────────────────

async function fetchStyleDetailRow(id: string, marketCode: string) {
  return db.wigStyle.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      coverImageKey: true,
      imageKeys: true,
      variants: {
        where: { isActive: true },
        orderBy: { sku: "asc" },
        select: {
          id: true, color: true, colorHex: true,
          length: true, curl: true, stock: true, sku: true,
          marketPrices: {
            where: { marketCode },
            select: { amount: true },
          },
        },
      },
    },
  });
}

type StyleDetailRow = NonNullable<Awaited<ReturnType<typeof fetchStyleDetailRow>>>;

function toDetail(row: StyleDetailRow): WigStyleDetail {
  const variants: WigVariantDetail[] = row.variants.map((v) => ({
    id: v.id,
    color: v.color,
    colorHex: v.colorHex,
    length: v.length,
    curl: v.curl,
    price: v.marketPrices[0]?.amount ?? null,
    stock: v.stock,
    sku: v.sku,
  }));
  const prices = variants.flatMap((v) => v.price === null ? [] : [v.price]);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    coverImageKey: row.coverImageKey,
    imageKeys: row.imageKeys,
    basePrice: minPriceOrNull(prices),
    variants,
  };
}

export async function getWigStyleById(
  id: string,
  marketCode: string,
): Promise<WigStyleDetail | null> {
  const row = await fetchStyleDetailRow(id, marketCode);
  return row ? toDetail(row) : null;
}

function minPriceOrNull(prices: number[]): number | null {
  return prices.length > 0 ? Math.min(...prices) : null;
}
