import { createHash } from "node:crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  type PaymentOutbox,
} from "@prisma/client";
import {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  orderPaidEmailDedupKey,
  parseOrderPaidEmailPayload,
} from "@/lib/payment/email/topics";
import {
  EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS,
  EXIMBAY_REFUND_CANARY_INVENTORY_KEYS,
  deriveEximbayRefundCanaryMarketProjectionDigest,
  deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest,
  deriveEximbayRefundCanaryWigStyleMarketProjectionDigest,
  type EximbayRefundCanaryFreshSaleCustody,
  type EximbayRefundCanaryInventoryCounts,
  type EximbayRefundCanaryMarketProjection,
  type EximbayRefundCanaryVariantMarketPriceProjection,
  type EximbayRefundCanaryWigStyleMarketProjection,
} from "./eximbay-refund-canary-fresh-sale-custody";

type InventoryTx = Prisma.TransactionClient;

export type EximbayRefundCanaryInventoryInspection = Readonly<{
  counts: EximbayRefundCanaryInventoryCounts;
  marketProjectionSha256: string;
  variantMarketPriceProjectionSha256: string;
  wigStyleMarketProjectionSha256: string;
  paymentOutboxProjectionSha256: string;
  paymentEventProjectionSha256: string;
  inventoryEvidenceSha256: string;
}>;

export async function inspectEximbayRefundCanaryOneTargetInventory(
  tx: InventoryTx,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): Promise<EximbayRefundCanaryInventoryInspection | null> {
  const subject = await loadInventorySubject(tx, artifact);
  if (!subject) return null;
  if (!subjectAdmissionMatches(subject, artifact)) return null;
  const counts = await collectInventoryCounts(tx);
  if (!sameInventoryCounts(counts, artifact.inventory)) return null;
  const catalog = await inspectCatalogFixtureProjection(tx, subject, artifact);
  if (!catalog) return null;
  const projections = await inspectExternalEffectProjections(tx, artifact);
  if (!projections) return null;
  const profileDigest = syntheticProfileDigest(artifact.syntheticProfileRevision, subject);
  if (profileDigest !== artifact.syntheticProfileDigest) return null;
  const inventoryEvidenceSha256 = deriveEximbayRefundCanaryInventoryEvidenceDigest({
    counts,
    orderItemIds: artifact.orderItemIds,
    checkoutSessionLineIds: artifact.checkoutSessionLineIds,
    markets: catalog.markets,
    marketProjectionSha256: catalog.marketProjectionSha256,
    variantMarketPrices: catalog.variantMarketPrices,
    variantMarketPriceProjectionSha256: catalog.variantMarketPriceProjectionSha256,
    wigStyleMarkets: catalog.wigStyleMarkets,
    wigStyleMarketProjectionSha256: catalog.wigStyleMarketProjectionSha256,
    paymentOutboxProjectionSha256: projections.paymentOutboxProjectionSha256,
    paymentEventProjectionSha256: projections.paymentEventProjectionSha256,
  });
  if (inventoryEvidenceSha256 !== artifact.inventoryEvidenceSha256) return null;
  return Object.freeze({
    counts,
    marketProjectionSha256: catalog.marketProjectionSha256,
    variantMarketPriceProjectionSha256: catalog.variantMarketPriceProjectionSha256,
    wigStyleMarketProjectionSha256: catalog.wigStyleMarketProjectionSha256,
    ...projections,
    inventoryEvidenceSha256,
  });
}

function subjectAdmissionMatches(
  subject: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  return [subjectIdentityMatches, lineIdentityMatches, noPromotionMoneyMatches,
    shippingIdentityMatches]
    .every((predicate) => predicate(subject, artifact));
}

export function deriveEximbayRefundCanaryInventoryEvidenceDigest(
  input: Readonly<{
    counts: EximbayRefundCanaryInventoryCounts;
    orderItemIds: readonly string[];
    checkoutSessionLineIds: readonly string[];
    markets: readonly EximbayRefundCanaryMarketProjection[];
    marketProjectionSha256: string;
    variantMarketPrices: readonly EximbayRefundCanaryVariantMarketPriceProjection[];
    variantMarketPriceProjectionSha256: string;
    wigStyleMarkets: readonly EximbayRefundCanaryWigStyleMarketProjection[];
    wigStyleMarketProjectionSha256: string;
    paymentOutboxProjectionSha256: string;
    paymentEventProjectionSha256: string;
  }>,
): string {
  return sha256(JSON.stringify([
    "mira-refund-eximbay-canary-one-target-inventory/v3",
    EXIMBAY_REFUND_CANARY_INVENTORY_KEYS.map((key) => [key, input.counts[key]]),
    input.orderItemIds,
    input.checkoutSessionLineIds,
    input.markets.map(marketProjectionPreimage),
    input.marketProjectionSha256,
    input.variantMarketPrices.map(variantMarketPriceProjectionPreimage),
    input.variantMarketPriceProjectionSha256,
    input.wigStyleMarkets.map(wigStyleMarketProjectionPreimage),
    input.wigStyleMarketProjectionSha256,
    input.paymentOutboxProjectionSha256,
    input.paymentEventProjectionSha256,
  ]));
}

type CatalogFixtureInspection = Readonly<{
  markets: readonly EximbayRefundCanaryMarketProjection[];
  marketProjectionSha256: string;
  variantMarketPrices: readonly EximbayRefundCanaryVariantMarketPriceProjection[];
  variantMarketPriceProjectionSha256: string;
  wigStyleMarkets: readonly EximbayRefundCanaryWigStyleMarketProjection[];
  wigStyleMarketProjectionSha256: string;
}>;

async function inspectCatalogFixtureProjection(
  tx: InventoryTx,
  subject: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): Promise<CatalogFixtureInspection | null> {
  const [marketRows, priceRows, styleMarketRows] = await Promise.all([
    tx.market.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true, currency: true, shippableCountries: true, defaultLocale: true,
        isActive: true, taxConfig: true, paymentConfig: true,
      },
    }),
    tx.variantMarketPrice.findMany({
      orderBy: [{ variantId: "asc" }, { marketCode: "asc" }],
      select: {
        variantId: true,
        marketCode: true,
        amount: true,
        variant: {
          select: {
            wigStyleId: true,
            isActive: true,
            stock: true,
            fulfillmentType: true,
            wigStyle: { select: { isActive: true } },
          },
        },
      },
    }),
    tx.wigStyleMarket.findMany({
      orderBy: [{ wigStyleId: "asc" }, { marketCode: "asc" }],
      select: { wigStyleId: true, marketCode: true, isActive: true },
    }),
  ]);

  marketRows.sort((left, right) => compareBytewise(left.code, right.code));
  priceRows.sort((left, right) => compareBytewise(left.variantId, right.variantId)
    || compareBytewise(left.marketCode, right.marketCode));
  styleMarketRows.sort((left, right) => compareBytewise(left.wigStyleId, right.wigStyleId)
    || compareBytewise(left.marketCode, right.marketCode));

  if (![sameProjection(marketRows, EXIMBAY_REFUND_CANARY_CANONICAL_MARKETS),
    sameProjection(marketRows, artifact.catalogFixture.markets)].every(Boolean)) return null;
  const markets = artifact.catalogFixture.markets;
  const variantMarketPrices = projectVariantMarketPrices(priceRows, subject, artifact);
  if (!variantMarketPrices) return null;
  if (!sameProjection(variantMarketPrices, artifact.catalogFixture.variantMarketPrices)) return null;
  const wigStyleMarkets = projectWigStyleMarkets(styleMarketRows, variantMarketPrices, artifact);
  if (!wigStyleMarkets) return null;
  if (!sameProjection(wigStyleMarkets, artifact.catalogFixture.wigStyleMarkets)) return null;

  const marketProjectionSha256 = deriveEximbayRefundCanaryMarketProjectionDigest(markets);
  const variantMarketPriceProjectionSha256 =
    deriveEximbayRefundCanaryVariantMarketPriceProjectionDigest(variantMarketPrices);
  const wigStyleMarketProjectionSha256 =
    deriveEximbayRefundCanaryWigStyleMarketProjectionDigest(wigStyleMarkets);
  if (![
    marketProjectionSha256 === artifact.catalogFixture.marketProjectionSha256,
    variantMarketPriceProjectionSha256
      === artifact.catalogFixture.variantMarketPriceProjectionSha256,
    wigStyleMarketProjectionSha256
      === artifact.catalogFixture.wigStyleMarketProjectionSha256,
  ].every(Boolean)) return null;
  return Object.freeze({
    markets,
    marketProjectionSha256,
    variantMarketPrices,
    variantMarketPriceProjectionSha256,
    wigStyleMarkets,
    wigStyleMarketProjectionSha256,
  });
}

function projectVariantMarketPrices(
  rows: readonly Readonly<{
    variantId: string;
    marketCode: string;
    amount: number;
    variant: Readonly<{
      wigStyleId: string;
      isActive: boolean;
      stock: number;
      fulfillmentType: string;
      wigStyle: Readonly<{ isActive: boolean }>;
    }>;
  }>[],
  subject: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): readonly EximbayRefundCanaryVariantMarketPriceProjection[] | null {
  const orderItems = subject.refundAttempt.order.items;
  const sessionLines = subject.refundAttempt.order.session.lines;
  if (![rows.length === orderItems.length, rows.length === sessionLines.length,
    new Set(rows.map((row) => row.variantId)).size === rows.length].every(Boolean)) return null;
  const itemByVariant = uniqueByVariant(orderItems);
  const lineByVariant = uniqueByVariant(sessionLines);
  if (!itemByVariant || !lineByVariant) return null;
  const projections: EximbayRefundCanaryVariantMarketPriceProjection[] = [];
  for (const row of rows) {
    const item = itemByVariant.get(row.variantId);
    const line = lineByVariant.get(row.variantId);
    const projection = projectVariantMarketPriceRow(row, item, line, artifact);
    if (!projection) return null;
    projections.push(projection);
  }
  return Object.freeze(projections);
}

function projectVariantMarketPriceRow(
  row: Readonly<{
    variantId: string;
    marketCode: string;
    amount: number;
    variant: Readonly<{
      wigStyleId: string;
      isActive: boolean;
      stock: number;
      fulfillmentType: string;
      wigStyle: Readonly<{ isActive: boolean }>;
    }>;
  }>,
  item: InventorySubject["refundAttempt"]["order"]["items"][number] | undefined,
  line: InventorySubject["refundAttempt"]["order"]["session"]["lines"][number] | undefined,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): EximbayRefundCanaryVariantMarketPriceProjection | null {
  if (!item || !line) return null;
  const matches = [
    row.marketCode === artifact.marketCode,
    row.marketCode === "US",
    row.variant.wigStyleId === item.wigStyleId,
    row.variant.wigStyleId === line.wigStyleId,
    row.variant.isActive,
    row.variant.wigStyle.isActive,
    Number.isInteger(row.variant.stock),
    row.variant.stock >= line.quantity,
    row.variant.fulfillmentType === line.fulfillmentType,
    row.variant.fulfillmentType === item.fulfillmentType,
    row.amount === line.unitAmount,
    row.amount === item.unitAmount,
    line.discountAmount === 0,
    item.discountAmount === 0,
  ].every(Boolean);
  if (!matches) return null;
  return Object.freeze({
    variantId: row.variantId,
    wigStyleId: row.variant.wigStyleId,
    marketCode: "US",
    amount: row.amount,
    checkoutSessionLineId: line.id,
    orderItemId: item.id,
  });
}

function projectWigStyleMarkets(
  rows: readonly Readonly<{ wigStyleId: string; marketCode: string; isActive: boolean }>[],
  variantMarketPrices: readonly EximbayRefundCanaryVariantMarketPriceProjection[],
  artifact: EximbayRefundCanaryFreshSaleCustody,
): readonly EximbayRefundCanaryWigStyleMarketProjection[] | null {
  const requiredStyleIds = [...new Set(variantMarketPrices.map((row) => row.wigStyleId))]
    .sort(compareBytewise);
  if (rows.length !== requiredStyleIds.length) return null;
  const projections: EximbayRefundCanaryWigStyleMarketProjection[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.wigStyleId !== requiredStyleIds[index]
      || row.marketCode !== artifact.marketCode
      || row.marketCode !== "US"
      || row.isActive !== true) return null;
    projections.push(Object.freeze({
      wigStyleId: row.wigStyleId,
      marketCode: "US",
      isActive: true,
    }));
  }
  return Object.freeze(projections);
}

function uniqueByVariant<T extends Readonly<{ variantId: string }>>(
  rows: readonly T[],
): ReadonlyMap<string, T> | null {
  const map = new Map(rows.map((row) => [row.variantId, row]));
  return map.size === rows.length ? map : null;
}

function marketProjectionPreimage(row: EximbayRefundCanaryMarketProjection): readonly unknown[] {
  return [row.code, row.currency, row.shippableCountries, row.defaultLocale,
    row.isActive, row.taxConfig, row.paymentConfig];
}

function variantMarketPriceProjectionPreimage(
  row: EximbayRefundCanaryVariantMarketPriceProjection,
): readonly unknown[] {
  return [row.variantId, row.wigStyleId, row.marketCode, row.amount,
    row.checkoutSessionLineId, row.orderItemId];
}

function wigStyleMarketProjectionPreimage(
  row: EximbayRefundCanaryWigStyleMarketProjection,
): readonly unknown[] {
  return [row.wigStyleId, row.marketCode, row.isActive];
}

function sameProjection(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function deriveEximbayRefundCanarySyntheticProfileDigest(
  revision: string,
  input: Readonly<{
    user: Readonly<{
      id: string;
      email: string;
      emailVerified: Date | null;
      name: string | null;
      image: string | null;
      role: string;
    }>;
    checkoutShipping: ShippingProjection;
    orderShipping: ShippingProjection;
  }>,
): string {
  return sha256(JSON.stringify([
    "mira-refund-eximbay-canary-synthetic-profile/v1",
    revision,
    input.user.id,
    input.user.email,
    input.user.emailVerified?.toISOString() ?? null,
    input.user.name,
    input.user.image,
    input.user.role,
    shippingPreimage(input.checkoutShipping),
    shippingPreimage(input.orderShipping),
  ]));
}

async function loadInventorySubject(
  tx: InventoryTx,
  artifact: EximbayRefundCanaryFreshSaleCustody,
) {
  return tx.refundExecutionCommand.findUnique({
    where: { id: artifact.commandId },
    include: {
      refundAttempt: {
        include: {
          lines: true,
          payment: true,
          order: {
            include: {
              user: {
                select: {
                  id: true, email: true, emailVerified: true, name: true,
                  image: true, role: true,
                },
              },
              items: true,
              shipping: true,
              session: { include: { lines: true, shipping: true } },
              market: true,
            },
          },
        },
      },
    },
  });
}

type InventorySubject = NonNullable<Awaited<ReturnType<typeof loadInventorySubject>>>;

function subjectIdentityMatches(
  command: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  const attempt = command.refundAttempt;
  const payment = attempt.payment;
  const order = attempt.order;
  const session = order.session;
  return [
    command.id === artifact.commandId,
    command.refundAttemptId === artifact.refundAttemptId,
    command.status === RefundExecutionCommandStatus.READY,
    command.dispatchAttempt === 0,
    command.leaseOwner === null,
    command.leaseUntil === null,
    command.leaseTokenHash === null,
    attempt.id === artifact.refundAttemptId,
    attempt.orderId === artifact.orderId,
    attempt.paymentId === artifact.paymentId,
    attempt.status === RefundAttemptStatus.PROCESSING,
    attempt.actorType === RefundAttemptActorType.SYSTEM,
    attempt.actorUserId === null,
    attempt.provider === PaymentProvider.EXIMBAY,
    attempt.mode === PaymentMode.SANDBOX,
    attempt.providerRefundId === null,
    payment.id === artifact.paymentId,
    payment.checkoutSessionId === artifact.checkoutSessionId,
    payment.provider === PaymentProvider.EXIMBAY,
    payment.mode === PaymentMode.SANDBOX,
    payment.adapterExecutionKind === PaymentAdapterExecutionKind.EXTERNAL,
    payment.status === PaymentAttemptStatus.SUCCEEDED,
    payment.attemptLifecycle === PaymentAttemptLifecycle.FINALIZED,
    payment.providerOrderId === artifact.providerOrderId,
    payment.providerPaymentKey === artifact.providerTransactionId,
    payment.providerRef === artifact.normalizedSaleReceiptId,
    payment.financialSucceededAt?.toISOString() === artifact.saleEvidenceTimestamp,
    order.id === artifact.orderId,
    order.paymentId === payment.id,
    order.checkoutSessionId === artifact.checkoutSessionId,
    order.userId === artifact.syntheticAccountOpaqueId,
    order.user.id === artifact.syntheticAccountOpaqueId,
    order.user.role === "CUSTOMER",
    order.user.image === null,
    order.status === OrderStatus.REFUND_PENDING,
    order.marketCode === artifact.marketCode,
    order.currency === artifact.currency,
    order.promotionGrantId === null,
    order.discountAmount === 0,
    session.id === artifact.checkoutSessionId,
    session.userId === artifact.syntheticAccountOpaqueId,
    session.status === CheckoutSessionStatus.COMPLETED,
    session.marketCode === artifact.marketCode,
    session.currency === artifact.currency,
    session.promotionGrantId === null,
    session.discountAmount === 0,
    order.market.currency === artifact.currency,
    attempt.amount === artifact.amount,
    payment.amount === artifact.amount,
    order.totalAmount === artifact.amount,
    session.totalAmount === artifact.amount,
  ].every(Boolean);
}

function lineIdentityMatches(
  command: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  const orderItems = [...command.refundAttempt.order.items]
    .sort((left, right) => compareBytewise(left.id, right.id));
  const sessionLines = [...command.refundAttempt.order.session.lines]
    .sort((left, right) => compareBytewise(left.id, right.id));
  const refundLines = [...command.refundAttempt.lines]
    .sort((left, right) => compareBytewise(left.orderItemId, right.orderItemId));
  if (JSON.stringify(orderItems.map((row) => row.id)) !== JSON.stringify(artifact.orderItemIds)
    || JSON.stringify(sessionLines.map((row) => row.id))
      !== JSON.stringify(artifact.checkoutSessionLineIds)
    || refundLines.length !== orderItems.length) return false;
  const sessionByVariant = new Map(sessionLines.map((row) => [row.variantId, row]));
  return orderItems.every((item) => {
    const sessionLine = sessionByVariant.get(item.variantId);
    const refundLine = refundLines.find((row) => row.orderItemId === item.id);
    if (!sessionLine || !refundLine) return false;
    return [
      sessionLine.wigStyleId === item.wigStyleId,
      sessionLine.quantity === item.quantity,
      sessionLine.unitAmount === item.unitAmount,
      sessionLine.discountAmount === item.discountAmount,
      sessionLine.discountAmount === 0,
      sessionLine.fulfillmentType === item.fulfillmentType,
      refundLine.orderId === artifact.orderId,
      refundLine.quantity === item.quantity,
    ].every(Boolean);
  });
}

function noPromotionMoneyMatches(
  command: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  const attempt = command.refundAttempt;
  const order = attempt.order;
  const session = order.session;
  const subtotal = session.lines.reduce(
    (sum, line) => sum + line.unitAmount * line.quantity,
    0,
  );
  return [
    session.promotionGrantId === null,
    order.promotionGrantId === null,
    session.lines.every((line) => line.discountAmount === 0),
    order.items.every((item) => item.discountAmount === 0),
    session.subtotalAmount === subtotal,
    order.subtotalAmount === subtotal,
    session.discountAmount === 0,
    order.discountAmount === 0,
    session.shippingAmount === order.shippingAmount,
    subtotal + session.shippingAmount === session.totalAmount,
    subtotal + order.shippingAmount === order.totalAmount,
    session.totalAmount === order.totalAmount,
    order.totalAmount === attempt.payment.amount,
    attempt.amount === order.totalAmount,
    artifact.amount === order.totalAmount,
  ].every(Boolean);
}

function shippingIdentityMatches(
  command: InventorySubject,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  const checkout = command.refundAttempt.order.session.shipping;
  const order = command.refundAttempt.order.shipping;
  if (!checkout || !order || checkout.country !== artifact.shippingCountry
    || order.country !== artifact.shippingCountry) return false;
  return JSON.stringify(shippingPreimage(checkout)) === JSON.stringify(shippingPreimage(order));
}

type ShippingProjection = Readonly<{
  recipientName: string;
  phone: string;
  country: string;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  memo: string | null;
}>;

function syntheticProfileDigest(revision: string, command: InventorySubject): string {
  const checkoutShipping = command.refundAttempt.order.session.shipping;
  const orderShipping = command.refundAttempt.order.shipping;
  if (!checkoutShipping || !orderShipping) return "";
  return deriveEximbayRefundCanarySyntheticProfileDigest(revision, {
    user: command.refundAttempt.order.user,
    checkoutShipping,
    orderShipping,
  });
}

function shippingPreimage(value: ShippingProjection): readonly unknown[] {
  return [value.recipientName, value.phone, value.country, value.postalCode,
    value.administrativeArea, value.city, value.addressLine1, value.addressLine2, value.memo];
}

async function inspectExternalEffectProjections(
  tx: InventoryTx,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): Promise<Readonly<{
  paymentOutboxProjectionSha256: string;
  paymentEventProjectionSha256: string;
}> | null> {
  const outbox = await tx.paymentOutbox.findMany({ orderBy: { id: "asc" } });
  const events = await tx.paymentEvent.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true, provider: true, source: true, transmissionId: true, eventType: true,
      verifiedMode: true, verifiedCredentialBinding: true, checkoutSessionId: true,
      providerPaymentKey: true, status: true, processedAt: true, failureStage: true,
      failureCode: true,
    },
  });
  if (!outbox.every((row) => allowedInitialOutbox(row, artifact.orderId))) return null;
  if (!events.every((row) => allowedInitialPaymentEvent(row, artifact))) return null;
  const paymentOutboxProjectionSha256 = sha256(JSON.stringify(outbox.map((row) => [
    row.id, row.topic, row.status, row.attempts, row.nextAttemptAt?.toISOString() ?? null,
    row.lastError, row.dedupKey, row.processedAt?.toISOString() ?? null,
  ])));
  const paymentEventProjectionSha256 = sha256(JSON.stringify(events.map((row) => [
    row.id, row.provider, row.source, row.transmissionId, row.eventType, row.verifiedMode,
    row.verifiedCredentialBinding, row.checkoutSessionId, row.providerPaymentKey, row.status,
    row.processedAt?.toISOString() ?? null, row.failureStage, row.failureCode,
  ])));
  return paymentOutboxProjectionSha256 === artifact.paymentOutboxProjectionSha256
    && paymentEventProjectionSha256 === artifact.paymentEventProjectionSha256
    ? Object.freeze({ paymentOutboxProjectionSha256, paymentEventProjectionSha256 })
    : null;
}

function allowedInitialOutbox(
  row: PaymentOutbox,
  orderId: string,
): boolean {
  const payload = parseOrderPaidEmailPayload(row.payload);
  return [
    row.topic === CUSTOMER_ORDER_PAID_EMAIL_V1,
    row.dedupKey === orderPaidEmailDedupKey(orderId),
    payload?.orderId === orderId,
    row.status === "PENDING",
    row.attempts === 0,
    row.nextAttemptAt === null,
    row.lastError === null,
    row.processedAt === null,
  ].every(Boolean);
}

function allowedInitialPaymentEvent(
  row: Readonly<{
    provider: PaymentProvider;
    verifiedMode: PaymentMode | null;
    checkoutSessionId: string | null;
    providerPaymentKey: string | null;
  }>,
  artifact: EximbayRefundCanaryFreshSaleCustody,
): boolean {
  return [
    row.provider === PaymentProvider.EXIMBAY,
    row.verifiedMode === PaymentMode.SANDBOX,
    row.checkoutSessionId === artifact.checkoutSessionId,
    row.providerPaymentKey === null
      || row.providerPaymentKey === artifact.providerTransactionId,
  ].every(Boolean);
}

async function collectInventoryCounts(tx: InventoryTx): Promise<EximbayRefundCanaryInventoryCounts> {
  const rows = await tx.$queryRaw<EximbayRefundCanaryInventoryCounts[]>(Prisma.sql`
    SELECT
      (SELECT count(*)::int FROM "User") AS "userCount",
      (SELECT count(*)::int FROM "Account") AS "accountCount",
      (SELECT count(*)::int FROM "Session") AS "sessionCount",
      (SELECT count(*)::int FROM "VerificationToken") AS "verificationTokenCount",
      (SELECT count(*)::int FROM "Market") AS "marketCount",
      (SELECT count(*)::int FROM "Fitting") AS "fittingCount",
      (SELECT count(*)::int FROM "CartItem") AS "cartItemCount",
      (SELECT count(*)::int FROM "WishlistItem") AS "wishlistItemCount",
      (SELECT count(*)::int FROM "CheckoutSession") AS "checkoutSessionCount",
      (SELECT count(*)::int FROM "CheckoutSessionLine") AS "checkoutSessionLineCount",
      (SELECT count(*)::int FROM "CheckoutSessionShipping") AS "checkoutSessionShippingCount",
      (SELECT count(*)::int FROM "Payment") AS "paymentCount",
      (SELECT count(*)::int FROM "Order") AS "orderCount",
      (SELECT count(*)::int FROM "CustomerRefundIntake") AS "customerRefundIntakeCount",
      (SELECT count(*)::int FROM "OrderCancellation") AS "orderCancellationCount",
      (SELECT count(*)::int FROM "RefundAttempt") AS "refundAttemptCount",
      (SELECT count(*)::int FROM "RefundAttemptLine") AS "refundAttemptLineCount",
      (SELECT count(*)::int FROM "RefundAttemptLineEconomicAllocation")
        AS "refundAttemptLineEconomicAllocationCount",
      (SELECT count(*)::int FROM "RefundAttemptTransition") AS "refundAttemptTransitionCount",
      (SELECT count(*)::int FROM "RefundExecutionCommand") AS "refundExecutionCommandCount",
      (SELECT count(*)::int FROM "EximbayRefundSandboxCanaryApproval") AS "approvalCount",
      (SELECT count(*)::int FROM "RefundExecutionCommandEvent") AS "commandEventCount",
      (SELECT count(*)::int FROM "RefundExecutionDispatchAttempt") AS "dispatchAttemptCount",
      (SELECT count(*)::int FROM "RefundExecutionProviderContactEligibilityProof")
        AS "contactProofCount",
      (SELECT count(*)::int FROM "RefundExecutionProviderOperationBinding")
        AS "operationBindingCount",
      (SELECT count(*)::int FROM "RefundExecutionEximbayPreflightObservation")
        AS "eximbayPreflightObservationCount",
      (SELECT count(*)::int FROM "RefundExecutionProviderEligibilityProof")
        AS "eligibilityProofCount",
      (SELECT count(*)::int FROM "RefundExecutionEvidence") AS "refundEvidenceCount",
      (SELECT count(*)::int FROM "OrderItem") AS "orderItemCount",
      (SELECT count(*)::int FROM "OrderShipping") AS "orderShippingCount",
      (SELECT count(*)::int FROM "ManufacturingRequest") AS "manufacturingRequestCount",
      (SELECT count(*)::int FROM "PaymentOutbox") AS "paymentOutboxCount",
      (SELECT count(*)::int FROM "PaymentEvent") AS "paymentEventCount",
      (SELECT count(*)::int FROM "WebhookIngressRejection") AS "webhookIngressRejectionCount",
      (SELECT count(*)::int FROM "Review") AS "reviewCount",
      (SELECT count(*)::int FROM "PromotionPolicyVersion") AS "promotionPolicyVersionCount",
      (SELECT count(*)::int FROM "PromotionMarketRule") AS "promotionMarketRuleCount",
      (SELECT count(*)::int FROM "CustomerBenefitProfile") AS "customerBenefitProfileCount",
      (SELECT count(*)::int FROM "PromotionGrant") AS "promotionGrantCount",
      (SELECT count(*)::int FROM "PromotionRecoveryReconciliationCheckpoint")
        AS "promotionRecoveryCheckpointCount",
      (SELECT count(*)::int FROM "WigStyle") AS "wigStyleCount",
      (SELECT count(*)::int FROM "WigVariant") AS "wigVariantCount",
      (SELECT count(*)::int FROM "VariantMarketPrice") AS "variantMarketPriceCount",
      (SELECT count(*)::int FROM "WigStyleMarket") AS "wigStyleMarketCount",
      (SELECT count(*)::int FROM "WigStyleLocalizedRevision")
        AS "wigStyleLocalizedRevisionCount",
      (SELECT count(*)::int FROM "WigStyleLocalizedApprovalDecision")
        AS "wigStyleLocalizedApprovalDecisionCount",
      (SELECT count(*)::int FROM "WigStyleLocalizedPublication")
        AS "wigStyleLocalizedPublicationCount",
      (SELECT count(*)::int FROM "WigStyleLocalizedPublicationEvent")
        AS "wigStyleLocalizedPublicationEventCount",
      (SELECT count(*)::int FROM "WigStyleRelation") AS "wigStyleRelationCount"
  `);
  const row = rows[0];
  if (rows.length !== 1 || !row) throw new Error("EXIMBAY_CANARY_INVENTORY_UNAVAILABLE");
  return Object.freeze(row);
}

function sameInventoryCounts(
  actual: EximbayRefundCanaryInventoryCounts,
  expected: EximbayRefundCanaryInventoryCounts,
): boolean {
  return EXIMBAY_REFUND_CANARY_INVENTORY_KEYS.every((key) => actual[key] === expected[key]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
