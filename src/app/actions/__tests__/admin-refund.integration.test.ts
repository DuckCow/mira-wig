// STRICT -- admin refund action + core behavior
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundInput, RefundResult } from "@/lib/payment/types";

type RefundHandler = (input: RefundInput) => Promise<RefundResult>;
type SessionHandler = () => Promise<Session | null>;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<SessionHandler>(),
  refund: vi.fn<RefundHandler>(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payment", () => ({
  getPaymentProvider: () => ({
    name: "test-provider",
    initiate: () => Promise.resolve({ status: "PENDING", providerTransactionId: null }),
    confirm: () => Promise.resolve({ status: "FAILED", providerTransactionId: "unused" }),
    refund: mocks.refund,
  }),
}));

import { db } from "@/lib/db";
import {
  refundOrderPaymentAction,
  type RefundOrderPaymentActionInput,
} from "../admin/orders";

type Ctx = {
  userId: string;
  styleId: string;
  variantId: string;
  orderId: string;
  paymentId: string;
  providerTransactionId: string;
  amount: number;
  initialStock: number;
};

const createdContexts: Ctx[] = [];

const SNAPSHOT = {
  styleName: "환불 테스트",
  color: "블랙",
  colorHex: null,
  length: "long",
  curl: "straight",
  coverImageKey: null,
  currencyCode: "KRW",
};

function makeSession(role: string): Session {
  return { user: { id: `${role.toLowerCase()}-1`, email: `${role}@test.com`, name: role, role }, expires: "2099-01-01" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(makeSession("ADMIN"));
  mockRefundSuccess();
});

afterEach(async () => {
  for (const ctx of createdContexts.splice(0).reverse()) await cleanup(ctx);
});

describe("refundOrderPaymentAction", () => {
  it("전액 환불은 adjustment를 성공 처리하고 주문/결제 상태를 REFUNDED로 바꾼다", async () => {
    const ctx = await createPaidOrder();
    const result = await refundOrderPaymentAction(actionInput(ctx));

    expect(result.success).toBe(true);
    expect(mocks.refund).toHaveBeenCalledTimes(1);
    expect(mocks.refund.mock.calls[0]?.[0].providerTransactionId).toBe(ctx.providerTransactionId);
    expect(mocks.refund.mock.calls[0]?.[0].amount).toBeUndefined();
    const state = await readState(ctx);
    expect(state.order.status).toBe("REFUNDED");
    expect(state.order.paymentStatus).toBe("REFUNDED");
    expect(state.payment.status).toBe("REFUNDED");
    expect(state.adjustments).toMatchObject([{ amount: ctx.amount, status: "SUCCEEDED" }]);
    expect(state.variant.stock).toBe(ctx.initialStock);
  });

  it("부분 환불은 주문 status를 유지하고 결제 상태만 PARTIALLY_REFUNDED로 바꾼다", async () => {
    const ctx = await createPaidOrder();
    const result = await refundOrderPaymentAction(actionInput(ctx, { amount: 30000 }));

    expect(result.success).toBe(true);
    expect(mocks.refund.mock.calls[0]?.[0].amount).toBe(30000);
    const state = await readState(ctx);
    expect(state.order.status).toBe("PAID");
    expect(state.order.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(state.payment.status).toBe("PARTIALLY_REFUNDED");
    expect(state.adjustments).toMatchObject([{ amount: 30000, status: "SUCCEEDED" }]);
  });

  it("부분 환불 누적이 전액에 도달하면 마지막 환불에서 REFUNDED로 수렴한다", async () => {
    const ctx = await createPaidOrder();
    await createSucceededAdjustment(ctx, 30000);
    await db.order.update({ where: { id: ctx.orderId }, data: { paymentStatus: "PARTIALLY_REFUNDED" } });
    await db.payment.update({ where: { id: ctx.paymentId }, data: { status: "PARTIALLY_REFUNDED" } });

    const result = await refundOrderPaymentAction(actionInput(ctx, { amount: 55000 }));

    expect(result.success).toBe(true);
    const state = await readState(ctx);
    expect(state.order.status).toBe("REFUNDED");
    expect(state.order.paymentStatus).toBe("REFUNDED");
    expect(state.payment.status).toBe("REFUNDED");
    expect(totalAdjustmentAmount(state.adjustments)).toBe(ctx.amount);
  });

  it("환불 가능액 초과는 provider를 호출하지 않고 상태를 바꾸지 않는다", async () => {
    const ctx = await createPaidOrder(50000);
    const result = await refundOrderPaymentAction(actionInput(ctx, { amount: 50001 }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("INSUFFICIENT_REFUNDABLE");
    expect(mocks.refund).not.toHaveBeenCalled();
    await expectStateUnchanged(ctx);
  });

  it("0원 또는 음수 환불은 INVALID_AMOUNT로 거부한다", async () => {
    const ctx = await createPaidOrder();
    const zero = await refundOrderPaymentAction(actionInput(ctx, { amount: 0 }));
    const negative = await refundOrderPaymentAction(actionInput(ctx, { amount: -1 }));

    expect(zero.success).toBe(false);
    if (!zero.success) expect(zero.errorCode).toBe("INVALID_AMOUNT");
    expect(negative.success).toBe(false);
    if (!negative.success) expect(negative.errorCode).toBe("INVALID_AMOUNT");
    expect(mocks.refund).not.toHaveBeenCalled();
    await expectStateUnchanged(ctx);
  });

  it("같은 idempotencyKey 재진입은 adjustment 1개와 provider 1회로 멱등 처리한다", async () => {
    const ctx = await createPaidOrder();
    const input = actionInput(ctx, { amount: 20000, idempotencyKey: `refund_same_${randomUUID()}` });
    const first = await refundOrderPaymentAction(input);
    const second = await refundOrderPaymentAction(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.errorCode).toBe("ALREADY");
      expect(second.existingStatus).toBe("SUCCEEDED");
    }
    expect(mocks.refund).toHaveBeenCalledTimes(1);
    expect((await readState(ctx)).adjustments).toHaveLength(1);
  });

  it("서로 다른 키는 한도 안에서 별개 환불로 진행되고 초과분은 거부된다", async () => {
    const ctx = await createPaidOrder(50000);
    const first = await refundOrderPaymentAction(actionInput(ctx, { amount: 20000 }));
    const second = await refundOrderPaymentAction(actionInput(ctx, { amount: 20000 }));
    const third = await refundOrderPaymentAction(actionInput(ctx, { amount: 20000 }));

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(false);
    if (!third.success) expect(third.errorCode).toBe("INSUFFICIENT_REFUNDABLE");
    expect(mocks.refund).toHaveBeenCalledTimes(2);
    expect(totalAdjustmentAmount((await readState(ctx)).adjustments)).toBe(40000);
  });

  it("provider 실패는 adjustment FAILED와 PROVIDER_FAILED 반환으로 남기고 주문 상태를 유지한다", async () => {
    const ctx = await createPaidOrder();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.refund.mockResolvedValueOnce({
      providerTransactionId: ctx.providerTransactionId,
      status: "FAILED",
      errorMessage: "provider down",
    });

    const result = await refundOrderPaymentAction(actionInput(ctx, { amount: 20000 }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PROVIDER_FAILED");
      expect(result.providerError).toBe("provider down");
    }
    expect(consoleError).toHaveBeenCalledWith("ADMIN_REFUND_PROVIDER_FAILED", expect.objectContaining({ providerError: "provider down" }));
    const state = await readState(ctx);
    expect(state.adjustments).toMatchObject([{ amount: 20000, status: "FAILED" }]);
    expect(state.order.status).toBe("PAID");
    expect(state.payment.status).toBe("SUCCEEDED");
    consoleError.mockRestore();
  });

  it("비관리자는 환불 코어와 provider를 호출하지 않는다", async () => {
    const ctx = await createPaidOrder();
    mocks.getSession.mockResolvedValue(makeSession("CUSTOMER"));

    const result = await refundOrderPaymentAction(actionInput(ctx, { amount: 20000 }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe("FORBIDDEN");
    expect(mocks.refund).not.toHaveBeenCalled();
    await expectStateUnchanged(ctx);
  });
});

function mockRefundSuccess(): void {
  mocks.refund.mockImplementation((input) => Promise.resolve({
    providerTransactionId: input.providerTransactionId,
    providerRefundId: `refund_${randomUUID()}`,
    status: "SUCCEEDED",
    amount: input.amount,
    currency: input.currency,
    refundableAmount: 0,
  }));
}

function actionInput(
  ctx: Ctx,
  override: Partial<RefundOrderPaymentActionInput> = {},
): RefundOrderPaymentActionInput {
  return {
    orderId: ctx.orderId,
    paymentId: ctx.paymentId,
    reason: "관리자 환불",
    idempotencyKey: `refund_${randomUUID()}`,
    ...override,
  };
}

async function createPaidOrder(amount = 85000): Promise<Ctx> {
  const runId = randomUUID().slice(0, 8);
  const userId = `refund_user_${runId}`;
  const initialStock = 7;
  await db.user.create({ data: { id: userId, email: `${runId}@refund.test`, role: "CUSTOMER" } });
  await db.market.upsert({
    where: { code: "KR" },
    update: {},
    create: { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  });
  const style = await db.wigStyle.create({
    data: { name: `환불 테스트 ${runId}`, category: "FASHION", tags: [], availableMarkets: { create: { marketCode: "KR", isActive: true } } },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "블랙",
      length: "long",
      curl: "straight",
      price: amount,
      stock: initialStock,
      sku: `REFUND_${runId}`,
      marketPrices: { create: { marketCode: "KR", amount } },
    },
  });
  const order = await db.order.create({
    data: {
      userId,
      status: "PAID",
      paymentStatus: "PAID",
      marketCode: "KR",
      currency: "KRW",
      totalAmount: amount,
      shippingFee: 0,
      recipientName: "홍길동",
      phone: "010-1234-5678",
      country: "KR",
      postalCode: "06234",
      city: "강남구",
      addressLine1: "테헤란로 1",
      items: { create: [{ variantId: variant.id, quantity: 1, unitPrice: amount, snapshotData: SNAPSHOT, manufacturingRequest: { create: {} } }] },
    },
  });
  const providerTransactionId = `pay_${runId}`;
  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      provider: "test-provider",
      providerTransactionId,
      idempotencyKey: `payment_${runId}`,
      status: "SUCCEEDED",
      amount,
      currency: "KRW",
    },
  });
  const ctx = { userId, styleId: style.id, variantId: variant.id, orderId: order.id, paymentId: payment.id, providerTransactionId, amount, initialStock };
  createdContexts.push(ctx);
  return ctx;
}

async function createSucceededAdjustment(ctx: Ctx, amount: number): Promise<void> {
  await db.paymentAdjustment.create({
    data: {
      paymentId: ctx.paymentId,
      providerRefundId: `existing_refund_${randomUUID()}`,
      amount,
      currency: "KRW",
      reason: "기존 환불",
      status: "SUCCEEDED",
      idempotencyKey: `existing_refund_${randomUUID()}`,
      refundableAmount: ctx.amount - amount,
    },
  });
}

async function readState(ctx: Ctx) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: ctx.orderId },
    select: { status: true, paymentStatus: true },
  });
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: ctx.paymentId },
    select: { status: true, amount: true },
  });
  const adjustments = await db.paymentAdjustment.findMany({
    where: { paymentId: ctx.paymentId },
    orderBy: { createdAt: "asc" },
    select: { amount: true, status: true },
  });
  const variant = await db.wigVariant.findUniqueOrThrow({
    where: { id: ctx.variantId },
    select: { stock: true },
  });
  return { order, payment, adjustments, variant };
}

async function expectStateUnchanged(ctx: Ctx): Promise<void> {
  const state = await readState(ctx);
  expect(state.order.status).toBe("PAID");
  expect(state.order.paymentStatus).toBe("PAID");
  expect(state.payment.status).toBe("SUCCEEDED");
  expect(state.adjustments).toHaveLength(0);
  expect(state.variant.stock).toBe(ctx.initialStock);
}

function totalAdjustmentAmount(adjustments: Array<{ amount: number }>): number {
  return adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
}

async function cleanup(ctx: Ctx): Promise<void> {
  await db.paymentAdjustment.deleteMany({ where: { paymentId: ctx.paymentId } });
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.order.deleteMany({ where: { id: ctx.orderId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}
