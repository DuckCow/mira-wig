import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { generateEximbayProviderOrderId } from "@/lib/payment/attempt/provider-order-id";
import {
  createEximbayPreparationFacts,
  createEximbayProviderOrderCandidate,
} from "@/lib/payment/providers/eximbay";
import {
  createTrustedEximbayProviderOrderBinding,
  materializeEximbayReadyRequest,
} from "../ready";

interface TestContext {
  readonly userId: string;
  readonly marketCode: string;
  readonly sessionIds: string[];
}

describe("EX2B1 trusted persisted binding and provider-free ready materialization", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    const identity = randomUUID().replaceAll("-", "");
    ctx = {
      userId: `ex2b1_ready_user_${identity}`,
      marketCode: `EX${identity.slice(0, 6)}`,
      sessionIds: [],
    };
    await db.market.create({
      data: {
        code: ctx.marketCode,
        currency: "USD",
        shippableCountries: ["US"],
        defaultLocale: "en",
      },
    });
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await db.payment.deleteMany({ where: { checkoutSessionId: { in: ctx.sessionIds } } });
    await db.checkoutSession.deleteMany({ where: { id: { in: ctx.sessionIds } } });
    await db.user.deleteMany({ where: { id: ctx.userId } });
    await db.market.deleteMany({ where: { code: ctx.marketCode } });
  });

  it("materializes exact P000/USD, P000/JPY, and no-method USD facts from persisted identity", async () => {
    const payment = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const candidate = createEximbayProviderOrderCandidate(payment.id);
    const binding = await createTrustedEximbayProviderOrderBinding(candidate, payment.id);

    const usd = materializeEximbayReadyRequest(preparation(candidate, "USD", 100, "P000"), binding);
    const jpy = materializeEximbayReadyRequest(preparation(candidate, "JPY", 1, "P000"), binding);
    const noMethod = materializeEximbayReadyRequest(preparation(candidate, "USD", 100), binding);

    expect(usd).toEqual(expectedRequest(payment.providerOrderId, "USD", "1.00", "P000"));
    expect(jpy).toEqual(expectedRequest(payment.providerOrderId, "JPY", "1", "P000"));
    expect(noMethod).toEqual(expectedRequest(payment.providerOrderId, "USD", "1.00"));
    expect(usd.payment.order_id).not.toBe(payment.id);
    expect(usd.payment.order_id).not.toBe(payment.idempotencyKey);
    expect(usd.payment.order_id).not.toBe(payment.providerConfirmIdempotencyKey);
    expect(usd.payment.order_id).not.toBe(payment.providerRef);
    expect(usd.payment.order_id).not.toBe(payment.providerPaymentKey);
    expect(usd).not.toHaveProperty("fgkey");
    expect(usd).not.toHaveProperty("endpoint");
    expect(usd).not.toHaveProperty("authorization");
  });

  it("deeply freezes returned facts and isolates them from mutable preparation input aliases", async () => {
    const payment = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const candidate = createEximbayProviderOrderCandidate(payment.id);
    const input = preparationInput(candidate, "USD", 100, "P000");
    const facts = createEximbayPreparationFacts(input);
    const binding = await createTrustedEximbayProviderOrderBinding(candidate, payment.id);

    input.buyerName = "changed-after-canonicalization";
    input.returnUrl = "https://changed.invalid/return";
    const request = materializeEximbayReadyRequest(facts, binding);

    expect(request.buyer.name).toBe("Synthetic Buyer");
    expect(request.url.return_url).toBe("https://mira-ex2b1.invalid/return");
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.payment)).toBe(true);
    expect(Object.isFrozen(request.merchant)).toBe(true);
    expect(Object.isFrozen(request.buyer)).toBe(true);
    expect(Object.isFrozen(request.url)).toBe(true);
    expect(Reflect.set(request.payment, "amount", "999.00")).toBe(false);
    expect(request.payment.amount).toBe("1.00");
  });

  it("binds only the exact candidate to its trusted persisted EXIMBAY Payment", async () => {
    const paymentA = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const paymentB = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const toss = await createPayment(ctx, PaymentProvider.TOSS);
    const candidateA = createEximbayProviderOrderCandidate(paymentA.id);
    const candidateB = createEximbayProviderOrderCandidate(paymentB.id);
    const tossCandidate = createEximbayProviderOrderCandidate(toss.id);

    await expect(createTrustedEximbayProviderOrderBinding(candidateA, paymentA.id))
      .resolves.toBeDefined();
    await expect(createTrustedEximbayProviderOrderBinding(candidateA, paymentB.id))
      .rejects.toMatchObject({ code: "PROVIDER_ORDER_CANDIDATE_PAYMENT_MISMATCH" });
    await expect(createTrustedEximbayProviderOrderBinding(tossCandidate, toss.id))
      .rejects.toMatchObject({ code: "PERSISTED_PAYMENT_PROVIDER_MISMATCH" });

    const bindingA = await createTrustedEximbayProviderOrderBinding(candidateA, paymentA.id);
    expect(() => materializeEximbayReadyRequest(preparation(candidateB, "USD", 100), bindingA))
      .toThrow("PROVIDER_ORDER_BINDING_PAYMENT_MISMATCH");
  });

  it("rejects a hand-built binding shape and rejects spread/copy authority", async () => {
    const payment = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const candidate = createEximbayProviderOrderCandidate(payment.id);
    const facts = preparation(candidate, "USD", 100);
    const binding = await createTrustedEximbayProviderOrderBinding(candidate, payment.id);

    expect(() => {
      Reflect.apply(materializeEximbayReadyRequest, undefined, [facts, {
        paymentId: payment.id,
        provider: PaymentProvider.EXIMBAY,
        providerOrderId: payment.providerOrderId,
      }]);
    }).toThrow("UNTRUSTED_PROVIDER_ORDER_BINDING");
    expect(() => {
      Reflect.apply(materializeEximbayReadyRequest, undefined, [facts, { ...binding }]);
    }).toThrow("UNTRUSTED_PROVIDER_ORDER_BINDING");
    expect(createTrustedEximbayProviderOrderBinding).toHaveLength(2);
  });

  it("makes the exact Prisma-shaped persistence spoof irrelevant to binding issuance", async () => {
    const paymentId = `spoofed_payment_${randomUUID()}`;
    const arbitraryProviderOrderId = `c${"z".repeat(24)}`;
    const candidate = createEximbayProviderOrderCandidate(paymentId);
    const findUnique = vi.fn(() => Promise.resolve({
      id: paymentId,
      provider: PaymentProvider.EXIMBAY,
      providerOrderId: arbitraryProviderOrderId,
    }));
    const spoof = prismaPersistenceSpoof(findUnique);

    await expect(Reflect.apply(createTrustedEximbayProviderOrderBinding, undefined, [
      spoof,
      candidate,
      paymentId,
    ])).rejects.toMatchObject({ code: "PROVIDER_ORDER_CANDIDATE_PAYMENT_MISMATCH" });
    expect(findUnique).not.toHaveBeenCalled();
    expect(() => {
      Reflect.apply(materializeEximbayReadyRequest, undefined, [
        preparation(candidate, "USD", 100),
        { paymentId, providerOrderId: arbitraryProviderOrderId },
      ]);
    }).toThrow("UNTRUSTED_PROVIDER_ORDER_BINDING");
  });

  it("does not inspect Proxy or structural Prisma imitations as persistence authority", async () => {
    const paymentId = `structural_spoof_${randomUUID()}`;
    const candidate = createEximbayProviderOrderCandidate(paymentId);
    const findUnique = vi.fn(() => Promise.resolve({
      id: paymentId,
      provider: PaymentProvider.EXIMBAY,
      providerOrderId: `c${"y".repeat(24)}`,
    }));
    const spoof = prismaPersistenceSpoof(findUnique);
    const proxyTraps: string[] = [];
    const proxy = new Proxy(spoof, {
      get: () => rejectProxyTrap(proxyTraps, "get"),
      has: () => rejectProxyTrap(proxyTraps, "has"),
      getPrototypeOf: () => rejectProxyTrap(proxyTraps, "getPrototypeOf"),
      ownKeys: () => rejectProxyTrap(proxyTraps, "ownKeys"),
      getOwnPropertyDescriptor: () => rejectProxyTrap(proxyTraps, "getOwnPropertyDescriptor"),
    });
    const PrismaClientImitation = class PrismaClient {};
    const imitations: unknown[] = [
      spoof,
      Object.create(spoof),
      Object.assign({}, spoof),
      Object.assign(new PrismaClientImitation(), spoof),
      { payment: spoof.payment, findUnique },
      proxy,
    ];

    for (const imitation of imitations) {
      await expect(Reflect.apply(createTrustedEximbayProviderOrderBinding, undefined, [
        imitation,
        candidate,
        paymentId,
      ])).rejects.toMatchObject({ code: "PROVIDER_ORDER_CANDIDATE_PAYMENT_MISMATCH" });
    }
    expect(findUnique).not.toHaveBeenCalled();
    expect(proxyTraps).toEqual([]);
  });

  it("fails closed for missing and invalid IDs returned by canonical persistence", async () => {
    await withCorruptCanonicalPaymentShape(ctx, async ({ missingPaymentId, invalidPaymentId }) => {
      const missingCandidate = createEximbayProviderOrderCandidate(missingPaymentId);
      const invalidCandidate = createEximbayProviderOrderCandidate(invalidPaymentId);

      await expect(createTrustedEximbayProviderOrderBinding(missingCandidate, missingPaymentId))
        .rejects.toMatchObject({ code: "INVALID_PERSISTED_PROVIDER_ORDER_ID" });
      await expect(createTrustedEximbayProviderOrderBinding(invalidCandidate, invalidPaymentId))
        .rejects.toMatchObject({ code: "INVALID_PERSISTED_PROVIDER_ORDER_ID" });
    });
  });

  it("exercises generation, persistence binding, and materialization without fetch or Node HTTP transport", async () => {
    const payment = await createPayment(ctx, PaymentProvider.EXIMBAY);
    const candidate = createEximbayProviderOrderCandidate(payment.id);
    const originalFetch = globalThis.fetch;
    const fetchCalls: unknown[] = [];
    globalThis.fetch = (...args) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    const httpRequest = vi.spyOn(http, "request");
    const httpsRequest = vi.spyOn(https, "request");
    try {
      expect(generateEximbayProviderOrderId()).toMatch(/^c[0-9a-z]{24}$/u);
      const binding = await createTrustedEximbayProviderOrderBinding(candidate, payment.id);
      expect(materializeEximbayReadyRequest(preparation(candidate, "USD", 100), binding).payment.order_id)
        .toBe(payment.providerOrderId);
      expect(fetchCalls).toEqual([]);
      expect(httpRequest).not.toHaveBeenCalled();
      expect(httpsRequest).not.toHaveBeenCalled();
    } finally {
      httpRequest.mockRestore();
      httpsRequest.mockRestore();
      globalThis.fetch = originalFetch;
    }
  });
});

async function createPayment(
  ctx: TestContext,
  provider: PaymentProvider,
  providerOrderId: string | null = provider === PaymentProvider.EXIMBAY
    ? syntheticEximbayProviderOrderId()
    : null,
) {
  const session = await db.checkoutSession.create({
    data: {
      userId: ctx.userId,
      marketCode: ctx.marketCode,
      currency: "USD",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 100,
      shippingAmount: 0,
      totalAmount: 100,
      expiresAt: new Date(Date.now() + 60_000),
      completedAt: new Date(),
    },
    select: { id: true },
  });
  ctx.sessionIds.push(session.id);
  const identity = randomUUID();
  return db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 100,
      currency: "USD",
      providerOrderId,
      providerRef: `provider_ref_${identity}`,
      providerConfirmIdempotencyKey: `confirm:${provider}:${identity}`,
      providerPaymentKey: `provider_payment_${identity}`,
      idempotencyKey: `payment_idempotency_${identity}`,
      financialSucceededAt: new Date(),
      blockingEndedAt: new Date(),
    },
  });
}

function preparation(
  candidate: ReturnType<typeof createEximbayProviderOrderCandidate>,
  currency: "USD" | "JPY",
  amountMinor: number,
  paymentMethod?: "P000",
) {
  return createEximbayPreparationFacts(preparationInput(candidate, currency, amountMinor, paymentMethod));
}

function preparationInput(
  candidate: ReturnType<typeof createEximbayProviderOrderCandidate>,
  currency: "USD" | "JPY",
  amountMinor: number,
  paymentMethod?: "P000",
) {
  return {
    transactionType: "PAYMENT" as const,
    providerOrderCandidate: candidate,
    currency,
    amountMinor,
    language: "EN" as const,
    ...(paymentMethod ? { paymentMethod } : {}),
    mid: "synthetic-mid",
    buyerName: "Synthetic Buyer",
    buyerEmail: "buyer@example.test",
    returnUrl: "https://mira-ex2b1.invalid/return",
    statusUrl: "https://mira-ex2b1.invalid/status",
  };
}

function expectedRequest(
  providerOrderId: string | null,
  currency: "USD" | "JPY",
  amount: string,
  paymentMethod?: "P000",
) {
  return {
    payment: {
      transaction_type: "PAYMENT",
      order_id: providerOrderId,
      currency,
      amount,
      lang: "EN",
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    },
    merchant: { mid: "synthetic-mid" },
    buyer: { name: "Synthetic Buyer", email: "buyer@example.test" },
    url: {
      return_url: "https://mira-ex2b1.invalid/return",
      status_url: "https://mira-ex2b1.invalid/status",
    },
  };
}

async function withCorruptCanonicalPaymentShape(
  ctx: TestContext,
  operation: (payments: {
    readonly missingPaymentId: string;
    readonly invalidPaymentId: string;
  }) => Promise<void>,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    ALTER TABLE "Payment"
    DROP CONSTRAINT "Payment_provider_order_identity_shape_check"
  `);
  try {
    const missing = await createPayment(ctx, PaymentProvider.EXIMBAY, null);
    const invalid = await createPayment(ctx, PaymentProvider.EXIMBAY, "invalid");
    await operation({ missingPaymentId: missing.id, invalidPaymentId: invalid.id });
  } finally {
    await db.payment.deleteMany({ where: { checkoutSessionId: { in: ctx.sessionIds } } });
    await db.$executeRaw(Prisma.sql`
      ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_provider_order_identity_shape_check" CHECK (
        (
          "provider" = 'EXIMBAY'
          AND "providerOrderId" IS NOT NULL
          AND "providerOrderId" ~ '^c[0-9a-z]{24}$'
        ) OR (
          "provider" <> 'EXIMBAY'
          AND "providerOrderId" IS NULL
        )
      )
    `);
  }
}

function prismaPersistenceSpoof(findUnique: () => Promise<unknown>) {
  return {
    [Symbol.toStringTag]: "PrismaClient",
    _runtimeDataModel: {},
    _engineConfig: {},
    _requestHandler: {},
    payment: { findUnique },
  };
}

function rejectProxyTrap(calls: string[], name: string): never {
  calls.push(name);
  throw new Error(`Persistence impersonation Proxy trap was inspected: ${name}`);
}
