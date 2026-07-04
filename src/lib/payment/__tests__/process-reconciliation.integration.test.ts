// ============================================================
// STRICT 존 통합 테스트 — confirmPayment finalize 보정
// PG confirm 성공 후 local finalize 경계의 수렴/알림 동작.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { ConfirmInput, PaymentProvider, PaymentResult, RefundInput, RefundResult } from "../types";

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
import { orderHasUnreconciledPayment, resolveUnreconciledMarker } from "../reconciliation";

interface Ctx {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
type ConfirmHandler = (input: ConfirmInput) => Promise<PaymentResult>;
type RefundHandler = (input: RefundInput) => Promise<RefundResult>;

const TEST_SNAPSHOT = {
  styleName: "테스트", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function testProvider(confirm: ConfirmHandler, refund?: RefundHandler) {
  let confirmCalls = 0;
  let refundCalls = 0;
  const provider: PaymentProvider = {
    name: "test-provider",
    initiate: () => Promise.resolve({ status: "PENDING", providerTransactionId: null }),
    confirm: async (input) => {
      confirmCalls += 1;
      return confirm(input);
    },
    refund: refund
      ? async (input) => {
        refundCalls += 1;
        return refund(input);
      }
      : undefined,
  };
  return { provider, get confirmCalls() { return confirmCalls; }, get refundCalls() { return refundCalls; } };
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

async function forceStockOut(ctx: Ctx): Promise<void> {
  await db.wigVariant.update({ where: { id: ctx.variantId }, data: { stock: 0 } });
}

function confirmSucceeded(input: ConfirmInput): Promise<PaymentResult> {
  return Promise.resolve({ status: "SUCCEEDED", providerTransactionId: input.providerTransactionId });
}

function confirmSucceededWithSecret(secret: string): ConfirmHandler {
  return (input) => Promise.resolve({
    status: "SUCCEEDED",
    providerTransactionId: input.providerTransactionId,
    providerWebhookSecret: secret,
  });
}

function refundSucceeded(providerRefundId: string): RefundHandler {
  return (input) => Promise.resolve({
    providerTransactionId: input.providerTransactionId,
    providerRefundId,
    status: "SUCCEEDED",
    amount: input.amount,
    currency: input.currency,
    refundableAmount: 0,
  });
}

function refundFailed(input: RefundInput): Promise<RefundResult> {
  return Promise.resolve({
    providerTransactionId: input.providerTransactionId,
    status: "FAILED",
    amount: input.amount,
    currency: input.currency,
    errorMessage: "refund failed",
  });
}

function confirm(ctx: Ctx, paymentKey: string) {
  return confirmPayment({ orderId: ctx.orderId, userId: ctx.userId, paymentKey, redirectAmount: 85000 });
}

async function adjustmentsFor(ctx: Ctx) {
  return db.paymentAdjustment.findMany({ where: { payment: { orderId: ctx.orderId } } });
}

function markerKey(ctx: Ctx, paymentKey: string): string {
  return `unconfirmed:${ctx.orderId}:${paymentKey}`;
}

function autoRefundKey(ctx: Ctx, paymentKey: string): string {
  return `auto-refund:${ctx.orderId}:${paymentKey}`;
}

async function createUnconfirmedMarker(ctx: Ctx, paymentKey: string) {
  return db.payment.create({
    data: {
      orderId: ctx.orderId,
      provider: "test-provider",
      providerTransactionId: paymentKey,
      idempotencyKey: markerKey(ctx, paymentKey),
      status: "PENDING",
      amount: 85000,
      currency: "KRW",
    },
  });
}

async function createPendingAutoRefund(ctx: Ctx, paymentKey: string) {
  const payment = await createUnconfirmedMarker(ctx, paymentKey);
  return db.paymentAdjustment.create({
    data: {
      paymentId: payment.id,
      amount: 85000,
      currency: "KRW",
      reason: "test pending auto refund",
      status: "PENDING",
      idempotencyKey: autoRefundKey(ctx, paymentKey),
    },
  });
}

async function autoRefundAdjustment(ctx: Ctx, paymentKey: string) {
  return db.paymentAdjustment.findUniqueOrThrow({ where: { idempotencyKey: autoRefundKey(ctx, paymentKey) } });
}

async function expectUnconfirmedMarker(ctx: Ctx, paymentKey: string, providerWebhookSecret: string | null): Promise<void> {
  const order = await db.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
  const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
  const payments = await db.payment.findMany({ where: { orderId: ctx.orderId } });
  expect(order.status).toBe("PENDING_PAYMENT");
  expect(variant.stock).toBe(0);
  expect(payments).toHaveLength(1);
  expect(payments[0]?.status).toBe("PENDING");
  expect(payments[0]?.providerTransactionId).toBe(paymentKey);
  expect(payments[0]?.providerWebhookSecret).toBe(providerWebhookSecret);
  expect(await orderHasUnreconciledPayment(ctx.orderId)).toBe(true);
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
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
  });
});

describe("orderHasUnreconciledPayment", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("marker 없는 PENDING_PAYMENT 주문은 unconfirmed 가드로 보지 않는다", async () => {
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
  });

  it("일반 PENDING 결제행은 unconfirmed 가드로 보지 않는다", async () => {
    await db.payment.create({
      data: {
        orderId: ctx!.orderId,
        provider: "test-provider",
        providerTransactionId: "pay_regular_pending",
        idempotencyKey: `regular:${ctx!.orderId}:pay_regular_pending`,
        status: "PENDING",
        amount: 85000,
        currency: "KRW",
      },
    });
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
  });

  it("adjustment 없는 PENDING unconfirmed marker는 가드로 본다", async () => {
    await createUnconfirmedMarker(ctx!, "pay_marker_only");
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(true);
  });

  it("FAILED auto-refund adjustment가 달린 PENDING marker는 가드로 본다", async () => {
    const marker = await createUnconfirmedMarker(ctx!, "pay_refund_failed_marker");
    await db.paymentAdjustment.create({
      data: {
        paymentId: marker.id,
        amount: 85000,
        currency: "KRW",
        reason: "test failed auto refund",
        status: "FAILED",
        idempotencyKey: autoRefundKey(ctx!, "pay_refund_failed_marker"),
      },
    });
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(true);
  });

  it("REFUNDED marker와 SUCCEEDED adjustment로 종결된 주문은 가드로 보지 않는다", async () => {
    const marker = await createUnconfirmedMarker(ctx!, "pay_resolved_marker");
    await db.payment.update({ where: { id: marker.id }, data: { status: "REFUNDED" } });
    await db.paymentAdjustment.create({
      data: {
        paymentId: marker.id,
        providerRefundId: "refund_resolved",
        amount: 85000,
        currency: "KRW",
        reason: "test resolved auto refund",
        status: "SUCCEEDED",
        idempotencyKey: autoRefundKey(ctx!, "pay_resolved_marker"),
      },
    });
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
  });
});

describe("confirmPayment — local finalize unconfirmed marker", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("PG 성공 후 finalize 미확정 + 보상 성공이면 secret 저장 후 마커를 REFUNDED로 해소한다", async () => {
    await forceStockOut(ctx!);
    const wrapped = testProvider(confirmSucceededWithSecret("secret_stock_out"), refundSucceeded("cancel_stock_out"));
    providerState.provider = wrapped.provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await confirm(ctx!, "pay_stock_out");
    const adjustments = await adjustmentsFor(ctx!);
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(result.status).toBe("unconfirmed");
    expect(wrapped.refundCalls).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("PAYMENT_AUTO_REFUND_SUCCEEDED", expect.objectContaining({
      orderId: ctx!.orderId,
      providerTransactionId: "pay_stock_out",
      providerRefundId: "cancel_stock_out",
    }));
    expect(errorSpy).toHaveBeenCalledWith("PAYMENT_RECONCILIATION_REQUIRED", expect.objectContaining({
      orderId: ctx!.orderId,
      paymentKey: "pay_stock_out",
    }));
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.status).toBe("SUCCEEDED");
    expect(adjustments[0]?.amount).toBe(85000);
    expect(adjustments[0]?.currency).toBe("KRW");
    expect(adjustments[0]?.providerRefundId).toBe("cancel_stock_out");
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("REFUNDED");
    expect(payments[0]?.providerTransactionId).toBe("pay_stock_out");
    expect(payments[0]?.providerWebhookSecret).toBe("secret_stock_out");
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
    await resolveUnreconciledMarker(ctx!.orderId, "pay_stock_out", "REFUNDED");
    expect(await orderHasUnreconciledPayment(ctx!.orderId)).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("confirmPayment — local finalize auto refund idempotency", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("같은 unconfirmed 재진입은 자동 보상을 중복 호출하지 않는다", async () => {
    await forceStockOut(ctx!);
    const wrapped = testProvider(confirmSucceeded, refundSucceeded("cancel_once"));
    providerState.provider = wrapped.provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await confirm(ctx!, "pay_retry");
    const second = await confirm(ctx!, "pay_retry");
    const adjustments = await adjustmentsFor(ctx!);
    expect(first.status).toBe("unconfirmed");
    expect(second.status).toBe("unconfirmed");
    expect(wrapped.refundCalls).toBe(1);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.idempotencyKey).toBe(`auto-refund:${ctx!.orderId}:pay_retry`);
    errorSpy.mockRestore();
  });

  it("PENDING 선기록만 남은 재진입은 자동 보상을 호출하지 않는다", async () => {
    await forceStockOut(ctx!);
    await createPendingAutoRefund(ctx!, "pay_pending_claim");
    const wrapped = testProvider(confirmSucceeded, refundSucceeded("cancel_not_called"));
    providerState.provider = wrapped.provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await confirm(ctx!, "pay_pending_claim");
    const adjustment = await autoRefundAdjustment(ctx!, "pay_pending_claim");
    expect(result.status).toBe("unconfirmed");
    expect(wrapped.refundCalls).toBe(0);
    expect(adjustment.status).toBe("PENDING");
    expect(adjustment.providerRefundId).toBeNull();
    errorSpy.mockRestore();
  });

  it("refund 성공 후 기록 update 실패 재진입은 자동 보상을 재호출하지 않는다", async () => {
    await forceStockOut(ctx!);
    const marker = await createUnconfirmedMarker(ctx!, "pay_update_crash");
    await db.paymentAdjustment.create({
      data: {
        paymentId: marker.id,
        providerRefundId: "cancel_collision",
        amount: 1,
        currency: "KRW",
        reason: "test collision",
        status: "SUCCEEDED",
        idempotencyKey: `collision:${ctx!.orderId}:pay_update_crash`,
      },
    });
    const wrapped = testProvider(confirmSucceeded, refundSucceeded("cancel_collision"));
    providerState.provider = wrapped.provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirm(ctx!, "pay_update_crash")).rejects.toThrow();
    expect(wrapped.refundCalls).toBe(1);
    const result = await confirm(ctx!, "pay_update_crash");
    const adjustment = await autoRefundAdjustment(ctx!, "pay_update_crash");
    expect(result.status).toBe("unconfirmed");
    expect(wrapped.refundCalls).toBe(1);
    expect(adjustment.status).toBe("PENDING");
    expect(adjustment.providerRefundId).toBeNull();
    errorSpy.mockRestore();
  });
});

describe("confirmPayment — local finalize auto refund failure", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("자동 보상이 실패해도 unconfirmed를 반환하고 실패 기록을 남긴다", async () => {
    await forceStockOut(ctx!);
    providerState.provider = testProvider(confirmSucceeded, refundFailed).provider;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await confirm(ctx!, "pay_refund_fail");
    const adjustments = await adjustmentsFor(ctx!);
    expect(result.status).toBe("unconfirmed");
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.status).toBe("FAILED");
    expect(errorSpy).toHaveBeenCalledWith("PAYMENT_AUTO_REFUND_FAILED", expect.objectContaining({
      orderId: ctx!.orderId,
      providerTransactionId: "pay_refund_fail",
      error: "refund failed",
    }));
    await expectUnconfirmedMarker(ctx!, "pay_refund_fail", null);
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
