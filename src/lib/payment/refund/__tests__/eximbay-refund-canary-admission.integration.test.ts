import { createHash, randomUUID } from "node:crypto";
import {
  FulfillmentType,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  PrismaClient,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapEximbayP3eDatabaseRoles,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from
  "@/lib/payment/__tests__/eximbay-fixture";
import { EXIMBAY_CHECKOUT_SANDBOX_ENABLED } from
  "@/lib/payment/eximbay/checkout-activation";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import { completeFromCapture, type CaptureFacts } from "@/lib/payment/complete";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  orderPaidEmailDedupKey,
} from "@/lib/payment/email/topics";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import { createCheckoutSession } from "@/lib/payment/session";
import { consumeEximbayRefundCanaryApproval } from
  "../consume-eximbay-refund-canary-approval";
import { parseEximbayRefundCanaryEnvironment } from
  "../eximbay-refund-canary-environment";
import {
  EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
  EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
  deriveEximbayRefundCanaryMarketProjectionDigest,
  deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest,
  deriveEximbayRefundCanaryWigStyleMarketProjectionDigest,
  parseEximbayRefundCanaryFreshSaleCustodyBytes,
  type EximbayRefundCanaryFreshSaleCustody,
  type EximbayRefundCanaryInventoryCounts,
  type EximbayRefundCanaryMarketProjection,
  type EximbayRefundCanaryVariantMarketPriceProjection,
  type EximbayRefundCanaryWigStyleMarketProjection,
} from "../eximbay-refund-canary-fresh-sale-custody";
import {
  deriveEximbayRefundCanaryInventoryEvidenceDigest,
  deriveEximbayRefundCanarySyntheticProfileDigest,
} from "../eximbay-refund-canary-inventory";
import { selectExactEximbayRefundCanaryCandidate } from
  "../eximbay-refund-canary-exact-selector";
import { sealEximbayRefundCanaryTarget } from
  "../eximbay-refund-canary-target-binding";
import { EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION } from
  "../eximbay-refund-sandbox-canary-approval-contract";
import { prepareEximbayRefundCanaryAdmission } from
  "../prepare-eximbay-refund-canary-admission";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";
import { createRefundExecutionWorkerRouter } from "../worker-router";
import { loadRefundWorkerMigrationInventory } from "../worker-migration-inventory";
import {
  cleanupDispatchFixtures,
  DISPATCH_NOW,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const AMOUNT = 12_345;
const ROLE_PASSWORD = "eximbay_admission_fixture_only";
const CONFIG = Object.freeze({
  mode: PaymentMode.SANDBOX,
  mid: "synthetic-merchant-mid",
  merchantAccountBindingId: "merchant-v1",
  credentialGenerationBindingId: "credential-v1",
});
const WORKER_ENV = Object.freeze({
  [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
  [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
});

type AdmissionFixture = Readonly<{
  fixture: DispatchFixture;
  artifact: EximbayRefundCanaryFreshSaleCustody;
  rawArtifact: Readonly<Record<string, unknown>>;
  artifactSha256: string;
  orderItemId: string;
  checkoutLineId: string;
  orderItemIds: readonly string[];
  checkoutLineIds: readonly string[];
  variantIds: readonly string[];
  wigStyleIds: readonly string[];
  readyContactCalls: number;
  providerOrderId: string;
  migrations: Awaited<ReturnType<typeof loadRefundWorkerMigrationInventory>>;
}>;

const fixtures: AdmissionFixture[] = [];
let databaseUrl: string;

beforeAll(async () => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  await resetDisposableContainmentDatabase();
  await requireEmptyContainmentDatabase();
});

afterEach(async () => {
  for (const prepared of fixtures) await cleanupAdmissionFixture(prepared);
  fixtures.length = 0;
});

describe("provider-free Eximbay canary admission", () => {
  it("creates one atomic binding and approval from an exact one-target artifact", async () => {
    const prepared = await trackedAdmissionFixture();
    expect(prepared.artifact.inventory).toMatchObject({
      marketCount: 2,
      variantMarketPriceCount: 1,
      wigStyleMarketCount: 1,
      wigStyleLocalizedRevisionCount: 0,
      wigStyleLocalizedApprovalDecisionCount: 0,
      wigStyleLocalizedPublicationCount: 0,
      wigStyleLocalizedPublicationEventCount: 0,
      wigStyleRelationCount: 0,
    });
    expect(prepared.artifact.catalogFixture).toMatchObject({
      markets: EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
      variantMarketPrices: [{
        variantId: prepared.variantIds[0],
        wigStyleId: prepared.wigStyleIds[0],
        marketCode: "US",
        amount: AMOUNT,
        checkoutSessionLineId: prepared.checkoutLineId,
        orderItemId: prepared.orderItemId,
      }],
      wigStyleMarkets: [{
        wigStyleId: prepared.wigStyleIds[0], marketCode: "US", isActive: true,
      }],
    });
    expect(prepared.readyContactCalls).toBe(1);
    const result = await prepare(prepared);
    expect(result).toMatchObject({
      ok: true,
      code: "EXIMBAY_REFUND_CANARY_APPROVAL_CREATED",
      commandId: prepared.fixture.commandId,
      custodyArtifactSha256: prepared.artifactSha256,
      issuerAuthority: "AUTHENTICATED_POSTGRES_SESSION",
      externalAuthority: "NOT_AUTHENTICATED_BY_SOURCE",
    });
    const [approval, bindings] = await Promise.all([
      db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({
        where: { commandId: prepared.fixture.commandId },
      }),
      db.refundExecutionProviderOperationBinding.findMany({
        where: { refundAttemptId: prepared.fixture.refundAttemptId },
      }),
    ]);
    expect(approval.approvalEvidenceDigest).toBe(prepared.artifactSha256);
    expect(approval.issuedByPrincipalId).toMatch(/^postgres-session\/v1:[a-z_][a-z0-9_$-]*$/u);
    expect(bindings).toHaveLength(1);
    expect(await executionFactCounts(prepared.fixture.commandId)).toEqual({
      commandEvents: 0,
      dispatches: 0,
      observations: 0,
      evidence: 0,
      outbox: 1,
    });
  });

  it("deduplicates repeated target-style lines while preserving exact price-row linkage", async () => {
    const prepared = await trackedAdmissionFixture({ variantAmounts: [4_000, 8_345] });
    expect(prepared.artifact.catalogFixture.variantMarketPrices).toHaveLength(2);
    expect(prepared.artifact.catalogFixture.wigStyleMarkets).toEqual([{
      wigStyleId: prepared.wigStyleIds[0],
      marketCode: "US",
      isActive: true,
    }]);
    expect(prepared.artifact.inventory).toMatchObject({
      checkoutSessionLineCount: 2,
      orderItemCount: 2,
      wigVariantCount: 2,
      variantMarketPriceCount: 2,
      wigStyleCount: 1,
      wigStyleMarketCount: 1,
    });
    await expect(prepare(prepared)).resolves.toMatchObject({
      ok: true,
      code: "EXIMBAY_REFUND_CANARY_APPROVAL_CREATED",
    });
  });

  it.each(["fresh", "expired", "consumed", "differently-bound"] as const)(
    "existing %s approval wins before target resealing",
    async (state) => {
      const prepared = await trackedAdmissionFixture();
      await insertExistingApproval(prepared, state);
      await expect(prepare(prepared)).resolves.toEqual({
        ok: false, code: "APPROVAL_ALREADY_EXISTS",
      });
      expect(await db.refundExecutionProviderOperationBinding.count({
        where: { refundAttemptId: prepared.fixture.refundAttemptId },
      })).toBe(0);
      expect(await db.eximbayRefundSandboxCanaryApproval.count({
        where: { commandId: prepared.fixture.commandId },
      })).toBe(1);
    },
  );

  it("existing approval wins after later target drift without renewal or reseal", async () => {
    const prepared = await trackedAdmissionFixture();
    const created = await prepare(prepared);
    if (!created.ok) throw new Error(created.code);
    const before = await durableAuthority(prepared);
    await db.order.update({
      where: { id: prepared.fixture.orderId },
      data: { subtotalAmount: AMOUNT + 1, totalAmount: AMOUNT + 1 },
    });
    await expect(prepare(prepared)).resolves.toEqual({
      ok: false, code: "APPROVAL_ALREADY_EXISTS",
    });
    expect(await durableAuthority(prepared)).toEqual(before);
  });

  it("concurrent first issuers converge to one approval and one binding", async () => {
    const prepared = await trackedAdmissionFixture();
    const results = await Promise.all([prepare(prepared), prepare(prepared)]);
    expect(results.map((result) => result.code).sort()).toEqual([
      "APPROVAL_ALREADY_EXISTS",
      "EXIMBAY_REFUND_CANARY_APPROVAL_CREATED",
    ]);
    expect(await db.eximbayRefundSandboxCanaryApproval.count()).toBe(1);
    expect(await db.refundExecutionProviderOperationBinding.count()).toBe(1);
  });

  it("rejects authoritative money, currency, ownership, and prior-success drift", async () => {
    const orderDrift = await trackedAdmissionFixture();
    await db.order.update({
      where: { id: orderDrift.fixture.orderId },
      data: { subtotalAmount: AMOUNT + 1, totalAmount: AMOUNT + 1 },
    });
    await expect(prepare(orderDrift)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
    await cleanupTrackedFixture(orderDrift);

    const currencyDrift = await trackedAdmissionFixture();
    await db.order.update({
      where: { id: currencyDrift.fixture.orderId }, data: { currency: "JPY" },
    });
    await expect(prepare(currencyDrift)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
    await cleanupTrackedFixture(currencyDrift);

    const ownershipDrift = await trackedAdmissionFixture();
    const secondPayment = await db.payment.create({
      data: {
        checkoutSessionId: ownershipDrift.fixture.sessionId,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
        amount: AMOUNT,
        currency: "USD",
        providerOrderId: syntheticEximbayProviderOrderId(),
        providerRef: `secondary-receipt-${randomUUID()}`,
        providerPaymentKey: `secondary-transaction-${randomUUID()}`,
        financialSucceededAt: DISPATCH_NOW,
        blockingEndedAt: DISPATCH_NOW,
        idempotencyKey: `secondary-payment-${randomUUID()}`,
      },
    });
    try {
      await db.refundAttempt.update({
        where: { id: ownershipDrift.fixture.refundAttemptId },
        data: { paymentId: secondPayment.id },
      });
      await expect(prepare(ownershipDrift)).resolves.toEqual({
        ok: false, code: "TARGET_NOT_ADMISSIBLE",
      });
    } finally {
      await db.refundAttempt.update({
        where: { id: ownershipDrift.fixture.refundAttemptId },
        data: { paymentId: ownershipDrift.fixture.paymentId },
      });
      await db.payment.delete({ where: { id: secondPayment.id } });
    }
    await cleanupTrackedFixture(ownershipDrift);

    const priorSuccess = await trackedAdmissionFixture();
    await db.refundAttempt.create({
      data: {
        orderId: priorSuccess.fixture.orderId,
        paymentId: priorSuccess.fixture.paymentId,
        amount: 1,
        currency: "USD",
        status: RefundAttemptStatus.SUCCEEDED,
        reason: "prior success falsifier",
        actorType: RefundAttemptActorType.SYSTEM,
        actorUserId: null,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        providerRefundId: `prior-refund-${randomUUID()}`,
        idempotencyKey: `prior-success-${randomUUID()}`,
        processedAt: DISPATCH_NOW,
      },
    });
    await expect(prepare(priorSuccess)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
  });

  it("rejects migration, database, profile, unrelated-target, and outbox drift", async () => {
    const migrationDrift = await trackedAdmissionFixture();
    const changedMigration = artifactMutation(migrationDrift, {
      migrationCount: migrationDrift.artifact.migrationCount + 1,
    });
    await expect(prepareWith(migrationDrift, changedMigration)).resolves.toEqual({
      ok: false, code: "MIGRATION_IDENTITY_MISMATCH",
    });
    await cleanupTrackedFixture(migrationDrift);

    const databaseDrift = await trackedAdmissionFixture();
    const changedDatabase = artifactMutation(databaseDrift, { databaseName: "refund_sandbox" });
    await expect(prepareWith(databaseDrift, changedDatabase)).resolves.toEqual({
      ok: false, code: "DATABASE_IDENTITY_MISMATCH",
    });
    await cleanupTrackedFixture(databaseDrift);

    const profileDrift = await trackedAdmissionFixture();
    const changedProfile = artifactMutation(profileDrift, {
      syntheticProfileDigest: "f".repeat(64),
    });
    await expect(prepareWith(profileDrift, changedProfile)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
    await cleanupTrackedFixture(profileDrift);

    const profileMediaDrift = await trackedAdmissionFixture();
    await db.user.update({
      where: { id: profileMediaDrift.fixture.userId },
      data: { image: "customer-profile-media-key" },
    });
    await expect(prepare(profileMediaDrift)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
    await cleanupTrackedFixture(profileMediaDrift);

    const unrelated = await trackedAdmissionFixture();
    const unrelatedUserId = `unrelated_customer_${randomUUID()}`;
    await db.user.create({
      data: { id: unrelatedUserId, email: `${unrelatedUserId}@example.test` },
    });
    try {
      await expect(prepare(unrelated)).resolves.toEqual({
        ok: false, code: "TARGET_NOT_ADMISSIBLE",
      });
    } finally {
      await db.user.delete({ where: { id: unrelatedUserId } });
    }
    await cleanupTrackedFixture(unrelated);

    const customerToken = await trackedAdmissionFixture();
    const token = `unexpected-customer-token-${randomUUID()}`;
    await db.verificationToken.create({
      data: {
        identifier: "unexpected-customer@example.test",
        token,
        expires: new Date(Date.now() + 60_000),
      },
    });
    try {
      await expect(prepare(customerToken)).resolves.toEqual({
        ok: false, code: "TARGET_NOT_ADMISSIBLE",
      });
    } finally {
      await db.verificationToken.delete({ where: { token } });
    }
    await cleanupTrackedFixture(customerToken);

    const unexplainedOutbox = await trackedAdmissionFixture();
    const outboxId = `unexplained-outbox-${randomUUID()}`;
    await db.paymentOutbox.create({
      data: { id: outboxId, topic: "unexplained", payload: { test: true } },
    });
    try {
      await expect(prepare(unexplainedOutbox)).resolves.toEqual({
        ok: false, code: "TARGET_NOT_ADMISSIBLE",
      });
    } finally {
      await db.paymentOutbox.delete({ where: { id: outboxId } });
    }
  });

  it("rejects missing, extra, wrong-market, wrong-amount, and artifact-mismatched prices", async () => {
    const prepared = await trackedAdmissionFixture();
    const projected = prepared.artifact.catalogFixture.variantMarketPrices[0]
      ?? failFixtureIdentity();
    const key = {
      variantId: projected.variantId,
      marketCode: projected.marketCode,
    };

    await db.variantMarketPrice.delete({ where: { variantId_marketCode: key } });
    await expectRejectedAdmission(prepared);
    await db.variantMarketPrice.create({ data: { ...key, amount: projected.amount } });

    await db.variantMarketPrice.update({
      where: { variantId_marketCode: key }, data: { amount: projected.amount + 1 },
    });
    await expectRejectedAdmission(prepared);
    await db.variantMarketPrice.update({
      where: { variantId_marketCode: key }, data: { amount: projected.amount },
    });

    await db.variantMarketPrice.create({
      data: { variantId: projected.variantId, marketCode: "KR", amount: projected.amount },
    });
    await expectRejectedAdmission(prepared);
    await db.variantMarketPrice.delete({
      where: {
        variantId_marketCode: { variantId: projected.variantId, marketCode: "KR" },
      },
    });

    await db.variantMarketPrice.delete({ where: { variantId_marketCode: key } });
    await db.variantMarketPrice.create({
      data: { variantId: projected.variantId, marketCode: "KR", amount: projected.amount },
    });
    await expectRejectedAdmission(prepared);
    await db.variantMarketPrice.delete({
      where: {
        variantId_marketCode: { variantId: projected.variantId, marketCode: "KR" },
      },
    });
    await db.variantMarketPrice.create({ data: { ...key, amount: projected.amount } });

    const changedPriceRows = prepared.artifact.catalogFixture.variantMarketPrices.map((row) => ({
      ...row,
      amount: row.amount + 1,
    }));
    const changedPriceArtifact = artifactMutation(prepared, {
      catalogFixture: catalogFixtureMutation(prepared, {
        variantMarketPrices: changedPriceRows,
      }),
    });
    await expect(prepareWith(prepared, changedPriceArtifact)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });

    const wrongVariantRows = prepared.artifact.catalogFixture.variantMarketPrices.map((row) => ({
      ...row,
      variantId: `${row.variantId}_wrong`,
    }));
    const wrongVariantArtifact = artifactMutation(prepared, {
      catalogFixture: catalogFixtureMutation(prepared, {
        variantMarketPrices: wrongVariantRows,
      }),
    });
    await expect(prepareWith(prepared, wrongVariantArtifact)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
  });

  it("rejects missing, extra, wrong-market, inactive, and wrongly linked style markets", async () => {
    const prepared = await trackedAdmissionFixture();
    const projected = prepared.artifact.catalogFixture.wigStyleMarkets[0]
      ?? failFixtureIdentity();
    const key = { wigStyleId: projected.wigStyleId, marketCode: projected.marketCode };

    await db.wigStyleMarket.delete({ where: { wigStyleId_marketCode: key } });
    await expectRejectedAdmission(prepared);
    await db.wigStyleMarket.create({ data: { ...key, isActive: true } });

    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: key }, data: { isActive: false },
    });
    await expectRejectedAdmission(prepared);
    await db.wigStyleMarket.update({
      where: { wigStyleId_marketCode: key }, data: { isActive: true },
    });

    await db.wigStyleMarket.delete({ where: { wigStyleId_marketCode: key } });
    await db.wigStyleMarket.create({
      data: { wigStyleId: projected.wigStyleId, marketCode: "KR", isActive: true },
    });
    await expectRejectedAdmission(prepared);
    await db.wigStyleMarket.delete({
      where: {
        wigStyleId_marketCode: { wigStyleId: projected.wigStyleId, marketCode: "KR" },
      },
    });
    await db.wigStyleMarket.create({ data: { ...key, isActive: true } });

    const unrelatedStyle = await db.wigStyle.create({
      data: {
        name: "Unrelated canary style",
        category: WigCategory.FASHION,
        tags: [],
        imageKeys: [],
        availableMarkets: { create: { marketCode: "US", isActive: true } },
      },
      select: { id: true },
    });
    await expectRejectedAdmission(prepared);
    await db.wigStyle.delete({ where: { id: unrelatedStyle.id } });

    const wrongStyleId = `${projected.wigStyleId}_wrong`;
    const wrongPriceRows = prepared.artifact.catalogFixture.variantMarketPrices.map((row) => ({
      ...row,
      wigStyleId: wrongStyleId,
    }));
    const wrongStyleRows = [{ ...projected, wigStyleId: wrongStyleId }];
    const wrongStyleArtifact = artifactMutation(prepared, {
      catalogFixture: catalogFixtureMutation(prepared, {
        variantMarketPrices: wrongPriceRows,
        wigStyleMarkets: wrongStyleRows,
      }),
    });
    await expect(prepareWith(prepared, wrongStyleArtifact)).resolves.toEqual({
      ok: false, code: "TARGET_NOT_ADMISSIBLE",
    });
  });

  it("independently rejects every malformed canonical Market fact and extra rows", async () => {
    const prepared = await trackedAdmissionFixture();
    const marketMutations: readonly Readonly<{
      code: string;
      mutation: Prisma.MarketUpdateInput;
      restore: Prisma.MarketUpdateInput;
    }>[] = [
      { code: "KR", mutation: { currency: "USD" }, restore: { currency: "KRW" } },
      {
        code: "KR",
        mutation: { shippableCountries: { set: ["US"] } },
        restore: { shippableCountries: { set: ["KR"] } },
      },
      { code: "KR", mutation: { defaultLocale: "en" }, restore: { defaultLocale: "ko" } },
      { code: "KR", mutation: { isActive: false }, restore: { isActive: true } },
      { code: "US", mutation: { currency: "KRW" }, restore: { currency: "USD" } },
      {
        code: "US",
        mutation: { shippableCountries: { set: ["KR"] } },
        restore: { shippableCountries: { set: ["US"] } },
      },
      { code: "US", mutation: { defaultLocale: "ko" }, restore: { defaultLocale: "en" } },
      { code: "US", mutation: { isActive: false }, restore: { isActive: true } },
    ];
    for (const { code, mutation, restore } of marketMutations) {
      await db.market.update({ where: { code }, data: mutation });
      await expectRejectedAdmission(prepared);
      await db.market.update({ where: { code }, data: restore });
    }

    await db.market.update({
      where: { code: "US" }, data: { taxConfig: { unexpected: true } },
    });
    await expectRejectedAdmission(prepared);
    await db.market.update({ where: { code: "US" }, data: { taxConfig: Prisma.DbNull } });

    await db.market.update({
      where: { code: "US" }, data: { paymentConfig: { unexpected: true } },
    });
    await expectRejectedAdmission(prepared);
    await db.market.update({ where: { code: "US" }, data: { paymentConfig: Prisma.DbNull } });

    await db.market.delete({ where: { code: "KR" } });
    await expectRejectedAdmission(prepared);
    await ensureCanonicalCanaryMarkets();

    await db.market.create({
      data: {
        code: "CA", currency: "CAD", shippableCountries: ["CA"],
        defaultLocale: "en", isActive: true,
      },
    });
    await expectRejectedAdmission(prepared);
    await db.market.delete({ where: { code: "CA" } });

    await db.$transaction([
      db.checkoutSession.update({
        where: { id: prepared.fixture.sessionId },
        data: { marketCode: "KR", currency: "KRW" },
      }),
      db.order.update({
        where: { id: prepared.fixture.orderId },
        data: { marketCode: "KR", currency: "KRW" },
      }),
    ]);
    await expectRejectedAdmission(prepared);
    await db.$transaction([
      db.checkoutSession.update({
        where: { id: prepared.fixture.sessionId },
        data: { marketCode: "US", currency: "USD" },
      }),
      db.order.update({
        where: { id: prepared.fixture.orderId },
        data: { marketCode: "US", currency: "USD" },
      }),
    ]);
  });

  it("rejects current parent, variant, and stock facts that could not pass checkout", async () => {
    const prepared = await trackedAdmissionFixture();
    const variantId = prepared.variantIds[0] ?? failFixtureIdentity();
    const wigStyleId = prepared.wigStyleIds[0] ?? failFixtureIdentity();

    await db.wigVariant.update({ where: { id: variantId }, data: { isActive: false } });
    await expectRejectedAdmission(prepared);
    await db.wigVariant.update({ where: { id: variantId }, data: { isActive: true } });

    await db.wigStyle.update({ where: { id: wigStyleId }, data: { isActive: false } });
    await expectRejectedAdmission(prepared);
    await db.wigStyle.update({ where: { id: wigStyleId }, data: { isActive: true } });

    const current = await db.wigVariant.findUniqueOrThrow({ where: { id: variantId } });
    await db.wigVariant.update({ where: { id: variantId }, data: { stock: 0 } });
    await expectRejectedAdmission(prepared);
    await db.wigVariant.update({ where: { id: variantId }, data: { stock: current.stock } });
  });

  it("rejects a manufactured target after checkout-required catalog authority is removed", async () => {
    const prepared = await trackedAdmissionFixture();
    await Promise.all([
      db.variantMarketPrice.deleteMany(),
      db.wigStyleMarket.deleteMany(),
    ]);
    await expectRejectedAdmission(prepared);
  });

  it("binds target digests to authoritative money and custody bytes", async () => {
    const prepared = await trackedAdmissionFixture();
    const first = await sealEximbayRefundCanaryTarget(db, {
      commandId: prepared.fixture.commandId,
      merchantAccountBindingId: CONFIG.merchantAccountBindingId,
      credentialGenerationBindingId: CONFIG.credentialGenerationBindingId,
      custodyArtifactSha256: prepared.artifactSha256,
    });
    const changedCustody = await sealEximbayRefundCanaryTarget(db, {
      commandId: prepared.fixture.commandId,
      merchantAccountBindingId: CONFIG.merchantAccountBindingId,
      credentialGenerationBindingId: CONFIG.credentialGenerationBindingId,
      custodyArtifactSha256: "e".repeat(64),
    });
    expect(changedCustody.targetBindingDigest).not.toBe(first.targetBindingDigest);
    await db.refundExecutionProviderOperationBinding.delete({
      where: { id: first.providerOperationBindingId },
    });
    await Promise.all([
      db.payment.update({ where: { id: prepared.fixture.paymentId }, data: { amount: AMOUNT + 1 } }),
      db.order.update({
        where: { id: prepared.fixture.orderId },
        data: { subtotalAmount: AMOUNT + 1, totalAmount: AMOUNT + 1 },
      }),
      db.refundAttempt.update({
        where: { id: prepared.fixture.refundAttemptId }, data: { amount: AMOUNT + 1 },
      }),
    ]);
    const changedMoney = await sealEximbayRefundCanaryTarget(db, {
      commandId: prepared.fixture.commandId,
      merchantAccountBindingId: CONFIG.merchantAccountBindingId,
      credentialGenerationBindingId: CONFIG.credentialGenerationBindingId,
      custodyArtifactSha256: prepared.artifactSha256,
    });
    expect(changedMoney.targetBindingDigest).not.toBe(first.targetBindingDigest);
  });

  it("consumption revalidation rejects later financial drift", async () => {
    const prepared = await trackedAdmissionFixture();
    const created = await prepare(prepared);
    if (!created.ok) throw new Error(created.code);
    const authority = canaryAuthority(prepared, created.targetBindingDigest);
    await db.order.update({
      where: { id: prepared.fixture.orderId },
      data: { subtotalAmount: AMOUNT + 1, totalAmount: AMOUNT + 1 },
    });
    await expect(consumeEximbayRefundCanaryApproval(db, authority)).resolves.toEqual({
      outcome: "TARGET_MISMATCH",
    });
    expect((await db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({
      where: { commandId: prepared.fixture.commandId },
    })).consumedAt).toBeNull();
  });

  it("executes the complete simulated canonical path as the restricted login", async () => {
    const prepared = await trackedAdmissionFixture();
    const created = await prepare(prepared);
    if (!created.ok) throw new Error(created.code);
    await installRestrictedRoleAuthority();
    const authority = canaryAuthority(prepared, created.targetBindingDigest);
    const restricted = restrictedPrisma();
    const calls = { retrieve: 0, cancel: 0, lookup: 0, toss: 0, secret: 0 };
    try {
      await expect(restricted.$queryRaw<{ currentUser: string; sessionUser: string }[]>`
        SELECT current_user AS "currentUser", session_user AS "sessionUser"
      `).resolves.toEqual([{
        currentUser: "mira_refund_canary", sessionUser: "mira_refund_canary",
      }]);
      await expect(consumeEximbayRefundCanaryApproval(restricted, authority)).resolves
        .toEqual({ outcome: "ADMITTED", commandId: prepared.fixture.commandId });
      const candidate = await selectExactEximbayRefundCanaryCandidate(
        restricted, prepared.fixture.commandId,
      );
      expect(candidate).toEqual({
        commandId: prepared.fixture.commandId,
        candidateClass: "READY",
        provider: "EXIMBAY",
      });
      if (!candidate) throw new Error("RESTRICTED_CANDIDATE_REQUIRED");
      const router = createRefundExecutionWorkerRouter({
        lookup: () => {
          calls.toss += 1;
          return Promise.reject(new Error("TOSS_LOOKUP_UNREACHABLE"));
        },
        cancellation: () => {
          calls.toss += 1;
          return Promise.reject(new Error("TOSS_CANCEL_UNREACHABLE"));
        },
        eximbay: {
          config: CONFIG,
          retrieve: () => {
            calls.retrieve += 1;
            return Promise.resolve(retrieveSuccess(prepared));
          },
          cancellation: (_url, init) => {
            calls.cancel += 1;
            return Promise.resolve(cancelSuccess(prepared, init));
          },
          lookup: () => {
            calls.lookup += 1;
            return Promise.reject(new Error("RECONCILIATION_LOOKUP_UNREACHABLE"));
          },
        },
      });
      await expect(router(
        restricted, candidate, authority.consumedExecutionId, WORKER_ENV,
      )).resolves.toMatchObject({ kind: "SUCCEEDED" });
    } finally {
      await restricted.$disconnect();
    }
    expect(calls).toEqual({ retrieve: 1, cancel: 1, lookup: 0, toss: 0, secret: 0 });
    const [attempt, order, command, payment, binding, commandEvents, approval,
      observations, dispatches, evidence, outbox, tossEligibility, tossContact] = await Promise.all([
      db.refundAttempt.findUniqueOrThrow({ where: { id: prepared.fixture.refundAttemptId } }),
      db.order.findUniqueOrThrow({ where: { id: prepared.fixture.orderId } }),
      db.refundExecutionCommand.findUniqueOrThrow({ where: { id: prepared.fixture.commandId } }),
      db.payment.findUniqueOrThrow({ where: { id: prepared.fixture.paymentId } }),
      db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
        where: { refundAttemptId: prepared.fixture.refundAttemptId },
      }),
      db.refundExecutionCommandEvent.findMany({
        where: { commandId: prepared.fixture.commandId }, orderBy: { id: "asc" },
      }),
      db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({
        where: { commandId: prepared.fixture.commandId },
      }),
      db.refundExecutionEximbayPreflightObservation.findMany(),
      db.refundExecutionDispatchAttempt.findMany(),
      db.refundExecutionEvidence.findMany(),
      db.paymentOutbox.findMany(),
      db.refundExecutionProviderEligibilityProof.count(),
      db.refundExecutionProviderContactEligibilityProof.count(),
    ]);
    expect(attempt).toMatchObject({ status: "SUCCEEDED", amount: AMOUNT });
    expect(order).toMatchObject({ status: "REFUNDED", totalAmount: AMOUNT });
    expect(command).toMatchObject({ status: "DONE", dispatchAttempt: 1 });
    expect(approval.consumedAt).toBeInstanceOf(Date);
    expect(observations).toHaveLength(1);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      state: "CONTACT_MAY_HAVE_OCCURRED", ordinal: 1,
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ outcome: "SUCCEEDED", application: "APPLIED" });
    expect(outbox).toHaveLength(2);
    expect(outbox).toContainEqual(expect.objectContaining({
      topic: CUSTOMER_ORDER_PAID_EMAIL_V1,
      dedupKey: orderPaidEmailDedupKey(prepared.fixture.orderId),
      status: "PENDING",
      attempts: 0,
    }));
    const refundOutbox = outbox.find((row) => row.topic === CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1);
    expect(refundOutbox).toMatchObject({
      topic: CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
      status: "PENDING",
      attempts: 0,
    });
    expect(refundOutbox?.dedupKey).toBe(
      `customer-refund-succeeded:v1:${prepared.fixture.refundAttemptId}`,
    );
    expect(tossEligibility).toBe(0);
    expect(tossContact).toBe(0);
    expect(commandEvents.length).toBeGreaterThan(0);
    await proveRestrictedLockAuthority({
      paymentId: payment.id,
      bindingId: binding.id,
      commandId: command.id,
      commandEventId: commandEvents[0]?.id ?? failMissingLockRow(),
      evidenceId: evidence[0]?.id ?? failMissingLockRow(),
    });
  });
});

type RestrictedLockTarget = Readonly<{
  paymentId: string;
  bindingId: string;
  commandId: string;
  commandEventId: string;
  evidenceId: string;
}>;

async function proveRestrictedLockAuthority(target: RestrictedLockTarget): Promise<void> {
  const before = await lockOnlyTimestampSnapshot(target);
  const locker = await restrictedPg();
  try {
    await locker.query("BEGIN");
    const scalarLocks = await locker.query<{ payment: boolean; binding: boolean }>(`
      SELECT public.mira_refund_canary_lock_payment($1) AS payment,
        public.mira_refund_canary_lock_provider_operation_binding($2) AS binding
    `, [target.paymentId, target.bindingId]);
    expect(scalarLocks.rows).toEqual([{ payment: true, binding: true }]);
    await expect(locker.query(`
      SELECT public.mira_refund_canary_lock_command_events($1),
        public.mira_refund_canary_lock_evidence($1)
    `, [target.commandId])).resolves.toMatchObject({ rowCount: 1 });
    await expectExactRowLockUnavailable(
      'SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE NOWAIT', target.paymentId,
    );
    await expectExactRowLockUnavailable(
      'SELECT "id" FROM "RefundExecutionProviderOperationBinding" '
        + 'WHERE "id" = $1 FOR UPDATE NOWAIT', target.bindingId,
    );
    await expectExactRowLockUnavailable(
      'SELECT "id" FROM "RefundExecutionCommandEvent" '
        + 'WHERE "id" = $1 FOR UPDATE NOWAIT', target.commandEventId,
    );
    await expectExactRowLockUnavailable(
      'SELECT "id" FROM "RefundExecutionEvidence" '
        + 'WHERE "id" = $1 FOR UPDATE NOWAIT', target.evidenceId,
    );
  } finally {
    await locker.query("ROLLBACK").catch(() => undefined);
    await locker.end();
  }

  const mutator = await restrictedPg();
  try {
    await expectPermissionDenied(mutator, `
      UPDATE "Payment" SET "updatedAt" = "updatedAt" + interval '1 second'
      WHERE "id" = $1
    `, [target.paymentId]);
    await expectPermissionDenied(mutator, `
      UPDATE "RefundExecutionProviderOperationBinding"
      SET "createdAt" = "createdAt" + interval '1 second' WHERE "id" = $1
    `, [target.bindingId]);
    await expectPermissionDenied(mutator, `
      UPDATE "RefundExecutionCommandEvent"
      SET "createdAt" = "createdAt" + interval '1 second' WHERE "id" = $1
    `, [target.commandEventId]);
    await expectPermissionDenied(mutator, `
      UPDATE "RefundExecutionEvidence"
      SET "createdAt" = "createdAt" + interval '1 second' WHERE "id" = $1
    `, [target.evidenceId]);
  } finally {
    await mutator.end();
  }
  expect(await lockOnlyTimestampSnapshot(target)).toEqual(before);
}

async function expectExactRowLockUnavailable(sql: string, id: string): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await expect(admin.query(sql, [id])).rejects.toMatchObject({ code: "55P03" });
  } finally {
    await admin.end();
  }
}

async function lockOnlyTimestampSnapshot(target: RestrictedLockTarget): Promise<unknown> {
  const [payment, binding, event, evidence] = await Promise.all([
    db.payment.findUniqueOrThrow({
      where: { id: target.paymentId }, select: { updatedAt: true },
    }),
    db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
      where: { id: target.bindingId }, select: { createdAt: true },
    }),
    db.refundExecutionCommandEvent.findUniqueOrThrow({
      where: { id: target.commandEventId }, select: { createdAt: true },
    }),
    db.refundExecutionEvidence.findUniqueOrThrow({
      where: { id: target.evidenceId }, select: { createdAt: true },
    }),
  ]);
  return Object.freeze({
    paymentUpdatedAt: payment.updatedAt.toISOString(),
    bindingCreatedAt: binding.createdAt.toISOString(),
    eventCreatedAt: event.createdAt.toISOString(),
    evidenceCreatedAt: evidence.createdAt.toISOString(),
  });
}

function failMissingLockRow(): never {
  throw new Error("RESTRICTED_LOCK_PROOF_ROW_REQUIRED");
}

async function trackedAdmissionFixture(
  options: Readonly<{ variantAmounts?: readonly number[] }> = {},
): Promise<AdmissionFixture> {
  const prepared = await buildAdmissionFixture(options);
  fixtures.push(prepared);
  return prepared;
}

async function buildAdmissionFixture(
  options: Readonly<{ variantAmounts?: readonly number[] }> = {},
): Promise<AdmissionFixture> {
  const variantAmounts = requireVariantAmounts(options.variantAmounts);
  await ensureCanonicalCanaryMarkets();
  const identity = randomUUID();
  const userId = `canary_sale_user_${identity}`;
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      name: "Synthetic Canary Buyer",
    },
  });
  await createRealSaleCatalog(userId, identity, variantAmounts);
  const session = await createCheckoutSession(db, {
    userId,
    marketCode: "US",
    communicationLocale: "en",
    shipping: shippingData(),
    now: DISPATCH_NOW,
  });
  const { initiated, readyContactCalls } = await initiateRealEximbaySale(session.sessionId, userId);
  const providerTransactionId = `synthetic_sale_transaction_${identity}`;
  const normalizedSaleReceiptId = `synthetic_sale_receipt_${identity}`;
  await db.payment.update({
    where: { id: initiated.paymentId },
    data: { providerRef: normalizedSaleReceiptId },
  });
  const capturedAt = new Date(DISPATCH_NOW.getTime() + 2_000);
  const capture: CaptureFacts = {
    paymentId: initiated.paymentId,
    checkoutSessionId: session.sessionId,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    providerPaymentKey: providerTransactionId,
    amount: session.totalAmount,
    currency: session.currency,
    capturedAt,
    receivedAt: capturedAt,
  };
  const completion = requireCompletedSale(await completeFromCapture(db, capture));
  const order = await db.order.findUniqueOrThrow({
    where: { id: completion.orderId },
    include: { items: true },
  });
  const orderItems = [...order.items].sort((left, right) => compareStrings(left.id, right.id));
  const checkoutLines = await db.checkoutSessionLine.findMany({
    where: { sessionId: session.sessionId },
    orderBy: { id: "asc" },
  });
  const refundAttemptId = `canary_refund_${identity}`;
  const commandId = `canary_command_${identity}`;
  const operationKey = `refund:${initiated.paymentId}:${refundAttemptId}`;
  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.REFUND_PENDING },
    }),
    db.refundAttempt.create({
      data: {
        id: refundAttemptId,
        orderId: order.id,
        paymentId: initiated.paymentId,
        amount: AMOUNT,
        currency: "USD",
        status: RefundAttemptStatus.PROCESSING,
        reason: "Synthetic controlled Eximbay canary refund",
        actorType: RefundAttemptActorType.SYSTEM,
        actorUserId: null,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        idempotencyKey: operationKey,
        requestedAt: capturedAt,
      },
    }),
    ...orderItems.map((item) => db.refundAttemptLine.create({
      data: {
        refundAttemptId,
        orderItemId: item.id,
        orderId: order.id,
        quantity: item.quantity,
      },
    })),
    db.refundExecutionCommand.create({
      data: {
        id: commandId,
        refundAttemptId,
        status: RefundExecutionCommandStatus.READY,
        availableAt: capturedAt,
      },
    }),
    db.refundAttemptTransition.create({
      data: {
        refundAttemptId,
        fromStatus: null,
        toStatus: RefundAttemptStatus.REQUESTED,
        orderStatusBefore: OrderStatus.PAID,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.SYSTEM,
        actorUserId: null,
        reason: "Synthetic controlled Eximbay canary refund",
        operationKey: `refund-request:${refundAttemptId}`,
        createdAt: capturedAt,
      },
    }),
    db.refundAttemptTransition.create({
      data: {
        refundAttemptId,
        fromStatus: RefundAttemptStatus.REQUESTED,
        toStatus: RefundAttemptStatus.PROCESSING,
        orderStatusBefore: OrderStatus.REFUND_PENDING,
        orderStatusAfter: OrderStatus.REFUND_PENDING,
        actorType: RefundAttemptActorType.ADMIN,
        actorUserId: "synthetic_preparation_admin",
        reason: "Refund execution claimed.",
        operationKey: `refund-exec-claim:${commandId}`,
        createdAt: capturedAt,
      },
    }),
  ]);
  const fixture: DispatchFixture = Object.freeze({
    userId,
    sessionId: session.sessionId,
    paymentId: initiated.paymentId,
    orderId: order.id,
    refundAttemptId,
    commandId,
    totalAmount: AMOUNT,
    targetAmount: AMOUNT,
    providerRef: normalizedSaleReceiptId,
    providerPaymentKey: providerTransactionId,
    operationKey,
  });
  const [payment, user, checkoutShipping, orderShipping, migrations, marketRows,
    priceRows, styleMarketRows, outboxRows] = await Promise.all([
    db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }),
    db.user.findUniqueOrThrow({ where: { id: fixture.userId } }),
    db.checkoutSessionShipping.findUniqueOrThrow({ where: { sessionId: fixture.sessionId } }),
    db.orderShipping.findUniqueOrThrow({ where: { orderId: fixture.orderId } }),
    loadRefundWorkerMigrationInventory(),
    db.market.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true, currency: true, shippableCountries: true, defaultLocale: true,
        isActive: true, taxConfig: true, paymentConfig: true,
      },
    }),
    db.variantMarketPrice.findMany({
      orderBy: [{ variantId: "asc" }, { marketCode: "asc" }],
      select: {
        variantId: true, marketCode: true, amount: true,
        variant: { select: { wigStyleId: true } },
      },
    }),
    db.wigStyleMarket.findMany({
      orderBy: [{ wigStyleId: "asc" }, { marketCode: "asc" }],
    }),
    db.paymentOutbox.findMany({ orderBy: { id: "asc" } }),
  ]);
  const paymentIdentity = requireFixturePaymentIdentity(payment);
  requireCanonicalFixtureMarketRows(marketRows);
  const itemByVariant = new Map(orderItems.map((item) => [item.variantId, item]));
  const lineByVariant = new Map(checkoutLines.map((line) => [line.variantId, line]));
  const variantMarketPrices = [...priceRows]
    .sort((left, right) => compareStrings(left.variantId, right.variantId))
    .map((row) => {
      const item = itemByVariant.get(row.variantId);
      const line = lineByVariant.get(row.variantId);
      if (!item || !line || row.marketCode !== "US") {
        throw new Error("EXIMBAY_FIXTURE_PRICE_LINKAGE_MISSING");
      }
      return Object.freeze({
        variantId: row.variantId,
        wigStyleId: row.variant.wigStyleId,
        marketCode: "US" as const,
        amount: row.amount,
        checkoutSessionLineId: line.id,
        orderItemId: item.id,
      });
    });
  const wigStyleMarkets = [...styleMarketRows]
    .sort((left, right) => compareStrings(left.wigStyleId, right.wigStyleId))
    .map((row) => {
      if (row.marketCode !== "US" || row.isActive !== true) {
        throw new Error("EXIMBAY_FIXTURE_STYLE_MARKET_AUTHORITY_MISMATCH");
      }
      return Object.freeze({
        wigStyleId: row.wigStyleId, marketCode: "US" as const, isActive: true as const,
      });
    });
  const markets = EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS;
  const marketProjectionSha256 = deriveEximbayRefundCanaryMarketProjectionDigest(markets);
  const variantMarketPriceProjectionSha256 =
    deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(variantMarketPrices);
  const wigStyleMarketProjectionSha256 =
    deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(wigStyleMarkets);
  const inventory = inventoryCounts({
    lineCount: orderItems.length,
    styleCount: wigStyleMarkets.length,
    paymentOutboxCount: outboxRows.length,
  });
  const orderItemIds = orderItems.map((item) => item.id);
  const checkoutSessionLineIds = checkoutLines.map((line) => line.id).sort(compareStrings);
  const paymentOutboxProjectionSha256 = sha256Text(JSON.stringify(outboxRows.map((row) => [
    row.id, row.topic, row.status, row.attempts, row.nextAttemptAt?.toISOString() ?? null,
    row.lastError, row.dedupKey, row.processedAt?.toISOString() ?? null,
  ])));
  const paymentEventProjectionSha256 = sha256Text(JSON.stringify([]));
  const inventoryEvidenceSha256 = deriveEximbayRefundCanaryInventoryEvidenceDigest({
    counts: inventory,
    orderItemIds,
    checkoutSessionLineIds,
    markets,
    marketProjectionSha256,
    variantMarketPrices,
    variantMarketPriceProjectionSha256,
    wigStyleMarkets,
    wigStyleMarketProjectionSha256,
    paymentOutboxProjectionSha256,
    paymentEventProjectionSha256,
  });
  const secretResource = "projects/mira-sbx1/secrets/eximbay-canary-key";
  const secretVersion = "7";
  const secretGenerationBindingDigest = sha256Text(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1",
    secretResource, secretVersion, CONFIG.credentialGenerationBindingId,
  ]));
  const rawArtifact = Object.freeze({
    contractVersion: EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
    canaryRunId: `canary-run-${randomUUID()}`,
    sourceBaselineCommit: EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
    sourceBaselineTree: EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
    migrationCount: migrations.migrationCount,
    migrationDigest: migrations.migrationDigest,
    gcpProjectNumber: "123456789012",
    cloudSqlResource:
      "projects/mira-sbx1/locations/asia-northeast3/instances/refund-sbx",
    cloudSqlInstanceConnectionName: "mira-sbx1:asia-northeast3:refund-sbx",
    databaseName: "wig_platform_test",
    syntheticProfileRevision: "synthetic-profile-v1",
    syntheticProfileDigest: deriveEximbayRefundCanarySyntheticProfileDigest(
      "synthetic-profile-v1",
      { user, checkoutShipping, orderShipping },
    ),
    syntheticAccountOpaqueId: fixture.userId,
    checkoutSessionId: fixture.sessionId,
    paymentId: fixture.paymentId,
    orderId: fixture.orderId,
    refundAttemptId: fixture.refundAttemptId,
    commandId: fixture.commandId,
    orderItemIds,
    checkoutSessionLineIds,
    marketCode: "US",
    shippingCountry: "US",
    currency: "USD",
    promotionState: "NONE",
    provider: "EXIMBAY",
    mode: "SANDBOX",
    adapterExecutionKind: "EXTERNAL",
    paymentStatus: "SUCCEEDED",
    paymentLifecycle: "FINALIZED",
    providerOrderId: paymentIdentity.providerOrderId,
    providerTransactionId: paymentIdentity.providerPaymentKey,
    amount: AMOUNT,
    saleEvidenceTimestamp: paymentIdentity.financialSucceededAt.toISOString(),
    normalizedSaleReceiptId: paymentIdentity.providerRef,
    originalAmount: AMOUNT,
    refundableBalanceAtSale: AMOUNT,
    merchantAccountBindingId: CONFIG.merchantAccountBindingId,
    credentialGenerationBindingId: CONFIG.credentialGenerationBindingId,
    restrictedRawReceiptSha256: sha256Text("restricted-sale-receipt-fixture"),
    inventoryEvidenceSha256,
    dispatcherCustomerChannelEvidenceSha256:
      sha256Text("no-dispatcher-channel-external-evidence-fixture"),
    externalAuthorityStatus: "REQUIRES_INDEPENDENT_AUTHENTICATION",
    releaseBindingDigest: "a".repeat(64),
    canaryJobBindingDigest: "b".repeat(64),
    preflightJobBindingDigest: "c".repeat(64),
    imageBindingDigest: "d".repeat(64),
    secretGenerationBindingDigest,
    paymentOutboxProjectionSha256,
    paymentEventProjectionSha256,
    catalogFixture: {
      markets,
      marketProjectionSha256,
      variantMarketPrices,
      variantMarketPriceProjectionSha256,
      wigStyleMarkets,
      wigStyleMarketProjectionSha256,
    },
    inventory,
  });
  const parsed = parseRawArtifact(rawArtifact);
  return Object.freeze({
    fixture,
    artifact: parsed.artifact,
    rawArtifact,
    artifactSha256: parsed.sha256,
    orderItemId: orderItemIds[0] ?? failFixtureIdentity(),
    checkoutLineId: checkoutSessionLineIds[0] ?? failFixtureIdentity(),
    orderItemIds,
    checkoutLineIds: checkoutSessionLineIds,
    variantIds: variantMarketPrices.map((row) => row.variantId),
    wigStyleIds: wigStyleMarkets.map((row) => row.wigStyleId),
    readyContactCalls,
    providerOrderId: paymentIdentity.providerOrderId,
    migrations,
  });
}

function requireVariantAmounts(value: readonly number[] | undefined): readonly number[] {
  const amounts = value ?? [AMOUNT];
  const valid = [
    amounts.length > 0,
    amounts.every((amount) => Number.isInteger(amount) && amount >= 0),
    amounts.reduce((sum, amount) => sum + amount, 0) === AMOUNT,
  ].every(Boolean);
  if (!valid) throw new Error("EXIMBAY_FIXTURE_AMOUNTS_INVALID");
  return amounts;
}

async function createRealSaleCatalog(
  userId: string,
  identity: string,
  variantAmounts: readonly number[],
): Promise<void> {
  const style = await db.wigStyle.create({
    data: {
      id: `canary_style_${identity}`,
      name: "Synthetic Eximbay Canary Style",
      category: WigCategory.FASHION,
      tags: ["synthetic-canary"],
      imageKeys: [],
      isActive: true,
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
    select: { id: true },
  });
  for (const [index, amount] of variantAmounts.entries()) {
    const variant = await db.wigVariant.create({
      data: {
        id: `canary_variant_${index}_${identity}`,
        wigStyleId: style.id,
        color: `Synthetic ${index}`,
        length: "Medium",
        curl: "Natural",
        price: amount,
        stock: 10,
        sku: `CANARY-${index}-${identity}`,
        isActive: true,
        fulfillmentType: FulfillmentType.STOCKED,
        marketPrices: { create: { marketCode: "US", amount } },
      },
      select: { id: true },
    });
    await db.cartItem.create({
      data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 },
    });
  }
}

async function initiateRealEximbaySale(sessionId: string, userId: string) {
  let readyContactCalls = 0;
  const initiated = await withEximbayCheckoutActivation(() => initiatePaymentAttempt(db, {
    sessionId,
    userId,
    adapterContext: eximbaySaleAdapterContext(),
    now: new Date(DISPATCH_NOW.getTime() + 1_000),
    contactBoundaryClock: () => new Date(DISPATCH_NOW.getTime() + 1_000),
    eximbayReady: {
      env: syntheticEximbayReadyEnvironment(),
      fetchImpl: () => {
        readyContactCalls += 1;
        return Promise.resolve(syntheticReadyResponse());
      },
    },
  }));
  const valid = [initiated.provider === PaymentProvider.EXIMBAY,
    initiated.initiateResult.kind === "ready", readyContactCalls === 1].every(Boolean);
  if (!valid) throw new Error("EXIMBAY_REAL_INITIATION_FIXTURE_FAILED");
  return Object.freeze({ initiated, readyContactCalls });
}

function requireCompletedSale(
  result: Awaited<ReturnType<typeof completeFromCapture>>,
) {
  if (result.kind !== "completed") {
    throw new Error(`EXIMBAY_PROVIDER_FREE_COMPLETION_FAILED:${result.kind}`);
  }
  return result;
}

function requireFixturePaymentIdentity(payment: Readonly<{
  providerOrderId: string | null;
  providerPaymentKey: string | null;
  providerRef: string | null;
  financialSucceededAt: Date | null;
}>): Readonly<{
  providerOrderId: string;
  providerPaymentKey: string;
  providerRef: string;
  financialSucceededAt: Date;
}> {
  const { providerOrderId, providerPaymentKey, providerRef, financialSucceededAt } = payment;
  if (![providerOrderId, providerPaymentKey, providerRef].every(
    (value) => typeof value === "string" && value.length > 0,
  ) || !(financialSucceededAt instanceof Date)) throw new Error("EXIMBAY_FIXTURE_IDENTITY_MISSING");
  return Object.freeze({
    providerOrderId: providerOrderId ?? failFixtureIdentity(),
    providerPaymentKey: providerPaymentKey ?? failFixtureIdentity(),
    providerRef: providerRef ?? failFixtureIdentity(),
    financialSucceededAt,
  });
}

function requireCanonicalFixtureMarketRows(rows: unknown): void {
  if (JSON.stringify(rows) !== JSON.stringify(EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS)) {
    throw new Error("EXIMBAY_FIXTURE_MARKET_AUTHORITY_MISMATCH");
  }
}

async function ensureCanonicalCanaryMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: "KR" },
    update: {
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
      taxConfig: Prisma.DbNull,
      paymentConfig: Prisma.DbNull,
    },
    create: {
      code: "KR",
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
  await db.market.upsert({
    where: { code: "US" },
    update: {
      currency: "USD",
      shippableCountries: [ShippingCountry.US],
      defaultLocale: "en",
      isActive: true,
      taxConfig: Prisma.DbNull,
      paymentConfig: Prisma.DbNull,
    },
    create: {
      code: "US",
      currency: "USD",
      shippableCountries: [ShippingCountry.US],
      defaultLocale: "en",
      isActive: true,
    },
  });
}

async function withEximbayCheckoutActivation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = process.env[EXIMBAY_CHECKOUT_SANDBOX_ENABLED];
  process.env[EXIMBAY_CHECKOUT_SANDBOX_ENABLED] = "ENABLED";
  try {
    return await operation();
  } finally {
    if (previous === undefined) delete process.env[EXIMBAY_CHECKOUT_SANDBOX_ENABLED];
    else process.env[EXIMBAY_CHECKOUT_SANDBOX_ENABLED] = previous;
  }
}

function eximbaySaleAdapterContext(): ProviderFactoryContext {
  return {
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    market: "US",
    method: PaymentMethod.CARD,
    currency: "USD",
    ruleId: "cfa.us.card.usd",
    credentials: [
      { name: "EXIMBAY_SANDBOX_API_KEY", required: true, present: true },
      { name: "EXIMBAY_SANDBOX_MID", required: true, present: true },
    ],
    liveGuard: {
      kind: "blocked",
      liveEnabled: false,
      reason: "Eximbay is installed only for the bounded customer SANDBOX route.",
    },
  };
}

function syntheticEximbayReadyEnvironment(): Readonly<Record<string, string>> {
  return {
    EXIMBAY_SANDBOX_API_KEY: "SYNTHETIC_EXIMBAY_READY_KEY",
    EXIMBAY_SANDBOX_MID: "synthetic-ready-mid",
    PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
  };
}

function syntheticReadyResponse(): Response {
  return new Response(JSON.stringify({
    rescode: "0000",
    resmsg: "Synthetic READY success",
    fgkey: "synthetic-ready-fgkey",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function compareStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function failFixtureIdentity(): never {
  throw new Error("EXIMBAY_FIXTURE_IDENTITY_MISSING");
}

function shippingData() {
  return {
    recipientName: "Synthetic Canary",
    phone: "+12025550123",
    country: ShippingCountry.US,
    postalCode: "98101",
    administrativeArea: "WA",
    city: "Seattle",
    addressLine1: "1 Synthetic Way",
  };
}

function inventoryCounts(input: Readonly<{
  lineCount: number;
  styleCount: number;
  paymentOutboxCount: number;
}>): EximbayRefundCanaryInventoryCounts {
  return Object.freeze({
    userCount: 1, accountCount: 0, sessionCount: 0, verificationTokenCount: 0,
    marketCount: 2,
    fittingCount: 0,
    cartItemCount: 0, wishlistItemCount: 0, checkoutSessionCount: 1,
    checkoutSessionLineCount: input.lineCount, checkoutSessionShippingCount: 1, paymentCount: 1,
    orderCount: 1, customerRefundIntakeCount: 0, orderCancellationCount: 0,
    refundAttemptCount: 1, refundAttemptLineCount: input.lineCount,
    refundAttemptLineEconomicAllocationCount: 0, refundAttemptTransitionCount: 2,
    refundExecutionCommandCount: 1, approvalCount: 0, commandEventCount: 0,
    dispatchAttemptCount: 0, contactProofCount: 0, operationBindingCount: 0,
    eximbayPreflightObservationCount: 0, eligibilityProofCount: 0,
    refundEvidenceCount: 0, orderItemCount: input.lineCount, orderShippingCount: 1,
    manufacturingRequestCount: 0, paymentOutboxCount: input.paymentOutboxCount,
    paymentEventCount: 0,
    webhookIngressRejectionCount: 0, reviewCount: 0, promotionPolicyVersionCount: 0,
    promotionMarketRuleCount: 0, customerBenefitProfileCount: 0,
    promotionGrantCount: 0, promotionRecoveryCheckpointCount: 0,
    wigStyleCount: input.styleCount, wigVariantCount: input.lineCount,
    variantMarketPriceCount: input.lineCount,
    wigStyleMarketCount: input.styleCount, wigStyleLocalizedRevisionCount: 0,
    wigStyleLocalizedApprovalDecisionCount: 0, wigStyleLocalizedPublicationCount: 0,
    wigStyleLocalizedPublicationEventCount: 0, wigStyleRelationCount: 0,
  });
}

function parseRawArtifact(value: Readonly<Record<string, unknown>>): Readonly<{
  artifact: EximbayRefundCanaryFreshSaleCustody;
  sha256: string;
}> {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  const sha256 = sha256Bytes(bytes);
  const artifact = parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256);
  if (!artifact) throw new Error("TEST_ARTIFACT_INVALID");
  return Object.freeze({ artifact, sha256 });
}

function artifactMutation(
  prepared: AdmissionFixture,
  mutation: Readonly<Record<string, unknown>>,
) {
  return parseRawArtifact(Object.freeze({ ...prepared.rawArtifact, ...mutation }));
}

function catalogFixtureMutation(
  prepared: AdmissionFixture,
  mutation: Readonly<{
    markets?: readonly EximbayRefundCanaryMarketProjection[];
    variantMarketPrices?: readonly EximbayRefundCanaryVariantMarketPriceProjection[];
    wigStyleMarkets?: readonly EximbayRefundCanaryWigStyleMarketProjection[];
  }>,
) {
  const current = prepared.artifact.catalogFixture;
  const markets = mutation.markets ?? current.markets;
  const variantMarketPrices = mutation.variantMarketPrices ?? current.variantMarketPrices;
  const wigStyleMarkets = mutation.wigStyleMarkets ?? current.wigStyleMarkets;
  return Object.freeze({
    markets,
    marketProjectionSha256: deriveEximbayRefundCanaryMarketProjectionDigest(markets),
    variantMarketPrices,
    variantMarketPriceProjectionSha256:
      deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(variantMarketPrices),
    wigStyleMarkets,
    wigStyleMarketProjectionSha256:
      deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(wigStyleMarkets),
  });
}

async function expectRejectedAdmission(prepared: AdmissionFixture): Promise<void> {
  await expect(prepare(prepared)).resolves.toEqual({
    ok: false,
    code: "TARGET_NOT_ADMISSIBLE",
  });
}

function prepare(prepared: AdmissionFixture) {
  return prepareEximbayRefundCanaryAdmission(
    db, prepared.artifact, prepared.artifactSha256, prepared.migrations,
  );
}

function prepareWith(
  prepared: AdmissionFixture,
  changed: ReturnType<typeof parseRawArtifact>,
) {
  return prepareEximbayRefundCanaryAdmission(
    db, changed.artifact, changed.sha256, prepared.migrations,
  );
}

async function insertExistingApproval(
  prepared: AdmissionFixture,
  state: "fresh" | "expired" | "consumed" | "differently-bound",
): Promise<void> {
  const now = new Date();
  const expired = state === "expired";
  const approvedAt = new Date(now.getTime() - (expired ? 20 : 1) * 60_000);
  const expiresAt = new Date(now.getTime() + (expired ? -5 : 14) * 60_000);
  const consumedAt = state === "consumed" ? now : null;
  await db.eximbayRefundSandboxCanaryApproval.create({
    data: {
      formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_APPROVAL_VERSION,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      approvalEvidenceDigest: prepared.artifactSha256,
      releaseBindingDigest: prepared.artifact.releaseBindingDigest,
      canaryJobBindingDigest: prepared.artifact.canaryJobBindingDigest,
      preflightJobBindingDigest: prepared.artifact.preflightJobBindingDigest,
      imageBindingDigest: prepared.artifact.imageBindingDigest,
      secretGenerationBindingDigest: prepared.artifact.secretGenerationBindingDigest,
      targetBindingDigest: state === "differently-bound"
        ? "9".repeat(64) : "8".repeat(64),
      commandId: prepared.fixture.commandId,
      approvedAt,
      expiresAt,
      issuedByPrincipalId: "postgres-session/v1:fixture_issuer",
      consumedAt,
      consumedExecutionId: consumedAt ? "fixture-consumer" : null,
      consumedExecutionBindingDigest: consumedAt ? "7".repeat(64) : null,
    },
  });
}

async function durableAuthority(prepared: AdmissionFixture) {
  const [approval, binding] = await Promise.all([
    db.eximbayRefundSandboxCanaryApproval.findUniqueOrThrow({
      where: { commandId: prepared.fixture.commandId },
    }),
    db.refundExecutionProviderOperationBinding.findUniqueOrThrow({
      where: { refundAttemptId: prepared.fixture.refundAttemptId },
    }),
  ]);
  return Object.freeze({ approval, binding });
}

async function executionFactCounts(commandId: string) {
  const [commandEvents, dispatches, observations, evidence, outbox] = await Promise.all([
    db.refundExecutionCommandEvent.count({ where: { commandId } }),
    db.refundExecutionDispatchAttempt.count({ where: { commandId } }),
    db.refundExecutionEximbayPreflightObservation.count(),
    db.refundExecutionEvidence.count({ where: { commandId } }),
    db.paymentOutbox.count(),
  ]);
  return { commandEvents, dispatches, observations, evidence, outbox };
}

function canaryAuthority(prepared: AdmissionFixture, targetBindingDigest: string) {
  const secretResource = "projects/mira-sbx1/secrets/eximbay-canary-key";
  const env = {
    DATABASE_URL: databaseUrl,
    MIRA_REFUND_EXIMBAY_CANARY_LANE: "EXIMBAY_SANDBOX_V1",
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST:
      prepared.artifact.releaseBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST:
      prepared.artifact.canaryJobBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST:
      prepared.artifact.preflightJobBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST:
      prepared.artifact.imageBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST:
      prepared.artifact.secretGenerationBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST: targetBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST:
      prepared.artifactSha256,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: secretResource,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "7",
    EXIMBAY_SANDBOX_MID: CONFIG.mid,
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING:
      CONFIG.merchantAccountBindingId,
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING:
      CONFIG.credentialGenerationBindingId,
    REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
    REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
    CLOUD_RUN_JOB: "job-1",
    CLOUD_RUN_EXECUTION: "execution-1",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  };
  const authority = parseEximbayRefundCanaryEnvironment(env);
  if (!authority) throw new Error("EXPECTED_VALID_CANARY_AUTHORITY");
  return authority;
}

function retrieveSuccess(prepared: AdmissionFixture): Response {
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    payment: {
      order_id: prepared.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", AMOUNT),
      transaction_id: prepared.fixture.providerPaymentKey,
      status: "SALE",
      transaction_date: "20260829010203",
      balance: encodeEximbayAmount("USD", AMOUNT),
    },
  });
}

function cancelSuccess(prepared: AdmissionFixture, init: RequestInit | undefined): Response {
  const body = parseRequestBody(init?.body);
  const refundId = isRecord(body) && isRecord(body.refund)
    && typeof body.refund.refund_id === "string" ? body.refund.refund_id : "";
  return jsonResponse({
    rescode: "0000",
    resmsg: "Success.",
    mid: CONFIG.mid,
    refund: {
      refund_amount: encodeEximbayAmount("USD", AMOUNT),
      refund_id: refundId,
      refund_date: "20260829010304",
      refund_transaction_id: "synthetic-provider-refund-transaction",
    },
    payment: {
      order_id: prepared.providerOrderId,
      currency: "USD",
      amount: encodeEximbayAmount("USD", AMOUNT),
      transaction_id: prepared.fixture.providerPaymentKey,
      balance: "0.00",
    },
  });
}

function parseRequestBody(value: BodyInit | null | undefined): unknown {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function installRestrictedRoleAuthority(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await bootstrapEximbayP3eDatabaseRoles(admin, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "wig_platform_test",
    });
    await admin.query(`ALTER ROLE mira_refund_canary PASSWORD '${ROLE_PASSWORD}'`);
  } finally {
    await admin.end();
  }
}

function restrictedPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: restrictedDatabaseUrl() }),
  });
}

async function restrictedPg(): Promise<Client> {
  const client = new Client({ connectionString: restrictedDatabaseUrl() });
  await client.connect();
  return client;
}

function restrictedDatabaseUrl(): string {
  const url = new URL(databaseUrl);
  url.username = "mira_refund_canary";
  url.password = ROLE_PASSWORD;
  return url.toString();
}

async function expectPermissionDenied(
  client: Client,
  sql: string,
  values: readonly string[],
): Promise<void> {
  await expect(client.query(sql, [...values])).rejects.toThrow(/permission denied/iu);
}

async function cleanupTrackedFixture(prepared: AdmissionFixture): Promise<void> {
  const index = fixtures.indexOf(prepared);
  if (index >= 0) fixtures.splice(index, 1);
  await cleanupAdmissionFixture(prepared);
}

async function cleanupAdmissionFixture(prepared: AdmissionFixture): Promise<void> {
  const bindings = await db.refundExecutionProviderOperationBinding.findMany({
    where: { refundAttemptId: prepared.fixture.refundAttemptId }, select: { id: true },
  });
  await db.$executeRawUnsafe(
    'ALTER TABLE "RefundExecutionEximbayPreflightObservation" '
      + 'DISABLE TRIGGER "EximbayPreflight_immutable"',
  );
  try {
    await db.refundExecutionEximbayPreflightObservation.deleteMany({
      where: { bindingId: { in: bindings.map((binding) => binding.id) } },
    });
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "RefundExecutionEximbayPreflightObservation" '
        + 'ENABLE TRIGGER "EximbayPreflight_immutable"',
    );
  }
  await Promise.all([
    db.paymentOutbox.deleteMany({
      where: { dedupKey: orderPaidEmailDedupKey(prepared.fixture.orderId) },
    }),
    db.checkoutSessionLine.deleteMany({ where: { sessionId: prepared.fixture.sessionId } }),
    db.checkoutSessionShipping.deleteMany({ where: { sessionId: prepared.fixture.sessionId } }),
    db.orderShipping.deleteMany({ where: { orderId: prepared.fixture.orderId } }),
  ]);
  await cleanupDispatchFixtures(prepared.fixture);
}

async function requireEmptyContainmentDatabase(): Promise<void> {
  const counts = await Promise.all([
    db.user.count(), db.payment.count(), db.order.count(), db.refundAttempt.count(),
    db.paymentOutbox.count(), db.wigStyle.count(),
  ]);
  if (counts.some((count) => count !== 0)) {
    throw new Error("EXIMBAY_ADMISSION_TEST_REQUIRES_EMPTY_DISPOSABLE_DATABASE");
  }
}

async function resetDisposableContainmentDatabase(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await admin.query(`
      DO $reset$
      DECLARE
        application_tables text;
      BEGIN
        SELECT string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ')
        INTO application_tables
        FROM pg_class relation
        JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND relation.relname <> '_prisma_migrations';
        IF application_tables IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || application_tables || ' RESTART IDENTITY CASCADE';
        END IF;
      END
      $reset$;
    `);
  } finally {
    await admin.end();
  }
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
  return value;
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
