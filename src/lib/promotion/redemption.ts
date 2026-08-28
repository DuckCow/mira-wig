import "server-only";

import {
  PaymentAttemptStatus,
  Prisma,
  PromotionKind,
  PromotionPolicyStatus,
} from "@prisma/client";
import { calculatePercentageDiscount } from "./discount";

export type PromotionRedemptionErrorCode =
  | "PROMOTION_GRANT_UNAVAILABLE"
  | "PROMOTION_DISCOUNT_UNAVAILABLE"
  | "PROMOTION_FIRST_ORDER_REQUIRED"
  | "PROMOTION_TERMS_STALE"
  | "PROMOTION_REDEMPTION_CONFLICT";

export class PromotionRedemptionError extends Error {
  constructor(
    readonly code: PromotionRedemptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PromotionRedemptionError";
  }
}

export interface PromotionCheckoutLineInput {
  /** CheckoutSession guarantees one frozen line per variant. */
  readonly lineId: string;
  readonly grossAmount: number;
  readonly frozenDiscountAmount?: number;
}

export interface PriceSelectedPromotionInput {
  readonly promotionGrantId: string;
  readonly userId: string;
  readonly marketCode: string;
  readonly currency: string;
  readonly lines: readonly PromotionCheckoutLineInput[];
  readonly now: Date;
  readonly reservationOwnerSessionId?: string;
  readonly frozenDiscountAmount?: number;
}

export interface SelectedPromotionTerms {
  readonly promotionGrantId: string;
  readonly firstOrderOnly: boolean;
  readonly discountAmount: number;
  readonly lineDiscounts: readonly Readonly<{
    lineId: string;
    discountAmount: number;
  }>[];
  readonly expiresAt: Date | null;
}

type PromotionTx = Prisma.TransactionClient;
type PromotionReader = Pick<PromotionTx, "promotionGrant" | "order">;
type PromotionDiscriminatorReader = Pick<PromotionTx, "promotionGrant">;

export async function selectedPromotionFirstOrderOnly(
  client: PromotionDiscriminatorReader,
  promotionGrantId: string,
): Promise<boolean> {
  if (!promotionGrantId.trim()) unavailable("Selected promotion grant is unavailable.");
  const grant = await client.promotionGrant.findUnique({
    where: { id: promotionGrantId },
    select: { policyVersion: { select: { firstOrderOnly: true } } },
  });
  if (!grant) unavailable("Selected promotion grant is unavailable.");
  return grant.policyVersion.firstOrderOnly;
}

export async function priceSelectedPromotion(
  client: PromotionReader,
  input: PriceSelectedPromotionInput,
): Promise<SelectedPromotionTerms> {
  requirePromotionInput(input);
  const grant = await loadGrant(client, input.promotionGrantId, input.marketCode);
  if (!grant) unavailable("Selected promotion grant is unavailable.");
  validateGrant(grant, input);
  if (grant.policyVersion.firstOrderOnly
    && await financiallyCompletedOrderExists(client, input.userId)) {
    throw new PromotionRedemptionError(
      "PROMOTION_FIRST_ORDER_REQUIRED",
      "The selected promotion is limited to a first order.",
    );
  }
  const rule = grant.policyVersion.marketRules[0];
  if (!rule) unavailable("The issuing policy has no rule for the checkout Market.");
  const calculation = calculatePercentageDiscount({
    currency: input.currency,
    lines: input.lines.map((line) => ({
      lineId: line.lineId,
      eligibleMinor: BigInt(line.grossAmount),
    })),
    rateBps: rule.rateBps,
    maximumDiscountMinor: rule.maximumDiscountMinor,
    minimumEligibleSubtotalMinor: rule.minimumEligibleSubtotalMinor,
  });
  if (calculation.disposition !== "APPLIED" || calculation.actualDiscountMinor === BigInt(0)) {
    throw new PromotionRedemptionError(
      "PROMOTION_DISCOUNT_UNAVAILABLE",
      "The selected promotion does not produce a monetary discount for this checkout.",
    );
  }
  const discountAmount = safeMinorNumber(calculation.actualDiscountMinor);
  const lineDiscounts = calculation.allocations.map((allocation) => Object.freeze({
    lineId: allocation.lineId,
    discountAmount: safeMinorNumber(allocation.lineDiscountMinor),
  }));
  validateFrozenTerms(input, discountAmount, lineDiscounts);
  return Object.freeze({
    promotionGrantId: grant.id,
    firstOrderOnly: grant.policyVersion.firstOrderOnly,
    discountAmount,
    lineDiscounts: Object.freeze(lineDiscounts),
    expiresAt: grant.expiresAt,
  });
}

export async function reserveSelectedPromotionForContact(
  tx: PromotionTx,
  input: PriceSelectedPromotionInput & {
    readonly reservationOwnerSessionId: string;
    readonly expectedFirstOrderOnly: boolean;
  },
): Promise<SelectedPromotionTerms> {
  await lockPromotionGrant(tx, input.promotionGrantId);
  const terms = await priceSelectedPromotion(tx, input);
  if (terms.firstOrderOnly !== input.expectedFirstOrderOnly) stale();
  const grant = await tx.promotionGrant.findUnique({
    where: { id: input.promotionGrantId },
    select: { reservedCheckoutSessionId: true },
  });
  if (!grant) unavailable("Selected promotion grant is unavailable.");
  if (grant.reservedCheckoutSessionId === input.reservationOwnerSessionId) return terms;
  if (grant.reservedCheckoutSessionId !== null) {
    unavailable("Selected promotion grant is reserved by another checkout.");
  }
  const reserved = await tx.promotionGrant.updateMany({
    where: {
      id: input.promotionGrantId,
      reservedCheckoutSessionId: null,
      redeemedAt: null,
      revokedAt: null,
    },
    data: {
      reservedCheckoutSessionId: input.reservationOwnerSessionId,
      reservedAt: input.now,
    },
  });
  if (reserved.count !== 1) unavailable("Selected promotion grant could not be reserved.");
  return terms;
}

export async function requirePromotionReservationForCompletion(
  tx: PromotionTx,
  input: Readonly<{ promotionGrantId: string; checkoutSessionId: string }>,
): Promise<void> {
  await lockPromotionGrant(tx, input.promotionGrantId);
  const grant = await tx.promotionGrant.findUnique({
    where: { id: input.promotionGrantId },
    select: {
      reservedCheckoutSessionId: true,
      redeemedAt: true,
      order: { select: { id: true } },
    },
  });
  if (!grant
    || grant.reservedCheckoutSessionId !== input.checkoutSessionId
    || grant.redeemedAt !== null
    || grant.order !== null) {
    throw new PromotionRedemptionError(
      "PROMOTION_REDEMPTION_CONFLICT",
      "Promotion reservation cannot be consumed by this checkout.",
    );
  }
}

export async function redeemPromotionForOrder(
  tx: PromotionTx,
  input: Readonly<{
    promotionGrantId: string;
    checkoutSessionId: string;
    redeemedAt: Date;
  }>,
): Promise<void> {
  const redeemed = await tx.promotionGrant.updateMany({
    where: {
      id: input.promotionGrantId,
      reservedCheckoutSessionId: input.checkoutSessionId,
      redeemedAt: null,
    },
    data: {
      redeemedAt: input.redeemedAt,
      reservedCheckoutSessionId: null,
      reservedAt: null,
    },
  });
  if (redeemed.count !== 1) {
    throw new PromotionRedemptionError(
      "PROMOTION_REDEMPTION_CONFLICT",
      "Promotion redemption changed during order completion.",
    );
  }
}

async function loadGrant(
  client: PromotionReader,
  promotionGrantId: string,
  marketCode: string,
) {
  return client.promotionGrant.findUnique({
    where: { id: promotionGrantId },
    include: {
      policyVersion: {
        include: {
          marketRules: {
            where: { marketCode },
            include: { market: { select: { currency: true } } },
          },
        },
      },
    },
  });
}

function validateGrant(
  grant: NonNullable<Awaited<ReturnType<typeof loadGrant>>>,
  input: PriceSelectedPromotionInput,
): void {
  const rule = grant.policyVersion.marketRules[0];
  const reservationOwner = input.reservationOwnerSessionId;
  const unavailableReasons = [
    grant.userId !== input.userId,
    grant.validFrom.getTime() > input.now.getTime(),
    grantHasExpired(grant.expiresAt, input.now),
    grant.revokedAt !== null,
    grant.redeemedAt !== null,
    !SUPPORTED_REDEMPTION_KINDS.includes(grant.policyVersion.kind),
    !SUPPORTED_ISSUING_POLICY_STATUSES.includes(grant.policyVersion.status),
    rule === undefined,
    rule?.currency !== input.currency,
    rule?.market.currency !== input.currency,
    reservationBelongsElsewhere(grant.reservedCheckoutSessionId, reservationOwner),
  ];
  if (unavailableReasons.some(Boolean)) {
    unavailable("Selected promotion grant is not eligible for this checkout.");
  }
}

function grantHasExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && now.getTime() >= expiresAt.getTime();
}

function reservationBelongsElsewhere(
  reservedCheckoutSessionId: string | null,
  reservationOwnerSessionId: string | undefined,
): boolean {
  return reservedCheckoutSessionId !== null
    && reservedCheckoutSessionId !== reservationOwnerSessionId;
}

const SUPPORTED_REDEMPTION_KINDS: readonly PromotionKind[] = Object.freeze([
  PromotionKind.SIGNUP,
  PromotionKind.BIRTHDAY,
]);

const SUPPORTED_ISSUING_POLICY_STATUSES: readonly PromotionPolicyStatus[] = Object.freeze([
  PromotionPolicyStatus.ACTIVE,
  PromotionPolicyStatus.RETIRED,
]);

async function financiallyCompletedOrderExists(
  client: PromotionReader,
  userId: string,
): Promise<boolean> {
  const order = await client.order.findFirst({
    where: {
      userId,
      payment: {
        status: PaymentAttemptStatus.SUCCEEDED,
        financialSucceededAt: { not: null },
      },
    },
    select: { id: true },
  });
  return order !== null;
}

function validateFrozenTerms(
  input: PriceSelectedPromotionInput,
  discountAmount: number,
  lineDiscounts: readonly Readonly<{ lineId: string; discountAmount: number }>[],
): void {
  if (input.frozenDiscountAmount !== undefined
    && input.frozenDiscountAmount !== discountAmount) stale();
  const expectedByLine = new Map(lineDiscounts.map((line) => [line.lineId, line.discountAmount]));
  for (const line of input.lines) {
    if (line.frozenDiscountAmount !== undefined
      && expectedByLine.get(line.lineId) !== line.frozenDiscountAmount) stale();
  }
}

function requirePromotionInput(input: PriceSelectedPromotionInput): void {
  if (!input.promotionGrantId.trim()
    || !input.userId.trim()
    || !input.marketCode.trim()
    || !/^[A-Z]{3}$/u.test(input.currency)
    || !Number.isFinite(input.now.getTime())
    || input.lines.length === 0
    || input.lines.some((line) => (
      !line.lineId.trim()
      || !Number.isSafeInteger(line.grossAmount)
      || line.grossAmount < 0
    ))) unavailable("Promotion checkout input is invalid.");
}

function safeMinorNumber(value: bigint): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) stale();
  return numberValue;
}

async function lockPromotionGrant(tx: PromotionTx, promotionGrantId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "PromotionGrant"
    WHERE "id" = ${promotionGrantId}
    FOR UPDATE
  `);
}

function unavailable(message: string): never {
  throw new PromotionRedemptionError("PROMOTION_GRANT_UNAVAILABLE", message);
}

function stale(): never {
  throw new PromotionRedemptionError(
    "PROMOTION_TERMS_STALE",
    "Frozen promotion terms no longer match the issuing policy.",
  );
}
