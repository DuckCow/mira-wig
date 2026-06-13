// ============================================================
// lib/catalog.ts — 카탈로그 데이터 계층 (서버 전용)
// 컴포넌트·페이지는 여기서만 가져다 쓴다. Prisma 직접 접근 금지.
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

// ── 내부 헬퍼 ────────────────────────────────────────────────

type StyleRow = Awaited<ReturnType<typeof fetchStyleRows>>[number];

function buildWhere(params: GetWigStylesParams): Prisma.WigStyleWhereInput {
  const base: Prisma.WigStyleWhereInput = { isActive: true };
  if (params.category) base.category = params.category;
  if (params.query) {
    base.OR = [
      { name: { contains: params.query, mode: Prisma.QueryMode.insensitive } },
      { tags: { hasSome: [params.query] } },
    ];
  }
  return base;
}

function toSummary(row: StyleRow): WigStyleSummary {
  const prices = row.variants.map((v) => v.price);
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags,
    coverImageKey: row.coverImageKey,
    basePrice: prices.length > 0 ? Math.min(...prices) : 0,
  };
}

async function fetchStyleRows(params: GetWigStylesParams) {
  return db.wigStyle.findMany({
    where: buildWhere(params),
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      tags: true,
      coverImageKey: true,
      variants: {
        where: { isActive: true },
        select: { price: true },
      },
    },
  });
}

// ── 공개 API ─────────────────────────────────────────────────

export async function getWigStyles(
  params: GetWigStylesParams,
): Promise<WigStyleSummary[]> {
  const rows = await fetchStyleRows(params);
  return rows.map(toSummary);
}

const STYLE_DETAIL_SELECT = {
  id: true,
  name: true,
  description: true,
  category: true,
  tags: true,
  coverImageKey: true,
  imageKeys: true,
  variants: {
    where: { isActive: true },
    orderBy: { price: "asc" as const },
    select: {
      id: true, color: true, colorHex: true,
      length: true, curl: true, price: true, stock: true, sku: true,
    },
  },
} satisfies Prisma.WigStyleSelect;

type StyleDetailRow = NonNullable<
  Awaited<ReturnType<typeof fetchStyleDetailRow>>
>;

async function fetchStyleDetailRow(id: string) {
  return db.wigStyle.findUnique({
    where: { id, isActive: true },
    select: STYLE_DETAIL_SELECT,
  });
}

function toDetail(row: StyleDetailRow): WigStyleDetail {
  const prices = row.variants.map((v) => v.price);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    coverImageKey: row.coverImageKey,
    imageKeys: row.imageKeys,
    basePrice: prices.length > 0 ? Math.min(...prices) : 0,
    variants: row.variants.map((v) => ({
      id: v.id, color: v.color, colorHex: v.colorHex,
      length: v.length, curl: v.curl,
      price: v.price, stock: v.stock, sku: v.sku,
    })),
  };
}

export async function getWigStyleById(
  id: string,
): Promise<WigStyleDetail | null> {
  const row = await fetchStyleDetailRow(id);
  return row ? toDetail(row) : null;
}
