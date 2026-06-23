// ============================================================
// STRICT 존 통합 테스트 — processPayment / confirmPayment 2-phase
// 실제 DB + 외부 provider 경계 mock.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type {
  ConfirmInput,
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  PaymentResult,
  PaymentStatus,
} from "../types";

const providerState = vi.hoisted((): { provider: PaymentProvider | null } => ({ provider: null }));

vi.mock("../index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../index")>();
  return {
    ...actual,
    getPaymentProvider: (marketCode?: string) =>
      providerState.provider ?? actual.getPaymentProvider(marketCode),
  };
});

import { confirmPayment, processPayment } from "../process";

interface Ctx {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
}

const TEST_SNAPSHOT = {
  styleName: "테스트", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

function makeKey(): string { return `test_idem_${randomUUID()}`; }

function testProvider(initiateStatus: PaymentStatus, confirmStatus: PaymentStatus) {
  let confirmCalls = 0;
  const provider: PaymentProvider = {
    name: "test-provider",
    initiate(_input: InitiateInput): Promise<InitiateResult> {
      return Promise.resolve({ status: initiateStatus, providerTransactionId: null });
    },
    confirm(input: ConfirmInput): Promise<PaymentResult> {
      confirmCalls += 1;
      return Promise.resolve({
        status: confirmStatus,
        providerTransactionId: input.providerTransactionId,
      });
    },
  };
  return { provider, get confirmCalls() { return confirmCalls; } };
}

async function setupUser(runId: string): Promise<string> {
  const id = `test_${runId}`;
  await db.user.create({ data: { id, email: `${runId}@test.com`, role: "CUSTOMER" } });
  return id;
}

async function setupStyle(runId: string): Promise<string> {
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: { name: `테스트 ${runId}`, category: "FASHION", tags: [],
      availableMarkets: { create: { marketCode: "KR", isActive: true } } },
  });
  return style.id;
}

async function setupVariant(styleId: string, runId: string, stock: number): Promise<string> {
  const v = await db.wigVariant.create({
    data: {
      wigStyleId: styleId, color: "블랙", colorHex: null,
      length: "long", curl: "straight", price: 85000,
      stock, sku: `TEST_2P_${runId}`,
      marketPrices: { create: { marketCode: "KR", amount: 85000 } },
    },
  });
  return v.id;
}

async function setupOrder(userId: string, variantId: string, styleId: string): Promise<string> {
  const order = await db.order.create({
    data: {
      userId, status: "PENDING_PAYMENT", marketCode: "KR", currency: "KRW",
      totalAmount: 85000, shippingFee: 0, recipientName: "홍길동",
      phone: "010-1234-5678", country: "KR", postalCode: "06234",
      city: "강남구", addressLine1: "테헤란로 1",
      items: { create: [{ variantId, quantity: 1, unitPrice: 85000,
        snapshotData: TEST_SNAPSHOT, manufacturingRequest: { create: {} } }] },
    },
  });
  await db.cartItem.create({ data: { userId, wigStyleId: styleId, variantId, quantity: 1 } });
  return order.id;
}

async function setupFixtures(stock = 10): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const userId = await setupUser(runId);
  const styleId = await setupStyle(runId);
  const variantId = await setupVariant(styleId, runId, stock);
  const orderId = await setupOrder(userId, variantId, styleId);
  return { userId, orderId, variantId, styleId, initialStock: stock };
}

async function cleanupFixtures(ctx: Ctx | null): Promise<void> {
  if (!ctx) return;
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.order.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

describe("processPayment — 2-phase initiate", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("PENDING provider는 pending 결과를 반환하고 DB를 변경하지 않는다", async () => {
    providerState.provider = testProvider("PENDING", "SUCCEEDED").provider;
    const result = await processPayment(ctx!.orderId, ctx!.userId, makeKey());
    expect(result.status).toBe("pending");
    if (result.status === "pending") {
      expect(result).toMatchObject({ orderId: ctx!.orderId, amount: 85000, currency: "KRW" });
    }
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const cart = await db.cartItem.findMany({ where: { userId: ctx!.userId } });
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paymentStatus).toBe("PENDING");
    expect(variant.stock).toBe(ctx!.initialStock);
    expect(cart).toHaveLength(1);
    expect(payments).toHaveLength(0);
  });
});

describe("confirmPayment — 2-phase confirm success", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("confirm SUCCEEDED면 성공 트랜잭션 효과를 적용하고 재confirm은 멱등 성공이다", async () => {
    const wrapped = testProvider("PENDING", "SUCCEEDED");
    providerState.provider = wrapped.provider;
    const first = await confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_ok", redirectAmount: 85000 });
    const second = await confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_ok", redirectAmount: 85000 });
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const cart = await db.cartItem.findMany({ where: { userId: ctx!.userId } });
    const payments = await db.payment.findMany({ where: { orderId: ctx!.orderId } });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(wrapped.confirmCalls).toBe(1);
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
    expect(variant.stock).toBe(ctx!.initialStock - 1);
    expect(cart).toHaveLength(0);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe("SUCCEEDED");
  });
});

describe("confirmPayment — 2-phase confirm failure", () => {
  let ctx: Ctx | null = null;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); providerState.provider = null; ctx = null; });

  it("confirm FAILED면 실패 트랜잭션을 적용하고 재고는 차감하지 않는다", async () => {
    providerState.provider = testProvider("PENDING", "FAILED").provider;
    const result = await confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_fail", redirectAmount: 85000 });
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    const payment = await db.payment.findFirst({ where: { orderId: ctx!.orderId } });
    expect(result.success).toBe(false);
    expect(order.status).toBe("PAYMENT_FAILED");
    expect(order.paymentStatus).toBe("FAILED");
    expect(variant.stock).toBe(ctx!.initialStock);
    expect(payment?.status).toBe("FAILED");
  });

  it("금액 불일치면 provider.confirm을 호출하지 않고 확정하지 않는다", async () => {
    const wrapped = testProvider("PENDING", "SUCCEEDED");
    providerState.provider = wrapped.provider;
    const result = await confirmPayment({ orderId: ctx!.orderId, userId: ctx!.userId, paymentKey: "pay_tampered", redirectAmount: 1 });
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx!.orderId } });
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx!.variantId } });
    expect(result.success).toBe(false);
    expect(wrapped.confirmCalls).toBe(0);
    expect(order.status).toBe("PAYMENT_FAILED");
    expect(order.paymentStatus).toBe("FAILED");
    expect(variant.stock).toBe(ctx!.initialStock);
  });
});
