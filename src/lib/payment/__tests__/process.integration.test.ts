// ============================================================
// STRICT 존 통합 테스트 — processPayment (실제 DB)
// 각 테스트마다 독립 픽스처를 생성·정리한다.
// DATABASE_URL 환경변수 필요.
// ============================================================
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { processPayment } from "../process";

// ── 타입 ─────────────────────────────────────────────────────

interface Ctx {
  userId: string;
  orderId: string;
  variantId: string;
  styleId: string;
  initialStock: number;
}

// ── 픽스처 헬퍼 ──────────────────────────────────────────────

function makeRunId(): string { return randomUUID().slice(0, 8); }
function makeKey(): string { return `test_idem_${randomUUID()}`; }

const TEST_SNAPSHOT = {
  styleName: "테스트", color: "블랙", colorHex: null,
  length: "long", curl: "straight", coverImageKey: null, currencyCode: "KRW",
};

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
      stock, sku: `TEST_${runId}`,
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
  const runId = makeRunId();
  const userId = await setupUser(runId);
  const styleId = await setupStyle(runId);
  const variantId = await setupVariant(styleId, runId, stock);
  const orderId = await setupOrder(userId, variantId, styleId);
  return { userId, orderId, variantId, styleId, initialStock: stock };
}

async function cleanupFixtures(ctx: Ctx): Promise<void> {
  await db.payment.deleteMany({ where: { orderId: ctx.orderId } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.order.deleteMany({ where: { userId: ctx.userId } });
  await db.wigStyle.deleteMany({ where: { id: ctx.styleId } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}

// ── 결제 성공 경로 ────────────────────────────────────────────

describe("processPayment — 결제 성공", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); });

  it("주문 상태와 결제 상태가 PAID로 전이된다", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
  });

  it("재고가 주문 수량(1)만큼 차감된다", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBe(ctx.initialStock - 1);
  });

  it("카트가 비워진다", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const cart = await db.cartItem.findMany({ where: { userId: ctx.userId } });
    expect(cart).toHaveLength(0);
  });

  it("Payment 레코드 SUCCEEDED가 생성된다", async () => {
    const key = makeKey();
    const result = await processPayment(ctx.orderId, ctx.userId, key);
    expect(result.success).toBe(true);
    const payment = await db.payment.findUnique({ where: { idempotencyKey: key } });
    expect(payment?.status).toBe("SUCCEEDED");
    expect(payment?.providerWebhookSecret).toBeNull();
  });

  it("성공 결과에 paymentId가 포함된다", async () => {
    const result = await processPayment(ctx.orderId, ctx.userId, makeKey());
    expect(result.success).toBe(true);
    if (result.success) expect(result.paymentId).toBeTruthy();
  });
});

// ── 재고 부족 실패 경로 ───────────────────────────────────────

describe("processPayment — 재고 부족(stock=0)", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupFixtures(0); });
  afterEach(async () => { await cleanupFixtures(ctx); });

  it("결제 실패 결과를 반환한다", async () => {
    const result = await processPayment(ctx.orderId, ctx.userId, makeKey());
    expect(result.success).toBe(false);
  });

  it("주문 상태가 PAYMENT_FAILED, 결제 상태가 FAILED로 전이된다", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const order = await db.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
    expect(order.status).toBe("PAYMENT_FAILED");
    expect(order.paymentStatus).toBe("FAILED");
  });

  it("재고는 변하지 않는다 (0 유지)", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBe(0);
  });

  it("카트는 유지된다", async () => {
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const cart = await db.cartItem.findMany({ where: { userId: ctx.userId } });
    expect(cart).toHaveLength(1);
  });

  it("Payment FAILED 레코드가 생성된다", async () => {
    const key = makeKey();
    await processPayment(ctx.orderId, ctx.userId, key);
    const payment = await db.payment.findUnique({ where: { idempotencyKey: key } });
    expect(payment?.status).toBe("FAILED");
  });
});

// ── idempotency ───────────────────────────────────────────────

describe("processPayment — idempotency", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); });

  it("같은 키로 두 번 호출해도 재고는 한 번만 차감된다", async () => {
    const key = makeKey();
    await processPayment(ctx.orderId, ctx.userId, key);
    await processPayment(ctx.orderId, ctx.userId, key); // 두 번째 호출
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBe(ctx.initialStock - 1); // 한 번만
  });

  it("같은 키로 두 번 호출하면 두 번째도 success를 반환한다", async () => {
    const key = makeKey();
    const r1 = await processPayment(ctx.orderId, ctx.userId, key);
    const r2 = await processPayment(ctx.orderId, ctx.userId, key);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it("같은 키 두 번째 호출은 동일 paymentId를 반환한다", async () => {
    const key = makeKey();
    const r1 = await processPayment(ctx.orderId, ctx.userId, key);
    const r2 = await processPayment(ctx.orderId, ctx.userId, key);
    if (!r1.success || !r2.success) throw new Error("둘 다 성공해야 합니다");
    expect(r1.paymentId).toBe(r2.paymentId);
  });

  it("Payment 레코드는 하나만 생성된다", async () => {
    const key = makeKey();
    await processPayment(ctx.orderId, ctx.userId, key);
    await processPayment(ctx.orderId, ctx.userId, key);
    const payments = await db.payment.findMany({ where: { idempotencyKey: key } });
    expect(payments).toHaveLength(1);
  });
});

// ── 상태 가드 ─────────────────────────────────────────────────

describe("processPayment — 상태 가드", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupFixtures(10); });
  afterEach(async () => { await cleanupFixtures(ctx); });

  it("이미 PAID인 주문은 결제 거부한다", async () => {
    await db.order.update({ where: { id: ctx.orderId }, data: { status: "PAID" } });
    const result = await processPayment(ctx.orderId, ctx.userId, makeKey());
    expect(result.success).toBe(false);
  });

  it("PAID 주문에 재결제 시도해도 재고는 변하지 않는다", async () => {
    await db.order.update({ where: { id: ctx.orderId }, data: { status: "PAID" } });
    await processPayment(ctx.orderId, ctx.userId, makeKey());
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBe(ctx.initialStock);
  });

  it("다른 유저는 결제를 처리할 수 없다", async () => {
    const result = await processPayment(ctx.orderId, "wrong_user_id", makeKey());
    expect(result.success).toBe(false);
  });
});

// ── 동시성 + 트랜잭션 롤백 ────────────────────────────────────

describe("processPayment — 동시성(재고 = 1)", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await setupFixtures(1); });
  afterEach(async () => { await cleanupFixtures(ctx); });

  it("두 동시 결제 중 하나만 성공하고 재고는 정확히 0이 된다", async () => {
    const [r1, r2] = await Promise.all([
      processPayment(ctx.orderId, ctx.userId, makeKey()),
      processPayment(ctx.orderId, ctx.userId, makeKey()),
    ]);
    const successes = [r1, r2].filter((r) => r.success).length;
    expect(successes).toBe(1);
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBe(0);
  });

  it("[롤백] 실패한 트랜잭션이 재고를 음수로 만들지 않는다", async () => {
    await Promise.all([
      processPayment(ctx.orderId, ctx.userId, makeKey()),
      processPayment(ctx.orderId, ctx.userId, makeKey()),
    ]);
    const variant = await db.wigVariant.findUniqueOrThrow({ where: { id: ctx.variantId } });
    expect(variant.stock).toBeGreaterThanOrEqual(0);
  });
});
