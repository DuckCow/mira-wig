import { randomUUID } from "crypto";
import {
  FulfillmentType,
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { createCheckoutSession, SESSION_TTL_MS, type CheckoutShippingInput } from "@/lib/payment/session";
import { priceSelectedPromotion } from "../redemption";

interface Fixture {
  readonly userId: string;
  readonly userIds: string[];
  readonly policyIds: string[];
  readonly styleIds: string[];
  readonly variantIds: string[];
}

interface PromotionOptions {
  readonly kind?: PromotionKind;
  readonly status?: PromotionPolicyStatus;
  readonly rateBps?: number;
  readonly maximumDiscountMinor?: bigint;
  readonly minimumEligibleSubtotalMinor?: bigint | null;
  readonly ruleMarketCode?: string | null;
  readonly ruleCurrency?: string;
  readonly grantUserId?: string;
  readonly validFrom?: Date;
  readonly expiresAt?: Date | null;
  readonly originMarketCode?: string | null;
}

const NOW = new Date("2026-08-28T06:00:00.000Z");

describe("promotion checkout redemption", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = {
      userId: `promo_c1_checkout_${randomUUID()}`,
      userIds: [],
      policyIds: [],
      styleIds: [],
      variantIds: [],
    };
    await ensureMarkets();
    await createUser(fixture, fixture.userId);
  });

  afterEach(async () => {
    await cleanup(fixture);
  });

  it.each([PromotionKind.SIGNUP, PromotionKind.BIRTHDAY])(
    "freezes a valid %s grant, bounded expiry, net total, and historical line allocation",
    async (kind) => {
      const grantExpiry = new Date(NOW.getTime() + 30_000);
      const grant = await createGrant(fixture, { kind, expiresAt: grantExpiry, rateBps: 1_500 });
      const first = await createCartLine(fixture, 10_001, 1);
      const second = await createCartLine(fixture, 5_000, 1);

      const created = await createCheckoutSession(db, sessionInput(fixture, grant.id));
      const session = await db.checkoutSession.findUniqueOrThrow({
        where: { id: created.sessionId },
        include: { lines: { orderBy: { variantId: "asc" } } },
      });

      expect(session.promotionGrantId).toBe(grant.id);
      expect(session.expiresAt).toEqual(grantExpiry);
      expect(session.expiresAt.getTime()).toBeLessThan(NOW.getTime() + SESSION_TTL_MS);
      expect(session.discountAmount).toBe(2_250);
      expect(session.totalAmount).toBe(session.subtotalAmount + session.shippingAmount - session.discountAmount);
      expect(session.lines.reduce((sum, line) => sum + line.discountAmount, 0)).toBe(session.discountAmount);
      expect(session.lines.map((line) => line.variantId).sort()).toEqual([first.id, second.id].sort());
    },
  );

  it("enforces the nullable user-scoped first-order claim partial unique index", async () => {
    const columns = await db.$queryRaw<Array<{ isNullable: string; columnDefault: string | null }>>(Prisma.sql`
      SELECT is_nullable AS "isNullable", column_default AS "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'CheckoutSession'
        AND column_name = 'firstOrderPromotionClaimedAt'
    `);
    expect(columns).toEqual([{ isNullable: "YES", columnDefault: null }]);
    const indexes = await db.$queryRaw<Array<{ indexdef: string }>>(Prisma.sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'CheckoutSession'
        AND indexname = 'CheckoutSession_firstOrderPromotionClaim_user_key'
    `);
    expect(indexes.map(({ indexdef }) => indexdef.replace(/\s+/g, " "))).toEqual([
      'CREATE UNIQUE INDEX "CheckoutSession_firstOrderPromotionClaim_user_key" ON public."CheckoutSession" USING btree ("userId") WHERE ("firstOrderPromotionClaimedAt" IS NOT NULL)',
    ]);

    const sameUserSessions = await Promise.all([
      createBareSession(fixture),
      createBareSession(fixture),
      createBareSession(fixture),
    ]);
    await expect(db.checkoutSession.findMany({
      where: { id: { in: sameUserSessions } },
      select: { firstOrderPromotionClaimedAt: true },
    })).resolves.toEqual([
      { firstOrderPromotionClaimedAt: null },
      { firstOrderPromotionClaimedAt: null },
      { firstOrderPromotionClaimedAt: null },
    ]);
    await db.checkoutSession.update({
      where: { id: sameUserSessions[0] },
      data: { firstOrderPromotionClaimedAt: NOW },
    });
    await expect(db.checkoutSession.update({
      where: { id: sameUserSessions[1] },
      data: { firstOrderPromotionClaimedAt: NOW },
    })).rejects.toMatchObject({ code: "P2002" });

    const otherUserId = `promo_c1_claim_other_${randomUUID()}`;
    await createUser(fixture, otherUserId);
    const otherUserSession = await createBareSessionForUser(otherUserId);
    await expect(db.checkoutSession.update({
      where: { id: otherUserSession },
      data: { firstOrderPromotionClaimedAt: NOW },
    })).resolves.toMatchObject({ firstOrderPromotionClaimedAt: NOW });
  });

  it("rejects wrong-owner, revoked, redeemed, future, expired, and other-session-reserved grants", async () => {
    const foreignUserId = `promo_c1_foreign_${randomUUID()}`;
    await createUser(fixture, foreignUserId);
    const cases: Array<{ label: string; grantId: string }> = [];
    cases.push({ label: "wrong owner", grantId: (await createGrant(fixture, { grantUserId: foreignUserId })).id });
    const revoked = await createGrant(fixture);
    await db.promotionGrant.update({ where: { id: revoked.id }, data: { revokedAt: NOW } });
    cases.push({ label: "revoked", grantId: revoked.id });
    const redeemed = await createGrant(fixture);
    await db.promotionGrant.update({ where: { id: redeemed.id }, data: { redeemedAt: NOW } });
    cases.push({ label: "redeemed", grantId: redeemed.id });
    cases.push({
      label: "not yet valid",
      grantId: (await createGrant(fixture, { validFrom: new Date(NOW.getTime() + 1) })).id,
    });
    cases.push({ label: "expired", grantId: (await createGrant(fixture, { expiresAt: NOW })).id });
    const reserved = await createGrant(fixture);
    const ownerSessionId = await createBareSession(fixture);
    await db.promotionGrant.update({
      where: { id: reserved.id },
      data: { reservedCheckoutSessionId: ownerSessionId, reservedAt: NOW },
    });
    cases.push({ label: "reserved elsewhere", grantId: reserved.id });

    for (const candidate of cases) {
      await expect(price(candidate.grantId)).rejects.toMatchObject({ code: "PROMOTION_GRANT_UNAVAILABLE" });
    }
  });

  it("fails closed for minimum, zero-benefit, DRAFT, absent Market rule, and wrong rule currency", async () => {
    const minimum = await createGrant(fixture, { minimumEligibleSubtotalMinor: BigInt(20_000) });
    await expect(price(minimum.id)).rejects.toMatchObject({ code: "PROMOTION_DISCOUNT_UNAVAILABLE" });
    const zero = await createGrant(fixture, { rateBps: 1 });
    await expect(price(zero.id, [{ lineId: "tiny", grossAmount: 1 }]))
      .rejects.toMatchObject({ code: "PROMOTION_DISCOUNT_UNAVAILABLE" });
    const draft = await createGrant(fixture, { status: PromotionPolicyStatus.DRAFT });
    await expect(price(draft.id)).rejects.toMatchObject({ code: "PROMOTION_GRANT_UNAVAILABLE" });
    const noRule = await createGrant(fixture, { ruleMarketCode: null });
    await expect(price(noRule.id)).rejects.toMatchObject({ code: "PROMOTION_GRANT_UNAVAILABLE" });
    const wrongCurrency = await createGrant(fixture, { ruleCurrency: "USD" });
    await expect(price(wrongCurrency.id)).rejects.toMatchObject({ code: "PROMOTION_GRANT_UNAVAILABLE" });
  });

  it("allows RETIRED issued policy and an origin Market different from the checkout Market", async () => {
    const grant = await createGrant(fixture, {
      status: PromotionPolicyStatus.RETIRED,
      originMarketCode: MarketCode.US,
    });

    await expect(price(grant.id)).resolves.toMatchObject({ promotionGrantId: grant.id, discountAmount: 1_200 });
  });

  it("caps and allocates by stable line identity independently of input order", async () => {
    const grant = await createGrant(fixture, { rateBps: 3_333, maximumDiscountMinor: BigInt(2_000) });
    const lines = [
      { lineId: "variant-b", grossAmount: 3_001 },
      { lineId: "variant-a", grossAmount: 7_000 },
    ];

    const forward = await price(grant.id, lines);
    const reverse = await price(grant.id, [...lines].reverse());

    expect(forward.discountAmount).toBe(2_000);
    expect(forward.lineDiscounts).toEqual(reverse.lineDiscounts);
    expect(forward.lineDiscounts.reduce((sum, line) => sum + line.discountAmount, 0)).toBe(2_000);
  });

  it("does not create a free promoted checkout", async () => {
    const grant = await createGrant(fixture, { rateBps: 10_000, maximumDiscountMinor: BigInt(100_000) });
    await createCartLine(fixture, 1_000, 1);

    await expect(createCheckoutSession(db, sessionInput(fixture, grant.id)))
      .rejects.toMatchObject({ code: "TOTAL_AMOUNT_TOO_LOW" });
  });

  function price(
    promotionGrantId: string,
    lines: readonly { lineId: string; grossAmount: number }[] = [{ lineId: "variant-1", grossAmount: 12_000 }],
  ) {
    return priceSelectedPromotion(db, {
      promotionGrantId,
      userId: fixture.userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      lines,
      now: NOW,
    });
  }
});

async function createUser(fixture: Fixture, userId: string): Promise<void> {
  fixture.userIds.push(userId);
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
}

async function createGrant(fixture: Fixture, options: PromotionOptions = {}) {
  const kind = options.kind ?? PromotionKind.BIRTHDAY;
  const ruleMarketCode = options.ruleMarketCode === undefined ? MarketCode.KR : options.ruleMarketCode;
  const policy = await db.promotionPolicyVersion.create({
    data: promotionPolicyData(options, kind, ruleMarketCode),
  });
  fixture.policyIds.push(policy.id);
  await transitionPolicyForTest(policy.id, options.status ?? PromotionPolicyStatus.ACTIVE);
  return db.promotionGrant.create({
    data: promotionGrantData(fixture, policy.id, options),
  });
}

function promotionPolicyData(
  options: PromotionOptions,
  kind: PromotionKind,
  ruleMarketCode: string | null,
) {
  const birthday = kind === PromotionKind.BIRTHDAY;
  return {
    programKey: `promo_c1_policy_${randomUUID()}`,
    version: 1,
    kind,
    startsAt: new Date(NOW.getTime() - 86_400_000),
    endsAt: new Date(NOW.getTime() + 86_400_000),
    firstOrderOnly: kind === PromotionKind.SIGNUP,
    requiresQualifyingPurchase: birthday,
    birthdayWindowBeforeDays: birthday ? 0 : null,
    birthdayWindowAfterDays: birthday ? 0 : null,
    birthdayLeapDayObservation: birthday ? "FEB_28" as const : null,
    marketRules: ruleMarketCode === null ? undefined : {
      create: {
        marketCode: ruleMarketCode,
        currency: options.ruleCurrency ?? "KRW",
        rateBps: options.rateBps ?? 1_000,
        maximumDiscountMinor: options.maximumDiscountMinor ?? BigInt(100_000),
        minimumEligibleSubtotalMinor: options.minimumEligibleSubtotalMinor ?? null,
        eligibilityTimeZone: birthday ? "Asia/Seoul" : null,
      },
    },
  };
}

async function transitionPolicyForTest(id: string, status: PromotionPolicyStatus): Promise<void> {
  if (status === PromotionPolicyStatus.DRAFT) return;
  await db.promotionPolicyVersion.update({
    where: { id },
    data: { status: PromotionPolicyStatus.ACTIVE },
  });
  if (status === PromotionPolicyStatus.RETIRED) {
    await db.promotionPolicyVersion.update({ where: { id }, data: { status } });
  }
}

function promotionGrantData(fixture: Fixture, policyVersionId: string, options: PromotionOptions) {
  return {
    userId: options.grantUserId ?? fixture.userId,
    policyVersionId,
    grantKey: `promo_c1_grant_${randomUUID()}`,
    originMarketCode: options.originMarketCode === undefined ? MarketCode.KR : options.originMarketCode,
    issuedAt: NOW,
    validFrom: options.validFrom ?? new Date(NOW.getTime() - 1_000),
    expiresAt: options.expiresAt === undefined ? new Date(NOW.getTime() + 3_600_000) : options.expiresAt,
  };
}

async function createCartLine(fixture: Fixture, amount: number, quantity: number) {
  const style = await db.wigStyle.create({
    data: {
      name: `Promo C1 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/promo-c1-cover.png",
      availableMarkets: { create: { marketCode: MarketCode.KR, isActive: true } },
    },
    select: { id: true },
  });
  fixture.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: amount,
      stock: 10,
      sku: `PROMO-C1-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: MarketCode.KR, amount } },
    },
    select: { id: true, wigStyleId: true },
  });
  fixture.variantIds.push(variant.id);
  await db.cartItem.create({
    data: { userId: fixture.userId, wigStyleId: style.id, variantId: variant.id, quantity },
  });
  return variant;
}

async function createBareSession(fixture: Fixture): Promise<string> {
  return createBareSessionForUser(fixture.userId);
}

async function createBareSessionForUser(userId: string): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MarketCode.KR,
      communicationLocale: "ko",
      currency: "KRW",
      subtotalAmount: 1,
      shippingAmount: 0,
      totalAmount: 1,
      expiresAt: new Date(NOW.getTime() + 60_000),
    },
    select: { id: true },
  });
  return session.id;
}

function sessionInput(fixture: Fixture, promotionGrantId: string) {
  return {
    userId: fixture.userId,
    marketCode: MarketCode.KR,
    communicationLocale: "ko" as const,
    shipping: validShipping(),
    promotionGrantId,
    now: NOW,
  };
}

function validShipping(): CheckoutShippingInput {
  return {
    recipientName: "홍길동",
    phone: "010-1234-5678",
    country: ShippingCountry.KR,
    postalCode: "12345",
    administrativeArea: "서울특별시",
    city: "강남구",
    addressLine1: "테헤란로 1",
  };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
  await db.market.upsert({
    where: { code: MarketCode.US },
    update: { currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
    create: { code: MarketCode.US, currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
  });
}

async function cleanup(fixture: Fixture): Promise<void> {
  await db.promotionGrant.updateMany({
    where: { policyVersionId: { in: fixture.policyIds } },
    data: { reservedCheckoutSessionId: null, reservedAt: null },
  });
  await db.checkoutSessionLine.deleteMany({ where: { session: { userId: { in: fixture.userIds } } } });
  await db.checkoutSessionShipping.deleteMany({ where: { session: { userId: { in: fixture.userIds } } } });
  await db.checkoutSession.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await db.cartItem.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await tx.promotionGrant.deleteMany({ where: { policyVersionId: { in: fixture.policyIds } } });
    await tx.promotionMarketRule.deleteMany({ where: { policyVersionId: { in: fixture.policyIds } } });
    await tx.promotionPolicyVersion.deleteMany({ where: { id: { in: fixture.policyIds } } });
  });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: fixture.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: fixture.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: fixture.styleIds } } });
  await db.user.deleteMany({ where: { id: { in: fixture.userIds } } });
}
