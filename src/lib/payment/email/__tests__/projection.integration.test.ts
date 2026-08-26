import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  FulfillmentType,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  RefundAttemptStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { snapshotToJson } from "@/lib/order/snapshot";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  createPrismaTransactionalEmailProjectionSource,
  createTransactionalEmailHandlers,
  orderPaidEmailDedupKey,
  refundSucceededEmailDedupKey,
  type TransactionalEmailSendInput,
} from "@/lib/payment/email";

const NOW = new Date("2026-08-27T06:00:00.000Z");

interface Fixture {
  userId: string;
  sessionId: string;
  paymentId: string;
  orderId: string;
  styleId: string;
  variantId: string;
}

describe("R13B authoritative email projection", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await cleanup(fixture);
  });

  it("uses server-owned recipient, frozen Locale, and persisted item snapshot", async () => {
    await Promise.all([
      db.user.update({
        where: { id: fixture.userId },
        data: { email: "current-account@example.test" },
      }),
      db.market.update({ where: { code: "KR" }, data: { defaultLocale: "en" } }),
      db.wigStyle.update({ where: { id: fixture.styleId }, data: { name: "Changed Catalog Name" } }),
    ]);
    const sends: TransactionalEmailSendInput[] = [];
    const registry = createTransactionalEmailHandlers({
      source: createPrismaTransactionalEmailProjectionSource(db),
      port: { send: (input) => { sends.push(input); return Promise.resolve(); } },
      publicOrigin: "https://mira.test",
    });

    await registry[CUSTOMER_ORDER_PAID_EMAIL_V1](
      { orderId: fixture.orderId },
      context(
        CUSTOMER_ORDER_PAID_EMAIL_V1,
        orderPaidEmailDedupKey(fixture.orderId),
      ),
    );

    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe("current-account@example.test");
    expect(sends[0].subject).toBe("ご注文を承りました");
    expect(sends[0].text).toContain("Frozen Historical Style");
    expect(sends[0].text).not.toContain("Changed Catalog Name");
  });

  it.each([
    [200, OrderStatus.PARTIALLY_REFUNDED, "PARTIAL", "800"],
    [1_000, OrderStatus.REFUNDED, "FULL", null],
  ] as const)(
    "renders coherent succeeded refund amount %s as %s",
    async (amount, orderStatus, completion, remainingFragment) => {
      const refundAttemptId = await createSucceededRefund(fixture, amount, orderStatus);
      const sends: TransactionalEmailSendInput[] = [];
      const registry = createTransactionalEmailHandlers({
        source: createPrismaTransactionalEmailProjectionSource(db),
        port: { send: (input) => { sends.push(input); return Promise.resolve(); } },
        publicOrigin: "https://mira.test",
      });

      const result = await registry[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1](
        { refundAttemptId },
        context(
          CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
          refundSucceededEmailDedupKey(refundAttemptId),
        ),
      );

      expect(result).toBeUndefined();
      expect(sends).toHaveLength(1);
      expect(sends[0].subject).toBe("返金が完了しました");
      expect(sends[0].text).toContain(completion === "FULL" ? "全額返金完了" : "一部返金完了");
      if (remainingFragment) expect(sends[0].text).toContain(remainingFragment);
      expect(sends[0].text).not.toMatch(/refundAttempt|providerRefund|refund_id|receipt|領収/iu);
    },
  );

  it("fails closed before transport when the succeeded refund ledger is incoherent", async () => {
    const refundAttemptId = await createSucceededRefund(fixture, 900, OrderStatus.REFUNDED);
    await db.refundAttempt.create({
      data: {
        orderId: fixture.orderId,
        paymentId: fixture.paymentId,
        amount: 200,
        currency: "KRW",
        status: RefundAttemptStatus.SUCCEEDED,
        reason: "Corrupt aggregate fixture",
        actorType: RefundAttemptActorType.SYSTEM,
        provider: PaymentProvider.MOCK,
        mode: PaymentMode.SANDBOX,
        idempotencyKey: `refund:${fixture.paymentId}:${randomUUID()}`,
        processedAt: NOW,
      },
    });
    let sendCount = 0;
    const registry = createTransactionalEmailHandlers({
      source: createPrismaTransactionalEmailProjectionSource(db),
      port: { send: () => { sendCount += 1; return Promise.resolve(); } },
      publicOrigin: "https://mira.test",
    });

    const result = await registry[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1](
      { refundAttemptId },
      context(
        CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
        refundSucceededEmailDedupKey(refundAttemptId),
      ),
    );

    expect(result).toEqual({ outcome: "terminal_failed", reason: "REFUND_LEDGER_INCOHERENT" });
    expect(sendCount).toBe(0);
  });
});

async function createFixture(): Promise<Fixture> {
  const identity = randomUUID();
  await db.market.upsert({
    where: { code: "KR" },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: "KR", currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
  const user = await db.user.create({
    data: { id: `r13b_user_${identity}`, email: `r13b_${identity}@example.test` },
  });
  const session = await db.checkoutSession.create({
    data: {
      userId: user.id,
      marketCode: "KR",
      communicationLocale: "ja",
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `provider_${identity}`,
      idempotencyKey: `payment_${identity}`,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
    },
  });
  const style = await db.wigStyle.create({
    data: {
      name: "Current Catalog Style",
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      length: "medium",
      curl: "straight",
      price: 1_000,
      stock: 1,
      sku: `R13B-${identity}`,
      isActive: true,
      fulfillmentType: FulfillmentType.STOCKED,
    },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId: user.id,
      marketCode: "KR",
      currency: "KRW",
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      status: OrderStatus.PAID,
      paidAt: NOW,
      items: {
        create: {
          variantId: variant.id,
          wigStyleId: style.id,
          quantity: 1,
          unitAmount: 1_000,
          fulfillmentType: FulfillmentType.STOCKED,
          snapshotData: snapshotToJson({
            styleName: "Frozen Historical Style",
            color: "Natural Black",
            colorHex: "#111111",
            length: "medium",
            curl: "straight",
            coverImageKey: null,
            currencyCode: "KRW",
          }),
        },
      },
    },
  });
  return {
    userId: user.id,
    sessionId: session.id,
    paymentId: payment.id,
    orderId: order.id,
    styleId: style.id,
    variantId: variant.id,
  };
}

async function createSucceededRefund(
  fixture: Fixture,
  amount: number,
  orderStatus: OrderStatus,
): Promise<string> {
  const attempt = await db.refundAttempt.create({
    data: {
      orderId: fixture.orderId,
      paymentId: fixture.paymentId,
      amount,
      currency: "KRW",
      status: RefundAttemptStatus.SUCCEEDED,
      reason: "Succeeded refund fixture",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${fixture.paymentId}:${randomUUID()}`,
      processedAt: NOW,
    },
  });
  await db.order.update({ where: { id: fixture.orderId }, data: { status: orderStatus } });
  return attempt.id;
}

async function cleanup(fixture: Fixture): Promise<void> {
  await db.refundAttemptTransition.deleteMany({ where: { refundAttempt: { orderId: fixture.orderId } } });
  await db.refundAttempt.deleteMany({ where: { orderId: fixture.orderId } });
  await db.orderItem.deleteMany({ where: { orderId: fixture.orderId } });
  await db.order.deleteMany({ where: { id: fixture.orderId } });
  await db.payment.deleteMany({ where: { id: fixture.paymentId } });
  await db.checkoutSession.deleteMany({ where: { id: fixture.sessionId } });
  await db.wigVariant.deleteMany({ where: { id: fixture.variantId } });
  await db.wigStyle.deleteMany({ where: { id: fixture.styleId } });
  await db.user.deleteMany({ where: { id: fixture.userId } });
}

function context(topic: string, dedupKey: string) {
  return { id: "outbox_projection", topic, dedupKey, attempt: 1, now: NOW };
}
