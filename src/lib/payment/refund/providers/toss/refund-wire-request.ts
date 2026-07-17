import { isTossRefundPaymentKey } from "./refund-eligibility";
import { isTossRefundProviderOperationKey } from "./refund-operation-key";

export const TOSS_REFUND_CANCEL_REASON = "Mira merchant refund";
const WIRE_INPUT_FIELDS = ["paymentKey", "providerOperationKey", "cancelAmount"] as const;
const POSTGRES_INT_MAX = 2_147_483_647;

type WireInputRecord = Record<(typeof WIRE_INPUT_FIELDS)[number], unknown>;

export type NormalizedTossRefundWireInput = Readonly<{
  paymentKey: string;
  providerOperationKey: string;
  cancelAmount: number;
}>;

export type TossRefundCancellationWireRequest = Readonly<{
  method: "POST";
  path: string;
  contentType: "application/json";
  idempotencyKey: string;
  body: Readonly<{
    cancelReason: typeof TOSS_REFUND_CANCEL_REASON;
    cancelAmount: number;
  }>;
}>;

export class TossRefundWireInputError extends Error {
  constructor() {
    super("Toss refund wire input is invalid.");
    this.name = "TossRefundWireInputError";
  }
}

export function deriveTossRefundCancellationWireRequest(
  input: unknown,
): TossRefundCancellationWireRequest {
  const facts = normalizeTossRefundWireInput(input);
  const body = Object.freeze({
    cancelReason: TOSS_REFUND_CANCEL_REASON,
    cancelAmount: facts.cancelAmount,
  });
  return Object.freeze({
    method: "POST",
    path: `/v1/payments/${encodeURIComponent(facts.paymentKey)}/cancel`,
    contentType: "application/json",
    idempotencyKey: facts.providerOperationKey,
    body,
  });
}

export function normalizeTossRefundWireInput(input: unknown): NormalizedTossRefundWireInput {
  if (!hasExactEnumerableFields(input)) throw new TossRefundWireInputError();
  if (!isTossRefundPaymentKey(input.paymentKey)) throw new TossRefundWireInputError();
  if (!isTossRefundProviderOperationKey(input.providerOperationKey)) {
    throw new TossRefundWireInputError();
  }
  if (!isPositivePostgresInteger(input.cancelAmount)) throw new TossRefundWireInputError();
  return Object.freeze({
    paymentKey: input.paymentKey,
    providerOperationKey: input.providerOperationKey,
    cancelAmount: input.cancelAmount,
  });
}

function hasExactEnumerableFields(value: unknown): value is WireInputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value)
    .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
  return keys.length === WIRE_INPUT_FIELDS.length
    && keys.every((key) => (
      typeof key === "string" && WIRE_INPUT_FIELDS.some((field) => field === key)
    ));
}

function isPositivePostgresInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= POSTGRES_INT_MAX;
}
