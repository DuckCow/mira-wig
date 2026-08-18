"use server";

// ============================================================
// app/actions/admin/catalog.ts — 어드민 카탈로그 서버 액션 (thin wrapper)
// ------------------------------------------------------------
// 모든 액션: requireAdmin → lib 위임 → errorCode 매핑.
// 이미지·마켓 가격(VariantMarketPrice/WigStyleMarket)은 별도 작업.
// ============================================================

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { catalogStorage } from "@/lib/storage";
import {
  createWigStyle,
  updateWigStyle,
  deactivateWigStyle,
  createWigVariant,
  updateWigVariant,
  updateVariantStock,
  deactivateWigVariant,
  CatalogAdminException,
  type CatalogAdminErrorCode,
  type CreateStyleInput,
  type UpdateStyleInput,
  type CreateVariantInput,
  type UpdateVariantInput,
} from "@/lib/catalog-admin";

// ── 공통 타입 ─────────────────────────────────────────────────

type AdminErrorCode = CatalogAdminErrorCode | "UNAUTHENTICATED" | "FORBIDDEN" | "UNSUPPORTED_TYPE";

type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | ({ success: true } & T)
  | { success: false; errorCode: AdminErrorCode };

function handleError(e: unknown): { success: false; errorCode: AdminErrorCode } {
  if (e instanceof CatalogAdminException) return { success: false, errorCode: e.code };
  throw e;
}

const ADMIN_PATH = "/admin/styles";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// ── 이미지 업로드 액션 ────────────────────────────────────────

export async function getCoverImageUploadUrlAction(
  contentType: string,
): Promise<ActionResult<{ uploadUrl: string; key: string; requiredHeaders: Record<string, string> }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return { success: false, errorCode: "UNSUPPORTED_TYPE" };
  }
  const result = await catalogStorage.getUploadUrl({ purpose: "wig-style", contentType });
  return {
    success: true,
    uploadUrl: result.uploadUrl,
    key: result.key,
    requiredHeaders: result.requiredHeaders ?? {},
  };
}

// ── WigStyle 액션 ─────────────────────────────────────────────

export async function createStyleAction(
  input: CreateStyleInput,
): Promise<ActionResult<{ styleId: string }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const { id } = await createWigStyle(input);
    revalidatePath(ADMIN_PATH);
    return { success: true, styleId: id };
  } catch (e) {
    return handleError(e);
  }
}

export async function updateStyleAction(
  styleId: string,
  input: UpdateStyleInput,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await updateWigStyle(styleId, input, catalogStorage);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}

export async function deactivateStyleAction(styleId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await deactivateWigStyle(styleId);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}

// ── WigVariant 액션 ───────────────────────────────────────────

export async function createVariantAction(
  input: CreateVariantInput,
): Promise<ActionResult<{ variantId: string }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const { id } = await createWigVariant(input);
    revalidatePath(ADMIN_PATH);
    return { success: true, variantId: id };
  } catch (e) {
    return handleError(e);
  }
}

export async function updateVariantAction(
  variantId: string,
  input: UpdateVariantInput,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await updateWigVariant(variantId, input);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}

export async function updateStockAction(
  variantId: string,
  stock: number,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await updateVariantStock(variantId, stock);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}

export async function deactivateVariantAction(variantId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await deactivateWigVariant(variantId);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}
