import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
  EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
  deriveEximbayRefundCanaryMarketProjectionDigest,
  deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest,
  deriveEximbayRefundCanaryWigStyleMarketProjectionDigest,
  parseEximbayRefundCanaryFreshSaleCustodyBytes,
} from "../eximbay-refund-canary-fresh-sale-custody";
import { runEximbayRefundCanaryPreparation } from
  "../prepare-eximbay-refund-canary-admission";
import {
  eximbayRefundCanaryDatabaseSessionIssuer,
  isEximbayRefundCanaryDatabaseSessionIssuer,
} from "../eximbay-refund-sandbox-canary-approval-contract";

describe("Eximbay fresh-SALE custody artifact", () => {
  it("accepts exact bytes while retaining an explicit external-authentication boundary", () => {
    const bytes = artifactBytes(artifact());
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes)))
      .toMatchObject({
        contractVersion: EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
        externalAuthorityStatus: "REQUIRES_INDEPENDENT_AUTHENTICATION",
        provider: "EXIMBAY",
        mode: "SANDBOX",
        amount: 12_345,
        catalogFixture: {
          markets: EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
          variantMarketPrices: [{
            variantId: "variant-001", wigStyleId: "style-001", marketCode: "US",
            amount: 12_345, checkoutSessionLineId: "checkout-line-001",
            orderItemId: "order-item-001",
          }],
          wigStyleMarkets: [{ wigStyleId: "style-001", marketCode: "US", isActive: true }],
        },
        inventory: { marketCount: 2, variantMarketPriceCount: 1, wigStyleMarketCount: 1 },
      });
  });

  it.each([
    ["top-level duplicate before a valid last value", (raw: string) => raw.replace(
      '"paymentId":"payment-001"',
      '"paymentId":null,"paymentId":"payment-001"',
    )],
    ["top-level duplicate after a valid first value", (raw: string) => raw.replace(
      '"paymentId":"payment-001"',
      '"paymentId":"payment-001","paymentId":"payment-001"',
    )],
    ["decoded-equivalent escaped top-level duplicate", (raw: string) => raw.replace(
      '"paymentId":"payment-001"',
      '"paymentId":"payment-001","\\u0070aymentId":"payment-001"',
    )],
    ["nested inventory duplicate", (raw: string) => raw.replace(
      '"userCount":1',
      '"userCount":1,"userCount":1',
    )],
    ["nested custody-object duplicate", (raw: string) => raw.replace(
      '"catalogFixture":{"markets"',
      '"catalogFixture":{"markets":[],"markets"',
    )],
  ])("rejects %s before JSON semantic collapse", (_name, mutate) => {
    const raw = JSON.stringify(artifact());
    const bytes = Buffer.from(`${mutate(raw)}\n`, "utf8");
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
  });

  it("keeps member identity scope-local and ignores key-like string text and escapes", () => {
    const value = {
      ...artifact(),
      normalizedSaleReceiptId: 'receipt says "paymentId":"other" and path \\ "quoted"',
    };
    const bytes = artifactBytes(value);
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes)))
      .toMatchObject({
        currency: "USD",
        catalogFixture: { variantMarketPrices: [{ amount: 12_345 }] },
        normalizedSaleReceiptId: value.normalizedSaleReceiptId,
      });
  });

  it("retains SHA-256 authority over the original whitespace-bearing bytes", () => {
    const bytes = Buffer.from(`${JSON.stringify(artifact(), null, 2)}\n`, "utf8");
    const compact = artifactBytes(artifact());
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).not.toBeNull();
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(compact))).toBeNull();
  });

  it("rejects byte tampering, hash substitution, extra keys, and scalar authority claims", () => {
    const valid = artifact();
    const bytes = artifactBytes(valid);
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(
      Buffer.concat([bytes, Buffer.from(" ")]),
      sha256(bytes),
    )).toBeNull();
    expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, "0".repeat(64))).toBeNull();
    for (const candidate of [
      { ...valid, noCustomerPiiAttested: true },
      { ...valid, issuedByPrincipalId: "caller-reviewer" },
      { ...valid, externalAuthorityStatus: "AUTHENTICATED_BY_SOURCE" },
    ]) {
      const candidateBytes = artifactBytes(candidate);
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(
        candidateBytes,
        sha256(candidateBytes),
      )).toBeNull();
    }
  });

  it("rejects stale baseline, money drift, promotion, and incomplete one-target inventory", () => {
    for (const candidate of [
      { ...artifact(), sourceBaselineCommit: "0".repeat(40) },
      { ...artifact(), originalAmount: 12_344 },
      { ...artifact(), promotionState: "APPLIED" },
      { ...artifact(), inventory: { ...inventory(), userCount: 2 } },
      { ...artifact(), inventory: { ...inventory(), refundAttemptLineCount: 0 } },
    ]) {
      const bytes = artifactBytes(candidate);
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
    }
  });

  it("admits exact target catalog rows while retaining the five empty catalog models", () => {
    const mustBeEmpty = [
      "wigStyleLocalizedRevisionCount",
      "wigStyleLocalizedApprovalDecisionCount",
      "wigStyleLocalizedPublicationCount",
      "wigStyleLocalizedPublicationEventCount",
      "wigStyleRelationCount",
    ] as const;
    for (const candidateInventory of [
      { ...inventory(), marketCount: 1 },
      { ...inventory(), marketCount: 3 },
      { ...inventory(), variantMarketPriceCount: 0 },
      { ...inventory(), wigStyleMarketCount: 0 },
      ...mustBeEmpty.map((key) => ({ ...inventory(), [key]: 1 })),
    ]) {
      const bytes = artifactBytes({ ...artifact(), inventory: candidateInventory });
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
    }
  });

  it("rejects noncanonical Market semantics and projection-digest self-certification", () => {
    const valid = artifact();
    const catalog = valid.catalogFixture;
    const wrongKr = catalog.markets.map((row) => (
      row.code === "KR" ? { ...row, currency: "USD" } : row
    ));
    const wrongAmount = catalog.variantMarketPrices.map((row) => ({ ...row, amount: 12_344 }));
    for (const changedCatalog of [
      { ...catalog, markets: wrongKr,
        marketProjectionSha256: rawMarketProjectionDigest(wrongKr) },
      { ...catalog, marketProjectionSha256: "f".repeat(64) },
      { ...catalog, variantMarketPrices: wrongAmount },
      { ...catalog, wigStyleMarkets: [{ ...catalog.wigStyleMarkets[0], isActive: false }] },
    ]) {
      const bytes = artifactBytes({ ...valid, catalogFixture: changedCatalog });
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
    }
  });

  it("rejects duplicate or contradictory explicit catalog row identities", () => {
    const valid = artifact();
    const catalog = valid.catalogFixture;
    const price = catalog.variantMarketPrices[0];
    const style = catalog.wigStyleMarkets[0];
    if (!price || !style) throw new Error("CATALOG_FIXTURE_ROW_REQUIRED");
    const duplicatePrices = [price, price];
    const duplicateStyles = [style, style];
    for (const changedCatalog of [
      {
        ...catalog,
        variantMarketPrices: duplicatePrices,
        variantMarketPriceProjectionSha256:
          deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(duplicatePrices),
      },
      {
        ...catalog,
        wigStyleMarkets: duplicateStyles,
        wigStyleMarketProjectionSha256:
          deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(duplicateStyles),
      },
      {
        ...catalog,
        variantMarketPrices: [{ ...price, marketCode: "KR" }],
      },
    ]) {
      const bytes = artifactBytes({ ...valid, catalogFixture: changedCatalog });
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
    }
  });

  it("rejects missing fields, wrong version, malformed digests/times, and provider drift", () => {
    const valid = artifact();
    const { currency: _currency, ...missingCurrency } = valid;
    for (const candidate of [
      missingCurrency,
      { ...valid, contractVersion: "mira-refund-eximbay-canary-fresh-sale-custody/v0" },
      { ...valid, migrationDigest: "not-a-digest" },
      { ...valid, saleEvidenceTimestamp: "2026-08-29" },
      { ...valid, provider: "TOSS" },
      { ...valid, providerTransactionId: "" },
      { ...valid, refundableBalanceAtSale: valid.amount - 1 },
    ]) {
      const bytes = artifactBytes(candidate);
      expect(parseEximbayRefundCanaryFreshSaleCustodyBytes(bytes, sha256(bytes))).toBeNull();
    }
  });

  it("rejects raw provider secrets and caller issuer labels before any I/O", async () => {
    const dependencies = {
      readArtifact: vi.fn(() => Promise.reject(new Error("MUST_NOT_READ"))),
      loadMigrationInventory: vi.fn(() => Promise.reject(new Error("MUST_NOT_LOAD"))),
      createDatabase: vi.fn((): never => { throw new Error("MUST_NOT_CONNECT"); }),
      disconnectDatabase: vi.fn(() => Promise.resolve()),
    };
    const base = {
      DATABASE_URL: "postgresql://fixture@127.0.0.1:5432/refund_sandbox",
      MIRA_REFUND_EXIMBAY_PREPARATION_ARTIFACT_PATH: "/tmp/artifact.json",
      MIRA_REFUND_EXIMBAY_PREPARATION_EXPECTED_SHA256: "a".repeat(64),
    };
    for (const forbidden of [
      { EXIMBAY_SANDBOX_API_KEY: "raw-secret" },
      { EXIMBAY_SANDBOX_API_KEY: "" },
      { MIRA_REFUND_EXIMBAY_PREPARATION_ISSUED_BY_PRINCIPAL_ID: "caller-reviewer" },
      { MIRA_REFUND_EXIMBAY_PREPARATION_ISSUED_BY_PRINCIPAL_ID: "" },
    ]) {
      await expect(runEximbayRefundCanaryPreparation(
        { ...base, ...forbidden }, dependencies,
      )).resolves.toEqual({ ok: false, code: "CONFIG_INVALID" });
    }
    expect(dependencies.readArtifact).not.toHaveBeenCalled();
    expect(dependencies.loadMigrationInventory).not.toHaveBeenCalled();
    expect(dependencies.createDatabase).not.toHaveBeenCalled();
  });

  it("accepts only authenticated non-runtime PostgreSQL session issuers", () => {
    expect(eximbayRefundCanaryDatabaseSessionIssuer("preparation_operator"))
      .toBe("postgres-session/v1:preparation_operator");
    for (const role of ["mira_refund_preflight", "mira_refund_canary"]) {
      expect(eximbayRefundCanaryDatabaseSessionIssuer(role)).toBeNull();
      expect(isEximbayRefundCanaryDatabaseSessionIssuer(
        `postgres-session/v1:${role}`,
      )).toBe(false);
    }
    expect(isEximbayRefundCanaryDatabaseSessionIssuer(
      "postgres-session/v1:preparation_operator",
    )).toBe(true);
  });
});

function artifact() {
  const digest = "a".repeat(64);
  return {
    contractVersion: EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
    canaryRunId: "canary-run-001",
    sourceBaselineCommit: EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
    sourceBaselineTree: EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
    migrationCount: 47,
    migrationDigest: digest,
    gcpProjectNumber: "123456789012",
    cloudSqlResource: "projects/mira-sbx1/locations/asia-northeast3/instances/refund-sbx",
    cloudSqlInstanceConnectionName: "mira-sbx1:asia-northeast3:refund-sbx",
    databaseName: "refund_sandbox",
    syntheticProfileRevision: "synthetic-profile-v1",
    syntheticProfileDigest: digest,
    syntheticAccountOpaqueId: "synthetic-account-001",
    checkoutSessionId: "checkout-001",
    paymentId: "payment-001",
    orderId: "order-001",
    refundAttemptId: "refund-001",
    commandId: "command-001",
    orderItemIds: ["order-item-001"],
    checkoutSessionLineIds: ["checkout-line-001"],
    marketCode: "US",
    shippingCountry: "US",
    currency: "USD",
    promotionState: "NONE",
    provider: "EXIMBAY",
    mode: "SANDBOX",
    adapterExecutionKind: "EXTERNAL",
    paymentStatus: "SUCCEEDED",
    paymentLifecycle: "FINALIZED",
    providerOrderId: "provider-order-001",
    providerTransactionId: "provider-transaction-001",
    amount: 12_345,
    saleEvidenceTimestamp: "2026-08-29T01:02:03.000Z",
    normalizedSaleReceiptId: "sale-receipt-001",
    originalAmount: 12_345,
    refundableBalanceAtSale: 12_345,
    merchantAccountBindingId: "merchant-v1",
    credentialGenerationBindingId: "credential-v1",
    restrictedRawReceiptSha256: digest,
    inventoryEvidenceSha256: digest,
    dispatcherCustomerChannelEvidenceSha256: digest,
    externalAuthorityStatus: "REQUIRES_INDEPENDENT_AUTHENTICATION",
    releaseBindingDigest: digest,
    canaryJobBindingDigest: digest,
    preflightJobBindingDigest: digest,
    imageBindingDigest: digest,
    secretGenerationBindingDigest: digest,
    paymentOutboxProjectionSha256: sha256(Buffer.from("[]")),
    paymentEventProjectionSha256: sha256(Buffer.from("[]")),
    catalogFixture: catalogFixture(),
    inventory: inventory(),
  };
}

function catalogFixture() {
  const markets = EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS;
  const variantMarketPrices = [{
    variantId: "variant-001",
    wigStyleId: "style-001",
    marketCode: "US" as const,
    amount: 12_345,
    checkoutSessionLineId: "checkout-line-001",
    orderItemId: "order-item-001",
  }];
  const wigStyleMarkets = [{
    wigStyleId: "style-001",
    marketCode: "US" as const,
    isActive: true as const,
  }];
  return {
    markets,
    marketProjectionSha256: deriveEximbayRefundCanaryMarketProjectionDigest(markets),
    variantMarketPrices,
    variantMarketPriceProjectionSha256:
      deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(variantMarketPrices),
    wigStyleMarkets,
    wigStyleMarketProjectionSha256:
      deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(wigStyleMarkets),
  };
}

function inventory() {
  return {
    userCount: 1, accountCount: 0, sessionCount: 0, verificationTokenCount: 0,
    marketCount: 2,
    fittingCount: 0,
    cartItemCount: 0, wishlistItemCount: 0, checkoutSessionCount: 1,
    checkoutSessionLineCount: 1, checkoutSessionShippingCount: 1, paymentCount: 1,
    orderCount: 1, customerRefundIntakeCount: 0, orderCancellationCount: 0,
    refundAttemptCount: 1, refundAttemptLineCount: 1,
    refundAttemptLineEconomicAllocationCount: 0, refundAttemptTransitionCount: 2,
    refundExecutionCommandCount: 1, approvalCount: 0, commandEventCount: 0,
    dispatchAttemptCount: 0, contactProofCount: 0, operationBindingCount: 0,
    eximbayPreflightObservationCount: 0, eligibilityProofCount: 0,
    refundEvidenceCount: 0, orderItemCount: 1, orderShippingCount: 1,
    manufacturingRequestCount: 0, paymentOutboxCount: 0, paymentEventCount: 0,
    webhookIngressRejectionCount: 0, reviewCount: 0, promotionPolicyVersionCount: 0,
    promotionMarketRuleCount: 0, customerBenefitProfileCount: 0,
    promotionGrantCount: 0, promotionRecoveryCheckpointCount: 0,
    wigStyleCount: 1, wigVariantCount: 1, variantMarketPriceCount: 1,
    wigStyleMarketCount: 1, wigStyleLocalizedRevisionCount: 0,
    wigStyleLocalizedApprovalDecisionCount: 0, wigStyleLocalizedPublicationCount: 0,
    wigStyleLocalizedPublicationEventCount: 0, wigStyleRelationCount: 0,
  };
}

function artifactBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rawMarketProjectionDigest(rows: readonly Readonly<{
  code: string;
  currency: string;
  shippableCountries: readonly string[];
  defaultLocale: string;
  isActive: boolean;
  taxConfig: null;
  paymentConfig: null;
}>[]): string {
  return sha256(Buffer.from(JSON.stringify([
    "mira-refund-eximbay-canary-market-projection/v2",
    rows.map((row) => [row.code, row.currency, row.shippableCountries, row.defaultLocale,
      row.isActive, row.taxConfig, row.paymentConfig]),
  ])));
}
