import { randomUUID } from "crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { parseSnapshotData } from "@/lib/order/snapshot";
import { recordCapture, type CaptureFacts } from "@/lib/payment/complete";
import { PAYMENT_REMEDIATION_REQUIRED_TOPIC } from "@/lib/payment/remediation";
import {
  SESSION_TTL_MS,
  SessionException,
  createCheckoutSession,
  expireStale,
  isDefinedTransition,
  isUsable,
  readCheckoutSessionResume,
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
    expect(session.communicationLocale).toBe("ko");
    expect(session.currency).toBe("KRW");
    expect(session.subtotalAmount).toBe(31_500);
    expect(session.shippingAmount).toBe(0);
    expect(session.totalAmount).toBe(31_500);
    expect(session.shipping?.recipientName).toBe("홍길동");
    expect(session.lines).toHaveLength(2);
  });

  it.each(["ko", "en", "ja"] as const)(
    "freezes admitted %s communication Locale independently of Market defaults",
    async (communicationLocale) => {
      const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
      await addCart(ctx, variant, 1);
      const result = await createCheckoutSession(db, baseInput(ctx, { communicationLocale }));
      await db.market.update({ where: { code: MarketCode.KR }, data: { defaultLocale: "ja" } });

      const session = await db.checkoutSession.findUniqueOrThrow({
        where: { id: result.sessionId },
        select: { marketCode: true, communicationLocale: true },
      });

      expect(session).toEqual({ marketCode: MarketCode.KR, communicationLocale });
    },
  );

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

  it("cart-backed checkout freezes the exact source CartItem identity and quantity", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    const source = await addCart(ctx, variant, 2);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const line = firstLine(await findSession(result.sessionId));

    expect(line.sourceCartItemId).toBe(source.id);
    expect(line.quantity).toBe(2);
  });

  it("multiple checkout lines preserve distinct exact source CartItem identities", async () => {
    const first = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    const second = await createCartVariant(ctx, { amount: 7_500, stock: 5 });
    const firstSource = await addCart(ctx, first, 1);
    const secondSource = await addCart(ctx, second, 2);

    const result = await createCheckoutSession(db, baseInput(ctx));
    const session = await findSession(result.sessionId);

    expect(lineForVariant(session, first.id).sourceCartItemId).toBe(firstSource.id);
    expect(lineForVariant(session, second.id).sourceCartItemId).toBe(secondSource.id);
    expect(firstSource.id).not.toBe(secondSource.id);
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

  it("uses current DB shippableCountries and rejects the former static-only country without residue", async () => {
    const variant = await createCartVariant(ctx, { stock: 5 });
    await addCart(ctx, variant, 1);
    await db.market.update({
      where: { code: MarketCode.KR },
      data: { shippableCountries: [ShippingCountry.US] },
    });

    await expectFailure("SHIPPING_COUNTRY_INVALID", () => {
      return createCheckoutSession(db, baseInput(ctx));
    });
    await expectNoSessionResidue(ctx.userId);

    const created = await createCheckoutSession(db, baseInput(ctx, {
      shipping: validShipping(ShippingCountry.US),
    }));
    expect((await findSession(created.sessionId)).shipping?.country).toBe(ShippingCountry.US);
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

  it("unsupported current DB Market currency fails closed without session residue", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    await db.market.update({ where: { code: MarketCode.KR }, data: { currency: "EUR" } });

    await expectFailure("MARKET_UNAVAILABLE", () => createCheckoutSession(db, baseInput(ctx)));
    await expectNoSessionResidue(ctx.userId);
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

  it("keeps frozen session commerce facts invariant after current Market and catalog drift", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 2);
    const result = await createCheckoutSession(db, baseInput(ctx));
    const before = await findSession(result.sessionId);

    await Promise.all([
      db.market.update({
        where: { code: MarketCode.KR },
        data: { currency: "JPY", shippableCountries: [ShippingCountry.US], defaultLocale: "en" },
      }),
      db.variantMarketPrice.update({
        where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.KR } },
        data: { amount: 99_000 },
      }),
    ]);
    const after = await findSession(result.sessionId);

    expect(after.currency).toBe(before.currency);
    expect(after.subtotalAmount).toBe(before.subtotalAmount);
    expect(after.shippingAmount).toBe(before.shippingAmount);
    expect(after.totalAmount).toBe(before.totalAmount);
    expect(after.shipping).toEqual(before.shipping);
    expect(after.lines).toEqual(before.lines);
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
    expect(hasJsonKey(snapshot, "sourceCartItemId")).toBe(false);
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

  it("expiresAt이 fresh time보다 늦으면 SUBMITTED 세션은 usable이다", () => {
    const now = new Date("2026-07-06T00:00:00.000Z");
    const session = {
      status: CheckoutSessionStatus.SUBMITTED,
      expiresAt: new Date(now.getTime() + 1),
    };

    expect(isUsable(session, now)).toBe(true);
  });

  it("스위퍼는 만료된 SUBMITTED 세션을 EXPIRED로 전이하고 count를 반환한다", async () => {
    const result = await createReadySession(ctx, new Date("2026-07-06T00:00:00.000Z"));
    const sweepNow = new Date(result.expiresAt.getTime() + 1);

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
  });

  it("스위퍼는 uncontacted CONTACT_AUTHORIZED 결제 권한만 있으면 세션을 만료한다", async () => {
    const result = await createReadySession(ctx, new Date("2026-07-06T00:00:00.000Z"));
    const sweepNow = new Date(result.expiresAt.getTime() + 1);
    await createSessionPayment(result, PaymentAttemptLifecycle.CONTACT_AUTHORIZED);

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(1);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
  });

  it("스위퍼는 active CONTACTED 결제가 있는 세션을 만료하지 않는다", async () => {
    const result = await createReadySession(ctx, new Date("2026-07-06T00:00:00.000Z"));
    const sweepNow = new Date(result.expiresAt.getTime() + 1);
    await createSessionPayment(result, PaymentAttemptLifecycle.CONTACTED);

    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(0);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
  });

  it("C2J unresolved exposure commit while expiry waits is seen after the session lock", async () => {
    const session = await createPastDueSession(ctx);
    const superseded = await createSupersededPayment(session);
    const facts = captureFacts(session, superseded.id);
    const beforeCommit = coordinationBarrier();
    const observer = await openLockObserver("exposure");
    const transactionSpy = holdNextTransactionBeforeCommit(beforeCommit);
    let released = false;

    try {
      const capture = recordCapture(db, facts);
      await beforeCommit.reached;
      const expiry = expireStale(db, { now: new Date(), limit: 10 });
      const waiting = await waitForSessionLockWait(observer);

      expect(waiting.state).toBe("active");
      expect(waiting.waitEventType).toBe("Lock");
      expect(waiting.blockingPids.length).toBeGreaterThan(0);
      beforeCommit.release();
      released = true;

      const [captured, expiryCount] = await Promise.all([capture, expiry]);
      expect(expiryCount).toBe(0);
      expect(captured).toMatchObject({
        id: superseded.id,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        blockingEndedAt: null,
      });
      await expect(statusOf(session.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
      await expect(db.payment.findUnique({
        where: { id: superseded.id },
        select: { financialSucceededAt: true, remediationStatus: true, blockingEndedAt: true },
      })).resolves.toMatchObject({
        financialSucceededAt: facts.capturedAt,
        remediationStatus: PaymentRemediationStatus.PENDING,
        blockingEndedAt: null,
      });
      await expect(db.paymentOutbox.count({
        where: {
          topic: PAYMENT_REMEDIATION_REQUIRED_TOPIC,
          payload: { path: ["paymentId"], equals: superseded.id },
        },
      })).resolves.toBe(1);
    } finally {
      if (!released) beforeCommit.release();
      transactionSpy.mockRestore();
      await observer.end();
    }
  });

  it("C2J stale future candidate is rejected by fresh post-lock DB time", async () => {
    const result = await createReadySession(ctx);

    await expect(expireStale(db, { now: result.expiresAt, limit: 10 })).resolves.toBe(0);
    await expect(statusOf(result.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
  });

  it("C2J ordinary expiry counts only committed transitions and replay is zero", async () => {
    const first = await createPastDueSession(ctx);
    const second = await createPastDueSession(ctx);
    const sweepNow = new Date("2026-07-06T00:00:00.001Z");

    await expect(db.checkoutSession.count({
      where: {
        id: { in: [first.sessionId, second.sessionId] },
        status: CheckoutSessionStatus.SUBMITTED,
        expiresAt: { lte: sweepNow },
      },
    })).resolves.toBe(2);
    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(2);
    await expect(statusOf(first.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
    await expect(statusOf(second.sessionId)).resolves.toBe(CheckoutSessionStatus.EXPIRED);
    await expect(expireStale(db, { now: sweepNow, limit: 10 })).resolves.toBe(0);
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

  it("rehydrates frozen session authority without reading or rewriting current Cart/catalog facts", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 2);
    const created = await createCheckoutSession(db, baseInput(ctx));

    await Promise.all([
      db.cartItem.updateMany({ where: { userId: ctx.userId }, data: { quantity: 1 } }),
      db.variantMarketPrice.update({
        where: { variantId_marketCode: { variantId: variant.id, marketCode: MarketCode.KR } },
        data: { amount: 99_000 },
      }),
      db.wigStyle.update({ where: { id: variant.styleId }, data: { name: "Current catalog name" } }),
    ]);

    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });

    expect(resumed).toMatchObject({
      sessionId: created.sessionId,
      currency: "KRW",
      subtotalAmount: 24_000,
      totalAmount: 24_000,
      disposition: "PAYMENT_ELIGIBLE",
      shipping: { recipientName: "홍길동", addressLine1: "테헤란로 1" },
    });
    expect(resumed?.lines[0]).toMatchObject({
      quantity: 2,
      unitAmount: 12_000,
      snapshot: { styleName: variant.styleName, currencyCode: "KRW" },
    });
    await expect(db.checkoutSession.count({ where: { userId: ctx.userId } })).resolves.toBe(1);
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(0);
  });

  it("returns the same external absence for nonexistent and wrong-user explicit IDs", async () => {
    const created = await createReadySession(ctx);
    const otherUserId = `b1_other_${randomUUID()}`;
    await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@example.test` } });
    try {
      await expect(readCheckoutSessionResume(db, {
        checkoutSessionId: created.sessionId,
        authenticatedUserId: otherUserId,
      })).resolves.toBeNull();
      await expect(readCheckoutSessionResume(db, {
        checkoutSessionId: `missing_${randomUUID()}`,
        authenticatedUserId: otherUserId,
      })).resolves.toBeNull();
    } finally {
      await db.user.deleteMany({ where: { id: otherUserId } });
    }
  });

  it("isolates two explicit session IDs for the same user's two tabs", async () => {
    const variant = await createCartVariant(ctx, { amount: 12_000, stock: 5 });
    await addCart(ctx, variant, 1);
    const first = await createCheckoutSession(db, baseInput(ctx));
    const second = await createCheckoutSession(db, baseInput(ctx));

    const [tabA, tabB] = await Promise.all([
      readCheckoutSessionResume(db, {
        checkoutSessionId: first.sessionId,
        authenticatedUserId: ctx.userId,
      }),
      readCheckoutSessionResume(db, {
        checkoutSessionId: second.sessionId,
        authenticatedUserId: ctx.userId,
      }),
    ]);

    expect(tabA?.sessionId).toBe(first.sessionId);
    expect(tabB?.sessionId).toBe(second.sessionId);
    expect(tabA?.sessionId).not.toBe(tabB?.sessionId);
  });

  it("gates every existing Payment from the resumed initiation surface", async () => {
    const created = await createReadySession(ctx);
    await createSessionPayment(created, PaymentAttemptLifecycle.CONTACTED);

    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });

    expect(resumed?.disposition).toBe("PAYMENT_EXISTS");
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(1);
  });

  it("keeps frozen market/currency amounts visible but gates a drifted current Market relationship", async () => {
    const created = await createReadySession(ctx);
    await db.market.update({ where: { code: MarketCode.KR }, data: { currency: "JPY" } });

    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });

    expect(resumed).toMatchObject({
      sessionId: created.sessionId,
      marketCode: "KR",
      currency: "KRW",
      totalAmount: 12_000,
      disposition: "MARKET_UNAVAILABLE",
    });
    expect(resumed?.lines[0]?.snapshot.currencyCode).toBe("KRW");
  });

  it("classifies expiry lazily without mutating the durable session", async () => {
    const createdAt = new Date("2026-08-23T00:00:00.000Z");
    const created = await createReadySession(ctx, createdAt);

    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
      now: created.expiresAt,
    });

    expect(resumed?.disposition).toBe("EXPIRED");
    await expect(statusOf(created.sessionId)).resolves.toBe(CheckoutSessionStatus.SUBMITTED);
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(0);
  });

  it("fails closed for a COMPLETED session without its required Order", async () => {
    const created = await createReadySession(ctx);
    await db.checkoutSession.update({
      where: { id: created.sessionId },
      data: { status: CheckoutSessionStatus.COMPLETED, completedAt: new Date() },
    });

    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });

    expect(resumed?.disposition).toBe("TERMINAL");
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(0);
  });

  it("fails closed when required frozen shipping presentation is structurally incomplete", async () => {
    const created = await createReadySession(ctx);
    await db.checkoutSessionShipping.update({
      where: { sessionId: created.sessionId },
      data: { addressLine1: "" },
    });

    await expect(readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    })).resolves.toBeNull();
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(0);
  });

  it("reconstructs the same R10D-style zero-Payment session on repeated server reads", async () => {
    const variant = await createCartVariant(ctx, { amount: 4_999, stock: 5, marketCode: MarketCode.US });
    await addCart(ctx, variant, 1);
    const created = await createCheckoutSession(db, baseInput(ctx, {
      marketCode: MarketCode.US,
      shipping: validShipping(ShippingCountry.US),
    }));

    const firstRequest = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });
    const reconstructedRequest = await readCheckoutSessionResume(db, {
      checkoutSessionId: created.sessionId,
      authenticatedUserId: ctx.userId,
    });

    expect(firstRequest).toMatchObject({
      sessionId: created.sessionId,
      totalAmount: 4_999,
      currency: "USD",
      disposition: "PAYMENT_ELIGIBLE",
    });
    expect(reconstructedRequest).toEqual(firstRequest);
    await expect(db.checkoutSession.count({ where: { userId: ctx.userId } })).resolves.toBe(1);
    await expect(db.payment.count({ where: { checkoutSessionId: created.sessionId } })).resolves.toBe(0);
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
  await db.payment.deleteMany({ where: { session: { userId: context.userId } } });
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
      availableMarkets: {
        create: [MarketCode.KR, MarketCode.US, MarketCode.JP].map((marketCode) => ({ marketCode, isActive: true })),
      },
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
): Promise<{ id: string }> {
  return db.cartItem.create({
    data: { userId: context.userId, wigStyleId: variant.styleId, variantId: variant.id, quantity },
    select: { id: true },
  });
}

function baseInput(
  context: TestContext,
  overrides: Partial<Parameters<typeof createCheckoutSession>[1]> = {},
): Parameters<typeof createCheckoutSession>[1] {
  return {
    userId: context.userId,
    marketCode: MarketCode.KR,
    communicationLocale: "ko",
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

async function createPastDueSession(context: TestContext) {
  const session = await createReadySession(context);
  const expiresAt = new Date("2026-07-06T00:00:00.000Z");
  await db.checkoutSession.update({
    where: { id: session.sessionId },
    data: { expiresAt },
  });
  return { ...session, expiresAt };
}

async function createSupersededPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
) {
  const now = new Date();
  return db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `c2j-superseded:${randomUUID()}`,
      contactIntentAt: now,
      supersededAt: now,
      blockingEndedAt: now,
    },
    select: { id: true },
  });
}

function captureFacts(
  session: { sessionId: string; totalAmount: number; currency: string; expiresAt: Date },
  paymentId: string,
): CaptureFacts {
  const capturedAt = new Date(session.expiresAt.getTime() - 1);
  return {
    paymentId,
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey: `c2j-exposure:${randomUUID()}`,
    amount: session.totalAmount,
    currency: session.currency,
    capturedAt,
    receivedAt: new Date(),
  };
}

interface CoordinationBarrier {
  reached: Promise<void>;
  wait(): Promise<void>;
  release(): void;
}

function coordinationBarrier(): CoordinationBarrier {
  let markReached: () => void = () => { throw new Error("Coordination barrier was not initialized"); };
  let releaseWait: () => void = () => { throw new Error("Coordination barrier was not initialized"); };
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  const released = new Promise<void>((resolve) => { releaseWait = resolve; });
  return {
    reached,
    wait: async () => {
      markReached();
      await released;
    },
    release: releaseWait,
  };
}

function holdNextTransactionBeforeCommit(barrier: CoordinationBarrier) {
  const transaction = db.$transaction.bind(db);
  const transactionSpy = vi.spyOn(db, "$transaction");
  transactionSpy.mockImplementation(transaction);
  transactionSpy.mockImplementationOnce(async (operation) => transaction(async (tx) => {
    const result = await operation(tx);
    await barrier.wait();
    return result;
  }));
  return transactionSpy;
}

interface SessionLockWaitEvidence {
  state: string;
  waitEventType: string | null;
  blockingPids: number[];
}

async function openLockObserver(label: string): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for lock-wait verification");
  const observer = new Client({
    connectionString,
    application_name: `wig_c2j_session_observer_${label}`,
  });
  await observer.connect();
  return observer;
}

async function waitForSessionLockWait(observer: Client): Promise<SessionLockWaitEvidence> {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const result = await observer.query<SessionLockWaitEvidence>(`
      SELECT a.state,
             a.wait_event_type AS "waitEventType",
             pg_blocking_pids(a.pid) AS "blockingPids"
      FROM pg_stat_activity a
      WHERE a.datname = current_database()
        AND a.state = 'active'
        AND a.wait_event_type = 'Lock'
        AND a.query LIKE '%CheckoutSession%FOR UPDATE%'
        AND cardinality(pg_blocking_pids(a.pid)) > 0
    `);
    const waiting = result.rows[0];
    if (waiting) return waiting;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for CheckoutSession row-lock evidence");
}

async function createSessionPayment(
  session: { sessionId: string; totalAmount: number; currency: string },
  attemptLifecycle: PaymentAttemptLifecycle,
): Promise<void> {
  const contactIntentAt = new Date();
  await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      routingRuleId: `test.session-expiry.${randomUUID()}`,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle,
      amount: session.totalAmount,
      currency: session.currency,
      idempotencyKey: `session-expiry:${randomUUID()}`,
      contactIntentAt,
      contactStartedAt: attemptLifecycle === PaymentAttemptLifecycle.CONTACTED
        ? contactIntentAt
        : undefined,
    },
  });
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
