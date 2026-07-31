import { randomUUID } from "crypto";
import { WigCategory } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  createManualStyleRelation,
  getAdminManualStyleRelations,
  getManualRelationTargetChoices,
  setManualStyleRelationActive,
  updateManualStyleRelation,
} from "../admin";
import {
  ManualStyleRelationException,
  type ManualStyleRelationErrorCode,
} from "../types";

interface Fixture {
  styleIds: string[];
  sourceStyleId: string;
  targetStyleId: string;
}

describe("manual item relation admin service", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    const suffix = randomUUID();
    fixture = {
      styleIds: [],
      sourceStyleId: `relation_admin_source_${suffix}`,
      targetStyleId: `relation_admin_target_${suffix}`,
    };
    fixture.styleIds.push(fixture.sourceStyleId, fixture.targetStyleId);
    await ensureMarkets();
    await Promise.all([
      createStyle(fixture.sourceStyleId),
      createStyle(fixture.targetStyleId),
    ]);
  });

  afterEach(async () => {
    await db.wigStyleRelation.deleteMany({
      where: {
        OR: [
          { sourceStyleId: { in: fixture.styleIds } },
          { targetStyleId: { in: fixture.styleIds } },
        ],
      },
    });
    await db.wigStyle.deleteMany({ where: { id: { in: fixture.styleIds } } });
  });

  it("creates a normalized inactive draft with immutable actor snapshots", async () => {
    const created = await createDraft(fixture, {
      actor: " authenticated-admin ",
      internalRationale: "  편집 검토 완료  ",
    });
    const row = await db.wigStyleRelation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      isActive: false,
      internalRationale: "편집 검토 완료",
      createdByAdminUserId: "authenticated-admin",
      updatedByAdminUserId: "authenticated-admin",
    });
  });

  it("rejects self, blank actor, and missing source/target/market references", async () => {
    await expectRelationCode(createManualStyleRelation("admin", {
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.sourceStyleId,
      marketCode: "KR",
      purpose: "SIMILAR_STYLE",
      priority: 0,
    }), "SELF_RELATION");
    await expectRelationCode(createDraft(fixture, { actor: " " }), "INVALID_ACTOR");
    await expectRelationCode(createDraft(fixture, {
      sourceStyleId: "missing-source",
    }), "SOURCE_STYLE_NOT_FOUND");
    await expectRelationCode(createDraft(fixture, {
      targetStyleId: "missing-target",
    }), "TARGET_STYLE_NOT_FOUND");
    await expectRelationCode(createDraft(fixture, {
      marketCode: "missing-market",
    }), "MARKET_NOT_FOUND");
  });

  it("rejects a duplicate tuple but allows reverse direction and another market", async () => {
    await createDraft(fixture);
    await expectRelationCode(createDraft(fixture, {
      purpose: "COMPARE_WITH",
    }), "RELATION_DUPLICATE");
    await createManualStyleRelation("admin", {
      sourceStyleId: fixture.targetStyleId,
      targetStyleId: fixture.sourceStyleId,
      marketCode: "KR",
      purpose: "COMPARE_WITH",
      priority: 1,
    });
    await createDraft(fixture, { marketCode: "US" });
    await expect(db.wigStyleRelation.count({
      where: {
        OR: [
          { sourceStyleId: fixture.sourceStyleId },
          { sourceStyleId: fixture.targetStyleId },
        ],
      },
    })).resolves.toBe(3);
  });

  it("updates only mutable editorial fields and revalidates active rationale", async () => {
    const created = await createDraft(fixture, { internalRationale: "활성 근거" });
    await makeEligible(fixture.sourceStyleId);
    await makeEligible(fixture.targetStyleId);
    await setManualStyleRelationActive("activator", created.id, true);
    await updateManualStyleRelation("editor", created.id, {
      purpose: "COMPARE_WITH",
      priority: 10000,
      internalRationale: "  갱신 근거  ",
    });
    await expectRelationCode(updateManualStyleRelation("editor", created.id, {
      internalRationale: "  ",
    }), "RATIONALE_REQUIRED");
    const row = await db.wigStyleRelation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      sourceStyleId: fixture.sourceStyleId,
      targetStyleId: fixture.targetStyleId,
      marketCode: "KR",
      purpose: "COMPARE_WITH",
      priority: 10000,
      internalRationale: "갱신 근거",
      updatedByAdminUserId: "editor",
    });
  });

  it("deactivation is idempotent and preserves editorial data", async () => {
    const created = await createDraft(fixture, { internalRationale: "보존 근거" });
    await setManualStyleRelationActive("deactivator", created.id, false);
    await setManualStyleRelationActive("deactivator", created.id, false);
    const row = await db.wigStyleRelation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      isActive: false,
      internalRationale: "보존 근거",
      updatedByAdminUserId: "deactivator",
    });
  });

  it("rejects invalid active-state inputs before changing relation state or snapshots", async () => {
    const created = await createDraft(fixture, { internalRationale: "보존 근거" });
    const before = await db.wigStyleRelation.findUniqueOrThrow({
      where: { id: created.id },
    });
    const findRelation = vi.spyOn(db.wigStyleRelation, "findUnique");
    const updateRelation = vi.spyOn(db.wigStyleRelation, "update");
    const beginTransaction = vi.spyOn(db, "$transaction");

    try {
      for (const invalidState of ["false", 1]) {
        await expectRelationCode(
          setManualStyleRelationActive("forged-transition-actor", created.id, invalidState),
          "INVALID_ACTIVE_STATE",
        );
      }
      expect(findRelation).not.toHaveBeenCalled();
      expect(updateRelation).not.toHaveBeenCalled();
      expect(beginTransaction).not.toHaveBeenCalled();
    } finally {
      findRelation.mockRestore();
      updateRelation.mockRestore();
      beginTransaction.mockRestore();
    }

    const after = await db.wigStyleRelation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after).toMatchObject({
      isActive: false,
      internalRationale: before.internalRationale,
      updatedByAdminUserId: before.updatedByAdminUserId,
      updatedAt: before.updatedAt,
    });
  });

  it("requires active and exact-market published source and target styles", async () => {
    const created = await createDraft(fixture, { internalRationale: "활성 근거" });
    await expectRelationCode(
      setManualStyleRelationActive("admin", created.id, true),
      "SOURCE_NOT_PUBLISHED",
    );
    await db.wigStyle.update({
      where: { id: fixture.sourceStyleId },
      data: { isActive: false },
    });
    await publishStyle(fixture.sourceStyleId, "KR");
    await expectRelationCode(
      setManualStyleRelationActive("admin", created.id, true),
      "SOURCE_NOT_PUBLISHED",
    );
    await db.wigStyle.update({
      where: { id: fixture.sourceStyleId },
      data: { isActive: true },
    });
    await expectRelationCode(
      setManualStyleRelationActive("admin", created.id, true),
      "TARGET_NOT_PUBLISHED",
    );
    await db.wigStyle.update({
      where: { id: fixture.targetStyleId },
      data: { isActive: false },
    });
    await publishStyle(fixture.targetStyleId, "KR");
    await expectRelationCode(
      setManualStyleRelationActive("admin", created.id, true),
      "TARGET_NOT_PUBLISHED",
    );
  });

  it("rejects split active/priced witnesses and accepts one same active priced variant at stock zero", async () => {
    const created = await createDraft(fixture, { internalRationale: "활성 근거" });
    await publishStyle(fixture.sourceStyleId, "KR");
    await publishStyle(fixture.targetStyleId, "KR");
    await createVariant(fixture.targetStyleId, { isActive: true, priced: false, stock: 0 });
    await createVariant(fixture.targetStyleId, { isActive: false, priced: true, stock: 5 });
    await expectRelationCode(
      setManualStyleRelationActive("admin", created.id, true),
      "TARGET_NO_ACTIVE_PRICED_VARIANT",
    );
    const eligibleVariantId = await createVariant(fixture.targetStyleId, {
      isActive: true,
      priced: true,
      stock: 0,
    });
    await setManualStyleRelationActive("admin", created.id, true);
    const [relation, variant] = await Promise.all([
      db.wigStyleRelation.findUniqueOrThrow({ where: { id: created.id } }),
      db.wigVariant.findUniqueOrThrow({ where: { id: eligibleVariantId } }),
    ]);
    expect(relation.isActive).toBe(true);
    expect(variant.stock).toBe(0);
  });

  it("lists deterministic diagnostics and excludes source/already-related target choices", async () => {
    await createDraft(fixture, { priority: 5 });
    const candidateId = `relation_admin_candidate_${randomUUID()}`;
    fixture.styleIds.push(candidateId);
    await createStyle(candidateId);
    const [relations, choices] = await Promise.all([
      getAdminManualStyleRelations(fixture.sourceStyleId, "KR"),
      getManualRelationTargetChoices(fixture.sourceStyleId, "KR"),
    ]);
    expect(relations[0]).toMatchObject({
      targetStyleId: fixture.targetStyleId,
      diagnostic: "TARGET_NOT_PUBLISHED",
    });
    expect(choices.map((choice) => choice.id)).toContain(candidateId);
    expect(choices.map((choice) => choice.id)).not.toContain(fixture.sourceStyleId);
    expect(choices.map((choice) => choice.id)).not.toContain(fixture.targetStyleId);
    expect(choices.find((choice) => choice.id === candidateId)).toMatchObject({
      isActive: true,
      marketIsActive: false,
      hasActivePricedVariant: false,
    });
  });
});

interface DraftOverrides {
  actor?: string;
  sourceStyleId?: string;
  targetStyleId?: string;
  marketCode?: string;
  purpose?: "SIMILAR_STYLE" | "COMPARE_WITH";
  priority?: number;
  internalRationale?: string | null;
}

async function createDraft(fixture: Fixture, override: DraftOverrides = {}) {
  return createManualStyleRelation(override.actor ?? "admin", {
    sourceStyleId: override.sourceStyleId ?? fixture.sourceStyleId,
    targetStyleId: override.targetStyleId ?? fixture.targetStyleId,
    marketCode: override.marketCode ?? "KR",
    purpose: override.purpose ?? "SIMILAR_STYLE",
    priority: override.priority ?? 0,
    internalRationale: override.internalRationale,
  });
}

async function ensureMarkets(): Promise<void> {
  await Promise.all(["KR", "US"].map((code) => db.market.upsert({
    where: { code },
    create: {
      code,
      currency: code === "KR" ? "KRW" : "USD",
      shippableCountries: [code],
      defaultLocale: code === "KR" ? "ko" : "en",
    },
    update: {},
  })));
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

async function publishStyle(styleId: string, marketCode: string): Promise<void> {
  await db.wigStyleMarket.upsert({
    where: { wigStyleId_marketCode: { wigStyleId: styleId, marketCode } },
    create: { wigStyleId: styleId, marketCode, isActive: true },
    update: { isActive: true },
  });
}

async function makeEligible(styleId: string): Promise<void> {
  await publishStyle(styleId, "KR");
  await createVariant(styleId, { isActive: true, priced: true, stock: 0 });
}

async function createVariant(
  styleId: string,
  options: { isActive: boolean; priced: boolean; stock: number },
): Promise<string> {
  const id = `relation_admin_variant_${randomUUID()}`;
  await db.wigVariant.create({
    data: {
      id,
      wigStyleId: styleId,
      color: "black",
      length: "medium",
      curl: "straight",
      price: 999999,
      stock: options.stock,
      sku: `REL-${randomUUID()}`,
      isActive: options.isActive,
      ...(options.priced && {
        marketPrices: {
          create: { marketCode: "KR", amount: 85000 },
        },
      }),
    },
  });
  return id;
}

async function expectRelationCode(
  promise: Promise<unknown>,
  code: ManualStyleRelationErrorCode,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ManualStyleRelationException);
    if (error instanceof ManualStyleRelationException) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected manual relation error ${code}.`);
}
