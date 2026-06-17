"use server";

// ============================================================
// app/actions/admin/market-price.ts — 마켓 가격·가용성 어드민 액션
// ------------------------------------------------------------
// requireAdmin → lib 위임 → errorCode 매핑.
// setStyleMarketAvailabilityAction은 warnings를 함께 반환(차단 없음).
// findMarketPriceGapsAction은 읽기 전용 — 갭 진단.
// ============================================================

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { CatalogAdminException, type CatalogAdminErrorCode } from "@/lib/catalog-admin/types";
import {
  setVariantPrices,
  setStyleMarketAvailability,
  findMarketPriceGaps,
} from "@/lib/catalog-admin/market-price";
import type {
  SetVariantPriceEntry,
  PriceWarning,
  PriceGapItem,
} from "@/lib/catalog-admin/types";

// ── 공통 타입 ─────────────────────────────────────────────────

type AdminErrorCode = CatalogAdminErrorCode | "UNAUTHENTICATED" | "FORBIDDEN";

type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | ({ success: true } & T)
  | { success: false; errorCode: AdminErrorCode };

function handleError(e: unknown): { success: false; errorCode: AdminErrorCode } {
  if (e instanceof CatalogAdminException) return { success: false, errorCode: e.code };
  throw e;
}

const ADMIN_PATH = "/admin/styles";

// ── VariantMarketPrice 액션 ───────────────────────────────────

/**
 * variant의 마켓별 가격을 일괄 upsert한다.
 * entries 길이 1로 단일 마켓만 변경하는 케이스도 커버.
 */
export async function setVariantPricesAction(
  variantId: string,
  entries: SetVariantPriceEntry[],
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    await setVariantPrices(variantId, entries);
    revalidatePath(ADMIN_PATH);
    return { success: true };
  } catch (e) {
    return handleError(e);
  }
}

// ── WigStyleMarket 액션 ───────────────────────────────────────

/**
 * 스타일×마켓 가용성 토글.
 * 활성화 시 가격 없는 variant를 warnings로 반환 — 토글 자체는 성공.
 */
export async function setStyleMarketAvailabilityAction(
  wigStyleId: string,
  marketCode: string,
  isActive: boolean,
): Promise<ActionResult<{ warnings: PriceWarning[] }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const warnings = await setStyleMarketAvailability(wigStyleId, marketCode, isActive);
    revalidatePath(ADMIN_PATH);
    return { success: true, warnings };
  } catch (e) {
    return handleError(e);
  }
}

// ── 갭 진단 액션 ──────────────────────────────────────────────

/**
 * isActive=true 스타일×마켓 중 가격이 없는 variant 목록 반환.
 * 읽기 전용 — DB 변경 없음. DB 에러는 re-throw.
 */
export async function findMarketPriceGapsAction(): Promise<ActionResult<{ gaps: PriceGapItem[] }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const gaps = await findMarketPriceGaps();
  return { success: true, gaps };
}
