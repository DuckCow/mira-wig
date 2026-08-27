import { randomUUID } from "node:crypto";
import { OutboxStatus } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  createTransactionalEmailHandlers,
  orderPaidEmailDedupKey,
  type TransactionalEmailPort,
  type TransactionalEmailProjectionSource,
  type TransactionalEmailSendInput,
} from "@/lib/payment/email";
import { dispatchPending, type OutboxRegistry } from "@/lib/payment/outbox";
import { TransactionalEmailDeliveryError } from "@/lib/payment/email/delivery-error";

const FIRST_NOW = new Date("2026-08-27T05:00:00.000Z");
const createdIds: string[] = [];

describe("R13B email handler with generic outbox dispatcher", () => {
  afterEach(async () => {
    await db.paymentOutbox.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  it("retries transient transport failure and reaches DONE with a stable idempotency identity", async () => {
    const topic = `test.r13b.order-paid.${randomUUID()}`;
    const orderId = `order_${randomUUID()}`;
    const dedupKey = orderPaidEmailDedupKey(orderId);
    const job = await db.paymentOutbox.create({
      data: { topic, dedupKey, payload: { orderId } },
      select: { id: true },
    });
    createdIds.push(job.id);
    const sends: TransactionalEmailSendInput[] = [];
    let attempts = 0;
    const port: TransactionalEmailPort = {
      send: (input) => {
        sends.push(input);
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new TransactionalEmailDeliveryError(
            "TRANSIENT",
            "SES_SERVICE_UNAVAILABLE",
          ))
          : Promise.resolve();
      },
    };
    const handlers = createTransactionalEmailHandlers({
      source: source(orderId),
      port,
      publicOrigin: "https://mira.test",
    });
    const registry: OutboxRegistry = { [topic]: handlers[CUSTOMER_ORDER_PAID_EMAIL_V1] };

    const first = await dispatchPending({ client: db, registry, now: FIRST_NOW });
    const pending = await db.paymentOutbox.findUniqueOrThrow({ where: { id: job.id } });
    const retryAt = requireDate(pending.nextAttemptAt);
    const second = await dispatchPending({ client: db, registry, now: retryAt });
    const done = await db.paymentOutbox.findUniqueOrThrow({ where: { id: job.id } });

    expect(first).toMatchObject({ retried: 1, succeeded: 0 });
    expect(pending.lastError).toBe("SES_SERVICE_UNAVAILABLE");
    expect(second).toMatchObject({ retried: 0, succeeded: 1 });
    expect(done.status).toBe(OutboxStatus.DONE);
    expect(sends).toHaveLength(2);
    expect(sends.map((send) => send.idempotencyKey)).toEqual([dedupKey, dedupKey]);
  });

  it("terminally fails malformed payload without repeated attempts", async () => {
    const topic = `test.r13b.malformed.${randomUUID()}`;
    const orderId = `order_${randomUUID()}`;
    const job = await db.paymentOutbox.create({
      data: {
        topic,
        dedupKey: orderPaidEmailDedupKey(orderId),
        payload: { orderId, email: "attacker@example.test" },
      },
      select: { id: true },
    });
    createdIds.push(job.id);
    const handlers = createTransactionalEmailHandlers({
      source: source(orderId),
      port: { send: () => Promise.reject(new Error("must not send")) },
      publicOrigin: "https://mira.test",
    });
    const registry: OutboxRegistry = { [topic]: handlers[CUSTOMER_ORDER_PAID_EMAIL_V1] };

    const result = await dispatchPending({ client: db, registry, now: FIRST_NOW });
    const failed = await db.paymentOutbox.findUniqueOrThrow({ where: { id: job.id } });
    const replay = await dispatchPending({ client: db, registry, now: new Date(FIRST_NOW.getTime() + 86_400_000) });

    expect(result).toMatchObject({ terminalFailed: 1, retried: 0 });
    expect(failed.status).toBe(OutboxStatus.FAILED);
    expect(failed.attempts).toBe(1);
    expect(failed.nextAttemptAt).toBeNull();
    expect(replay.claimed).toBe(0);
  });
});

function source(orderId: string): TransactionalEmailProjectionSource {
  return {
    loadOrderPaid: () => Promise.resolve({
      ok: true,
      value: {
        to: "customer@example.test",
        locale: "en",
        orderId,
        paidAt: FIRST_NOW,
        status: "PAID",
        currency: "KRW",
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
            coverImageKey: null,
            currencyCode: "KRW",
          },
        }],
      },
    }),
    loadRefundSucceeded: () => Promise.resolve({ ok: false, reason: "NOT_USED" }),
  };
}

function requireDate(value: Date | null): Date {
  if (!value) throw new Error("Expected retry timestamp");
  return value;
}
