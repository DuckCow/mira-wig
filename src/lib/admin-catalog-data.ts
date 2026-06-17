// ============================================================
// lib/admin-catalog-data.ts — 어드민 카탈로그 DB 읽기 (서버 전용)
// ============================================================
import "server-only";

import { db } from "@/lib/db";
import type { StyleRow, StyleDetail } from "./admin-catalog.types";

const VARIANT_SELECT = {
  id: true,
  color: true,
  length: true,
  curl: true,
  sku: true,
  stock: true,
  isActive: true,
} as const;

export async function listStyles(): Promise<StyleRow[]> {
  const rows = await db.wigStyle.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      isActive: true,
      _count: { select: { variants: true } },
    },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    isActive: r.isActive,
    variantCount: r._count.variants,
  }));
}

export async function getStyleDetail(id: string): Promise<StyleDetail | null> {
  return db.wigStyle.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      sortOrder: true,
      isActive: true,
      variants: {
        select: VARIANT_SELECT,
        orderBy: { sku: "asc" },
      },
    },
  });
}
