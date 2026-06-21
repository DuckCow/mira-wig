// ============================================================
// lib/catalog-admin/index.ts — 어드민 카탈로그 쓰기 계층 (STRICT 존, 서버 전용)
// ------------------------------------------------------------
// WigStyle / WigVariant CRUD. 이미지·마켓 가격은 별도 작업.
// 삭제는 soft(isActive=false)만 제공 — OrderItem/CartItem 참조 보호.
// WigStyle.onDelete=Cascade → Style 비활성화는 Variant까지 내려가지 않음
//   (isActive만 변경; Cascade는 hard delete 시에만 발동).
// ============================================================
import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { WIG_CATEGORIES } from "@/lib/catalog.types";
import {
  CatalogAdminException,
  type CreateStyleInput,
  type UpdateStyleInput,
  type CreateVariantInput,
  type UpdateVariantInput,
} from "./types";

export * from "./types";

// ── 내부 헬퍼 ────────────────────────────────────────────────

const VALID_CATEGORIES: ReadonlySet<string> = new Set(WIG_CATEGORIES);

function assertNonEmpty(value: string | undefined, field: string): void {
  if (!value || !value.trim()) {
    throw new CatalogAdminException("INVALID_INPUT", `${field}은(는) 필수입니다.`);
  }
}

function assertValidCategory(value: string): void {
  if (!VALID_CATEGORIES.has(value)) {
    throw new CatalogAdminException("INVALID_CATEGORY", `유효하지 않은 카테고리: ${value}`);
  }
}

function isSkuDuplicate(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== "P2002") return false;
  const target = e.meta?.["target"];
  return Array.isArray(target) && target.includes("sku");
}

// ── WigStyle ──────────────────────────────────────────────────

/** WigStyle을 생성한다. 이미지(coverImageKey/imageKeys)는 별도 작업(S3 연동). */
export async function createWigStyle(input: CreateStyleInput): Promise<{ id: string }> {
  assertNonEmpty(input.name, "이름");
  assertValidCategory(input.category);
  return db.wigStyle.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      category: input.category,
      tags: input.tags ?? [],
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      imageKeys: [],
    },
    select: { id: true },
  });
}

function buildStyleUpdateData(input: UpdateStyleInput) {
  return {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.coverImageKey !== undefined && { coverImageKey: input.coverImageKey }),
  };
}

/** WigStyle 텍스트 메타를 수정한다. 이미지 필드는 제외. */
export async function updateWigStyle(styleId: string, input: UpdateStyleInput): Promise<void> {
  if (input.name !== undefined) assertNonEmpty(input.name, "이름");
  if (input.category !== undefined) assertValidCategory(input.category);
  const existing = await db.wigStyle.findUnique({ where: { id: styleId }, select: { id: true } });
  if (!existing) throw new CatalogAdminException("STYLE_NOT_FOUND", "스타일을 찾을 수 없습니다.");
  await db.wigStyle.update({ where: { id: styleId }, data: buildStyleUpdateData(input) });
}

/**
 * WigStyle을 비활성화(soft delete)한다.
 * hard delete는 제공하지 않는다 — Variant가 OrderItem/CartItem에 참조될 수 있음.
 * 전역 isActive 축만 조작. 마켓별 노출(WigStyleMarket.isActive)은 작업 1b.
 */
export async function deactivateWigStyle(styleId: string): Promise<void> {
  const existing = await db.wigStyle.findUnique({ where: { id: styleId }, select: { id: true } });
  if (!existing) throw new CatalogAdminException("STYLE_NOT_FOUND", "스타일을 찾을 수 없습니다.");
  await db.wigStyle.update({ where: { id: styleId }, data: { isActive: false } });
}

// ── WigVariant ────────────────────────────────────────────────

/** WigVariant를 생성한다. sku는 @unique — 충돌 시 SKU_DUPLICATE. */
export async function createWigVariant(input: CreateVariantInput): Promise<{ id: string }> {
  assertNonEmpty(input.wigStyleId, "스타일 ID");
  assertNonEmpty(input.color, "색상");
  assertNonEmpty(input.length, "길이");
  assertNonEmpty(input.curl, "컬");
  assertNonEmpty(input.sku, "SKU");
  const style = await db.wigStyle.findUnique({ where: { id: input.wigStyleId }, select: { id: true } });
  if (!style) throw new CatalogAdminException("STYLE_NOT_FOUND", "부모 스타일을 찾을 수 없습니다.");
  try {
    return await db.wigVariant.create({
      data: {
        wigStyleId: input.wigStyleId,
        color: input.color,
        colorHex: input.colorHex ?? null,
        length: input.length,
        curl: input.curl,
        price: input.price ?? 0, // KRW 하위호환; 실 마켓 가격은 VariantMarketPrice(작업 1b)
        stock: input.stock ?? 0,
        sku: input.sku,
        isActive: input.isActive ?? true,
      },
      select: { id: true },
    });
  } catch (e) {
    if (isSkuDuplicate(e)) throw new CatalogAdminException("SKU_DUPLICATE", `SKU '${input.sku}'이(가) 이미 존재합니다.`);
    throw e;
  }
}

function buildVariantData(input: UpdateVariantInput) {
  return {
    ...(input.color !== undefined && { color: input.color }),
    ...(input.colorHex !== undefined && { colorHex: input.colorHex }),
    ...(input.length !== undefined && { length: input.length }),
    ...(input.curl !== undefined && { curl: input.curl }),
    ...(input.price !== undefined && { price: input.price }),
    ...(input.stock !== undefined && { stock: input.stock }),
    ...(input.sku !== undefined && { sku: input.sku }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };
}

/** WigVariant 속성을 수정한다. sku 변경 시 @unique 충돌 → SKU_DUPLICATE. */
export async function updateWigVariant(variantId: string, input: UpdateVariantInput): Promise<void> {
  const existing = await db.wigVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!existing) throw new CatalogAdminException("VARIANT_NOT_FOUND", "변형을 찾을 수 없습니다.");
  try {
    await db.wigVariant.update({ where: { id: variantId }, data: buildVariantData(input) });
  } catch (e) {
    if (isSkuDuplicate(e)) throw new CatalogAdminException("SKU_DUPLICATE", `SKU '${input.sku}'이(가) 이미 존재합니다.`);
    throw e;
  }
}

/** 재고만 수정한다 — 운영 중 stock만 자주 변경되는 패턴 지원. */
export async function updateVariantStock(variantId: string, stock: number): Promise<void> {
  if (stock < 0) throw new CatalogAdminException("INVALID_INPUT", "재고는 0 이상이어야 합니다.");
  const existing = await db.wigVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!existing) throw new CatalogAdminException("VARIANT_NOT_FOUND", "변형을 찾을 수 없습니다.");
  await db.wigVariant.update({ where: { id: variantId }, data: { stock } });
}

/**
 * WigVariant를 비활성화(soft delete)한다.
 * hard delete는 제공하지 않는다 — OrderItem이 이 variant를 참조할 수 있음.
 * 전역 isActive 축만 조작. 마켓별 노출은 작업 1b.
 */
export async function deactivateWigVariant(variantId: string): Promise<void> {
  const existing = await db.wigVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!existing) throw new CatalogAdminException("VARIANT_NOT_FOUND", "변형을 찾을 수 없습니다.");
  await db.wigVariant.update({ where: { id: variantId }, data: { isActive: false } });
}
