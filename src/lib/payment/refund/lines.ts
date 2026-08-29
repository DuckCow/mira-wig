import { RefundAttemptStatus } from "@prisma/client";
import { isGuardedRefundAttemptStatus } from "./invariants";

export const POSTGRES_INT_MAX = 2_147_483_647;

export interface RefundLineInput {
  readonly orderItemId: string;
  readonly quantity: number;
  readonly merchandiseRefundAmount?: number;
}

export interface CanonicalRefundLine {
  readonly orderItemId: string;
  readonly quantity: number;
  readonly merchandiseRefundAmount?: number;
}

export type NormalizeRefundLinesResult =
  | { ok: true; lines: readonly CanonicalRefundLine[] }
  | { ok: false; code: "INVALID_REFUND_LINES"; message: string };

export function normalizeRefundLines(
  input: unknown,
  options: { readonly allowEmpty: boolean } = { allowEmpty: false },
): NormalizeRefundLinesResult {
  if (!Array.isArray(input) || (!options.allowEmpty && input.length === 0)) {
    return invalidLines("Refund line selection must contain at least one item.");
  }
  const seen = new Set<string>();
  const lines: CanonicalRefundLine[] = [];
  for (const line of input) {
    const normalized = normalizeRefundLine(line);
    if (!normalized.ok) return normalized;
    if (seen.has(normalized.line.orderItemId)) {
      return invalidLines("Duplicate refund line items are not allowed.");
    }
    seen.add(normalized.line.orderItemId);
    lines.push(normalized.line);
  }
  lines.sort((left, right) => (
    left.orderItemId < right.orderItemId ? -1 : left.orderItemId > right.orderItemId ? 1 : 0
  ));
  return { ok: true, lines: Object.freeze(lines) };
}

export function sameCanonicalRefundLines(
  left: readonly RefundLineInput[],
  right: readonly RefundLineInput[],
): boolean {
  const canonicalLeft = normalizeRefundLines(
    left.map(canonicalComparableLine),
    { allowEmpty: true },
  );
  const canonicalRight = normalizeRefundLines(
    right.map(canonicalComparableLine),
    { allowEmpty: true },
  );
  if (!canonicalLeft.ok || !canonicalRight.ok || canonicalLeft.lines.length !== canonicalRight.lines.length) {
    return false;
  }
  return canonicalLeft.lines.every((line, index) => (
    line.orderItemId === canonicalRight.lines[index]?.orderItemId
      && line.quantity === canonicalRight.lines[index]?.quantity
      && line.merchandiseRefundAmount
        === canonicalRight.lines[index]?.merchandiseRefundAmount
  ));
}

export interface RefundLineCapacityItem {
  readonly id: string;
  readonly quantity: number;
}

export interface RefundLineCapacityAttempt {
  readonly status: RefundAttemptStatus;
  readonly lines: readonly RefundLineCapacityEntry[];
}

export interface RefundLineCapacityEntry {
  readonly orderItemId: string;
  readonly orderId: string;
  readonly quantity: number;
}

export type RefundLineCapacityResult =
  | { ok: true; remainingByOrderItemId: ReadonlyMap<string, number> }
  | { ok: false; code: "REFUND_LINE_HISTORY_UNATTRIBUTED" | "REFUND_LINE_LEDGER_INCONSISTENT" };

export function deriveRefundLineCapacity(
  orderId: string,
  items: readonly RefundLineCapacityItem[],
  attempts: readonly RefundLineCapacityAttempt[],
): RefundLineCapacityResult {
  const ordered = orderedQuantities(items);
  if (!ordered.ok) return ordered;
  const guarded = guardedQuantities(orderId, ordered.quantities, attempts);
  if (!guarded.ok) return guarded;
  return {
    ok: true,
    remainingByOrderItemId: new Map(
      items.map((item) => [item.id, item.quantity - (guarded.quantities.get(item.id) ?? 0)]),
    ),
  };
}

function normalizeRefundLine(
  value: unknown,
): { ok: true; line: CanonicalRefundLine } | Extract<NormalizeRefundLinesResult, { ok: false }> {
  if (!isPlainRefundLine(value)) return invalidLines("Refund line selection is invalid.");
  const orderItemId = typeof value.orderItemId === "string" ? value.orderItemId.trim() : "";
  if (!orderItemId || !isPositivePostgresInteger(value.quantity)) {
    return invalidLines("Refund line item and quantity must be valid.");
  }
  if (
    "merchandiseRefundAmount" in value
    && !isNonnegativePostgresInteger(value.merchandiseRefundAmount)
  ) {
    return invalidLines("Refund line economic allocation must be a nonnegative integer.");
  }
  const line = "merchandiseRefundAmount" in value
    ? { orderItemId, quantity: value.quantity, merchandiseRefundAmount: value.merchandiseRefundAmount }
    : { orderItemId, quantity: value.quantity };
  return { ok: true, line: Object.freeze(line) };
}

type QuantityMapResult =
  | { ok: true; quantities: ReadonlyMap<string, number> }
  | { ok: false; code: "REFUND_LINE_HISTORY_UNATTRIBUTED" | "REFUND_LINE_LEDGER_INCONSISTENT" };

function orderedQuantities(items: readonly RefundLineCapacityItem[]): QuantityMapResult {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!isPositivePostgresInteger(item.quantity) || quantities.has(item.id)) {
      return { ok: false, code: "REFUND_LINE_LEDGER_INCONSISTENT" };
    }
    quantities.set(item.id, item.quantity);
  }
  return { ok: true, quantities };
}

function guardedQuantities(
  orderId: string,
  ordered: ReadonlyMap<string, number>,
  attempts: readonly RefundLineCapacityAttempt[],
): QuantityMapResult {
  const quantities = new Map<string, number>();
  for (const attempt of attempts) {
    if (!isGuardedRefundAttemptStatus(attempt.status)) continue;
    if (attempt.lines.length === 0) return { ok: false, code: "REFUND_LINE_HISTORY_UNATTRIBUTED" };
    const failure = addGuardedAttempt(orderId, ordered, quantities, attempt.lines);
    if (failure) return failure;
  }
  return { ok: true, quantities };
}

function addGuardedAttempt(
  orderId: string,
  ordered: ReadonlyMap<string, number>,
  guarded: Map<string, number>,
  lines: readonly RefundLineCapacityEntry[],
): Extract<QuantityMapResult, { ok: false }> | null {
  for (const line of lines) {
    const orderedQuantity = ordered.get(line.orderItemId);
    if (line.orderId !== orderId || orderedQuantity === undefined || !isPositivePostgresInteger(line.quantity)) {
      return { ok: false, code: "REFUND_LINE_LEDGER_INCONSISTENT" };
    }
    const next = (guarded.get(line.orderItemId) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(next) || next > orderedQuantity) {
      return { ok: false, code: "REFUND_LINE_LEDGER_INCONSISTENT" };
    }
    guarded.set(line.orderItemId, next);
  }
  return null;
}

function isPositivePostgresInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POSTGRES_INT_MAX;
}

function isNonnegativePostgresInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 0 && value <= POSTGRES_INT_MAX;
}

function isPlainRefundLine(value: unknown): value is RefundLineInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(["orderItemId", "quantity", "merchandiseRefundAmount"]);
  return [
    keys.length === 2 || keys.length === 3,
    keys.includes("orderItemId"),
    keys.includes("quantity"),
    keys.every((key) => typeof key === "string" && allowed.has(key)),
  ].every(Boolean);
}

function canonicalComparableLine(line: RefundLineInput): RefundLineInput {
  return line.merchandiseRefundAmount === undefined
    ? { orderItemId: line.orderItemId, quantity: line.quantity }
    : {
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        merchandiseRefundAmount: line.merchandiseRefundAmount,
      };
}

function invalidLines(message: string): Extract<NormalizeRefundLinesResult, { ok: false }> {
  return { ok: false, code: "INVALID_REFUND_LINES", message };
}
