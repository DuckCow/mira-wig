import { randomUUID } from "crypto";
import { WigCategory } from "@prisma/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";
import { db } from "@/lib/db";
import {
  ManualItemRelationsActivationConfigError,
  type ManualItemRelationsActivationEnv,
} from "../activation";
import { getManualRelatedStyles } from "../public";

interface Fixture {
  styleIds: string[];
  sourceStyleId: string;
  targetStyleId: string;
}

const SIMILAR_STYLE_ENABLED_ENV = {
  MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "ENABLED",
} as const;

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

  it("accepts only activation environment injection at the exported boundary", () => {
    type PublicReadEnvironment = Parameters<typeof getManualRelatedStyles>[3];
    expectTypeOf<PublicReadEnvironment>().toEqualTypeOf<
      ManualItemRelationsActivationEnv | undefined
    >();
  });

  it("keeps blank KR configuration off and rejects invalid KR configuration", async () => {
    await expect(
      getManualRelatedStyles(fixture.sourceStyleId, "KR", "ko", {}),
    ).resolves.toEqual(emptyGroups());
    await expect(getManualRelatedStyles(fixture.sourceStyleId, "KR", "ko", {
      MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "invalid",
    })).rejects.toBeInstanceOf(ManualItemRelationsActivationConfigError);
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
      contentProvenance: {
        kind: "LEGACY_ORIGINAL",
        requestedLocale: "ko",
        sourceLanguage: "UNVERIFIED",
      },
    }]);
    expect(Object.keys(groups.SIMILAR_STYLE[0] ?? {}).sort()).toEqual([
      "basePrice",
      "category",
      "contentProvenance",
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
    const similarOnly = await getManualRelatedStyles(
      fixture.sourceStyleId,
      "KR",
      "ko",
      SIMILAR_STYLE_ENABLED_ENV,
    );
    expect(similarOnly.SIMILAR_STYLE).toHaveLength(4);
    expect(similarOnly.COMPARE_WITH).toEqual([]);

    const groups = await getManualRelatedStyles(
      fixture.sourceStyleId,
      "KR",
      "ko",
      {
        MANUAL_ITEM_RELATIONS_KR_SIMILAR_STYLE_ENABLED: "ENABLED",
        MANUAL_ITEM_RELATIONS_KR_COMPARE_WITH_ENABLED: "ENABLED",
      },
    );
    expect(groups.SIMILAR_STYLE.map((style) => style.id)).toEqual([
      targetIds[0],
      targetIds[1],
      targetIds[2],
      targetIds[3],
    ]);
    expect(groups.COMPARE_WITH.map((style) => style.id)).toEqual([targetIds[5]]);
  });

  it("cannot activate an eligible US relation with injected KR activation keys", async () => {
    await ensureMarket("US");
    await Promise.all([
      publishStyle(fixture.sourceStyleId, "US"),
      publishStyle(fixture.targetStyleId, "US"),
    ]);
    await createActiveRelation(
      fixture.sourceStyleId,
      fixture.targetStyleId,
      0,
      "SIMILAR_STYLE",
      "US",
    );
    await makeEligibleTarget(fixture.targetStyleId, {
      active: true,
      priced: true,
      marketCode: "US",
    });
    await expect(getManualRelatedStyles(
      fixture.sourceStyleId,
      "US",
      "en",
      SIMILAR_STYLE_ENABLED_ENV,
    )).resolves.toEqual(emptyGroups());
  });
});

function emptyGroups() {
  return { SIMILAR_STYLE: [], COMPARE_WITH: [] };
}

async function read(sourceStyleId: string) {
  return getManualRelatedStyles(sourceStyleId, "KR", "ko", SIMILAR_STYLE_ENABLED_ENV);
}

async function ensureMarket(code = "KR"): Promise<void> {
  await db.market.upsert({
    where: { code },
    create: {
      code,
      currency: code === "KR" ? "KRW" : "USD",
      shippableCountries: [code],
      defaultLocale: code === "KR" ? "ko" : "en",
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

async function publishStyle(styleId: string, marketCode = "KR"): Promise<void> {
  await db.wigStyleMarket.create({
    data: { wigStyleId: styleId, marketCode, isActive: true },
  });
}

async function createActiveRelation(
  sourceStyleId: string,
  targetStyleId: string,
  priority: number,
  purpose: "SIMILAR_STYLE" | "COMPARE_WITH" = "SIMILAR_STYLE",
  marketCode = "KR",
): Promise<void> {
  await db.wigStyleRelation.create({
    data: {
      sourceStyleId,
      targetStyleId,
      marketCode,
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
    marketCode?: string;
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
          create: {
            marketCode: options.marketCode ?? "KR",
            amount: options.marketAmount ?? 85000,
          },
        },
      }),
    },
  });
}
