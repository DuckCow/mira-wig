import { randomUUID } from "crypto";
import {
  Prisma,
  WigCategory,
  WigStyleRelationPurpose,
} from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

interface Fixture {
  sourceStyleId: string;
  targetStyleId: string;
  marketA: string;
  marketB: string;
}

describe("manual item relation migration constraints", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    await db.wigStyleRelation.deleteMany({
      where: {
        OR: [
          { sourceStyleId: { startsWith: "relation_schema_" } },
          { targetStyleId: { startsWith: "relation_schema_" } },
        ],
      },
    });
    await db.wigStyle.deleteMany({ where: { id: { startsWith: "relation_schema_" } } });
    await db.market.deleteMany({
      where: { OR: [{ code: { startsWith: "RA_" } }, { code: { startsWith: "RB_" } }] },
    });
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    fixture = {
      sourceStyleId: `relation_schema_source_${suffix}`,
      targetStyleId: `relation_schema_target_${suffix}`,
      marketA: `RA_${suffix}`,
      marketB: `RB_${suffix}`,
    };
    await Promise.all([
      createMarket(fixture.marketA),
      createMarket(fixture.marketB),
      createStyle(fixture.sourceStyleId),
      createStyle(fixture.targetStyleId),
    ]);
  });

  afterEach(async () => {
    await db.wigStyleRelation.deleteMany({
      where: { marketCode: { in: [fixture.marketA, fixture.marketB] } },
    });
    await db.wigStyle.deleteMany({
      where: { id: { in: [fixture.sourceStyleId, fixture.targetStyleId] } },
    });
    await db.market.deleteMany({
      where: { code: { in: [fixture.marketA, fixture.marketB] } },
    });
  });

  it("rejects a self relation", async () => {
    await expectConstraint(
      insertRelation({
        sourceStyleId: fixture.sourceStyleId,
        targetStyleId: fixture.sourceStyleId,
        marketCode: fixture.marketA,
      }),
      "WigStyleRelation_source_target_distinct_check",
    );
  });

  it.each([
    [-1, "WigStyleRelation_priority_lower_check"],
    [10001, "WigStyleRelation_priority_upper_check"],
  ])("rejects priority %d", async (priority, constraint) => {
    await expectConstraint(insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
      priority,
    }), constraint);
  });

  it("accepts both priority bounds", async () => {
    await insertRelation({
      id: relationId("lower"),
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
      priority: 0,
    });
    await insertRelation({
      id: relationId("upper"),
      sourceStyleId: fixture.targetStyleId,
      targetStyleId: fixture.sourceStyleId,
      marketCode: fixture.marketA,
      priority: 10000,
    });
    await expect(db.wigStyleRelation.count({
      where: { marketCode: fixture.marketA },
    })).resolves.toBe(2);
  });

  it.each([
    [null, "null"],
    ["   ", "simple blank"],
  ])("rejects active %s rationale", async (rationale, _label) => {
    await expectConstraint(insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
      isActive: true,
      internalRationale: rationale,
    }), "WigStyleRelation_active_rationale_check");
  });

  it("owns uniqueness across purpose while allowing reverse direction and another market", async () => {
    await insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
      purpose: WigStyleRelationPurpose.SIMILAR_STYLE,
    });
    await expectPrismaCode(insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
      purpose: WigStyleRelationPurpose.COMPARE_WITH,
    }), "P2010");
    await insertRelation({
      sourceStyleId: fixture.targetStyleId,
      targetStyleId: fixture.sourceStyleId,
      marketCode: fixture.marketA,
      purpose: WigStyleRelationPurpose.COMPARE_WITH,
    });
    await insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketB,
      purpose: WigStyleRelationPurpose.COMPARE_WITH,
    });
    await expect(db.wigStyleRelation.count()).resolves.toBeGreaterThanOrEqual(3);
  });

  it("restricts deletion of referenced styles and markets", async () => {
    await insertRelation({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: fixture.marketA,
    });
    await expectConstraint(
      db.wigStyle.delete({ where: { id: fixture.sourceStyleId } }),
      "WigStyleRelation_sourceStyleId_fkey",
    );
    await expectConstraint(
      db.wigStyle.delete({ where: { id: fixture.targetStyleId } }),
      "WigStyleRelation_targetStyleId_fkey",
    );
    await expectConstraint(
      db.market.delete({ where: { code: fixture.marketA } }),
      "WigStyleRelation_marketCode_fkey",
    );
  });
});

async function createMarket(code: string): Promise<void> {
  await db.market.create({
    data: {
      code,
      currency: "KRW",
      shippableCountries: ["KR"],
      defaultLocale: "ko",
    },
  });
}

async function createStyle(id: string): Promise<void> {
  await db.wigStyle.create({
    data: {
      id,
      name: id,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
}

interface RawRelationInput {
  id?: string;
  sourceStyleId: string;
  targetStyleId: string;
  marketCode: string;
  purpose?: WigStyleRelationPurpose;
  priority?: number;
  isActive?: boolean;
  internalRationale?: string | null;
}

async function insertRelation(input: RawRelationInput): Promise<unknown> {
  return db.$executeRaw(Prisma.sql`
    INSERT INTO "WigStyleRelation" (
      "id",
      "sourceStyleId",
      "targetStyleId",
      "marketCode",
      "purpose",
      "priority",
      "isActive",
      "internalRationale",
      "createdByAdminUserId",
      "updatedByAdminUserId",
      "updatedAt"
    ) VALUES (
      ${input.id ?? relationId("row")},
      ${input.sourceStyleId},
      ${input.targetStyleId},
      ${input.marketCode},
      ${(input.purpose ?? WigStyleRelationPurpose.SIMILAR_STYLE)}::"WigStyleRelationPurpose",
      ${input.priority ?? 0},
      ${input.isActive ?? false},
      ${input.internalRationale ?? null},
      'schema-admin',
      'schema-admin',
      CURRENT_TIMESTAMP
    )
  `);
}

function relationId(label: string): string {
  return `relation_schema_${label}_${randomUUID()}`;
}

async function expectConstraint(promise: Promise<unknown>, constraint: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(errorDetails(error)).toContain(constraint);
    return;
  }
  throw new Error(`Expected database constraint ${constraint} to reject the write.`);
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected Prisma error ${code}.`);
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.code}\n${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}
