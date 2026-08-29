import { RefundAttemptStatus, type RefundAttemptLineEconomicAllocation } from "@prisma/client";
import {
  expectedMerchandiseRefundAmount,
  incrementalDiscountReversal,
} from "./economic-allocation";
import type { CanonicalRefundLine } from "./lines";

interface EconomicOrderItem {
  readonly id: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly discountAmount: number;
}

interface HistoricalEconomicLine {
  readonly orderItemId: string;
  readonly quantity: number;
  readonly economicAllocation: RefundAttemptLineEconomicAllocation | null;
}

interface HistoricalEconomicAttempt {
  readonly id: string;
  readonly amount: number;
  readonly status: RefundAttemptStatus;
  readonly processedAt: Date | null;
  readonly lines: readonly HistoricalEconomicLine[];
}

export interface RefundEconomicOrder {
  readonly promotionGrantId: string | null;
  readonly discountAmount: number;
  readonly items: readonly EconomicOrderItem[];
  readonly refundAttempts: readonly HistoricalEconomicAttempt[];
}

export type RefundEconomicFailureCode =
  | "REFUND_ECONOMIC_ALLOCATION_REQUIRED"
  | "REFUND_ECONOMIC_ALLOCATION_UNEXPECTED"
  | "REFUND_ECONOMIC_ALLOCATION_MISMATCH"
  | "REFUND_PROMOTION_SNAPSHOT_INCONSISTENT"
  | "REFUND_ECONOMIC_HISTORY_INCONSISTENT";

export type RefundEconomicValidation =
  | { ok: true }
  | { ok: false; code: RefundEconomicFailureCode; message: string };

export type DeriveRefundEconomicLinesResult =
  | { ok: true; lines: readonly CanonicalRefundLine[] }
  | Extract<RefundEconomicValidation, { ok: false }>;

export function deriveRefundEconomicLines(
  order: RefundEconomicOrder,
  requestedAmount: number,
  requestedLines: readonly Readonly<{ orderItemId: string; quantity: number }>[],
): DeriveRefundEconomicLinesResult {
  if (order.promotionGrantId === null) return { ok: true, lines: requestedLines };
  const items = coherentCouponItems(order);
  if (!items.ok) return items;
  const succeeded = validateSucceededHistory(order.refundAttempts, items.items);
  if (!succeeded.ok) return succeeded;
  const lines: CanonicalRefundLine[] = [];
  for (const line of requestedLines) {
    const derived = deriveEconomicLine(line, items.items, succeeded.refundedQuantities);
    if (!derived.ok) return derived;
    lines.push(derived.line);
  }
  const validation = validateLines(
    lines,
    requestedAmount,
    items.items,
    succeeded.refundedQuantities,
    "REFUND_ECONOMIC_ALLOCATION_REQUIRED",
    "REFUND_ECONOMIC_ALLOCATION_MISMATCH",
  );
  return validation.ok ? { ok: true, lines: Object.freeze(lines) } : validation;
}

export function validateRefundEconomicAllocation(
  order: RefundEconomicOrder,
  requestedAmount: number,
  requestedLines: readonly CanonicalRefundLine[],
): RefundEconomicValidation {
  if (order.promotionGrantId === null) return validateNonCouponLines(requestedLines);
  const items = coherentCouponItems(order);
  if (!items.ok) return items;
  const succeeded = validateSucceededHistory(order.refundAttempts, items.items);
  if (!succeeded.ok) return succeeded;
  return validateLines(
    requestedLines,
    requestedAmount,
    items.items,
    succeeded.refundedQuantities,
    "REFUND_ECONOMIC_ALLOCATION_REQUIRED",
    "REFUND_ECONOMIC_ALLOCATION_MISMATCH",
  );
}

function validateNonCouponLines(
  lines: readonly CanonicalRefundLine[],
): RefundEconomicValidation {
  return lines.some((line) => line.merchandiseRefundAmount !== undefined)
    ? failure("REFUND_ECONOMIC_ALLOCATION_UNEXPECTED", "Non-coupon refunds must not carry coupon economic allocation.")
    : { ok: true };
}

type CouponItemsResult =
  | { ok: true; items: ReadonlyMap<string, EconomicOrderItem> }
  | Extract<RefundEconomicValidation, { ok: false }>;

function coherentCouponItems(order: RefundEconomicOrder): CouponItemsResult {
  const items = new Map<string, EconomicOrderItem>();
  let discountTotal = 0;
  for (const item of order.items) {
    if (items.has(item.id) || !isCoherentCouponItem(item)) return promotionSnapshotFailure();
    items.set(item.id, item);
    discountTotal += item.discountAmount;
  }
  if (order.discountAmount <= 0 || discountTotal !== order.discountAmount) {
    return promotionSnapshotFailure();
  }
  return { ok: true, items };
}

type HistoryResult =
  | { ok: true; refundedQuantities: ReadonlyMap<string, number> }
  | Extract<RefundEconomicValidation, { ok: false }>;

function validateSucceededHistory(
  attempts: readonly HistoricalEconomicAttempt[],
  items: ReadonlyMap<string, EconomicOrderItem>,
): HistoryResult {
  const refundedQuantities = new Map<string, number>();
  const succeeded = attempts.filter((attempt) => attempt.status === RefundAttemptStatus.SUCCEEDED)
    .sort(compareSucceededAttempts);
  for (const attempt of succeeded) {
    if (attempt.processedAt === null) return economicHistoryFailure();
    const result = validateLines(
      attempt.lines.map(historicalLineInput),
      attempt.amount,
      items,
      refundedQuantities,
      "REFUND_ECONOMIC_HISTORY_INCONSISTENT",
      "REFUND_ECONOMIC_HISTORY_INCONSISTENT",
    );
    if (!result.ok) return economicHistoryFailure();
    for (const line of attempt.lines) {
      refundedQuantities.set(
        line.orderItemId,
        (refundedQuantities.get(line.orderItemId) ?? 0) + line.quantity,
      );
    }
  }
  return { ok: true, refundedQuantities };
}

function validateLines(
  lines: readonly CanonicalRefundLine[],
  attemptAmount: number,
  items: ReadonlyMap<string, EconomicOrderItem>,
  refundedQuantities: ReadonlyMap<string, number>,
  missingCode: RefundEconomicFailureCode,
  mismatchCode: RefundEconomicFailureCode,
): RefundEconomicValidation {
  let merchandiseTotal = 0;
  for (const line of lines) {
    const validated = validateEconomicLine(line, items, refundedQuantities, missingCode, mismatchCode);
    if (!validated.ok) return validated;
    merchandiseTotal += validated.amount;
  }
  if (!Number.isSafeInteger(merchandiseTotal) || merchandiseTotal > attemptAmount) {
    return failure(mismatchCode, "Refund line economic allocation exceeds the aggregate refund amount.");
  }
  return { ok: true };
}

function deriveEconomicLine(
  line: Readonly<{ orderItemId: string; quantity: number }>,
  items: ReadonlyMap<string, EconomicOrderItem>,
  refundedQuantities: ReadonlyMap<string, number>,
): { ok: true; line: CanonicalRefundLine } | Extract<RefundEconomicValidation, { ok: false }> {
  const item = items.get(line.orderItemId);
  if (!item) return promotionSnapshotFailure();
  const maximum = maximumLineAmount(item, refundedQuantities.get(item.id) ?? 0, line.quantity);
  return maximum.ok
    ? { ok: true, line: { ...line, merchandiseRefundAmount: maximum.amount } }
    : economicHistoryFailure();
}

function isCoherentCouponItem(item: EconomicOrderItem): boolean {
  const scalarShape = [
    item.id.length > 0,
    Number.isInteger(item.quantity),
    item.quantity > 0,
    Number.isInteger(item.unitAmount),
    item.unitAmount >= 0,
    Number.isInteger(item.discountAmount),
    item.discountAmount >= 0,
  ].every(Boolean);
  return scalarShape
    && BigInt(item.discountAmount) <= BigInt(item.unitAmount) * BigInt(item.quantity);
}

function validateEconomicLine(
  line: CanonicalRefundLine,
  items: ReadonlyMap<string, EconomicOrderItem>,
  refundedQuantities: ReadonlyMap<string, number>,
  missingCode: RefundEconomicFailureCode,
  mismatchCode: RefundEconomicFailureCode,
): { ok: true; amount: number } | Extract<RefundEconomicValidation, { ok: false }> {
  const item = items.get(line.orderItemId);
  if (!item || line.merchandiseRefundAmount === undefined) {
    return failure(missingCode, "Every coupon refund line requires an economic allocation.");
  }
  const maximum = maximumLineAmount(item, refundedQuantities.get(item.id) ?? 0, line.quantity);
  if (!maximum.ok || line.merchandiseRefundAmount > maximum.amount) {
    return failure(mismatchCode, "Refund line economic allocation exceeds its frozen merchandise tranche.");
  }
  return { ok: true, amount: line.merchandiseRefundAmount };
}

function maximumLineAmount(
  item: EconomicOrderItem,
  previouslyRefunded: number,
  refundQuantity: number,
) {
  const discount = incrementalDiscountReversal(
    item.discountAmount,
    item.quantity,
    previouslyRefunded,
    refundQuantity,
  );
  if (!discount.ok) return discount;
  return expectedMerchandiseRefundAmount(item.unitAmount, refundQuantity, discount.amount);
}

function historicalLineInput(line: HistoricalEconomicLine): CanonicalRefundLine {
  const merchandiseRefundAmount = line.economicAllocation?.merchandiseRefundAmount;
  return merchandiseRefundAmount === undefined
    ? { orderItemId: line.orderItemId, quantity: line.quantity }
    : { orderItemId: line.orderItemId, quantity: line.quantity, merchandiseRefundAmount };
}

function compareSucceededAttempts(
  left: HistoricalEconomicAttempt,
  right: HistoricalEconomicAttempt,
): number {
  const time = (left.processedAt?.getTime() ?? 0) - (right.processedAt?.getTime() ?? 0);
  if (time !== 0) return time;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function promotionSnapshotFailure(): Extract<RefundEconomicValidation, { ok: false }> {
  return failure("REFUND_PROMOTION_SNAPSHOT_INCONSISTENT", "Coupon Order economics are inconsistent; manual review is required.");
}

function economicHistoryFailure(): Extract<RefundEconomicValidation, { ok: false }> {
  return failure("REFUND_ECONOMIC_HISTORY_INCONSISTENT", "Historical coupon refund economics are inconsistent; manual review is required.");
}

function failure(
  code: RefundEconomicFailureCode,
  message: string,
): Extract<RefundEconomicValidation, { ok: false }> {
  return { ok: false, code, message };
}
