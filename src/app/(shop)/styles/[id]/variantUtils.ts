// ============================================================
// 상세 페이지 variant 선택 로직 — 순수 유틸 (클라이언트 safe)
// ============================================================

import type { WigVariantDetail } from "@/lib/catalog.types";

export interface Selection {
  color: string | null;
  length: string | null;
  curl: string | null;
}

// 색상 목록 (중복 제거, 첫 등장 순서 유지)
export function getAvailableColors(
  variants: WigVariantDetail[],
): WigVariantDetail[] {
  const seen = new Set<string>();
  return variants.filter((v) => {
    if (seen.has(v.color)) return false;
    seen.add(v.color);
    return true;
  });
}

// 선택한 색상에서 가능한 길이 목록
export function getAvailableLengths(
  variants: WigVariantDetail[],
  color: string | null,
): string[] {
  if (!color) return [];
  return [...new Set(variants.filter((v) => v.color === color).map((v) => v.length))];
}

// 선택한 색상+길이에서 가능한 컬 목록
export function getAvailableCurls(
  variants: WigVariantDetail[],
  color: string | null,
  length: string | null,
): string[] {
  if (!color || !length) return [];
  return [
    ...new Set(
      variants.filter((v) => v.color === color && v.length === length).map((v) => v.curl),
    ),
  ];
}

// 3가지 선택이 완료됐을 때 해당 variant 반환
export function findSelectedVariant(
  variants: WigVariantDetail[],
  sel: Selection,
): WigVariantDetail | null {
  if (!sel.color || !sel.length || !sel.curl) return null;
  return (
    variants.find(
      (v) => v.color === sel.color && v.length === sel.length && v.curl === sel.curl,
    ) ?? null
  );
}
