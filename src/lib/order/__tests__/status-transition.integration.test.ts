// STRICT integration tests -- order fulfillment status transitions
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { transitionOrderStatus } from "../status-transition";

type Ctx = { userId: string; orderId: string };

const ctxs: Ctx[] = [];

function makeRunId(): string {
  return randomUUID().slice(0, 8);
}

function paymentStatusFor(status: OrderStatus): PaymentStatus {
  if (status === "PENDING_PAYMENT") return "PENDING";
  if (status === "PAYMENT_FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "REFUNDED") return "REFUNDED";
  return "PAID";
}

async function setupOrder(status: OrderStatus): Promise<Ctx> {
  const runId = makeRunId();
  const userId = `status_${runId}`;
  await db.user.create({ data: { id: userId, email: `${runId}@status.test`, role: "CUSTOMER" } });
  const order = await db.order.create({
    data: {
      userId,
      status,
      paymentStatus: paymentStatusFor(status),
      marketCode: "KR",
      currency: "KRW",
      totalAmount: 85000,
      shippingFee: 0,
      recipientName: "홍길동",
      phone: "010-1234-5678",
      country: "KR",
      postalCode: "06234",
      city: "강남구",
      addressLine1: "테헤란로 1",
    },
  });
  const ctx = { userId, orderId: order.id };
  ctxs.push(ctx);
  return ctx;
}

async function readStatus(orderId: string): Promise<OrderStatus> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return order.status;
}

afterEach(async () => {
  const userIds = ctxs.map((ctx) => ctx.userId);
  ctxs.length = 0;
  if (userIds.length === 0) return;
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("transitionOrderStatus -- allowed forward path", () => {
  it("PAID에서 DELIVERED까지 한 단계씩만 전진한다", async () => {
    const ctx = await setupOrder("PAID");
    const steps: OrderStatus[] = ["CONFIRMED", "MANUFACTURING", "SHIPPED", "DELIVERED"];
    let current: OrderStatus = "PAID";

    for (const target of steps) {
      const result = await transitionOrderStatus({
        orderId: ctx.orderId,
        targetStatus: target,
        expectedCurrentStatus: current,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.previousStatus).toBe(current);
        expect(result.status).toBe(target);
        expect(result.idempotent).toBe(false);
      }
      expect(await readStatus(ctx.orderId)).toBe(target);
      current = target;
    }
  });
});

describe("transitionOrderStatus -- rejected transitions", () => {
  it.each([
    ["SHIPPED", "MANUFACTURING"],
    ["PAID", "SHIPPED"],
    ["PENDING_PAYMENT", "CONFIRMED"],
    ["PAYMENT_FAILED", "CONFIRMED"],
    ["CANCELLED", "CONFIRMED"],
    ["REFUNDED", "CONFIRMED"],
    ["DELIVERED", "CONFIRMED"],
  ] as const)("거부: %s -> %s", async (current, target) => {
    const ctx = await setupOrder(current);
    const result = await transitionOrderStatus({
      orderId: ctx.orderId,
      targetStatus: target,
      expectedCurrentStatus: current,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("INVALID_TRANSITION");
    expect(await readStatus(ctx.orderId)).toBe(current);
  });

  it("존재하지 않는 주문은 NOT_FOUND", async () => {
    const result = await transitionOrderStatus({ orderId: "missing-order", targetStatus: "CONFIRMED" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("NOT_FOUND");
  });

  it("이미 목표 상태면 성공으로 수렴한다", async () => {
    const ctx = await setupOrder("CONFIRMED");
    const result = await transitionOrderStatus({ orderId: ctx.orderId, targetStatus: "CONFIRMED" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.idempotent).toBe(true);
    expect(await readStatus(ctx.orderId)).toBe("CONFIRMED");
  });
});

describe("transitionOrderStatus -- concurrency guard", () => {
  it("기대 현재 상태가 다르면 CONFLICT이고 상태를 바꾸지 않는다", async () => {
    const ctx = await setupOrder("PAID");
    const result = await transitionOrderStatus({
      orderId: ctx.orderId,
      targetStatus: "CONFIRMED",
      expectedCurrentStatus: "CONFIRMED",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("CONFLICT");
    expect(await readStatus(ctx.orderId)).toBe("PAID");
  });

  it("동시 전이는 한쪽만 성공하고 한쪽은 CONFLICT로 끝난다", async () => {
    const ctx = await setupOrder("PAID");
    const results = await Promise.all([
      transitionOrderStatus({ orderId: ctx.orderId, targetStatus: "CONFIRMED", expectedCurrentStatus: "PAID" }),
      transitionOrderStatus({ orderId: ctx.orderId, targetStatus: "CONFIRMED", expectedCurrentStatus: "PAID" }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success && result.errorCode === "CONFLICT")).toHaveLength(1);
    expect(await readStatus(ctx.orderId)).toBe("CONFIRMED");
  });
});
