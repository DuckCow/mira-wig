import { randomUUID } from "crypto";
import { WigCategory } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getManualRelatedStyles } from "../public";

interface Fixture {
  styleIds: string[];
  sourceStyleId: string;
  targetStyleId: string;
}

describe("manual related styles public read", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    const suffix = randomUUID();
    fixture = {
      styleIds: [],
      sourceStyleId: `relation_public_source_${suffix}`,
      targetStyleId: `relation_public_target_${suffix}`,
    };
    fixture.styleIds.push(fixture.sourceStyleId, fixture.targetStyleId);
    await ensureMarket();
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

  it("hides missing, globally inactive, and wrong-market source contexts", async () => {
    await expect(read("missing-source")).resolves.toEqual(emptyGroups());
    await createActiveRelation(fixture.sourceStyleId, fixture.targetStyleId, 0);
    await makeEligibleTarget(fixture.targetStyleId, { active: true, priced: true });
    await expect(read(fixture.sourceStyleId)).resolves.toEqual(emptyGroups());
    await publishStyle(fixture.sourceStyleId);
    await db.wigStyle.update({
      where: { id: fixture.sourceStyleId },
      data: { isActive: false },
    });
    await expect(read(fixture.sourceStyleId)).resolves.toEqual(emptyGroups());
  });

  it("omits globally inactive, wrong-market, and split-witness targets", async () => {
    await publishStyle(fixture.sourceStyleId);
    await createActiveRelation(fixture.sourceStyleId, fixture.targetStyleId, 0);
    await expect(read(fixture.sourceStyleId)).resolves.toEqual(emptyGroups());
    await publishStyle(fixture.targetStyleId);
    await db.wigStyle.update({
      where: { id: fixture.targetStyleId },
      data: { isActive: false },
    });
    await expect(read(fixture.sourceStyleId)).resolves.toEqual(emptyGroups());
    await db.wigStyle.update({
      where: { id: fixture.targetStyleId },
      data: { isActive: true },
    });
    await makeEligibleTarget(fixture.targetStyleId, { active: true, priced: false });
    await makeEligibleTarget(fixture.targetStyleId, { active: false, priced: true });
    await expect(read(fixture.sourceStyleId)).resolves.toEqual(emptyGroups());
  });

  it("uses an exact active market-priced variant, ignores stock and legacy price, and returns a safe shape", async () => {
    await Promise.all([
      publishStyle(fixture.sourceStyleId),
      publishStyle(fixture.targetStyleId),
    ]);
    await createActiveRelation(fixture.sourceStyleId, fixture.targetStyleId, 0);
    await makeEligibleTarget(fixture.targetStyleId, {
      active: true,
      priced: true,
      stock: 0,
      legacyPrice: 777777,
      marketAmount: 85000,
    });
    const groups = await read(fixture.sourceStyleId);
    expect(groups.SIMILAR_STYLE).toEqual([{
      id: fixture.targetStyleId,
      name: fixture.targetStyleId,
      category: "FASHION",
      tags: [],
      coverImageKey: null,
      basePrice: 85000,
    }]);
    expect(Object.keys(groups.SIMILAR_STYLE[0] ?? {}).sort()).toEqual([
      "basePrice",
      "category",
      "coverImageKey",
      "id",
      "name",
      "tags",
    ]);
    expect(JSON.stringify(groups)).not.toMatch(
      /internalRationale|createdByAdminUserId|updatedByAdminUserId|777777/u,
    );
  });

  it("groups by purpose, applies priority and UTF-16 tie-breaks, and caps each purpose at four", async () => {
    await publishStyle(fixture.sourceStyleId);
    const targetIds = [
      `relation_public_a_${randomUUID()}`,
      `relation_public_z_${randomUUID()}`,
      `relation_public_\u{10000}_${randomUUID()}`,
      `relation_public_\uE000_${randomUUID()}`,
      `relation_public_tail_${randomUUID()}`,
      `relation_public_compare_${randomUUID()}`,
    ];
    fixture.styleIds.push(...targetIds);
    for (const targetId of targetIds) {
      await createStyle(targetId);
      await publishStyle(targetId);
      await makeEligibleTarget(targetId, { active: true, priced: true });
    }
    await Promise.all([
      createActiveRelation(fixture.sourceStyleId, targetIds[4], 30),
      createActiveRelation(fixture.sourceStyleId, targetIds[3], 10),
      createActiveRelation(fixture.sourceStyleId, targetIds[2], 10),
      createActiveRelation(fixture.sourceStyleId, targetIds[1], 10),
      createActiveRelation(fixture.sourceStyleId, targetIds[0], 5),
      createActiveRelation(
        fixture.sourceStyleId,
        targetIds[5],
        0,
        "COMPARE_WITH",
      ),
    ]);
    const groups = await getManualRelatedStyles(
      fixture.sourceStyleId,
      "KR",
      ["SIMILAR_STYLE", "COMPARE_WITH"],
    );
    expect(groups.SIMILAR_STYLE.map((style) => style.id)).toEqual([
      targetIds[0],
      targetIds[1],
      targetIds[2],
      targetIds[3],
    ]);
    expect(groups.COMPARE_WITH.map((style) => style.id)).toEqual([targetIds[5]]);
  });
});

function emptyGroups() {
  return { SIMILAR_STYLE: [], COMPARE_WITH: [] };
}

async function read(sourceStyleId: string) {
  return getManualRelatedStyles(sourceStyleId, "KR", ["SIMILAR_STYLE"]);
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: "KR" },
    create: {
      code: "KR",
      currency: "KRW",
      shippableCountries: ["KR"],
      defaultLocale: "ko",
    },
    update: {},
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

async function publishStyle(styleId: string): Promise<void> {
  await db.wigStyleMarket.create({
    data: { wigStyleId: styleId, marketCode: "KR", isActive: true },
  });
}

async function createActiveRelation(
  sourceStyleId: string,
  targetStyleId: string,
  priority: number,
  purpose: "SIMILAR_STYLE" | "COMPARE_WITH" = "SIMILAR_STYLE",
): Promise<void> {
  await db.wigStyleRelation.create({
    data: {
      sourceStyleId,
      targetStyleId,
      marketCode: "KR",
      purpose,
      priority,
      isActive: true,
      internalRationale: "관리자 검토 근거",
      createdByAdminUserId: "admin",
      updatedByAdminUserId: "admin",
    },
  });
}

async function makeEligibleTarget(
  styleId: string,
  options: {
    active: boolean;
    priced: boolean;
    stock?: number;
    legacyPrice?: number;
    marketAmount?: number;
  },
): Promise<void> {
  await db.wigVariant.create({
    data: {
      id: `relation_public_variant_${randomUUID()}`,
      wigStyleId: styleId,
      color: "black",
      length: "medium",
      curl: "straight",
      price: options.legacyPrice ?? 999999,
      stock: options.stock ?? 0,
      sku: `REL-PUBLIC-${randomUUID()}`,
      isActive: options.active,
      ...(options.priced && {
        marketPrices: {
          create: { marketCode: "KR", amount: options.marketAmount ?? 85000 },
        },
      }),
    },
  });
}
