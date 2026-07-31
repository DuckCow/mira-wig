import "server-only";

import { db } from "@/lib/db";
import {
  getEnabledManualRelationPurposes,
  type ManualItemRelationsActivationEnv,
} from "./activation";
import {
  ManualStyleRelationPurpose,
  type ManualRelatedStyle,
  type ManualRelatedStyleGroups,
} from "./types";
import { compareUtf16CodeUnits } from "./validation";

const MAX_PER_PURPOSE = 4;

function emptyGroups(): ManualRelatedStyleGroups {
  return {
    SIMILAR_STYLE: [],
    COMPARE_WITH: [],
  };
}

export async function getManualRelatedStyles(
  sourceStyleId: string,
  marketCode: string,
  env?: ManualItemRelationsActivationEnv,
): Promise<ManualRelatedStyleGroups> {
  const enabledPurposes = getEnabledManualRelationPurposes(marketCode, env);
  if (enabledPurposes.length === 0) return emptyGroups();

  const source = await db.wigStyle.findFirst({
    where: {
      id: sourceStyleId,
      isActive: true,
      availableMarkets: { some: { marketCode, isActive: true } },
    },
    select: { id: true },
  });
  if (!source) return emptyGroups();

  const rows = await db.wigStyleRelation.findMany({
    where: {
      sourceStyleId,
      marketCode,
      isActive: true,
      purpose: { in: enabledPurposes },
      targetStyleId: { not: sourceStyleId },
      targetStyle: {
        isActive: true,
        availableMarkets: { some: { marketCode, isActive: true } },
        variants: {
          some: {
            isActive: true,
            marketPrices: { some: { marketCode } },
          },
        },
      },
    },
    select: {
      purpose: true,
      priority: true,
      targetStyleId: true,
      targetStyle: {
        select: {
          id: true,
          name: true,
          category: true,
          tags: true,
          coverImageKey: true,
          variants: {
            where: {
              isActive: true,
              marketPrices: { some: { marketCode } },
            },
            select: {
              marketPrices: {
                where: { marketCode },
                select: { amount: true },
              },
            },
          },
        },
      },
    },
  });

  rows.sort((left, right) => (
    left.priority - right.priority
    || compareUtf16CodeUnits(left.targetStyleId, right.targetStyleId)
  ));

  const groups = emptyGroups();
  const seenTargetIds = new Set<string>();
  for (const row of rows) {
    if (seenTargetIds.has(row.targetStyleId)) continue;
    const group = groups[row.purpose];
    if (group.length >= MAX_PER_PURPOSE) continue;
    const prices = row.targetStyle.variants.flatMap((variant) => (
      variant.marketPrices.map((price) => price.amount)
    ));
    const basePrice = minPrice(prices);
    if (basePrice === null) continue;
    const style: ManualRelatedStyle = {
      id: row.targetStyle.id,
      name: row.targetStyle.name,
      category: row.targetStyle.category,
      tags: row.targetStyle.tags,
      coverImageKey: row.targetStyle.coverImageKey,
      basePrice,
    };
    group.push(style);
    seenTargetIds.add(row.targetStyleId);
  }
  return groups;
}

function minPrice(prices: number[]): number | null {
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export const MANUAL_RELATED_STYLE_GROUP_ORDER = [
  ManualStyleRelationPurpose.SIMILAR_STYLE,
  ManualStyleRelationPurpose.COMPARE_WITH,
] as const;
