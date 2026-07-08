// ============================================================
// lib/catalog-admin/market-price.ts — 마켓 가격·가용성 쓰기 계층 (STRICT 존, 서버 전용)
// ------------------------------------------------------------
// VariantMarketPrice upsert / WigStyleMarket 토글 / 갭 진단.
// 금액은 최소단위 정수 (§4): KRW/JPY zero-decimal, USD 센트.
// 고객 노출 마켓 가격은 최소 1 minor unit 이상이어야 한다.
// 명시적 무료상품/할인/배송비 설계 전까지 bare 0 가격은 임시 차단한다.
// ×100 변환 절대 금지 — 받은 정수를 그대로 저장.
// ============================================================
import "server-only";

import { db } from "@/lib/db";
import { isMarketCode, MARKET_CONFIGS } from "@/lib/market/types";
import {
  CatalogAdminException,
  type SetVariantPriceEntry,
  type PriceWarning,
  type PriceGapItem,
} from "./types";

// ── 내부 헬퍼 ────────────────────────────────────────────────

function assertValidAmount(amount: number, currencyCode: string): void {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new CatalogAdminException(
      "INVALID_AMOUNT",
      `${currencyCode} 금액은 1 이상의 정수여야 합니다. 받은 값: ${String(amount)}`,
    );
  }
}

function assertValidMarketCode(code: string): asserts code is keyof typeof MARKET_CONFIGS {
  if (!isMarketCode(code)) {
    throw new CatalogAdminException("MARKET_NOT_FOUND", `유효하지 않은 마켓 코드: ${code}`);
  }
}

// ── VariantMarketPrice ────────────────────────────────────────

/**
 * variant의 마켓별 가격을 일괄 upsert한다.
 * entries 배열 길이 1로 단일 마켓만 변경하는 케이스도 커버.
 * 금액은 1 이상의 최소단위 정수(§4) — KRW 85000, USD 7799, JPY 9800.
 */
export async function setVariantPrices(
  variantId: string,
  entries: SetVariantPriceEntry[],
): Promise<void> {
  const variant = await db.wigVariant.findUnique({ where: { id: variantId }, select: { id: true } });
  if (!variant) throw new CatalogAdminException("VARIANT_NOT_FOUND", "변형을 찾을 수 없습니다.");

  for (const entry of entries) {
    assertValidMarketCode(entry.marketCode);
    const currencyCode = MARKET_CONFIGS[entry.marketCode].currency.code;
    assertValidAmount(entry.amount, currencyCode);
  }

  await Promise.all(
    entries.map((entry) =>
      db.variantMarketPrice.upsert({
        where: { variantId_marketCode: { variantId, marketCode: entry.marketCode } },
        create: { variantId, marketCode: entry.marketCode, amount: entry.amount },
        update: { amount: entry.amount },
      }),
    ),
  );
}

// ── WigStyleMarket ────────────────────────────────────────────

/**
 * 스타일×마켓 가용성 토글.
 * 활성화(isActive=true) 시 가격이 없는 활성 variant를 경고로 반환.
 * 경고가 있어도 토글은 성공 — 차단(hard block) 없음.
 * 비활성화는 경고 없음.
 */
export async function setStyleMarketAvailability(
  wigStyleId: string,
  marketCode: string,
  isActive: boolean,
): Promise<PriceWarning[]> {
  assertValidMarketCode(marketCode);
  const style = await db.wigStyle.findUnique({ where: { id: wigStyleId }, select: { id: true } });
  if (!style) throw new CatalogAdminException("STYLE_NOT_FOUND", "스타일을 찾을 수 없습니다.");

  await db.wigStyleMarket.upsert({
    where: { wigStyleId_marketCode: { wigStyleId, marketCode } },
    create: { wigStyleId, marketCode, isActive },
    update: { isActive },
  });

  if (!isActive) return [];

  const variants = await db.wigVariant.findMany({
    where: { wigStyleId, isActive: true },
    select: {
      id: true,
      sku: true,
      marketPrices: { where: { marketCode }, select: { marketCode: true } },
    },
  });

  return variants
    .filter((v) => v.marketPrices.length === 0)
    .map((v) => ({ variantId: v.id, sku: v.sku, marketCode }));
}

// ── 갭 진단 ──────────────────────────────────────────────────

/**
 * WigStyleMarket.isActive=true 이지만 활성 variant 중 해당 마켓
 * 가격(VariantMarketPrice)이 없는 조합을 반환한다.
 * 읽기 전용 — 데이터 변경 없음.
 * 관계 쿼리 + in-memory 필터: Prisma nested include는 per-row where
 * 지원 불가이므로 marketPrices 전체를 fetch 후 JS에서 확인.
 */
export async function findMarketPriceGaps(): Promise<PriceGapItem[]> {
  const activeStyleMarkets = await db.wigStyleMarket.findMany({
    where: { isActive: true },
    select: {
      wigStyleId: true,
      marketCode: true,
      wigStyle: {
        select: {
          name: true,
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              sku: true,
              marketPrices: { select: { marketCode: true } },
            },
          },
        },
      },
    },
  });

  const gaps: PriceGapItem[] = [];
  for (const wsm of activeStyleMarkets) {
    for (const variant of wsm.wigStyle.variants) {
      const hasPrice = variant.marketPrices.some((p) => p.marketCode === wsm.marketCode);
      if (!hasPrice) {
        gaps.push({
          wigStyleId: wsm.wigStyleId,
          styleName: wsm.wigStyle.name,
          marketCode: wsm.marketCode,
          variantId: variant.id,
          sku: variant.sku,
        });
      }
    }
  }
  return gaps;
}
