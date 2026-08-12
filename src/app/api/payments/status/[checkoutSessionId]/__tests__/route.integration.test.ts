import { randomUUID } from "node:crypto";
import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  Prisma,
  ShippingCountry,
} from "@prisma/client";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { getSession } from "@/lib/session";
import { GET } from "../route";

const mockGetSession = vi.mocked(getSession);
const AMOUNT = 12_000;
const NOW = new Date("2026-08-12T00:00:00.000Z");

interface TestContext {
  ownerUserId: string;
  otherUserId: string;
  sessionIds: string[];
}

describe("provider-neutral payment status route", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = {
      ownerUserId: `return_owner_${randomUUID()}`,
      otherUserId: `return_other_${randomUUID()}`,
      sessionIds: [],
    };
    await ensureMarket();
    await db.user.createMany({
      data: [
        { id: ctx.ownerUserId, email: `${ctx.ownerUserId}@example.test` },
        { id: ctx.otherUserId, email: `${ctx.otherUserId}@example.test` },
      ],
    });
    mockGetSession.mockResolvedValue(authenticatedSession(ctx.ownerUserId));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup(ctx);
  });

  it("shows success only from a completed local session, finalized payment, and persisted order", async () => {
    const processing = await createPayment(ctx, { paymentStatus: PaymentAttemptStatus.SUCCEEDED });

    await expect(readStatus(processing.sessionId, { result: "success" })).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });

    const succeeded = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.COMPLETED,
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      createOrder: true,
    });

    await expect(readStatus(succeeded.sessionId, { result: "failure" })).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "SUCCEEDED", orderId: succeeded.orderId },
    });
  });

  it("ignores a provider-return query and never treats an attempt or session failure as whole-checkout failure", async () => {
    const pending = await createPayment(ctx);
    const failed = await createPayment(ctx, { paymentStatus: PaymentAttemptStatus.FAILED });
    const failedSession = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.FAILED,
      paymentStatus: PaymentAttemptStatus.FAILED,
    });

    await expect(readStatus(pending.sessionId, { status: "success", paymentKey: "untrusted" })).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
    await expect(readStatus(failed.sessionId, { status: "success", paymentKey: "untrusted" })).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
    await expect(readStatus(failedSession.sessionId)).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
  });

  it("aggregates older and newer attempts without createdAt-desc failure authority", async () => {
    const olderFailed = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.SUBMITTED);
    ctx.sessionIds.push(olderFailed);
    await createPaymentFixture(olderFailed, {
      status: PaymentAttemptStatus.FAILED,
      createdAt: new Date(NOW.getTime() - 2_000),
    });
    await createPaymentFixture(olderFailed, {
      status: PaymentAttemptStatus.AWAITING,
      createdAt: new Date(NOW.getTime() - 1_000),
    });

    const newerFailed = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.SUBMITTED);
    ctx.sessionIds.push(newerFailed);
    await createPaymentFixture(newerFailed, {
      status: PaymentAttemptStatus.AWAITING,
      createdAt: new Date(NOW.getTime() - 2_000),
    });
    await createPaymentFixture(newerFailed, {
      status: PaymentAttemptStatus.FAILED,
      createdAt: new Date(NOW.getTime() - 1_000),
    });

    await expect(readStatus(olderFailed)).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
    await expect(readStatus(newerFailed)).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
  });

  it("keeps replacement, unknown, terminal-looking, and remediation lineages processing", async () => {
    const replacement = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.SUBMITTED);
    ctx.sessionIds.push(replacement);
    await createPaymentFixture(replacement, {
      lifecycle: PaymentAttemptLifecycle.SUPERSEDED,
      blockingEndedAt: NOW,
    });
    await createPaymentFixture(replacement, {
      status: PaymentAttemptStatus.AWAITING,
      lifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
    });

    const unknown = await createPayment(ctx, {
      paymentLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      blockingEndedAt: null,
    });
    const failedWithCapturedExposure = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.FAILED,
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentLifecycle: PaymentAttemptLifecycle.CONTACTED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      blockingEndedAt: null,
    });

    const openOwner = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.SUBMITTED);
    ctx.sessionIds.push(openOwner);
    await createPaymentFixture(openOwner, { status: PaymentAttemptStatus.FAILED });
    await createPaymentFixture(openOwner, {
      status: PaymentAttemptStatus.AWAITING,
      lifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
    });

    for (const sessionId of [replacement, unknown.sessionId, failedWithCapturedExposure.sessionId, openOwner]) {
      await expect(readStatus(sessionId)).resolves.toEqual({
        httpStatus: 200,
        body: { kind: "PROCESSING" },
      });
    }
  });

  it("keeps multiple terminal-looking rows and suspension/remediation lineages processing", async () => {
    const reusable = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.FAILED);
    ctx.sessionIds.push(reusable);
    await createPaymentFixture(reusable, { status: PaymentAttemptStatus.FAILED });
    await createPaymentFixture(reusable, {
      status: PaymentAttemptStatus.VOIDED,
      lifecycle: PaymentAttemptLifecycle.TERMINAL_REMEDIATED,
      remediationStatus: PaymentRemediationStatus.REMEDIATED,
      blockingEndedAt: NOW,
    });

    const cycle = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.SUBMITTED);
    ctx.sessionIds.push(cycle);
    const cycleA = await createPaymentFixture(cycle, {
      status: PaymentAttemptStatus.FAILED,
    });
    const cycleB = await createPaymentFixture(cycle, {
      status: PaymentAttemptStatus.FAILED,
    });
    const cycleKeyA = `return_cycle_${randomUUID()}`;
    const cycleKeyB = `return_cycle_${randomUUID()}`;
    await db.$executeRaw(Prisma.sql`
      UPDATE "Payment"
      SET "status" = 'SUCCEEDED'::"PaymentAttemptStatus",
          "attemptLifecycle" = 'SUSPENDED'::"PaymentAttemptLifecycle",
          "remediationStatus" = 'PENDING'::"PaymentRemediationStatus",
          "providerPaymentKey" = CASE "id"
            WHEN ${cycleA} THEN ${cycleKeyA}
            ELSE ${cycleKeyB}
          END,
          "financialSucceededAt" = ${NOW},
          "blockingEndedAt" = ${NOW},
          "suspendedByPaymentId" = CASE "id"
            WHEN ${cycleA} THEN ${cycleB}
            ELSE ${cycleA}
          END
      WHERE "id" IN (${cycleA}, ${cycleB})
    `);

    const remediation = await createPayment(ctx, {
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentLifecycle: PaymentAttemptLifecycle.CONTACTED,
      remediationStatus: PaymentRemediationStatus.RECONCILIATION_REQUIRED,
      blockingEndedAt: null,
    });

    await expect(readStatus(reusable)).resolves.toEqual({ httpStatus: 200, body: { kind: "PROCESSING" } });
    await expect(readStatus(cycle)).resolves.toEqual({ httpStatus: 200, body: { kind: "PROCESSING" } });
    await expect(readStatus(remediation.sessionId)).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
  });

  it("requires the exact completed Order-Payment relation and both completion facts", async () => {
    const wrongLinked = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.COMPLETED);
    ctx.sessionIds.push(wrongLinked);
    const failedPaymentId = await createPaymentFixture(wrongLinked, { status: PaymentAttemptStatus.FAILED });
    await createPaymentFixture(wrongLinked, { status: PaymentAttemptStatus.SUCCEEDED });
    await createOrderFixture(wrongLinked, failedPaymentId, ctx.ownerUserId);

    const notCompleted = await createPayment(ctx, {
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      createOrder: true,
    });
    const noOrder = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.COMPLETED,
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
    });
    const notFinalized = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.COMPLETED,
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentLifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
      createOrder: true,
    });
    const noFinancialFact = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.COMPLETED,
      paymentStatus: PaymentAttemptStatus.AWAITING,
      paymentLifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
      createOrder: true,
    });
    const noBlockingFact = await createPayment(ctx, {
      checkoutStatus: CheckoutSessionStatus.COMPLETED,
      paymentStatus: PaymentAttemptStatus.SUCCEEDED,
      paymentLifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
      createOrder: true,
    });

    for (const sessionId of [
      wrongLinked,
      notCompleted.sessionId,
      noOrder.sessionId,
      notFinalized.sessionId,
      noFinancialFact.sessionId,
      noBlockingFact.sessionId,
    ]) {
      await expect(readStatus(sessionId)).resolves.toEqual({
        httpStatus: 200,
        body: { kind: "PROCESSING" },
      });
    }
  });

  it("rejects success while any sibling has unresolved or additional financial exposure", async () => {
    const unresolvedSibling = await createCompletedOrderPayment(ctx);
    await createPaymentFixture(unresolvedSibling.sessionId, {
      status: PaymentAttemptStatus.AWAITING,
      lifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      blockingEndedAt: null,
    });

    const remediationSibling = await createCompletedOrderPayment(ctx);
    await createPaymentFixture(remediationSibling.sessionId, {
      status: PaymentAttemptStatus.SUCCEEDED,
      lifecycle: PaymentAttemptLifecycle.CONTACTED,
      remediationStatus: PaymentRemediationStatus.PENDING,
      blockingEndedAt: null,
    });

    const blockingSibling = await createCompletedOrderPayment(ctx);
    await createPaymentFixture(blockingSibling.sessionId, {
      status: PaymentAttemptStatus.AWAITING,
      lifecycle: PaymentAttemptLifecycle.CONTACTED,
      blockingEndedAt: null,
    });

    const duplicateCapture = await createCompletedOrderPayment(ctx);
    await createPaymentFixture(duplicateCapture.sessionId, {
      status: PaymentAttemptStatus.SUCCEEDED,
      lifecycle: PaymentAttemptLifecycle.CONTACTED,
      remediationStatus: PaymentRemediationStatus.NONE,
      blockingEndedAt: null,
    });

    for (const sessionId of [
      unresolvedSibling.sessionId,
      remediationSibling.sessionId,
      blockingSibling.sessionId,
      duplicateCapture.sessionId,
    ]) {
      await expect(readStatus(sessionId)).resolves.toEqual({
        httpStatus: 200,
        body: { kind: "PROCESSING" },
      });
    }
  });

  it("never accepts an Order Payment from another checkout as local success", async () => {
    const completed = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.COMPLETED);
    const other = await createCheckoutSessionFixture(ctx.ownerUserId, CheckoutSessionStatus.COMPLETED);
    ctx.sessionIds.push(completed, other);
    const unrelatedPayment = await createPaymentFixture(other, { status: PaymentAttemptStatus.SUCCEEDED });
    await createOrderFixture(completed, unrelatedPayment, ctx.ownerUserId);

    await expect(readStatus(completed)).resolves.toEqual({
      httpStatus: 200,
      body: { kind: "PROCESSING" },
    });
  });

  it("does not disclose another user's checkout relative to a missing checkout", async () => {
    const other = await createPayment(ctx, { userId: ctx.otherUserId });
    const otherResponse = await readStatus(other.sessionId);
    const missingResponse = await readStatus(`missing_${randomUUID()}`);

    expect(otherResponse).toEqual({ httpStatus: 404, body: { kind: "UNAVAILABLE" } });
    expect(missingResponse).toEqual(otherResponse);
  });

  it("returns the same unavailable body before lookup when authentication is absent", async () => {
    const owned = await createPayment(ctx);
    mockGetSession.mockResolvedValue(null);

    await expect(readStatus(owned.sessionId)).resolves.toEqual({
      httpStatus: 401,
      body: { kind: "UNAVAILABLE" },
    });
  });

  it("is read-only across refresh and never calls provider HTTP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const pending = await createPayment(ctx);
    const before = await paymentCount(pending.sessionId);

    await readStatus(pending.sessionId);
    await readStatus(pending.sessionId, { retry: "1" });
    await readStatus(pending.sessionId, { retry: "2" });

    await expect(paymentCount(pending.sessionId)).resolves.toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

async function createPayment(
  context: TestContext,
  options: {
    userId?: string;
    checkoutStatus?: CheckoutSessionStatus;
    paymentStatus?: PaymentAttemptStatus;
    paymentLifecycle?: PaymentAttemptLifecycle;
    remediationStatus?: PaymentRemediationStatus;
    financialSucceededAt?: Date | null;
    blockingEndedAt?: Date | null;
    createOrder?: boolean;
  } = {},
): Promise<{ sessionId: string; paymentId: string; orderId?: string }> {
  const userId = options.userId ?? context.ownerUserId;
  const checkoutStatus = options.checkoutStatus ?? CheckoutSessionStatus.SUBMITTED;
  const paymentStatus = options.paymentStatus ?? PaymentAttemptStatus.INITIATED;
  const sessionId = await createCheckoutSessionFixture(userId, checkoutStatus);
  context.sessionIds.push(sessionId);
  const paymentId = await createPaymentFixture(sessionId, {
    status: paymentStatus,
    lifecycle: options.paymentLifecycle,
    remediationStatus: options.remediationStatus,
    financialSucceededAt: options.financialSucceededAt,
    blockingEndedAt: options.blockingEndedAt,
  });
  if (!options.createOrder) return { sessionId, paymentId };
  const orderId = await createOrderFixture(sessionId, paymentId, userId);
  return { sessionId, paymentId, orderId };
}

async function createCheckoutSessionFixture(
  userId: string,
  status: CheckoutSessionStatus,
): Promise<string> {
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      status,
      subtotalAmount: AMOUNT,
      shippingAmount: 0,
      totalAmount: AMOUNT,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      completedAt: status === CheckoutSessionStatus.COMPLETED ? NOW : null,
    },
    select: { id: true },
  });
  return session.id;
}

interface PaymentFixtureOptions {
  status?: PaymentAttemptStatus;
  lifecycle?: PaymentAttemptLifecycle;
  remediationStatus?: PaymentRemediationStatus;
  financialSucceededAt?: Date | null;
  blockingEndedAt?: Date | null;
  createdAt?: Date;
}

async function createPaymentFixture(
  checkoutSessionId: string,
  options: PaymentFixtureOptions = {},
): Promise<string> {
  const status = options.status ?? PaymentAttemptStatus.INITIATED;
  const lifecycle = options.lifecycle ?? paymentLifecycle(status);
  const remediationStatus = options.remediationStatus ?? PaymentRemediationStatus.NONE;
  const financiallySucceeded = isFinanciallySucceeded(status);
  const payment = await db.payment.create({
    data: {
      checkoutSessionId,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status,
      attemptLifecycle: lifecycle,
      remediationStatus,
      amount: AMOUNT,
      currency: "KRW",
      providerPaymentKey: financiallySucceeded ? `return_provider_key_${randomUUID()}` : null,
      idempotencyKey: `return:${checkoutSessionId}:${randomUUID()}`,
      contactIntentAt: NOW,
      financialSucceededAt: defaultWhenUndefined(options.financialSucceededAt, financiallySucceeded ? NOW : null),
      blockingEndedAt: defaultWhenUndefined(options.blockingEndedAt, defaultBlockingEndedAt(status)),
      ...lifecycleFixtureEvidence(lifecycle, status),
      ...remediationFixtureEvidence(remediationStatus),
      createdAt: options.createdAt,
    },
    select: { id: true },
  });
  return payment.id;
}

function isFinanciallySucceeded(status: PaymentAttemptStatus): boolean {
  return status === PaymentAttemptStatus.SUCCEEDED || status === PaymentAttemptStatus.VOIDED;
}

function defaultBlockingEndedAt(status: PaymentAttemptStatus): Date | null {
  return status === PaymentAttemptStatus.INITIATED || status === PaymentAttemptStatus.AWAITING ? null : NOW;
}

function defaultWhenUndefined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function lifecycleFixtureEvidence(
  lifecycle: PaymentAttemptLifecycle,
  status: PaymentAttemptStatus,
) {
  const superseded = lifecycle === PaymentAttemptLifecycle.SUPERSEDED;
  const failed = status === PaymentAttemptStatus.FAILED;
  return {
    contactStartedAt: superseded ? null : NOW,
    supersededAt: superseded ? NOW : null,
    errorCode: failed ? "PROVIDER_CONFIRM_TERMINAL" : null,
    errorMessage: failed ? "Payment attempt ended." : null,
  };
}

function remediationFixtureEvidence(status: PaymentRemediationStatus) {
  if (status !== PaymentRemediationStatus.REMEDIATED) {
    return { remediationOperation: null, remediationResultRef: null, remediatedAt: null };
  }
  return {
    remediationOperation: "VOID" as const,
    remediationResultRef: `return_remediation_${randomUUID()}`,
    remediatedAt: NOW,
  };
}

async function createCompletedOrderPayment(
  context: TestContext,
): Promise<{ sessionId: string; paymentId: string; orderId: string }> {
  const result = await createPayment(context, {
    checkoutStatus: CheckoutSessionStatus.COMPLETED,
    paymentStatus: PaymentAttemptStatus.SUCCEEDED,
    createOrder: true,
  });
  if (!result.orderId) throw new Error("Completed order fixture is missing its order.");
  return { sessionId: result.sessionId, paymentId: result.paymentId, orderId: result.orderId };
}

async function createOrderFixture(
  checkoutSessionId: string,
  paymentId: string,
  userId: string,
): Promise<string> {
  const order = await db.order.create({
    data: {
      checkoutSessionId,
      paymentId,
      userId,
      marketCode: MarketCode.KR,
      currency: "KRW",
      subtotalAmount: AMOUNT,
      shippingAmount: 0,
      totalAmount: AMOUNT,
      paidAt: NOW,
    },
    select: { id: true },
  });
  return order.id;
}

function paymentLifecycle(status: PaymentAttemptStatus): PaymentAttemptLifecycle {
  if (status === PaymentAttemptStatus.SUCCEEDED) return PaymentAttemptLifecycle.FINALIZED;
  if (status === PaymentAttemptStatus.FAILED) return PaymentAttemptLifecycle.TERMINAL_FAILURE;
  return PaymentAttemptLifecycle.CONTACTED;
}

async function readStatus(
  checkoutSessionId: string,
  query: Record<string, string> = {},
): Promise<{ httpStatus: number; body: unknown }> {
  const url = new URL(`http://localhost/api/payments/status/${checkoutSessionId}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await GET(new Request(url), { params: Promise.resolve({ checkoutSessionId }) });
  return { httpStatus: response.status, body: await response.json() };
}

function authenticatedSession(userId: string): Session {
  return {
    user: { id: userId, name: null, email: `${userId}@example.test`, image: null, role: "CUSTOMER" },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

async function paymentCount(checkoutSessionId: string): Promise<number> {
  return db.payment.count({ where: { checkoutSessionId } });
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: {
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
    create: {
      code: MarketCode.KR,
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  await db.order.deleteMany({ where: { checkoutSessionId: { in: context.sessionIds } } });
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: context.sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.user.deleteMany({ where: { id: { in: [context.ownerUserId, context.otherUserId] } } });
}
