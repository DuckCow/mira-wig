// ============================================================
// STRICT 존 통합 테스트 — confirmPayment finalize 보정
// PG confirm 성공 후 local finalize 경계의 수렴/알림 동작.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { ConfirmInput, PaymentProvider, PaymentResult } from "../types";

const providerState = vi.hoisted((): { provider: PaymentProvider | null } => ({ provider: null }));

vi.mock("../index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../index")>();
  return {
    ...actual,
    getPaymentProvider: (marketCode?: string) =>
      providerState.provider ?? actual.getPaymentProvider(marketCode),
  };
});

import { confirmPayment } from "../process";

interface Ctx {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type ConfirmHandler = (input: ConfirmInput) => Promise<PaymentResult>;

const TEST_SNAPSHOT = {
  styleName: "테스트", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function testProvider(confirm: ConfirmHandler) {
  let confirmCalls = 0;
  const provider: PaymentProvider = {
    name: "test-provider",
    initiate: () => Promise.resolve({ status: "PENDING", providerTransactionId: null }),
    confirm: async (input) => {
      confirmCalls += 1;
      return confirm(input);
    },
  };
  return { provider, get confirmCalls() { return confirmCalls; } };
}

async function setupFixtures(stock = 10): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const userId = `test_${runId}`;
  await db.user.create({ data: { id: userId, email: `${runId}@test.com`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: { name: `테스트 ${runId}`, category: "FASHION", tags: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } } },
  });
  const variant = await db.wigVariant.create({
    data: { wigStyleId: style.id, color: "블랙", length: "long", curl: "straight",
      price: 85000, stock, sku: `TEST_REC_${runId}`,
      marketPrices: { create: { marketCode: "KR", amount: 85000 } } },
  });
  const order = await db.order.create({
    data: { userId, status: "PENDING_PAYMENT", marketCode: "KR", currency: "KRW",
      totalAmount: 85000, shippingFee: 0, recipientName: "홍길동",
      phone: "010-1234-5678", country: "KR", postalCode: "06234",
      city: "강남구", addressLine1: "테헤란로 1",
      items: { create: [{ variantId: variant.id, quantity: 1, unitPrice: 85000,
        snapshotData: TEST_SNAPSHOT, manufacturingRequest: { create: {} } }] } },
  });
  await db.cartItem.create({ data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 } });
  return { userId, orderId: order.id, variantId: variant.id, styleId: style.id, initialStock: stock };
}

async function cleanupFixtures(ctx: Ctx | null): Promise<void> {
  if (!ctx) return;
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.order.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

async function markOrderPaid(ctx: Ctx): Promise<void> {
  await db.order.update({
    where: { id: ctx.orderId },
    data: { status: "PAID", paymentStatus: "PAID" },
  });
  await db.payment.create({
    data: { orderId: ctx.orderId, provider: "test-provider", providerTransactionId: "pay_winner",
      idempotencyKey: `test_idem_${randomUUID()}`, status: "SUCCEEDED",
      amount: 85000, currency: "KRW" },
  });
}

async function waitForConfirmCall(wrapped: { confirmCalls: number }): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (wrapped.confirmCalls > 0) return;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  throw new Error("confirm 호출 대기 실패");
}

describe("confirmPayment — concurrent finalize reconciliation", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("동시 confirm 두 건은 모두 success로 수렴하고 재고는 한 번만 차감된다", async () => {
    const wrapped = testProvider((input) => Promise.resolve({
      status: "SUCCEEDED",
      providerTransactionId: input.providerTransactionId,
    }));
    providerState.provider = wrapped.provider;
    const [first, second] = await Promise.all([
      confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_same", redirectAmount: 85000 }),
      confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_same", redirectAmount: 85000 }),
    ]);
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("SUCCEEDED");
  });
});

describe("confirmPayment — local finalize unconfirmed", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("PG 성공 후 finalize 미확정이면 unconfirmed와 알림 로그를 남긴다", async () => {
    await db.wigVariant.update({ where: { id: ctx!.variantId }, data: { stock: 0 } });
    providerState.provider = testProvider((input) => Promise.resolve({
      status: "SUCCEEDED",
      providerTransactionId: input.providerTransactionId,
    })).provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_stock_out", redirectAmount: 85000 });
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(result.status).toBe("unconfirmed");
    expect(errorSpy).toHaveBeenCalledWith("PAYMENT_RECONCILIATION_REQUIRED", expect.objectContaining({
      orderId: ctx!.orderId,
      paymentKey: "pay_stock_out",
    }));
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(variant.stock).toBe(0);
    expect(payments).toHaveLength(0);
    errorSpy.mockRestore();
  });
});

describe("confirmPayment — failed confirm after paid race", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("provider confirm FAILED라도 주문이 이미 PAID면 success로 수렴한다", async () => {
    const gate = deferred<void>();
    const wrapped = testProvider(async (input) => {
      await gate.promise;
      return { status: "FAILED", providerTransactionId: input.providerTransactionId };
    });
    providerState.provider = wrapped.provider;
    const pending = confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_late_fail", redirectAmount: 85000 });
    await waitForConfirmCall(wrapped);
    await markOrderPaid(ctx!);
    gate.resolve();
    const result = await pending;
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(result.success).toBe(true);
    expect(payments.map((payment) => payment.status)).toEqual(["SUCCEEDED"]);
  });
});
