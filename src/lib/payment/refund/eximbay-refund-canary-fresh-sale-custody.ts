import { createHash } from "node:crypto";

export const EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION =
  "mira-refund-eximbay-canary-fresh-sale-custody/v2";
export const EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT =
  "528858d7576a4452350dd840163ee987e36688a5";
export const EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE =
  "e72a7481da0c3fd9949ea08da2d79df5ef308e60";
export const EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_MAX_BYTES = 65_536;

const DIGEST = /^[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;
const DATABASE = /^[a-z][a-z0-9_]{0,62}$/u;
const PROJECT_NUMBER = /^[1-9][0-9]{5,19}$/u;
const LABEL = /^[A-Za-z0-9._-]{1,128}$/u;
const CLOUD_SQL_RESOURCE =
  /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/locations\/[a-z0-9-]{1,63}\/instances\/[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;
const CLOUD_SQL_CONNECTION =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]{1,63}:[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;

export const EXIMBAY_REFUND_CANARY_INVENTORY_KEYS = Object.freeze([
  "userCount",
  "accountCount",
  "sessionCount",
  "verificationTokenCount",
  "marketCount",
  "fittingCount",
  "cartItemCount",
  "wishlistItemCount",
  "checkoutSessionCount",
  "checkoutSessionLineCount",
  "checkoutSessionShippingCount",
  "paymentCount",
  "orderCount",
  "customerRefundIntakeCount",
  "orderCancellationCount",
  "refundAttemptCount",
  "refundAttemptLineCount",
  "refundAttemptLineEconomicAllocationCount",
  "refundAttemptTransitionCount",
  "refundExecutionCommandCount",
  "approvalCount",
  "commandEventCount",
  "dispatchAttemptCount",
  "contactProofCount",
  "operationBindingCount",
  "eximbayPreflightObservationCount",
  "eligibilityProofCount",
  "refundEvidenceCount",
  "orderItemCount",
  "orderShippingCount",
  "manufacturingRequestCount",
  "paymentOutboxCount",
  "paymentEventCount",
  "webhookIngressRejectionCount",
  "reviewCount",
  "promotionPolicyVersionCount",
  "promotionMarketRuleCount",
  "customerBenefitProfileCount",
  "promotionGrantCount",
  "promotionRecoveryCheckpointCount",
  "wigStyleCount",
  "wigVariantCount",
  "variantMarketPriceCount",
  "wigStyleMarketCount",
  "wigStyleLocalizedRevisionCount",
  "wigStyleLocalizedApprovalDecisionCount",
  "wigStyleLocalizedPublicationCount",
  "wigStyleLocalizedPublicationEventCount",
  "wigStyleRelationCount",
] as const);

export type EximbayRefundCanaryInventoryKey =
  typeof EXIMBAY_REFUND_CANARY_INVENTORY_KEYS[number];
export type EximbayRefundCanaryInventoryCounts = Readonly<
  Record<EximbayRefundCanaryInventoryKey, number>
>;

export type EximbayRefundCanaryMarketProjection = Readonly<{
  code: "KR" | "US";
  currency: "KRW" | "USD";
  shippableCountries: readonly ("KR" | "US")[];
  defaultLocale: "ko" | "en";
  isActive: true;
  taxConfig: null;
  paymentConfig: null;
}>;

export type EximbayRefundCanaryVariantMarketPriceProjection = Readonly<{
  variantId: string;
  wigStyleId: string;
  marketCode: "US";
  amount: number;
  checkoutSessionLineId: string;
  orderItemId: string;
}>;

export type EximbayRefundCanaryWigStyleMarketProjection = Readonly<{
  wigStyleId: string;
  marketCode: "US";
  isActive: true;
}>;

export type EximbayRefundCanaryCatalogFixtureCustody = Readonly<{
  markets: readonly EximbayRefundCanaryMarketProjection[];
  marketProjectionSha256: string;
  variantMarketPrices: readonly EximbayRefundCanaryVariantMarketPriceProjection[];
  variantMarketPriceProjectionSha256: string;
  wigStyleMarkets: readonly EximbayRefundCanaryWigStyleMarketProjection[];
  wigStyleMarketProjectionSha256: string;
}>;

export const EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS = Object.freeze([
  Object.freeze({
    code: "KR",
    currency: "KRW",
    shippableCountries: Object.freeze(["KR"] as const),
    defaultLocale: "ko",
    isActive: true,
    taxConfig: null,
    paymentConfig: null,
  }),
  Object.freeze({
    code: "US",
    currency: "USD",
    shippableCountries: Object.freeze(["US"] as const),
    defaultLocale: "en",
    isActive: true,
    taxConfig: null,
    paymentConfig: null,
  }),
] as const satisfies readonly EximbayRefundCanaryMarketProjection[]);

export type EximbayRefundCanaryFreshSaleCustody = Readonly<{
  contractVersion: typeof EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION;
  canaryRunId: string;
  sourceBaselineCommit: string;
  sourceBaselineTree: string;
  migrationCount: number;
  migrationDigest: string;
  gcpProjectNumber: string;
  cloudSqlResource: string;
  cloudSqlInstanceConnectionName: string;
  databaseName: string;
  syntheticProfileRevision: string;
  syntheticProfileDigest: string;
  syntheticAccountOpaqueId: string;
  checkoutSessionId: string;
  paymentId: string;
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  orderItemIds: readonly string[];
  checkoutSessionLineIds: readonly string[];
  marketCode: "US";
  shippingCountry: "US";
  currency: "USD";
  promotionState: "NONE";
  provider: "EXIMBAY";
  mode: "SANDBOX";
  adapterExecutionKind: "EXTERNAL";
  paymentStatus: "SUCCEEDED";
  paymentLifecycle: "FINALIZED";
  providerOrderId: string;
  providerTransactionId: string;
  amount: number;
  saleEvidenceTimestamp: string;
  normalizedSaleReceiptId: string;
  originalAmount: number;
  refundableBalanceAtSale: number;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  restrictedRawReceiptSha256: string;
  inventoryEvidenceSha256: string;
  dispatcherCustomerChannelEvidenceSha256: string;
  externalAuthorityStatus: "REQUIRES_INDEPENDENT_AUTHENTICATION";
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
  paymentOutboxProjectionSha256: string;
  paymentEventProjectionSha256: string;
  catalogFixture: EximbayRefundCanaryCatalogFixtureCustody;
  inventory: EximbayRefundCanaryInventoryCounts;
}>;

const ARTIFACT_KEYS = Object.freeze([
  "contractVersion", "canaryRunId", "sourceBaselineCommit", "sourceBaselineTree",
  "migrationCount", "migrationDigest", "gcpProjectNumber", "cloudSqlResource",
  "cloudSqlInstanceConnectionName", "databaseName", "syntheticProfileRevision",
  "syntheticProfileDigest", "syntheticAccountOpaqueId", "checkoutSessionId", "paymentId",
  "orderId", "refundAttemptId", "commandId", "orderItemIds", "checkoutSessionLineIds",
  "marketCode", "shippingCountry", "currency", "promotionState", "provider", "mode",
  "adapterExecutionKind", "paymentStatus", "paymentLifecycle", "providerOrderId",
  "providerTransactionId", "amount", "saleEvidenceTimestamp", "normalizedSaleReceiptId",
  "originalAmount", "refundableBalanceAtSale", "merchantAccountBindingId",
  "credentialGenerationBindingId", "restrictedRawReceiptSha256", "inventoryEvidenceSha256",
  "dispatcherCustomerChannelEvidenceSha256", "externalAuthorityStatus",
  "releaseBindingDigest", "canaryJobBindingDigest", "preflightJobBindingDigest",
  "imageBindingDigest", "secretGenerationBindingDigest", "paymentOutboxProjectionSha256",
  "paymentEventProjectionSha256", "catalogFixture", "inventory",
]);

const CATALOG_FIXTURE_KEYS = Object.freeze([
  "markets", "marketProjectionSha256", "variantMarketPrices",
  "variantMarketPriceProjectionSha256", "wigStyleMarkets",
  "wigStyleMarketProjectionSha256",
]);
const MARKET_PROJECTION_KEYS = Object.freeze([
  "code", "currency", "shippableCountries", "defaultLocale", "isActive",
  "taxConfig", "paymentConfig",
]);
const VARIANT_MARKET_PRICE_PROJECTION_KEYS = Object.freeze([
  "variantId", "wigStyleId", "marketCode", "amount",
  "checkoutSessionLineId", "orderItemId",
]);
const WIG_STYLE_MARKET_PROJECTION_KEYS = Object.freeze([
  "wigStyleId", "marketCode", "isActive",
]);
const MAX_TARGET_ROWS = 32;

export function sha256EximbayRefundCanaryFreshSaleCustodyBytes(
  bytes: Uint8Array,
): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseEximbayRefundCanaryFreshSaleCustodyBytes(
  bytes: Uint8Array,
  expectedSha256: string,
): EximbayRefundCanaryFreshSaleCustody | null {
  if (bytes.byteLength === 0
    || bytes.byteLength > EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_MAX_BYTES
    || !DIGEST.test(expectedSha256)
    || sha256EximbayRefundCanaryFreshSaleCustodyBytes(bytes) !== expectedSha256) return null;
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text, "utf8").equals(Buffer.from(bytes))) return null;
  let parsed: unknown;
  try {
    rejectDuplicateJsonObjectMembers(text);
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parseArtifact(parsed);
}

function parseArtifact(value: unknown): EximbayRefundCanaryFreshSaleCustody | null {
  if (!isRecord(value) || !hasExactKeys(value, ARTIFACT_KEYS)) return null;
  const components = parseArtifactComponents(value);
  if (!components) return null;
  if (!identityFieldsValid(value) || !authorityFieldsValid(value)) return null;
  if (!targetFieldsValid(value, components.orderItemIds,
    components.checkoutSessionLineIds, components.inventory, components.catalogFixture)) return null;
  return Object.freeze({
    contractVersion: EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
    canaryRunId: value.canaryRunId,
    sourceBaselineCommit: value.sourceBaselineCommit,
    sourceBaselineTree: value.sourceBaselineTree,
    migrationCount: value.migrationCount,
    migrationDigest: value.migrationDigest,
    gcpProjectNumber: value.gcpProjectNumber,
    cloudSqlResource: value.cloudSqlResource,
    cloudSqlInstanceConnectionName: value.cloudSqlInstanceConnectionName,
    databaseName: value.databaseName,
    syntheticProfileRevision: value.syntheticProfileRevision,
    syntheticProfileDigest: value.syntheticProfileDigest,
    syntheticAccountOpaqueId: value.syntheticAccountOpaqueId,
    checkoutSessionId: value.checkoutSessionId,
    paymentId: value.paymentId,
    orderId: value.orderId,
    refundAttemptId: value.refundAttemptId,
    commandId: value.commandId,
    orderItemIds: components.orderItemIds,
    checkoutSessionLineIds: components.checkoutSessionLineIds,
    marketCode: value.marketCode,
    shippingCountry: value.shippingCountry,
    currency: value.currency,
    promotionState: "NONE",
    provider: "EXIMBAY",
    mode: "SANDBOX",
    adapterExecutionKind: "EXTERNAL",
    paymentStatus: "SUCCEEDED",
    paymentLifecycle: "FINALIZED",
    providerOrderId: value.providerOrderId,
    providerTransactionId: value.providerTransactionId,
    amount: value.amount,
    saleEvidenceTimestamp: value.saleEvidenceTimestamp,
    normalizedSaleReceiptId: value.normalizedSaleReceiptId,
    originalAmount: value.originalAmount,
    refundableBalanceAtSale: value.refundableBalanceAtSale,
    merchantAccountBindingId: value.merchantAccountBindingId,
    credentialGenerationBindingId: value.credentialGenerationBindingId,
    restrictedRawReceiptSha256: value.restrictedRawReceiptSha256,
    inventoryEvidenceSha256: value.inventoryEvidenceSha256,
    dispatcherCustomerChannelEvidenceSha256:
      value.dispatcherCustomerChannelEvidenceSha256,
    externalAuthorityStatus: "REQUIRES_INDEPENDENT_AUTHENTICATION",
    releaseBindingDigest: value.releaseBindingDigest,
    canaryJobBindingDigest: value.canaryJobBindingDigest,
    preflightJobBindingDigest: value.preflightJobBindingDigest,
    imageBindingDigest: value.imageBindingDigest,
    secretGenerationBindingDigest: value.secretGenerationBindingDigest,
    paymentOutboxProjectionSha256: value.paymentOutboxProjectionSha256,
    paymentEventProjectionSha256: value.paymentEventProjectionSha256,
    catalogFixture: components.catalogFixture,
    inventory: components.inventory,
  });
}

function parseArtifactComponents(value: Readonly<Record<string, unknown>>): Readonly<{
  inventory: EximbayRefundCanaryInventoryCounts;
  catalogFixture: EximbayRefundCanaryCatalogFixtureCustody;
  orderItemIds: readonly string[];
  checkoutSessionLineIds: readonly string[];
}> | null {
  const inventory = parseInventory(value.inventory);
  const catalogFixture = parseCatalogFixture(value.catalogFixture);
  const orderItemIds = parseExactIds(value.orderItemIds);
  const checkoutSessionLineIds = parseExactIds(value.checkoutSessionLineIds);
  if (!inventory || !catalogFixture || !orderItemIds || !checkoutSessionLineIds) return null;
  return Object.freeze({ inventory, catalogFixture, orderItemIds, checkoutSessionLineIds });
}

function parseCatalogFixture(value: unknown): EximbayRefundCanaryCatalogFixtureCustody | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, CATALOG_FIXTURE_KEYS)) return null;
  const markets = parseMarketProjections(value.markets);
  const variantMarketPrices = parseVariantMarketPriceProjections(value.variantMarketPrices);
  const wigStyleMarkets = parseWigStyleMarketProjections(value.wigStyleMarkets);
  if (!markets || !variantMarketPrices || !wigStyleMarkets) return null;
  const digests = parseCatalogProjectionDigests(
    value,
    markets,
    variantMarketPrices,
    wigStyleMarkets,
  );
  if (!digests) return null;
  return Object.freeze({
    markets,
    marketProjectionSha256: digests.marketProjectionSha256,
    variantMarketPrices,
    variantMarketPriceProjectionSha256: digests.variantMarketPriceProjectionSha256,
    wigStyleMarkets,
    wigStyleMarketProjectionSha256: digests.wigStyleMarketProjectionSha256,
  });
}

function parseCatalogProjectionDigests(
  value: Readonly<Record<string, unknown>>,
  markets: readonly EximbayRefundCanaryMarketProjection[],
  variantMarketPrices: readonly EximbayRefundCanaryVariantMarketPriceProjection[],
  wigStyleMarkets: readonly EximbayRefundCanaryWigStyleMarketProjection[],
): Readonly<{
  marketProjectionSha256: string;
  variantMarketPriceProjectionSha256: string;
  wigStyleMarketProjectionSha256: string;
}> | null {
  const marketProjectionSha256 = parseProjectionDigest(
    value.marketProjectionSha256,
    deriveEximbayRefundCanaryMarketProjectionDigest(markets),
  );
  const variantMarketPriceProjectionSha256 = parseProjectionDigest(
    value.variantMarketPriceProjectionSha256,
    deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(variantMarketPrices),
  );
  const wigStyleMarketProjectionSha256 = parseProjectionDigest(
    value.wigStyleMarketProjectionSha256,
    deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(wigStyleMarkets),
  );
  if (!marketProjectionSha256
    || !variantMarketPriceProjectionSha256
    || !wigStyleMarketProjectionSha256) return null;
  return Object.freeze({
    marketProjectionSha256,
    variantMarketPriceProjectionSha256,
    wigStyleMarketProjectionSha256,
  });
}

function parseProjectionDigest(value: unknown, expected: string): string | null {
  return isDigest(value) && value === expected ? value : null;
}

function parseMarketProjections(value: unknown): readonly EximbayRefundCanaryMarketProjection[] | null {
  if (!Array.isArray(value) || value.length !== EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS.length) {
    return null;
  }
  const rows: EximbayRefundCanaryMarketProjection[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, MARKET_PROJECTION_KEYS)
      || !isCanonicalMarketProjection(entry)) return null;
    rows.push(Object.freeze({
      code: entry.code,
      currency: entry.currency,
      shippableCountries: Object.freeze([...entry.shippableCountries]),
      defaultLocale: entry.defaultLocale,
      isActive: true,
      taxConfig: null,
      paymentConfig: null,
    }));
  }
  return sameProjection(rows, EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS)
    ? Object.freeze(rows)
    : null;
}

function isCanonicalMarketProjection(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & EximbayRefundCanaryMarketProjection {
  if (!Array.isArray(value.shippableCountries)) return false;
  const canonical = EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS.find(
    (row) => row.code === value.code,
  );
  if (!canonical) return false;
  return value.currency === canonical.currency
    && sameProjection(value.shippableCountries, canonical.shippableCountries)
    && value.defaultLocale === canonical.defaultLocale
    && value.isActive === true
    && value.taxConfig === null
    && value.paymentConfig === null;
}

function parseVariantMarketPriceProjections(
  value: unknown,
): readonly EximbayRefundCanaryVariantMarketPriceProjection[] | null {
  if (!isBoundedTargetProjectionArray(value)) return null;
  const rows: EximbayRefundCanaryVariantMarketPriceProjection[] = [];
  for (const entry of value) {
    const parsed = parseVariantMarketPriceProjection(entry);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return hasDistinctVariantMarketPriceProjectionIdentities(rows)
    ? Object.freeze(rows)
    : null;
}

function isBoundedTargetProjectionArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_TARGET_ROWS;
}

function hasDistinctVariantMarketPriceProjectionIdentities(
  rows: readonly EximbayRefundCanaryVariantMarketPriceProjection[],
): boolean {
  const variantIds = rows.map((row) => row.variantId);
  const lineIds = rows.map((row) => row.checkoutSessionLineId);
  const orderItemIds = rows.map((row) => row.orderItemId);
  return distinctSorted(variantIds)
    && new Set(lineIds).size === rows.length
    && new Set(orderItemIds).size === rows.length;
}

function parseVariantMarketPriceProjection(
  value: unknown,
): EximbayRefundCanaryVariantMarketPriceProjection | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, VARIANT_MARKET_PRICE_PROJECTION_KEYS)) return null;
  if (!hasVariantMarketPriceProjectionIdentities(value)) return null;
  if (value.marketCode !== "US" || !isCatalogAmount(value.amount)) return null;
  return Object.freeze({
    variantId: value.variantId,
    wigStyleId: value.wigStyleId,
    marketCode: "US",
    amount: value.amount,
    checkoutSessionLineId: value.checkoutSessionLineId,
    orderItemId: value.orderItemId,
  });
}

function hasVariantMarketPriceProjectionIdentities(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> & Readonly<{
  variantId: string;
  wigStyleId: string;
  checkoutSessionLineId: string;
  orderItemId: string;
}> {
  return [value.variantId, value.wigStyleId, value.checkoutSessionLineId, value.orderItemId]
    .every((field) => isBoundedText(field, 255));
}

function parseWigStyleMarketProjections(
  value: unknown,
): readonly EximbayRefundCanaryWigStyleMarketProjection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TARGET_ROWS) return null;
  const rows: EximbayRefundCanaryWigStyleMarketProjection[] = [];
  for (const entry of value) {
    const parsed = parseWigStyleMarketProjection(entry);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return distinctSorted(rows.map((row) => row.wigStyleId)) ? Object.freeze(rows) : null;
}

function parseWigStyleMarketProjection(
  value: unknown,
): EximbayRefundCanaryWigStyleMarketProjection | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, WIG_STYLE_MARKET_PROJECTION_KEYS)) return null;
  if (!isBoundedText(value.wigStyleId, 255)) return null;
  if (![value.marketCode === "US", value.isActive === true].every(Boolean)) return null;
  return Object.freeze({ wigStyleId: value.wigStyleId, marketCode: "US", isActive: true });
}

export function deriveEximbayRefundCanaryMarketProjectionDigest(
  rows: readonly EximbayRefundCanaryMarketProjection[],
): string {
  return projectionDigest("mira-refund-eximbay-canary-market-projection/v2", rows.map((row) => [
    row.code, row.currency, row.shippableCountries, row.defaultLocale, row.isActive,
    row.taxConfig, row.paymentConfig,
  ]));
}

export function deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(
  rows: readonly EximbayRefundCanaryVariantMarketPriceProjection[],
): string {
  return projectionDigest(
    "mira-refund-eximbay-canary-variant-market-price-projection/v1",
    rows.map((row) => [
      row.variantId, row.wigStyleId, row.marketCode, row.amount,
      row.checkoutSessionLineId, row.orderItemId,
    ]),
  );
}

export function deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(
  rows: readonly EximbayRefundCanaryWigStyleMarketProjection[],
): string {
  return projectionDigest(
    "mira-refund-eximbay-canary-wig-style-market-projection/v1",
    rows.map((row) => [row.wigStyleId, row.marketCode, row.isActive]),
  );
}

function identityFieldsValid(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & Readonly<{
  canaryRunId: string;
  sourceBaselineCommit: string;
  sourceBaselineTree: string;
  migrationCount: number;
  migrationDigest: string;
  gcpProjectNumber: string;
  cloudSqlResource: string;
  cloudSqlInstanceConnectionName: string;
  databaseName: string;
  syntheticProfileRevision: string;
  syntheticProfileDigest: string;
  syntheticAccountOpaqueId: string;
}> {
  return [
    value.contractVersion === EXIMBAY_REFUND_CANARY_FRESH_SALE_CUSTODY_VERSION,
    isLabel(value.canaryRunId),
    value.sourceBaselineCommit === EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_COMMIT,
    value.sourceBaselineTree === EXIMBAY_REFUND_CANARY_SOURCE_BASELINE_TREE,
    matches(value.sourceBaselineCommit, GIT_OBJECT),
    matches(value.sourceBaselineTree, GIT_OBJECT),
    isPositiveInteger(value.migrationCount),
    isDigest(value.migrationDigest),
    matches(value.gcpProjectNumber, PROJECT_NUMBER),
    matches(value.cloudSqlResource, CLOUD_SQL_RESOURCE),
    matches(value.cloudSqlInstanceConnectionName, CLOUD_SQL_CONNECTION),
    matches(value.databaseName, DATABASE),
    isLabel(value.syntheticProfileRevision),
    isDigest(value.syntheticProfileDigest),
    isBoundedText(value.syntheticAccountOpaqueId, 255),
  ].every(Boolean);
}

function authorityFieldsValid(value: Readonly<Record<string, unknown>>): value is
Readonly<Record<string, unknown>> & Readonly<{
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
  restrictedRawReceiptSha256: string;
  inventoryEvidenceSha256: string;
  dispatcherCustomerChannelEvidenceSha256: string;
  paymentOutboxProjectionSha256: string;
  paymentEventProjectionSha256: string;
}> {
  return [
    value.externalAuthorityStatus === "REQUIRES_INDEPENDENT_AUTHENTICATION",
    [
      value.releaseBindingDigest,
      value.canaryJobBindingDigest,
      value.preflightJobBindingDigest,
      value.imageBindingDigest,
      value.secretGenerationBindingDigest,
      value.restrictedRawReceiptSha256,
      value.inventoryEvidenceSha256,
      value.dispatcherCustomerChannelEvidenceSha256,
      value.paymentOutboxProjectionSha256,
      value.paymentEventProjectionSha256,
    ].every(isDigest),
  ].every(Boolean);
}

function targetFieldsValid(
  value: Readonly<Record<string, unknown>>,
  orderItemIds: readonly string[],
  checkoutSessionLineIds: readonly string[],
  inventory: EximbayRefundCanaryInventoryCounts,
  catalogFixture: EximbayRefundCanaryCatalogFixtureCustody,
): value is Readonly<Record<string, unknown>> & EximbayRefundCanaryFreshSaleCustody {
  const variantMarketPrices = catalogFixture.variantMarketPrices;
  const wigStyleMarkets = catalogFixture.wigStyleMarkets;
  const projectedStyleIds = new Set(variantMarketPrices.map((row) => row.wigStyleId));
  return [
    [value.checkoutSessionId, value.paymentId, value.orderId,
      value.refundAttemptId, value.commandId].every((field) => isBoundedText(field, 255)),
    value.marketCode === "US",
    value.shippingCountry === "US",
    value.currency === "USD",
    value.promotionState === "NONE",
    value.provider === "EXIMBAY",
    value.mode === "SANDBOX",
    value.adapterExecutionKind === "EXTERNAL",
    value.paymentStatus === "SUCCEEDED",
    value.paymentLifecycle === "FINALIZED",
    isBoundedText(value.providerOrderId, 512),
    isBoundedText(value.providerTransactionId, 512),
    isPositiveInteger(value.amount),
    typeof value.amount === "number" && value.amount <= 2_147_483_647,
    isExactTimestamp(value.saleEvidenceTimestamp),
    isBoundedText(value.normalizedSaleReceiptId, 512),
    value.originalAmount === value.amount,
    value.refundableBalanceAtSale === value.amount,
    isLabel(value.merchantAccountBindingId),
    isLabel(value.credentialGenerationBindingId),
    orderItemIds.length === inventory.orderItemCount,
    checkoutSessionLineIds.length === inventory.checkoutSessionLineCount,
    inventory.refundAttemptLineCount === inventory.orderItemCount,
    variantMarketPrices.length === inventory.variantMarketPriceCount,
    variantMarketPrices.length === inventory.wigVariantCount,
    variantMarketPrices.length === inventory.checkoutSessionLineCount,
    variantMarketPrices.length === inventory.orderItemCount,
    wigStyleMarkets.length === inventory.wigStyleMarketCount,
    wigStyleMarkets.length === inventory.wigStyleCount,
    variantMarketPrices.every((row) => orderItemIds.includes(row.orderItemId)
      && checkoutSessionLineIds.includes(row.checkoutSessionLineId)),
    wigStyleMarkets.every((row) => projectedStyleIds.has(row.wigStyleId)),
    projectedStyleIds.size === wigStyleMarkets.length,
  ].every(Boolean);
}

function parseInventory(value: unknown): EximbayRefundCanaryInventoryCounts | null {
  if (!isRecord(value) || !hasExactKeys(value, EXIMBAY_REFUND_CANARY_INVENTORY_KEYS)) return null;
  const inventory: Partial<Record<EximbayRefundCanaryInventoryKey, number>> = {};
  for (const key of EXIMBAY_REFUND_CANARY_INVENTORY_KEYS) {
    const count = value[key];
    if (!isNonnegativeInteger(count)) return null;
    inventory[key] = count;
  }
  if (!isCompleteInventory(inventory) || !fixedInventoryCountsValid(inventory)) return null;
  return Object.freeze(inventory);
}

function isCompleteInventory(
  value: Partial<Record<EximbayRefundCanaryInventoryKey, number>>,
): value is Record<EximbayRefundCanaryInventoryKey, number> {
  return EXIMBAY_REFUND_CANARY_INVENTORY_KEYS.every(
    (key) => typeof value[key] === "number",
  );
}

function fixedInventoryCountsValid(
  value: Partial<Record<EximbayRefundCanaryInventoryKey, number>>,
): boolean {
  const ones = ["userCount", "checkoutSessionCount", "checkoutSessionShippingCount",
    "paymentCount", "orderCount", "refundAttemptCount", "refundExecutionCommandCount",
    "orderShippingCount"] as const;
  const zeros = ["accountCount", "sessionCount", "verificationTokenCount", "fittingCount",
    "cartItemCount", "wishlistItemCount", "customerRefundIntakeCount",
    "orderCancellationCount",
    "refundAttemptLineEconomicAllocationCount", "approvalCount", "commandEventCount",
    "dispatchAttemptCount", "contactProofCount", "eximbayPreflightObservationCount",
    "eligibilityProofCount", "refundEvidenceCount", "manufacturingRequestCount",
    "webhookIngressRejectionCount", "reviewCount", "promotionPolicyVersionCount",
    "promotionMarketRuleCount", "customerBenefitProfileCount", "promotionGrantCount",
    "promotionRecoveryCheckpointCount",
    "wigStyleLocalizedRevisionCount", "wigStyleLocalizedApprovalDecisionCount",
    "wigStyleLocalizedPublicationCount", "wigStyleLocalizedPublicationEventCount",
    "wigStyleRelationCount"] as const;
  return [
    ones.every((key) => value[key] === 1),
    zeros.every((key) => value[key] === 0),
    value.marketCount === 2,
    value.refundAttemptTransitionCount === 2,
    [0, 1].includes(value.operationBindingCount ?? -1),
    Number(value.orderItemCount) > 0,
    value.checkoutSessionLineCount === value.orderItemCount,
    value.variantMarketPriceCount === value.orderItemCount,
    Number(value.wigStyleMarketCount) > 0,
    value.wigStyleMarketCount === value.wigStyleCount,
    value.wigVariantCount === value.variantMarketPriceCount,
    Number(value.wigStyleCount) <= Number(value.wigVariantCount),
    Number(value.paymentOutboxCount) <= 1,
  ].every(Boolean);
}

function parseExactIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TARGET_ROWS
    || !value.every((entry) => isBoundedText(entry, 255))) return null;
  const ids = value.filter((entry): entry is string => typeof entry === "string");
  return distinctSorted(ids) ? Object.freeze(ids) : null;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function matches(value: unknown, expression: RegExp): value is string {
  return typeof value === "string" && expression.test(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && LABEL.test(value);
}

function isBoundedText(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    && Buffer.byteLength(value, "utf8") <= maxBytes && !/\p{Cc}/u.test(value);
}

function isExactTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCatalogAmount(value: unknown): value is number {
  return isNonnegativeInteger(value) && Number(value) <= 2_147_483_647;
}

function distinctSorted(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || compareBytewise(values[index - 1] ?? "", value) < 0);
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sameProjection(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function projectionDigest(version: string, rows: readonly (readonly unknown[])[]): string {
  return createHash("sha256").update(JSON.stringify([version, rows]), "utf8").digest("hex");
}

const MAX_JSON_DEPTH = 64;

/** Reject ambiguity before JSON.parse can collapse repeated object members. */
function rejectDuplicateJsonObjectMembers(json: string): void {
  new DuplicateMemberScanner(json).scan();
}

class DuplicateMemberScanner {
  readonly #json: string;
  #index = 0;

  constructor(json: string) {
    this.#json = json;
  }

  scan(): void {
    this.#whitespace();
    this.#value(0);
    this.#whitespace();
    if (this.#index !== this.#json.length) throw new Error("Trailing JSON data.");
  }

  #value(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new Error("JSON nesting is too deep.");
    this.#whitespace();
    const token = this.#json[this.#index];
    if (token === '"') return void this.#string();
    if (token === "{") return this.#object(depth + 1);
    if (token === "[") return this.#array(depth + 1);
    if (token === "t") return this.#literal("true");
    if (token === "f") return this.#literal("false");
    if (token === "n") return this.#literal("null");
    this.#number();
  }

  #object(depth: number): void {
    this.#expect("{");
    this.#whitespace();
    if (this.#consume("}")) return;
    const seen = new Set<string>();
    while (true) {
      const key = this.#string();
      if (seen.has(key)) throw new Error("Duplicate JSON object member.");
      seen.add(key);
      this.#whitespace();
      this.#expect(":");
      this.#value(depth);
      this.#whitespace();
      if (this.#consume("}")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #array(depth: number): void {
    this.#expect("[");
    this.#whitespace();
    if (this.#consume("]")) return;
    while (true) {
      this.#value(depth);
      this.#whitespace();
      if (this.#consume("]")) return;
      this.#expect(",");
      this.#whitespace();
    }
  }

  #string(): string {
    const start = this.#index;
    this.#expect('"');
    while (this.#index < this.#json.length) {
      const character = this.#json[this.#index];
      this.#index += 1;
      if (character === '"') {
        const decoded: unknown = JSON.parse(this.#json.slice(start, this.#index));
        if (typeof decoded !== "string") throw new Error("Invalid JSON string.");
        return decoded;
      }
      if (character === "\\") this.#escape();
      else if (!character || character.charCodeAt(0) <= 0x1f) {
        throw new Error("Invalid JSON string.");
      }
    }
    throw new Error("Unterminated JSON string.");
  }

  #escape(): void {
    const escaped = this.#json[this.#index];
    this.#index += 1;
    if (escaped !== "u") {
      if (!escaped || !'"\\/bfnrt'.includes(escaped)) throw new Error("Invalid JSON escape.");
      return;
    }
    const unicode = this.#json.slice(this.#index, this.#index + 4);
    if (!/^[0-9a-fA-F]{4}$/u.test(unicode)) throw new Error("Invalid Unicode escape.");
    this.#index += 4;
  }

  #number(): void {
    const remaining = this.#json.slice(this.#index);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(remaining);
    if (!match) throw new Error("Invalid JSON value.");
    this.#index += match[0].length;
  }

  #literal(value: string): void {
    if (!this.#json.startsWith(value, this.#index)) throw new Error("Invalid JSON literal.");
    this.#index += value.length;
  }

  #whitespace(): void {
    while ([" ", "\t", "\n", "\r"].includes(this.#json[this.#index] ?? "")) {
      this.#index += 1;
    }
  }

  #expect(value: string): void {
    if (!this.#consume(value)) throw new Error("Malformed JSON.");
  }

  #consume(value: string): boolean {
    if (this.#json[this.#index] !== value) return false;
    this.#index += 1;
    return true;
  }
}
