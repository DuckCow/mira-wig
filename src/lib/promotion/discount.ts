export interface EligiblePromotionLine {
  readonly lineId: string;
  readonly eligibleMinor: bigint;
}

export interface CalculatePercentageDiscountInput {
  readonly currency: string;
  readonly lines: readonly EligiblePromotionLine[];
  readonly rateBps: number;
  readonly maximumDiscountMinor: bigint;
  readonly minimumEligibleSubtotalMinor?: bigint | null;
}

export type DiscountDisposition = "APPLIED" | "MINIMUM_NOT_MET" | "ZERO_SUBTOTAL";

export interface PromotionLineAllocation {
  readonly lineId: string;
  readonly lineEligibleMinor: bigint;
  readonly lineDiscountMinor: bigint;
}

export interface PercentageDiscountCalculation {
  readonly currency: string;
  readonly eligibleSubtotalMinor: bigint;
  readonly rateBps: number;
  readonly maximumDiscountMinor: bigint;
  readonly minimumEligibleSubtotalMinor: bigint | null;
  readonly rawDiscountMinor: bigint;
  readonly actualDiscountMinor: bigint;
  readonly allocations: readonly PromotionLineAllocation[];
  readonly disposition: DiscountDisposition;
}

const ZERO_MINOR = BigInt(0);
const ONE_MINOR = BigInt(1);
const BASIS_POINT_DENOMINATOR = BigInt(10_000);

export function calculatePercentageDiscount(
  input: CalculatePercentageDiscountInput,
): PercentageDiscountCalculation {
  validateInput(input);
  const sortedLines = [...input.lines].sort(compareLineIdentity);
  const eligibleSubtotalMinor = sortedLines.reduce(
    (sum, line) => sum + line.eligibleMinor,
    ZERO_MINOR,
  );
  const minimumEligibleSubtotalMinor = input.minimumEligibleSubtotalMinor ?? null;
  const rawDiscountMinor = eligibleSubtotalMinor * BigInt(input.rateBps) / BASIS_POINT_DENOMINATOR;
  const belowMinimum = minimumEligibleSubtotalMinor !== null
    && eligibleSubtotalMinor < minimumEligibleSubtotalMinor;
  const actualDiscountMinor = belowMinimum
    ? ZERO_MINOR
    : minimumBigInt(rawDiscountMinor, input.maximumDiscountMinor, eligibleSubtotalMinor);
  const disposition = discountDisposition(eligibleSubtotalMinor, belowMinimum);

  return Object.freeze({
    currency: input.currency,
    eligibleSubtotalMinor,
    rateBps: input.rateBps,
    maximumDiscountMinor: input.maximumDiscountMinor,
    minimumEligibleSubtotalMinor,
    rawDiscountMinor,
    actualDiscountMinor,
    allocations: Object.freeze(allocateDiscount(sortedLines, eligibleSubtotalMinor, actualDiscountMinor)),
    disposition,
  });
}

function validateInput(input: CalculatePercentageDiscountInput): void {
  if (!/^[A-Z]{3}$/u.test(input.currency)) throw new Error("PROMOTION_CURRENCY_INVALID");
  if (!Number.isInteger(input.rateBps) || input.rateBps < 1 || input.rateBps > 10_000) {
    throw new Error("PROMOTION_RATE_BPS_INVALID");
  }
  requireBigInt(input.maximumDiscountMinor, "PROMOTION_MAXIMUM_DISCOUNT_INVALID");
  if (input.maximumDiscountMinor <= ZERO_MINOR) throw new Error("PROMOTION_MAXIMUM_DISCOUNT_INVALID");
  if (input.minimumEligibleSubtotalMinor !== undefined
    && input.minimumEligibleSubtotalMinor !== null) {
    requireBigInt(input.minimumEligibleSubtotalMinor, "PROMOTION_MINIMUM_SUBTOTAL_INVALID");
    if (input.minimumEligibleSubtotalMinor < ZERO_MINOR) throw new Error("PROMOTION_MINIMUM_SUBTOTAL_INVALID");
  }
  const identities = new Set<string>();
  for (const line of input.lines) validateLine(line, identities);
}

function validateLine(line: EligiblePromotionLine, identities: Set<string>): void {
  if (!line.lineId.trim() || identities.has(line.lineId)) {
    throw new Error("PROMOTION_LINE_IDENTITY_INVALID");
  }
  identities.add(line.lineId);
  requireBigInt(line.eligibleMinor, "PROMOTION_LINE_AMOUNT_INVALID");
  if (line.eligibleMinor < ZERO_MINOR) throw new Error("PROMOTION_LINE_AMOUNT_INVALID");
}

function requireBigInt(value: unknown, code: string): asserts value is bigint {
  if (typeof value !== "bigint") throw new Error(code);
}

function discountDisposition(
  subtotal: bigint,
  belowMinimum: boolean,
): DiscountDisposition {
  if (subtotal === ZERO_MINOR) return "ZERO_SUBTOTAL";
  if (belowMinimum) return "MINIMUM_NOT_MET";
  return "APPLIED";
}

function minimumBigInt(...values: readonly bigint[]): bigint {
  return values.reduce((minimum, value) => value < minimum ? value : minimum);
}

function allocateDiscount(
  lines: readonly EligiblePromotionLine[],
  subtotal: bigint,
  discount: bigint,
): PromotionLineAllocation[] {
  if (subtotal === ZERO_MINOR || discount === ZERO_MINOR) return zeroAllocations(lines);
  const shares = lines.map((line) => {
    const numerator = line.eligibleMinor * discount;
    return {
      line,
      allocation: numerator / subtotal,
      remainder: numerator % subtotal,
    };
  });
  const initiallyAllocated = shares.reduce((sum, share) => sum + share.allocation, ZERO_MINOR);
  let unitsRemaining = discount - initiallyAllocated;
  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return compareIdentity(left.line.lineId, right.line.lineId);
  });
  for (const share of remainderOrder) {
    if (unitsRemaining === ZERO_MINOR) break;
    share.allocation += ONE_MINOR;
    unitsRemaining -= ONE_MINOR;
  }
  return shares.map(({ line, allocation }) => Object.freeze({
    lineId: line.lineId,
    lineEligibleMinor: line.eligibleMinor,
    lineDiscountMinor: allocation,
  }));
}

function zeroAllocations(lines: readonly EligiblePromotionLine[]): PromotionLineAllocation[] {
  return lines.map((line) => Object.freeze({
    lineId: line.lineId,
    lineEligibleMinor: line.eligibleMinor,
    lineDiscountMinor: ZERO_MINOR,
  }));
}

function compareLineIdentity(left: EligiblePromotionLine, right: EligiblePromotionLine): number {
  return compareIdentity(left.lineId, right.lineId);
}

function compareIdentity(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
