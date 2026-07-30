import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ManualStyleRelationException,
  type AdminManualStyleRelation,
  type CreateManualStyleRelationInput,
  type ManualRelationDiagnostic,
  type ManualRelationTargetChoice,
  type UpdateManualStyleRelationInput,
} from "./types";
import {
  assertActiveRationale,
  assertManualRelationPriority,
  assertManualRelationPurpose,
  compareUtf16CodeUnits,
  normalizeManualRelationRationale,
} from "./validation";

function normalizeRequiredIdentifier(
  value: unknown,
  code:
    | "INVALID_ACTOR"
    | "RELATION_NOT_FOUND"
    | "SOURCE_STYLE_NOT_FOUND"
    | "TARGET_STYLE_NOT_FOUND"
    | "MARKET_NOT_FOUND",
): string {
  if (typeof value !== "string") {
    throw new ManualStyleRelationException(code, "A required identifier is invalid.");
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new ManualStyleRelationException(code, "A required identifier is blank.");
  }
  return normalized;
}

function isDuplicateRelationError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function assertRelationReferences(
  sourceStyleId: string,
  targetStyleId: string,
  marketCode: string,
): Promise<void> {
  const [source, target, market] = await Promise.all([
    db.wigStyle.findUnique({ where: { id: sourceStyleId }, select: { id: true } }),
    db.wigStyle.findUnique({ where: { id: targetStyleId }, select: { id: true } }),
    db.market.findUnique({ where: { code: marketCode }, select: { code: true } }),
  ]);
  if (!source) {
    throw new ManualStyleRelationException("SOURCE_STYLE_NOT_FOUND", "Source style was not found.");
  }
  if (!target) {
    throw new ManualStyleRelationException("TARGET_STYLE_NOT_FOUND", "Target style was not found.");
  }
  if (!market) {
    throw new ManualStyleRelationException("MARKET_NOT_FOUND", "Market was not found.");
  }
}

export async function createManualStyleRelation(
  actorUserIdValue: string,
  input: CreateManualStyleRelationInput,
): Promise<{ id: string }> {
  const actorUserId = normalizeRequiredIdentifier(actorUserIdValue, "INVALID_ACTOR");
  const sourceStyleId = normalizeRequiredIdentifier(input.sourceStyleId, "SOURCE_STYLE_NOT_FOUND");
  const targetStyleId = normalizeRequiredIdentifier(input.targetStyleId, "TARGET_STYLE_NOT_FOUND");
  const marketCode = normalizeRequiredIdentifier(input.marketCode, "MARKET_NOT_FOUND");
  if (sourceStyleId === targetStyleId) {
    throw new ManualStyleRelationException("SELF_RELATION", "A style cannot relate to itself.");
  }
  assertManualRelationPurpose(input.purpose);
  assertManualRelationPriority(input.priority);
  const internalRationale = normalizeManualRelationRationale(input.internalRationale);
  await assertRelationReferences(sourceStyleId, targetStyleId, marketCode);

  const duplicate = await db.wigStyleRelation.findUnique({
    where: { sourceStyleId_targetStyleId_marketCode: { sourceStyleId, targetStyleId, marketCode } },
    select: { id: true },
  });
  if (duplicate) {
    throw new ManualStyleRelationException(
      "RELATION_DUPLICATE",
      "The directed style relation already exists for this market.",
    );
  }

  try {
    return await db.wigStyleRelation.create({
      data: {
        sourceStyleId,
        targetStyleId,
        marketCode,
        purpose: input.purpose,
        priority: input.priority,
        isActive: false,
        internalRationale,
        createdByAdminUserId: actorUserId,
        updatedByAdminUserId: actorUserId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isDuplicateRelationError(error)) {
      throw new ManualStyleRelationException(
        "RELATION_DUPLICATE",
        "The directed style relation already exists for this market.",
      );
    }
    throw error;
  }
}

export async function updateManualStyleRelation(
  actorUserIdValue: string,
  relationIdValue: string,
  input: UpdateManualStyleRelationInput,
): Promise<{ sourceStyleId: string }> {
  const actorUserId = normalizeRequiredIdentifier(actorUserIdValue, "INVALID_ACTOR");
  const relationId = normalizeRequiredIdentifier(relationIdValue, "RELATION_NOT_FOUND");
  const existing = await db.wigStyleRelation.findUnique({
    where: { id: relationId },
    select: {
      purpose: true,
      priority: true,
      internalRationale: true,
      isActive: true,
      sourceStyleId: true,
    },
  });
  if (!existing) {
    throw new ManualStyleRelationException("RELATION_NOT_FOUND", "Manual style relation was not found.");
  }

  const purpose = input.purpose ?? existing.purpose;
  const priority = input.priority ?? existing.priority;
  const internalRationale = Object.hasOwn(input, "internalRationale")
    ? normalizeManualRelationRationale(input.internalRationale)
    : existing.internalRationale;
  assertManualRelationPurpose(purpose);
  assertManualRelationPriority(priority);
  if (existing.isActive) assertActiveRationale(internalRationale);

  await db.wigStyleRelation.update({
    where: { id: relationId },
    data: {
      purpose,
      priority,
      internalRationale,
      updatedByAdminUserId: actorUserId,
    },
  });
  return { sourceStyleId: existing.sourceStyleId };
}

export async function setManualStyleRelationActive(
  actorUserIdValue: string,
  relationIdValue: string,
  isActive: boolean,
): Promise<{ sourceStyleId: string }> {
  const actorUserId = normalizeRequiredIdentifier(actorUserIdValue, "INVALID_ACTOR");
  const relationId = normalizeRequiredIdentifier(relationIdValue, "RELATION_NOT_FOUND");
  if (!isActive) {
    const existing = await db.wigStyleRelation.findUnique({
      where: { id: relationId },
      select: { sourceStyleId: true },
    });
    if (!existing) {
      throw new ManualStyleRelationException(
        "RELATION_NOT_FOUND",
        "Manual style relation was not found.",
      );
    }
    await db.wigStyleRelation.update({
      where: { id: relationId },
      data: { isActive: false, updatedByAdminUserId: actorUserId },
    });
    return existing;
  }

  return db.$transaction(async (transaction) => {
    const relation = await transaction.wigStyleRelation.findUnique({
      where: { id: relationId },
      select: {
        sourceStyleId: true,
        targetStyleId: true,
        marketCode: true,
        internalRationale: true,
      },
    });
    if (!relation) {
      throw new ManualStyleRelationException(
        "RELATION_NOT_FOUND",
        "Manual style relation was not found.",
      );
    }
    const normalizedRationale = normalizeManualRelationRationale(relation.internalRationale);
    assertActiveRationale(normalizedRationale);

    const market = await transaction.market.findUnique({
      where: { code: relation.marketCode },
      select: { code: true },
    });
    if (!market) {
      throw new ManualStyleRelationException("MARKET_NOT_FOUND", "Market was not found.");
    }
    const source = await transaction.wigStyle.findUnique({
      where: { id: relation.sourceStyleId },
      select: {
        isActive: true,
        availableMarkets: {
          where: { marketCode: relation.marketCode, isActive: true },
          select: { marketCode: true },
        },
      },
    });
    if (!source) {
      throw new ManualStyleRelationException("SOURCE_STYLE_NOT_FOUND", "Source style was not found.");
    }
    if (!source.isActive || source.availableMarkets.length === 0) {
      throw new ManualStyleRelationException(
        "SOURCE_NOT_PUBLISHED",
        "Source style is not active and published in the relation market.",
      );
    }
    const target = await transaction.wigStyle.findUnique({
      where: { id: relation.targetStyleId },
      select: {
        isActive: true,
        availableMarkets: {
          where: { marketCode: relation.marketCode, isActive: true },
          select: { marketCode: true },
        },
        variants: {
          where: {
            isActive: true,
            marketPrices: { some: { marketCode: relation.marketCode } },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!target) {
      throw new ManualStyleRelationException("TARGET_STYLE_NOT_FOUND", "Target style was not found.");
    }
    if (!target.isActive || target.availableMarkets.length === 0) {
      throw new ManualStyleRelationException(
        "TARGET_NOT_PUBLISHED",
        "Target style is not active and published in the relation market.",
      );
    }
    if (target.variants.length === 0) {
      throw new ManualStyleRelationException(
        "TARGET_NO_ACTIVE_PRICED_VARIANT",
        "Target style has no active variant priced in the relation market.",
      );
    }

    await transaction.wigStyleRelation.update({
      where: { id: relationId },
      data: {
        isActive: true,
        internalRationale: normalizedRationale,
        updatedByAdminUserId: actorUserId,
      },
    });
    return { sourceStyleId: relation.sourceStyleId };
  });
}

function relationDiagnostic(
  targetIsActive: boolean,
  targetMarketIsActive: boolean,
  targetHasActivePricedVariant: boolean,
): ManualRelationDiagnostic {
  if (!targetIsActive) return "TARGET_GLOBALLY_INACTIVE";
  if (!targetMarketIsActive) return "TARGET_NOT_PUBLISHED";
  if (!targetHasActivePricedVariant) return "TARGET_NO_ACTIVE_PRICED_VARIANT";
  return "READY";
}

export async function getAdminManualStyleRelations(
  sourceStyleId: string,
  marketCode: string,
): Promise<AdminManualStyleRelation[]> {
  const rows = await db.wigStyleRelation.findMany({
    where: { sourceStyleId, marketCode },
    select: {
      id: true,
      sourceStyleId: true,
      targetStyleId: true,
      marketCode: true,
      purpose: true,
      priority: true,
      isActive: true,
      internalRationale: true,
      targetStyle: {
        select: {
          name: true,
          isActive: true,
          availableMarkets: {
            where: { marketCode, isActive: true },
            select: { marketCode: true },
          },
          variants: {
            where: {
              isActive: true,
              marketPrices: { some: { marketCode } },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  return rows
    .map((row) => {
      const targetMarketIsActive = row.targetStyle.availableMarkets.length > 0;
      const targetHasActivePricedVariant = row.targetStyle.variants.length > 0;
      return {
        id: row.id,
        sourceStyleId: row.sourceStyleId,
        targetStyleId: row.targetStyleId,
        marketCode: row.marketCode,
        targetName: row.targetStyle.name,
        targetIsActive: row.targetStyle.isActive,
        targetMarketIsActive,
        targetHasActivePricedVariant,
        purpose: row.purpose,
        priority: row.priority,
        isActive: row.isActive,
        internalRationale: row.internalRationale,
        diagnostic: relationDiagnostic(
          row.targetStyle.isActive,
          targetMarketIsActive,
          targetHasActivePricedVariant,
        ),
      };
    })
    .sort((left, right) => (
      left.priority - right.priority
      || compareUtf16CodeUnits(left.targetStyleId, right.targetStyleId)
    ));
}

export async function getManualRelationTargetChoices(
  sourceStyleId: string,
  marketCode: string,
): Promise<ManualRelationTargetChoice[]> {
  const related = await db.wigStyleRelation.findMany({
    where: { sourceStyleId, marketCode },
    select: { targetStyleId: true },
  });
  const excludedIds = [sourceStyleId, ...related.map((row) => row.targetStyleId)];
  const styles = await db.wigStyle.findMany({
    where: { id: { notIn: excludedIds } },
    select: {
      id: true,
      name: true,
      isActive: true,
      availableMarkets: {
        where: { marketCode, isActive: true },
        select: { marketCode: true },
      },
      variants: {
        where: {
          isActive: true,
          marketPrices: { some: { marketCode } },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  return styles
    .map((style) => ({
      id: style.id,
      name: style.name,
      isActive: style.isActive,
      marketIsActive: style.availableMarkets.length > 0,
      hasActivePricedVariant: style.variants.length > 0,
    }))
    .sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
}
