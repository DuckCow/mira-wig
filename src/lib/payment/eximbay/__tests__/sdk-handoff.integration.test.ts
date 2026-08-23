import { randomUUID } from "node:crypto";
import {
  FulfillmentType,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  initiatePaymentAttemptWithTransientAuthority,
  type InitiatePaymentAttemptExecution,
} from "@/lib/payment/attempt/initiate";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import type { PaymentInitiationProvider } from "@/lib/payment/providers/types";
import { createCheckoutSession, type CheckoutShippingInput } from "@/lib/payment/session";
import type { EximbayReadyFetch } from "../ready-http";

const trustedMaterializer = vi.hoisted(() => vi.fn());
const amountDecoder = vi.hoisted(() => vi.fn());

vi.mock("../ready-kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ready-kernel")>();
  trustedMaterializer.mockImplementation(actual.materializeTrustedEximbaySdkWire);
  return { ...actual, materializeTrustedEximbaySdkWire: trustedMaterializer };
});

vi.mock("@/lib/payment/providers/eximbay/amount", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment/providers/eximbay/amount")>();
  amountDecoder.mockImplementation(actual.decodeEximbayAmount);
  return { ...actual, decodeEximbayAmount: amountDecoder };
});

const provider = vi.hoisted<PaymentInitiationProvider>(() => ({
  code: "EXIMBAY",
  adapterExecutionKind: "EXTERNAL",
  initiate: () => Promise.reject(new Error("generic Eximbay provider seam must remain unused")),
}));

vi.mock("@/lib/payment/providers/initiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/initiation")>()),
  resolveInitiationProvider: () => provider,
}));

import { materializeFreshEximbayReadyHandoff } from "../sdk-handoff";

const READY_FGKEY = "SYNTHETIC_READY_FGKEY_NEVER_LOG";
const SYNTHETIC_MID = "SYNTHETIC_MID_NEVER_LOG";
const BUYER_NAME = "SYNTHETIC_BUYER_NEVER_LOG";
const BUYER_EMAIL = "synthetic-buyer@example.test";

interface TestContext {
  readonly userId: string;
  readonly styleIds: string[];
  readonly variantIds: string[];
  readonly fetches: ReturnType<typeof vi.fn<EximbayReadyFetch>>[];
}

describe("EX2B2-S3 trusted server handoff materialization", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    trustedMaterializer.mockClear();
    amountDecoder.mockClear();
    ctx = {
      userId: `ex2b2_s3_user_${randomUUID()}`,
      styleIds: [],
      variantIds: [],
      fetches: [],
    };
    await ensureMarkets();
    await db.user.create({
      data: { id: ctx.userId, name: BUYER_NAME, email: BUYER_EMAIL },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup(ctx);
  });

  it.each([
    ["USD", "US", 100, "1.00"],
    ["JPY", "JP", 100, "100"],
  ] as const)(
    "materializes one exact trusted %s wire after durable READY and decodes current amount",
    async (currency, market, amount, wireAmount) => {
      const fresh = await startFresh(ctx, market, amount);
      const payment = await db.payment.findUniqueOrThrow({ where: { id: fresh.durable.paymentId } });

      const handoff = await materializeFreshEximbayReadyHandoff(
        fresh.durable.paymentId,
        fresh.freshAuthority,
      );

      expect(handoff).toMatchObject({
        kind: "EXIMBAY_READY_HANDOFF_V1",
        paymentId: payment.id,
        mode: "SANDBOX",
        sdkGeneration: "v2",
        payload: {
          fgkey: READY_FGKEY,
          payment: {
            order_id: payment.providerOrderId,
            currency,
            amount: wireAmount,
            payment_method: "P000",
          },
        },
      });
      expect(trustedMaterializer).toHaveBeenCalledTimes(1);
      expect(amountDecoder).toHaveBeenCalledWith(currency, wireAmount);
      expect(Object.isFrozen(handoff)).toBe(true);
      expect(deeplyFrozen(handoff.payload)).toBe(true);
      expect(ctx.fetches.at(-1)).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects the same exact authority before a second DB transaction or trusted materialization", async () => {
    const fresh = await startFresh(ctx, "US", 100);
    const transaction = vi.spyOn(db, "$transaction");

    await materializeFreshEximbayReadyHandoff(fresh.durable.paymentId, fresh.freshAuthority);
    const transactionCalls = transaction.mock.calls.length;
    const materializerCalls = trustedMaterializer.mock.calls.length;

    await expect(materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    )).rejects.toMatchObject({ code: "FRESH_AUTHORITY_ALREADY_CONSUMED" });
    expect(transaction).toHaveBeenCalledTimes(transactionCalls);
    expect(trustedMaterializer).toHaveBeenCalledTimes(materializerCalls);
  });

  it("rejects a structural authority copy through the installed S2 WeakMap", async () => {
    const fresh = await startFresh(ctx, "US", 100);
    const copiedAuthority = { ...fresh.freshAuthority };

    await expect(materializeUnknownAuthority(fresh.durable.paymentId, copiedAuthority))
      .rejects.toMatchObject({ code: "UNTRUSTED_FRESH_AUTHORITY" });
    expect(trustedMaterializer).not.toHaveBeenCalled();
  });

  it("validates paymentId before consuming the exact authority", async () => {
    const fresh = await startFresh(ctx, "US", 100);

    await expect(materializeFreshEximbayReadyHandoff("", fresh.freshAuthority))
      .rejects.toMatchObject({ code: "INVALID_PAYMENT_ID" });
    await expect(materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    )).resolves.toMatchObject({ paymentId: fresh.durable.paymentId });
  });

  it.each([
    ["status", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { status: PaymentAttemptStatus.AWAITING } })],
    ["amount", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { amount: 101 } })],
    ["currency", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { currency: "JPY" } })],
    ["providerRef", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { providerRef: "synthetic-ref" } })],
    ["providerPaymentKey", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { providerPaymentKey: "synthetic-key" } })],
    ["supersededAt", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { supersededAt: new Date() } })],
    ["contactStartedAt equality", (paymentId: string) => shiftTimestamp(paymentId, "contactStartedAt")],
    ["initiationCompletedAt equality", (paymentId: string) => shiftTimestamp(paymentId, "initiationCompletedAt")],
    ["output kind and approve URL", (paymentId: string) => db.payment.update({
      where: { id: paymentId },
      data: { initiationOutputKind: PaymentInitiationOutputKind.REDIRECT, initiationApproveUrl: "https://example.test/redirect" },
    })],
    ["mode", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { mode: PaymentMode.LIVE } })],
    ["errorCode", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { errorCode: "SYNTHETIC" } })],
    ["errorMessage", (paymentId: string) => db.payment.update({ where: { id: paymentId }, data: { errorMessage: "SYNTHETIC" } })],
  ])("rejects individual current durable READY drift: %s", async (_label, drift) => {
    const fresh = await startFresh(ctx, "US", 100);
    await drift(fresh.durable.paymentId);
    const transaction = vi.spyOn(db, "$transaction");

    await expect(materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    )).rejects.toMatchObject({ code: "DURABLE_READY_LINEAGE_MISMATCH" });
    const transactionCalls = transaction.mock.calls.length;
    const materializerCalls = trustedMaterializer.mock.calls.length;
    await expect(materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    )).rejects.toMatchObject({ code: "FRESH_AUTHORITY_ALREADY_CONSUMED" });
    expect(transaction).toHaveBeenCalledTimes(transactionCalls);
    expect(trustedMaterializer).toHaveBeenCalledTimes(materializerCalls);
    expect(ctx.fetches.at(-1)).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["remediation and financial evidence", async (paymentId: string) => {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentAttemptStatus.SUCCEEDED,
          remediationStatus: PaymentRemediationStatus.REQUIRED,
          providerPaymentKey: `synthetic-financial-${randomUUID()}`,
          financialSucceededAt: new Date(),
        },
      });
    }],
    ["blocking terminal evidence", async (paymentId: string) => {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentAttemptStatus.FAILED,
          attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
          blockingEndedAt: new Date(),
        },
      });
    }],
    ["suspension evidence", async (paymentId: string) => suspendPayment(paymentId)],
  ])("rejects schema-valid non-READY lineage: %s", async (_label, drift) => {
    const fresh = await startFresh(ctx, "US", 100);
    await drift(fresh.durable.paymentId);

    await expect(materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    )).rejects.toMatchObject({ code: "DURABLE_READY_LINEAGE_MISMATCH" });
    expect(ctx.fetches.at(-1)).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-payment provider-order provenance and consumes the authority", async () => {
    const first = await startFresh(ctx, "US", 100);
    await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
    const second = await startFresh(ctx, "US", 100);

    await expect(materializeFreshEximbayReadyHandoff(
      second.durable.paymentId,
      first.freshAuthority,
    )).rejects.toMatchObject({ code: "DURABLE_READY_LINEAGE_MISMATCH" });
    expect(trustedMaterializer).toHaveBeenCalledTimes(1);
    expect(ctx.fetches[0]).toHaveBeenCalledTimes(1);
    expect(ctx.fetches[1]).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-Eximbay durable row before trusted materialization", async () => {
    const fresh = await startFresh(ctx, "US", 100);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: fresh.durable.paymentId } });
    await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
    const foreignSession = await createSession(ctx, "US", 100);
    const foreign = await db.payment.create({
      data: {
        checkoutSessionId: foreignSession.sessionId,
        provider: PaymentProvider.TOSS,
        mode: PaymentMode.SANDBOX,
        routingRuleId: "synthetic.foreign",
        status: PaymentAttemptStatus.FAILED,
        attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey: `foreign:${randomUUID()}`,
        contactIntentAt: new Date(),
        contactStartedAt: new Date(),
        blockingEndedAt: new Date(),
      },
    });

    await expect(materializeFreshEximbayReadyHandoff(foreign.id, fresh.freshAuthority))
      .rejects.toMatchObject({ code: "DURABLE_READY_LINEAGE_MISMATCH" });
    expect(trustedMaterializer).not.toHaveBeenCalled();
  });

  it("keeps captured trusted buyer wire valid after current User mutation", async () => {
    const fresh = await startFresh(ctx, "US", 100);
    await db.user.update({
      where: { id: ctx.userId },
      data: { name: "Changed Current Buyer", email: "changed-current@example.test" },
    });

    const handoff = await materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    );

    expect(handoff.payload.buyer).toEqual({ name: BUYER_NAME, email: BUYER_EMAIL });
  });

  it("permanently consumes decoder and trusted-materializer failures", async () => {
    const decoderFailure = await startFresh(ctx, "US", 100);
    amountDecoder.mockImplementationOnce(() => {
      throw new Error("synthetic decoder failure");
    });
    await expect(materializeFreshEximbayReadyHandoff(
      decoderFailure.durable.paymentId,
      decoderFailure.freshAuthority,
    )).rejects.toMatchObject({ code: "DURABLE_READY_LINEAGE_MISMATCH" });

    await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
    const materializerFailure = await startFresh(ctx, "US", 100);
    trustedMaterializer.mockImplementationOnce(() => {
      throw new Error("synthetic materializer failure");
    });
    await expect(materializeFreshEximbayReadyHandoff(
      materializerFailure.durable.paymentId,
      materializerFailure.freshAuthority,
    )).rejects.toMatchObject({ code: "TRUSTED_SDK_MATERIALIZATION_FAILED" });
    await expect(materializeFreshEximbayReadyHandoff(
      materializerFailure.durable.paymentId,
      materializerFailure.freshAuthority,
    )).rejects.toMatchObject({ code: "FRESH_AUTHORITY_ALREADY_CONSUMED" });
  });

  it("emits only bounded redacted errors and no sensitive logs", async () => {
    const fresh = await startFresh(ctx, "US", 100);
    await db.payment.update({
      where: { id: fresh.durable.paymentId },
      data: { providerRef: "SYNTHETIC_PROVIDER_REF_NEVER_LOG" },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const failure = await materializeFreshEximbayReadyHandoff(
      fresh.durable.paymentId,
      fresh.freshAuthority,
    ).then(
      () => "unexpected-success",
      (reason: unknown) => String(reason),
    );

    expect(failure).toBe("EximbaySdkHandoffError: DURABLE_READY_LINEAGE_MISMATCH");
    expect(failure).not.toMatch(new RegExp([
      READY_FGKEY,
      SYNTHETIC_MID,
      BUYER_NAME,
      BUYER_EMAIL,
      "payments.example.test",
      "SYNTHETIC_PROVIDER_REF_NEVER_LOG",
    ].join("|"), "u"));
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

async function startFresh(
  ctx: TestContext,
  market: "US" | "JP",
  amount: number,
): Promise<Extract<InitiatePaymentAttemptExecution, { channel: "FRESH_EXIMBAY_READY" }>> {
  const session = await createSession(ctx, market, amount);
  const fetchImpl = vi.fn<EximbayReadyFetch>(() => Promise.resolve(successResponse()));
  ctx.fetches.push(fetchImpl);
  const execution = await initiatePaymentAttemptWithTransientAuthority(db, {
    sessionId: session.sessionId,
    userId: ctx.userId,
    adapterContext: adapterContext(market, session.currency),
    eximbayReady: { env: syntheticEnv(), fetchImpl },
  });
  expect(execution.channel).toBe("FRESH_EXIMBAY_READY");
  if (execution.channel !== "FRESH_EXIMBAY_READY") {
    throw new Error("Expected fresh Eximbay READY authority");
  }
  const persisted = await db.payment.findUniqueOrThrow({ where: { id: execution.durable.paymentId } });
  expect(persisted).toMatchObject({
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    initiationOutputKind: PaymentInitiationOutputKind.READY,
  });
  expect(persisted.initiationCompletedAt?.getTime()).toBe(persisted.contactStartedAt?.getTime());
  return execution;
}

function adapterContext(market: "US" | "JP", currency: string): ProviderFactoryContext {
  return {
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    market,
    method: PaymentMethod.CARD,
    currency,
    ruleId: `synthetic.eximbay.s3.${market.toLowerCase()}`,
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "test-only dormant direct seam" },
  };
}

function syntheticEnv(): Record<string, string | undefined> {
  return {
    EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_API_KEY_NEVER_LOG",
    EXIMBAY_SANDBOX_MID: SYNTHETIC_MID,
    PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
  };
}

function successResponse(): Response {
  return new Response(JSON.stringify({
    rescode: "0000",
    resmsg: "synthetic",
    fgkey: READY_FGKEY,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
    create: { code: "US", currency: "USD", shippableCountries: [ShippingCountry.US], defaultLocale: "en", isActive: true },
  });
  await db.market.upsert({
    where: { code: "JP" },
    update: { currency: "JPY", shippableCountries: [ShippingCountry.JP], defaultLocale: "ja", isActive: true },
    create: { code: "JP", currency: "JPY", shippableCountries: [ShippingCountry.JP], defaultLocale: "ja", isActive: true },
  });
}

async function createSession(ctx: TestContext, market: "US" | "JP", amount: number) {
  const style = await db.wigStyle.create({
    data: {
      name: `EX2B2 S3 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      coverImageKey: "catalog/ex2b2-s3.png",
      availableMarkets: { create: { marketCode: market, isActive: true } },
    },
    select: { id: true },
  });
  ctx.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Natural Black",
      length: "Medium",
      curl: "C Curl",
      price: amount,
      stock: 5,
      sku: `EX2B2-S3-${randomUUID()}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: market, amount } },
    },
    select: { id: true },
  });
  ctx.variantIds.push(variant.id);
  await db.cartItem.create({
    data: { userId: ctx.userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 },
  });
  return createCheckoutSession(db, {
    userId: ctx.userId,
    marketCode: market,
    shipping: shipping(market),
  });
}

function shipping(market: "US" | "JP"): CheckoutShippingInput {
  if (market === "JP") {
    return {
      recipientName: "Synthetic Recipient",
      phone: "090-1234-5678",
      country: ShippingCountry.JP,
      postalCode: "100-0001",
      administrativeArea: "Tokyo",
      city: "Chiyoda",
      addressLine1: "1-1 Synthetic",
    };
  }
  return {
    recipientName: "Synthetic Recipient",
    phone: "+1-202-555-0100",
    country: ShippingCountry.US,
    postalCode: "10001",
    administrativeArea: "NY",
    city: "New York",
    addressLine1: "1 Synthetic Avenue",
  };
}

async function shiftTimestamp(
  paymentId: string,
  field: "contactStartedAt" | "initiationCompletedAt",
): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const current = payment[field];
  if (!current) throw new Error(`Missing ${field}`);
  await db.payment.update({
    where: { id: paymentId },
    data: { [field]: new Date(current.getTime() + 1) },
  });
}

async function suspendPayment(paymentId: string): Promise<void> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const blocker = await db.payment.create({
    data: {
      checkoutSessionId: payment.checkoutSessionId,
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
      routingRuleId: "synthetic.suspension.blocker",
      status: PaymentAttemptStatus.FAILED,
      attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
      amount: payment.amount,
      currency: payment.currency,
      idempotencyKey: `suspension-blocker:${randomUUID()}`,
      contactIntentAt: new Date(),
      contactStartedAt: new Date(),
      blockingEndedAt: new Date(),
    },
  });
  await db.payment.update({
    where: { id: paymentId },
    data: {
      attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
      blockingEndedAt: new Date(),
      suspendedByPaymentId: blocker.id,
    },
  });
}

async function materializeUnknownAuthority(paymentId: string, authority: unknown): Promise<void> {
  await Reflect.apply(materializeFreshEximbayReadyHandoff, undefined, [paymentId, authority]);
}

function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(deeplyFrozen);
}

async function cleanup(ctx: TestContext): Promise<void> {
  const sessions = await db.checkoutSession.findMany({
    where: { userId: ctx.userId },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);
  await db.payment.deleteMany({ where: { checkoutSessionId: { in: sessionIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: sessionIds } } });
  await db.cartItem.deleteMany({ where: { userId: ctx.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: ctx.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: ctx.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: ctx.styleIds } } });
  await db.user.deleteMany({ where: { id: ctx.userId } });
}
