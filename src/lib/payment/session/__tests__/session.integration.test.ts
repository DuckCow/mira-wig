import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import {
  SESSION_TTL_MS,
  SessionException,
  createCheckoutSession,
  expireStale,
  isDefinedTransition,
  isUsable,
  transitionCheckoutSession,
  type CheckoutShippingInput,
} from "@/lib/payment/session";

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
}

interface CatalogOptions {
  stock?: number;
  isActive?: boolean;
  amount?: number;
  marketCode?: MarketCode;
  withPrice?: boolean;
  fulfillmentType?: FulfillmentType;
}

describe("checkout session lifecycle", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("정상 생성은 SUBMITTED 세션과 shipping 위성을 만든다", async () => {
    const first = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    const second = await createCartVariant(ctx, { amount: 7_500, stock: 5 });
    await addCart(ctx, first, 2);
    await addCart(ctx, second, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const session = await findSession(result.sessionId);

    expect(session.status).toBe(CheckoutSessionStatus.SUBMITTED);
    expect(session.currency).toBe("KRW");
    expect(session.subtotalAmount).toBe(31_500);
    expect(session.shippingAmount).toBe(0);
    expect(session.totalAmount).toBe(31_500);
    expect(session.shipping?.recipientName).toBe("홍길동");
    expect(session.lines).toHaveLength(2);
  });

  it("KR administrativeArea 빈 문자열은 canonical 빈 문자열로 저장한다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const shipping = { ...validShipping(ShippingCountry.KR), administrativeArea: "" };

    const result = await createCheckoutSession(db, baseInput(ctx, { shipping }));
    const session = await findSession(result.sessionId);

    expect(session.shipping?.administrativeArea).toBe("");
  });

  it("KR administrativeArea 공백만 있으면 canonical 빈 문자열로 저장한다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const shipping = { ...validShipping(ShippingCountry.KR), administrativeArea: "   " };

    const result = await createCheckoutSession(db, baseInput(ctx, { shipping }));
    const session = await findSession(result.sessionId);

    expect(session.shipping?.administrativeArea).toBe("");
  });

  it("US administrativeArea 빈 문자열은 SHIPPING_ADDRESS_INVALID이고 residue가 없다", async () => {
    const variant = await createCartVariant(ctx, { amount: 2_999, stock: 5, marketCode: MarketCode.US });
    await addCart(ctx, variant, 1);
    const shipping = { ...validShipping(ShippingCountry.US), administrativeArea: "" };

    await expectFailure("SHIPPING_ADDRESS_INVALID", () => {
      return createCheckoutSession(db, baseInput(ctx, { marketCode: MarketCode.US, shipping }));
    });
    await expectNoSessionResidue(ctx.userId);
  });

  it("JP administrativeArea 공백만 있으면 SHIPPING_ADDRESS_INVALID이고 residue가 없다", async () => {
    const variant = await createCartVariant(ctx, { amount: 1_500, stock: 5, marketCode: MarketCode.JP });
    await addCart(ctx, variant, 1);
    const shipping = { ...validShipping(ShippingCountry.JP), administrativeArea: "   " };

    await expectFailure("SHIPPING_ADDRESS_INVALID", () => {
      return createCheckoutSession(db, baseInput(ctx, { marketCode: MarketCode.JP, shipping }));
    });
    await expectNoSessionResidue(ctx.userId);
  });

  it("runtime에서 administrativeArea property가 없으면 안전하게 거부하고 residue가 없다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const shipping = validShipping(ShippingCountry.KR);
    Reflect.deleteProperty(shipping, "administrativeArea");

    await expectFailure("SHIPPING_ADDRESS_INVALID", () => {
      return createCheckoutSession(db, baseInput(ctx, { shipping }));
    });
    await expectNoSessionResidue(ctx.userId);
  });

  it("runtime에서 administrativeArea가 null이면 안전하게 거부하고 residue가 없다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const shipping = validShipping(ShippingCountry.KR);
    Reflect.set(shipping, "administrativeArea", null);

    await expectFailure("SHIPPING_ADDRESS_INVALID", () => {
      return createCheckoutSession(db, baseInput(ctx, { shipping }));
    });
    await expectNoSessionResidue(ctx.userId);
  });

  it("정상 생성 라인은 시장 정가와 fulfillmentType을 복사한다", async () => {
    const variant = await createCartVariant(ctx, {
      amount: 12_000,
      stock: 5,
      fulfillmentType: FulfillmentType.STOCKED,
    });
    await addCart(ctx, variant, 2);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const line = firstLine(await findSession(result.sessionId));

    expect(line.unitAmount).toBe(12_000);
    expect(line.quantity).toBe(2);
    expect(line.fulfillmentType).toBe(FulfillmentType.STOCKED);
  });

  it("정상 생성 라인의 snapshotData는 표시 필드를 담는다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const snapshot = parseSnapshotData(firstLine(await findSession(result.sessionId)).snapshotData);

    expect(snapshot).toMatchObject({
      styleName: variant.styleName,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      currencyCode: "KRW",
    });
  });

  it("빈 카트는 세션을 만들지 않고 거부한다", async () => {
    await expectFailure("CART_EMPTY", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
  });

  it("비활성 variant는 세션을 만들지 않고 거부한다", async () => {
    const variant = await createCartVariant(ctx, { isActive: false, stock: 5 });
    await addCart(ctx, variant, 1);

    await expectFailure("VARIANT_UNAVAILABLE", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
  });

  it("시장 가격 부재는 세션을 만들지 않고 거부한다", async () => {
    const variant = await createCartVariant(ctx, { withPrice: false, stock: 5 });
    await addCart(ctx, variant, 1);

    await expectFailure("VARIANT_PRICE_UNAVAILABLE", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
  });

  it("total 0은 TOTAL_AMOUNT_TOO_LOW로 거부하고 세션/라인을 만들지 않는다", async () => {
    const variant = await createCartVariant(ctx, { amount: 0, stock: 5 });
    await addCart(ctx, variant, 1);

    await expectFailure("TOTAL_AMOUNT_TOO_LOW", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
  });

  it("total 1은 결제 가능한 최소 경계값으로 세션을 만든다", async () => {
    const variant = await createCartVariant(ctx, { amount: 1, stock: 5 });
    await addCart(ctx, variant, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const session = await findSession(result.sessionId);
    const line = firstLine(session);

    expect(result.subtotalAmount).toBe(1);
    expect(result.totalAmount).toBe(1);
    expect(session.subtotalAmount).toBe(1);
    expect(session.totalAmount).toBe(1);
    expect(line.unitAmount).toBe(1);
  });

  it("unitAmount 0 라인이 있어도 payable total이 1 이상이면 세션을 만든다", async () => {
    const freeLine = await createCartVariant(ctx, { amount: 0, stock: 5 });
    const paidLine = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, freeLine, 1);
    await addCart(ctx, paidLine, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const session = await findSession(result.sessionId);

    expect(result.totalAmount).toBe(12_000);
    expect(lineForVariant(session, freeLine.id).unitAmount).toBe(0);
    expect(lineForVariant(session, paidLine.id).unitAmount).toBe(12_000);
  });

  it("stock 쿼터 부족은 세션을 만들지 않고 거부한다", async () => {
    const variant = await createCartVariant(ctx, { stock: 1 });
    await addCart(ctx, variant, 2);

    await expectFailure("STOCK_INSUFFICIENT", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
  });

  it("배송국과 마켓이 맞지 않으면 세션을 만들지 않고 거부한다", async () => {
    const variant = await createCartVariant(ctx, { stock: 5 });
    await addCart(ctx, variant, 1);

    await expectFailure("SHIPPING_COUNTRY_INVALID", () => {
      const input = baseInput(ctx, { shipping: validShipping(ShippingCountry.US) });
      return createCheckoutSession(db, input);
    });
    await expectNoSessionResidue(ctx.userId);
  });

  it("비활성 시장은 기존 MARKET_UNAVAILABLE로 거부한다", async () => {
    const marketCode = makeSyntheticMarketCode();
    await createInactiveMarket(marketCode);

    try {
      await expectFailure("MARKET_UNAVAILABLE", () => {
        return createCheckoutSession(db, baseInput(ctx, { marketCode: requireSyntheticMarketCode(marketCode) }));
      });
      await expectNoSessionResidue(ctx.userId);
    } finally {
      await db.market.deleteMany({ where: { code: marketCode } });
    }
  });

  it("생성 후 시장 가격이 바뀌어도 unitAmount는 불변이다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    await db.variantMarketPrice.update({
      where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.KR } },
      data: { amount: 99_000 },
    });

    expect(firstLine(await findSession(result.sessionId)).unitAmount).toBe(12_000);
  });

  it("snapshotData에는 배송 PII 필드가 없다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const snapshot = firstLine(await findSession(result.sessionId)).snapshotData;

    expect(hasJsonKey(snapshot, "recipientName")).toBe(false);
    expect(hasJsonKey(snapshot, "phone")).toBe(false);
    expect(hasJsonKey(snapshot, "addressLine1")).toBe(false);
    expect(hasJsonKey(snapshot, "memo")).toBe(false);
  });

  it("shipping PII는 shipping 위성에만 저장된다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const session = await findSession(result.sessionId);

    expect(session.shipping?.phone).toBe("010-1234-5678");
    expect(session.shipping?.addressLine1).toBe("테헤란로 1");
    expect(session.shipping?.memo).toBe("경비실 맡겨주세요");
  });

  it("expiresAt 이전 SUBMITTED 세션은 usable이다", () => {
    const session = { status: CheckoutSessionStatus.SUBMITTED, expiresAt: futureDate(1_000) };

    expect(isUsable(session, new Date("2026-07-06T00:00:00.000Z"))).toBe(true);
  });

  it("expiresAt 경과 세션은 lazy 판정에서 usable이 아니다", () => {
    const now = new Date("2026-07-06T00:00:00.000Z");
    const session = { status: CheckoutSessionStatus.SUBMITTED, expiresAt: now };

    expect(isUsable(session, now)).toBe(false);
  });

  it("스위퍼는 만료된 SUBMITTED 세션을 EXPIRED로 전이하고 count를 반환한다", async () => {
    const result = await createReadySession(ctx, new Date("2026-07-06T00:00:00.000Z"));
    const sweepNow = new Date(result.expiresAt.getTime() + 1);

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
  });

  it("스위퍼는 COMPLETED 세션을 EXPIRED 대상으로 삼지 않는다", async () => {
    const result = await createReadySession(ctx, new Date("2026-07-06T00:00:00.000Z"));
    const sweepNow = new Date(result.expiresAt.getTime() + 1);
    await transitionCheckoutSession(db, {
      sessionId: result.sessionId,
      transition: { from: "SUBMITTED", to: "COMPLETED" },
      now: sweepNow,
    });

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(0);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
  });

  it("SUBMITTED에서 COMPLETED로 정의된 전이는 count=1이다", async () => {
    const result = await createReadySession(ctx);
    const now = new Date("2026-07-06T00:05:00.000Z");

    await expect(
      transitionCheckoutSession(db, {
        sessionId: result.sessionId,
        transition: { from: "SUBMITTED", to: "COMPLETED" },
        now,
      }),
    ).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
  });

  it("SUBMITTED에서 FAILED로 정의된 전이는 count=1이다", async () => {
    const result = await createReadySession(ctx);

    await expect(
      transitionCheckoutSession(db, {
        sessionId: result.sessionId,
        transition: { from: "SUBMITTED", to: "FAILED" },
        now: new Date("2026-07-06T00:05:00.000Z"),
      }),
    ).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.FAILED);
  });

  it("SUBMITTED에서 EXPIRED로 정의된 전이는 count=1이다", async () => {
    const result = await createReadySession(ctx);

    await expect(
      transitionCheckoutSession(db, {
        sessionId: result.sessionId,
        transition: { from: "SUBMITTED", to: "EXPIRED" },
        now: new Date("2026-07-06T00:05:00.000Z"),
      }),
    ).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
  });

  it("표 밖 전이는 미정의로 판정한다", () => {
    expect(
      isDefinedTransition({
        from: CheckoutSessionStatus.EXPIRED,
        to: CheckoutSessionStatus.FAILED,
      }),
    ).toBe(false);
  });

  it("EXPIRED에서 COMPLETED 늦은 유효 완료 전이는 count=1이다", async () => {
    const result = await createReadySession(ctx);
    await transitionCheckoutSession(db, {
      sessionId: result.sessionId,
      transition: { from: "SUBMITTED", to: "EXPIRED" },
      now: new Date("2026-07-06T00:04:00.000Z"),
    });

    await expect(
      transitionCheckoutSession(db, {
        sessionId: result.sessionId,
        transition: { from: "EXPIRED", to: "COMPLETED" },
        now: new Date("2026-07-06T00:05:00.000Z"),
      }),
    ).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.COMPLETED);
  });

  it("같은 유저의 SUBMITTED 세션 2개가 공존한다", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);

    const first = await createCheckoutSession(db, baseInput(ctx));
    const second = await createCheckoutSession(db, baseInput(ctx));

    expect(first.sessionId).not.toBe(second.sessionId);
    await expect(db.checkoutSession.count({ where: { userId: ctx.userId } })).resolves.toBe(2);
  });
});

function makeContext(): TestContext {
  return { userId: `b1_${randomUUID()}`, styleIds: [], variantIds: [] };
}

async function ensureMarkets(): Promise<void> {
  await upsertMarket(MarketCode.KR, "KRW", [ShippingCountry.KR], "ko");
  await upsertMarket(MarketCode.US, "USD", [ShippingCountry.US], "en");
  await upsertMarket(MarketCode.JP, "JPY", [ShippingCountry.JP], "ja");
}

async function upsertMarket(
  code: MarketCode,
  currency: string,
  shippableCountries: ShippingCountry[],
  defaultLocale: string,
): Promise<void> {
  await db.market.upsert({
    where: { code },
    update: { currency, shippableCountries, defaultLocale, isActive: true },
    create: { code, currency, shippableCountries, defaultLocale, isActive: true },
  });
}

function makeSyntheticMarketCode(): string {
  return `ZZ-${randomUUID().slice(0, 8)}`;
}

async function createInactiveMarket(code: string): Promise<void> {
  await db.market.create({
    data: {
      code,
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: false,
    },
  });
}

function requireSyntheticMarketCode(code: string): MarketCode {
  if (isSyntheticMarketCodeForTest(code)) return code;
  throw new Error(`Invalid synthetic market code ${code}`);
}

function isSyntheticMarketCodeForTest(code: string): code is MarketCode {
  return code.startsWith("ZZ-");
}

async function cleanup(context: TestContext): Promise<void> {
  await db.checkoutSessionLine.deleteMany({ where: { session: { userId: context.userId } } });
  await db.checkoutSessionShipping.deleteMany({ where: { session: { userId: context.userId } } });
  await db.checkoutSession.deleteMany({ where: { userId: context.userId } });
  await db.cartItem.deleteMany({ where: { userId: context.userId } });
  await deleteVariants(context);
  await db.user.deleteMany({ where: { id: context.userId } });
}

async function deleteVariants(context: TestContext): Promise<void> {
  if (context.variantIds.length > 0) {
    await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
    await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  }
  if (context.styleIds.length > 0) {
    await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  }
}

async function createCartVariant(context: TestContext, options: CatalogOptions = {}) {
  const style = await db.wigStyle.create({
    data: {
      name: `B1 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/b1-cover.png",
    },
    select: { id: true, name: true },
  });
  context.styleIds.push(style.id);
  return createVariant(context, style, options);
}

async function createVariant(
  context: TestContext,
  style: { id: string; name: string },
  options: CatalogOptions,
) {
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      colorHex: "#111111",
      length: "Medium",
      curl: "C Curl",
      price: 88_000,
      stock: options.stock ?? 10,
      sku: `B1-${randomUUID()}`,
      isActive: options.isActive ?? true,
      fulfillmentType: options.fulfillmentType ?? FulfillmentType.MTO,
    },
  });
  context.variantIds.push(variant.id);
  if (options.withPrice !== false) await createMarketPrice(variant.id, options);
  return { id: variant.id, styleId: style.id, styleName: style.name };
}

async function createMarketPrice(variantId: string, options: CatalogOptions): Promise<void> {
  await db.variantMarketPrice.create({
    data: {
      variantId,
      marketCode: options.marketCode ?? MarketCode.KR,
      amount: options.amount ?? 12_000,
    },
  });
}

async function addCart(
  context: TestContext,
  variant: { id: string; styleId: string },
  quantity: number,
): Promise<void> {
  await db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity },
  });
}

function baseInput(
  context: TestContext,
  overrides: Partial<Parameters<typeof createCheckoutSession>[1]> = {},
): Parameters<typeof createCheckoutSession>[1] {
  return {
    userId: context.userId,
    marketCode: MarketCode.KR,
    shipping: validShipping(ShippingCountry.KR),
    ...overrides,
  };
}

function validShipping(country: ShippingCountry): CheckoutShippingInput {
  return {
    recipientName: "홍길동",
    phone: "010-1234-5678",
    country,
    postalCode: "12345",
    administrativeArea: "서울특별시",
    city: "강남구",
    addressLine1: "테헤란로 1",
    addressLine2: "101호",
    memo: "경비실 맡겨주세요",
  };
}

async function createReadySession(context: TestContext, now?: Date) {
  const variant = await createCartVariant(context, { amount: 12_000, stock: 5 });
  await addCart(context, variant, 1);
  return createCheckoutSession(db, baseInput(context, { now }));
}

async function expectFailure(
  code: SessionException["code"],
  act: () => Promise<unknown>,
): Promise<void> {
  await expect(act()).rejects.toMatchObject({ code });
}

async function expectNoSessionResidue(userId: string): Promise<void> {
  await expect(db.checkoutSession.count({ where: { userId } })).resolves.toBe(0);
  await expect(db.checkoutSessionLine.count({ where: { session: { userId } } })).resolves.toBe(0);
  await expect(db.checkoutSessionShipping.count({ where: { session: { userId } } })).resolves.toBe(0);
}

async function findSession(id: string) {
  const session = await db.checkoutSession.findUnique({
    where: { id },
    include: { lines: { orderBy: { createdAt: "asc" } }, shipping: true },
  });
  if (!session) throw new Error(`Missing checkout session ${id}`);
  return session;
}

function firstLine(session: Awaited<ReturnType<typeof findSession>>) {
  const [line] = session.lines;
  if (!line) throw new Error("Expected checkout session line");
  return line;
}

function lineForVariant(session: Awaited<ReturnType<typeof findSession>>, variantId: string) {
  const line = session.lines.find((item) => item.variantId === variantId);
  if (!line) throw new Error(`Expected checkout session line for ${variantId}`);
  return line;
}

async function statusOf(id: string): Promise<CheckoutSessionStatus> {
  const session = await db.checkoutSession.findUnique({ where: { id }, select: { status: true } });
  if (!session) throw new Error(`Missing checkout session ${id}`);
  return session.status;
}

function hasJsonKey(value: unknown, key: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.prototype.hasOwnProperty.call(value, key);
}

function futureDate(offsetMs: number): Date {
  return new Date(new Date("2026-07-06T00:00:00.000Z").getTime() + SESSION_TTL_MS + offsetMs);
}
