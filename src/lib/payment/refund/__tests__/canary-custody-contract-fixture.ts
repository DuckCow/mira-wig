import { createHash } from "node:crypto";
import {
  EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
  EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
  EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
  deriveEximbayRefundCanaryMarketProjectionDigest,
  deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest,
  deriveEximbayRefundCanaryWigStyleMarketProjectionDigest,
} from "../eximbay-refund-canary-fresh-sale-custody";
export function historicalCustodyFixture() {
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

export function artifactBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

export function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
