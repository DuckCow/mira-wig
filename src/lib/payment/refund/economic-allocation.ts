import { POSTGRES_INT_MAX } from "./lines";

export type DiscountReversalResult =
  | { ok: true; amount: number }
  | { ok: false; code: "INVALID_DISCOUNT_ALLOCATION_INPUT" | "DISCOUNT_ALLOCATION_OVERFLOW" };

export function cumulativeDiscountReversal(
  lineDiscountAmount: number,
  quantity: number,
  refundedQuantity: number,
): DiscountReversalResult {
  if (!validInputs(lineDiscountAmount, quantity, refundedQuantity)) {
    return { ok: false, code: "INVALID_DISCOUNT_ALLOCATION_INPUT" };
  }
  return boundedNumber(
    (BigInt(lineDiscountAmount) * BigInt(refundedQuantity)) / BigInt(quantity),
  );
}

export function incrementalDiscountReversal(
  lineDiscountAmount: number,
  quantity: number,
  previouslyRefundedQuantity: number,
  refundQuantity: number,
): DiscountReversalResult {
  if (!isNonnegativePostgresInteger(refundQuantity)) {
    return { ok: false, code: "INVALID_DISCOUNT_ALLOCATION_INPUT" };
  }
  const afterQuantity = previouslyRefundedQuantity + refundQuantity;
  if (!Number.isSafeInteger(afterQuantity)) {
    return { ok: false, code: "DISCOUNT_ALLOCATION_OVERFLOW" };
  }
  const before = cumulativeDiscountReversal(
    lineDiscountAmount,
    quantity,
    previouslyRefundedQuantity,
  );
  if (!before.ok) return before;
  const after = cumulativeDiscountReversal(lineDiscountAmount, quantity, afterQuantity);
  if (!after.ok) return after;
  return { ok: true, amount: after.amount - before.amount };
}

export function expectedMerchandiseRefundAmount(
  unitAmount: number,
  refundQuantity: number,
  discountReversalAmount: number,
): DiscountReversalResult {
  if (
    !isNonnegativePostgresInteger(unitAmount)
    || !isNonnegativePostgresInteger(refundQuantity)
    || !isNonnegativePostgresInteger(discountReversalAmount)
  ) {
    return { ok: false, code: "INVALID_DISCOUNT_ALLOCATION_INPUT" };
  }
  const amount = BigInt(unitAmount) * BigInt(refundQuantity) - BigInt(discountReversalAmount);
  return boundedNumber(amount);
}

function validInputs(discount: number, quantity: number, refunded: number): boolean {
  return isNonnegativePostgresInteger(discount)
    && Number.isInteger(quantity) && quantity > 0 && quantity <= POSTGRES_INT_MAX
    && isNonnegativePostgresInteger(refunded) && refunded <= quantity;
}

function isNonnegativePostgresInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= POSTGRES_INT_MAX;
}

function boundedNumber(value: bigint): DiscountReversalResult {
  if (value < BigInt(0) || value > BigInt(POSTGRES_INT_MAX)) {
    return { ok: false, code: "DISCOUNT_ALLOCATION_OVERFLOW" };
  }
  return { ok: true, amount: Number(value) };
}
