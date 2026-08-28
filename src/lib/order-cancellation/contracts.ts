import type { OrderStatus, RefundAttemptStatus } from "@prisma/client";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CustomerCancellationInput = Readonly<{
  orderId: string;
  requestKey: string;
}>;

export type AuthenticatedCustomerCancellationInput = CustomerCancellationInput & Readonly<{
  requestedByUserId: string;
}>;

export type StartMtoProductionInput = Readonly<{
  orderId: string;
  orderItemId: string;
  requestKey: string;
}>;

export type AuthenticatedStartMtoProductionInput = StartMtoProductionInput & Readonly<{
  startedByUserId: string;
}>;

export type ReplaceCancellationRefundInput = Readonly<{
  orderId: string;
  requestKey: string;
  requestedByAdminUserId: string;
}>;

export type CancellationFailureCode =
  | "INVALID_INPUT"
  | "ORDER_NOT_FOUND_OR_NOT_OWNED"
  | "REQUEST_KEY_CONFLICT"
  | "NOT_ELIGIBLE"
  | "UNSUPPORTED_FULFILLMENT"
  | "MANUFACTURING_STATE_CONFLICT"
  | "REFUND_HISTORY_CONFLICT"
  | "INTAKE_CONFLICT"
  | "PAYMENT_NOT_REFUNDABLE"
  | "DISPUTE_REVIEW_REQUIRED"
  | "PERSISTENCE_CONFLICT";

export type CancellationSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  orderId: string;
  cancellationId: string;
  initialRefundAttemptId: string;
  acceptedAt: Date;
  expectedRefundAmount: number;
  currency: string;
  orderStatus: OrderStatus;
}>;

export type CancellationResult = CancellationSuccess | Readonly<{
  ok: false;
  code: CancellationFailureCode;
  message: string;
}>;

export type ProductionStartResult = Readonly<{
  ok: true;
  replayed: boolean;
  orderId: string;
  orderItemId: string;
  manufacturingRequestId: string;
  startedAt: Date;
}> | Readonly<{
  ok: false;
  code:
    | "INVALID_INPUT"
    | "ORDER_NOT_FOUND"
    | "ITEM_NOT_FOUND"
    | "NOT_MTO"
    | "MANUFACTURING_REQUEST_MISSING"
    | "ORDER_NOT_ELIGIBLE"
    | "ORDER_CANCELLED"
    | "REFUND_IN_PROGRESS"
    | "INTAKE_CONFLICT"
    | "DISPUTE_REVIEW_REQUIRED"
    | "ALREADY_STARTED"
    | "MANUFACTURING_STATE_CONFLICT"
    | "REQUEST_KEY_CONFLICT";
  message: string;
}>;

export type CancellationRefundReplacementResult = Readonly<{
  ok: true;
  replayed: boolean;
  orderId: string;
  refundAttemptId: string;
  amount: number;
  currency: string;
  status: RefundAttemptStatus;
}> | Readonly<{
  ok: false;
  code:
    | "INVALID_INPUT"
    | "ORDER_NOT_FOUND"
    | "ORDER_NOT_CANCELLED"
    | "DISPUTE_REVIEW_REQUIRED"
    | "PAYMENT_NOT_REFUNDABLE"
    | "NO_OUTSTANDING_OBLIGATION"
    | "REFUND_IN_PROGRESS"
    | "REFUND_LEDGER_INCONSISTENT"
    | "REFUND_LINE_LEDGER_INCONSISTENT"
    | "REQUEST_KEY_CONFLICT"
    | "PERSISTENCE_CONFLICT";
  message: string;
}>;

export function normalizeCustomerCancellationInput(
  input: unknown,
): AuthenticatedCustomerCancellationInput | null {
  if (!hasExactKeys(input, ["orderId", "requestKey", "requestedByUserId"])) return null;
  const orderId = canonicalIdentifier(input.orderId);
  const requestedByUserId = canonicalIdentifier(input.requestedByUserId);
  const requestKey = canonicalUuid(input.requestKey);
  return orderId && requestedByUserId && requestKey
    ? { orderId, requestKey, requestedByUserId }
    : null;
}

export function normalizeProductionStartInput(
  input: unknown,
): AuthenticatedStartMtoProductionInput | null {
  if (!hasExactKeys(input, ["orderId", "orderItemId", "requestKey", "startedByUserId"])) return null;
  const orderId = canonicalIdentifier(input.orderId);
  const orderItemId = canonicalIdentifier(input.orderItemId);
  const startedByUserId = canonicalIdentifier(input.startedByUserId);
  const requestKey = canonicalUuid(input.requestKey);
  return orderId && orderItemId && startedByUserId && requestKey
    ? { orderId, orderItemId, requestKey, startedByUserId }
    : null;
}

export function normalizeReplacementInput(
  input: unknown,
): ReplaceCancellationRefundInput | null {
  if (!hasExactKeys(input, ["orderId", "requestKey", "requestedByAdminUserId"])) return null;
  const orderId = canonicalIdentifier(input.orderId);
  const requestedByAdminUserId = canonicalIdentifier(input.requestedByAdminUserId);
  const requestKey = canonicalUuid(input.requestKey);
  return orderId && requestedByAdminUserId && requestKey
    ? { orderId, requestKey, requestedByAdminUserId }
    : null;
}

export function canonicalUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_V4.test(value) ? value : null;
}

function canonicalIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 191) return null;
  return value === value.trim() ? value : null;
}

function hasExactKeys<T extends readonly string[]>(
  value: unknown,
  keys: T,
): value is Record<T[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}
