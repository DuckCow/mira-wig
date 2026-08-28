import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OrderStatus, type Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { OutboxHandlerContext } from "@/lib/payment/outbox";
import { TransactionalEmailDeliveryError } from "@/lib/payment/email/delivery-error";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  buildOrderPaidEmail,
  buildRefundSucceededEmail,
  createTransactionalEmailHandlers,
  orderPaidEmailDedupKey,
  parseOrderPaidEmailPayload,
  parseRefundSucceededEmailPayload,
  refundSucceededEmailDedupKey,
  type OrderPaidEmailProjection,
  type RefundSucceededEmailProjection,
  type TransactionalEmailPort,
  type TransactionalEmailProjectionSource,
  type TransactionalEmailSendInput,
} from "@/lib/payment/email";

const NOW = new Date("2026-08-27T03:04:05.000Z");

describe("R13B transactional email source", () => {
  it("strictly admits identity-only payloads", () => {
    expect(parseOrderPaidEmailPayload({ orderId: "order_1" })).toEqual({ orderId: "order_1" });
    expect(parseRefundSucceededEmailPayload({ refundAttemptId: "refund_1" }))
      .toEqual({ refundAttemptId: "refund_1" });

    const rejected: Prisma.JsonValue[] = [
      null,
      [],
      {},
      { orderId: "" },
      { orderId: "order_1", email: "attacker@example.test" },
      { refundAttemptId: "refund_1", locale: "en" },
      { refundAttemptId: 42 },
    ];
    for (const payload of rejected) {
      expect(parseOrderPaidEmailPayload(payload)).toBeNull();
      expect(parseRefundSucceededEmailPayload(payload)).toBeNull();
    }
  });

  it.each([
    ["ko", "주문이 접수되었습니다", "환불이 완료되었습니다"],
    ["en", "Your order has been received", "Your refund is complete"],
    ["ja", "ご注文を承りました", "返金が完了しました"],
  ] as const)("renders customer-safe %s templates", (locale, orderSubject, refundSubject) => {
    const order = buildOrderPaidEmail(orderProjection(locale), "https://mira.test/orders/order_public");
    const refund = buildRefundSucceededEmail(
      refundProjection(locale),
      "https://mira.test/orders/order_public",
    );
    const rendered = `${order.subject}\n${order.text}\n${refund.subject}\n${refund.text}`;

    expect(order.subject).toBe(orderSubject);
    expect(refund.subject).toBe(refundSubject);
    expect(rendered).toContain("Frozen Style");
    expect(rendered).toContain("https://mira.test/orders/order_public");
    expect(rendered).not.toMatch(
      /receipt|영수증|領収|providerPaymentKey|providerOrderId|provider transaction|MID|routingRule|refund_id|providerRefundId|secret|서울시 강남구/iu,
    );
  });

  it.each([
    ["ko", "쿠폰 할인"],
    ["en", "Coupon discount"],
    ["ja", "クーポン割引"],
  ] as const)("renders the persisted coupon discount in the %s order-paid email", (locale, label) => {
    const projection = { ...orderProjection(locale), discountAmount: 5_000, totalPaidAmount: 80_000 };
    const email = buildOrderPaidEmail(projection, "https://mira.test/orders/order_public");

    expect(email.text).toContain(label);
    expect(email.text).toContain("₩5,000");
    expect(email.text).toContain("₩80,000");
  });

  it("sends through the provider-neutral port only after projection with a stable identity", async () => {
    const sends: TransactionalEmailSendInput[] = [];
    const port: TransactionalEmailPort = { send: (input) => { sends.push(input); return Promise.resolve(); } };
    const source = successfulSource();
    const registry = createTransactionalEmailHandlers({ source, port, publicOrigin: "https://mira.test" });
    const orderHandler = registry[CUSTOMER_ORDER_PAID_EMAIL_V1];
    const refundHandler = registry[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1];

    await orderHandler({ orderId: "order_public" }, context(
      CUSTOMER_ORDER_PAID_EMAIL_V1,
      orderPaidEmailDedupKey("order_public"),
    ));
    await refundHandler({ refundAttemptId: "refund_public" }, context(
      CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
      refundSucceededEmailDedupKey("refund_public"),
    ));

    expect(sends.map((send) => send.idempotencyKey)).toEqual([
      "customer-order-paid:v1:order_public",
      "customer-refund-succeeded:v1:refund_public",
    ]);
    expect(sends.every((send) => send.to === "customer@example.test")).toBe(true);
  });

  it("classifies malformed, mismatched, and permanently non-sendable jobs as terminal", async () => {
    const send = vi.fn<TransactionalEmailPort["send"]>();
    const source: TransactionalEmailProjectionSource = {
      loadOrderPaid: () => Promise.resolve({ ok: false, reason: "RECIPIENT_UNAVAILABLE" }),
      loadRefundSucceeded: () => Promise.resolve({ ok: false, reason: "COMMUNICATION_LOCALE_UNAVAILABLE" }),
    };
    const registry = createTransactionalEmailHandlers({ source, port: { send }, publicOrigin: "https://mira.test" });
    const orderHandler = registry[CUSTOMER_ORDER_PAID_EMAIL_V1];
    const refundHandler = registry[CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1];

    await expect(orderHandler({ orderId: "order_public", locale: "en" }, context(
      CUSTOMER_ORDER_PAID_EMAIL_V1,
      orderPaidEmailDedupKey("order_public"),
    ))).resolves.toEqual({ outcome: "terminal_failed", reason: "ORDER_PAID_EMAIL_PAYLOAD_INVALID" });
    await expect(orderHandler({ orderId: "order_public" }, context(
      CUSTOMER_ORDER_PAID_EMAIL_V1,
      "wrong",
    ))).resolves.toEqual({ outcome: "terminal_failed", reason: "ORDER_PAID_EMAIL_DEDUP_INVALID" });
    await expect(orderHandler({ orderId: "order_public" }, context(
      CUSTOMER_ORDER_PAID_EMAIL_V1,
      orderPaidEmailDedupKey("order_public"),
    ))).resolves.toEqual({ outcome: "terminal_failed", reason: "RECIPIENT_UNAVAILABLE" });
    await expect(refundHandler({ refundAttemptId: "refund_public" }, context(
      CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
      refundSucceededEmailDedupKey("refund_public"),
    ))).resolves.toEqual({ outcome: "terminal_failed", reason: "COMMUNICATION_LOCALE_UNAVAILABLE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("lets transient port failures enter the installed dispatcher retry path", async () => {
    const transportFailure = new TransactionalEmailDeliveryError(
      "TRANSIENT",
      "SES_SERVICE_UNAVAILABLE",
    );
    const port: TransactionalEmailPort = { send: () => Promise.reject(transportFailure) };
    const registry = createTransactionalEmailHandlers({
      source: successfulSource(),
      port,
      publicOrigin: "https://mira.test/",
    });

    await expect(registry[CUSTOMER_ORDER_PAID_EMAIL_V1](
      { orderId: "order_public" },
      context(CUSTOMER_ORDER_PAID_EMAIL_V1, orderPaidEmailDedupKey("order_public")),
    )).rejects.toBe(transportFailure);
  });

  it("converges permanent delivery failures to terminal_failed with only the safe code", async () => {
    const port: TransactionalEmailPort = {
      send: () => Promise.reject(new TransactionalEmailDeliveryError(
        "PERMANENT",
        "SES_MESSAGE_REJECTED",
      )),
    };
    const registry = createTransactionalEmailHandlers({
      source: successfulSource(),
      port,
      publicOrigin: "https://mira.test",
    });

    await expect(registry[CUSTOMER_ORDER_PAID_EMAIL_V1](
      { orderId: "order_public" },
      context(CUSTOMER_ORDER_PAID_EMAIL_V1, orderPaidEmailDedupKey("order_public")),
    )).resolves.toEqual({ outcome: "terminal_failed", reason: "SES_MESSAGE_REJECTED" });
  });

  it.each([
    "http://mira.test",
    "https://user:mypass@mira.test",
    "https://mira.test/store",
    "https://mira.test?market=KR",
    " https://mira.test",
  ])("rejects invalid public Mira origin %s", (publicOrigin) => {
    expect(() => createTransactionalEmailHandlers({
      source: successfulSource(),
      port: { send: () => Promise.resolve() },
      publicOrigin,
    })).toThrow("PUBLIC_MIRA_ORIGIN_INVALID");
  });

  it("keeps both R13B topics out of the production dispatcher registry", async () => {
    const source = await readFile(join(process.cwd(), "scripts/outbox-dispatch.ts"), "utf8");
    expect(source).not.toContain(CUSTOMER_ORDER_PAID_EMAIL_V1);
    expect(source).not.toContain(CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1);
    expect(source).not.toContain("customer.order-paid.email.v1");
    expect(source).not.toContain("customer.refund-succeeded.email.v1");
  });
});

function successfulSource(): TransactionalEmailProjectionSource {
  return {
    loadOrderPaid: () => Promise.resolve({ ok: true, value: orderProjection("en") }),
    loadRefundSucceeded: () => Promise.resolve({ ok: true, value: refundProjection("en") }),
  };
}

function orderProjection(locale: "ko" | "en" | "ja"): OrderPaidEmailProjection {
  return {
    to: "customer@example.test",
    locale,
    orderId: "order_public",
    paidAt: NOW,
    status: OrderStatus.PAID,
    currency: "KRW",
    discountAmount: 0,
    totalPaidAmount: 85_000,
    items: [{
      quantity: 1,
      unitAmount: 85_000,
      snapshot: {
        styleName: "Frozen Style",
        color: "Natural Black",
        colorHex: "#111111",
        length: "medium",
        curl: "straight",
        coverImageKey: "catalog/frozen.png",
        currencyCode: "KRW",
      },
    }],
  };
}

function refundProjection(locale: "ko" | "en" | "ja"): RefundSucceededEmailProjection {
  return {
    to: "customer@example.test",
    locale,
    orderId: "order_public",
    succeededAt: NOW,
    refundAmount: 20_000,
    currency: "KRW",
    completion: "PARTIAL",
    remainingPaidAmount: 65_000,
  };
}

function context(topic: string, dedupKey: string): OutboxHandlerContext {
  return { id: "outbox_1", topic, dedupKey, attempt: 1, now: NOW };
}
