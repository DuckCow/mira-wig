import { EximbayProtocolError } from "./errors";
import { requireEximbayMode, type EximbayPaymentMode } from "./types";
import { isRecord, requireExactKeys } from "./validation";

const providerVerifiedStatusBrand: unique symbol = Symbol("ProviderVerifiedEximbayStatus");
const authorizedVerifiedStatuses = new WeakSet<object>();

const VERIFIED_STATUS_KEYS: readonly string[] = [
  "transactionType",
  "rescode",
  "mid",
  "orderId",
  "currency",
  "amount",
  "correlation",
];
const VERIFIED_STATUS_OPTIONAL_KEYS: readonly string[] = ["status", "transactionId"];
const CORRELATION_KEYS: readonly string[] = ["paymentIdentity", "provider", "mode"];

export interface ProviderVerifiedEximbayStatus {
  readonly authority: "PROVIDER_VERIFIED_STATUS";
  readonly transactionType: string;
  readonly rescode: string;
  readonly status?: string;
  readonly mid: string;
  readonly orderId: string;
  readonly currency: string;
  readonly amount: string;
  readonly transactionId?: string;
  readonly correlation: {
    readonly paymentIdentity: string;
    readonly provider: string;
    readonly mode: EximbayPaymentMode;
  };
  readonly [providerVerifiedStatusBrand]: true;
}

export function createProviderVerifiedEximbayStatus(input: unknown): ProviderVerifiedEximbayStatus {
  if (!isRecord(input)) throw new EximbayProtocolError("INVALID_VERIFIED_STATUS");
  requireExactKeys(input, VERIFIED_STATUS_KEYS, VERIFIED_STATUS_OPTIONAL_KEYS);
  if (!isRecord(input.correlation)) throw new EximbayProtocolError("INVALID_VERIFIED_CORRELATION");
  requireExactKeys(input.correlation, CORRELATION_KEYS);
  const status = optionalString(input.status, "INVALID_VERIFIED_STATUS_VALUE");
  const transactionId = optionalString(input.transactionId, "INVALID_VERIFIED_TRANSACTION_ID");
  const verified: ProviderVerifiedEximbayStatus = {
    authority: "PROVIDER_VERIFIED_STATUS",
    transactionType: requireString(input.transactionType, "INVALID_VERIFIED_TRANSACTION_TYPE"),
    rescode: requireString(input.rescode, "INVALID_VERIFIED_RESCODE"),
    mid: requireString(input.mid, "INVALID_VERIFIED_MID"),
    orderId: requireString(input.orderId, "INVALID_VERIFIED_ORDER_ID"),
    currency: requireString(input.currency, "INVALID_VERIFIED_CURRENCY"),
    amount: requireString(input.amount, "INVALID_VERIFIED_AMOUNT"),
    correlation: Object.freeze({
      paymentIdentity: requireString(
        input.correlation.paymentIdentity,
        "INVALID_VERIFIED_PAYMENT_IDENTITY",
      ),
      provider: requireString(input.correlation.provider, "INVALID_VERIFIED_PROVIDER"),
      mode: requireEximbayMode(input.correlation.mode),
    }),
    ...(status === undefined ? {} : { status }),
    ...(transactionId === undefined ? {} : { transactionId }),
    [providerVerifiedStatusBrand]: true,
  };
  Object.defineProperty(verified, providerVerifiedStatusBrand, { enumerable: false });
  authorizedVerifiedStatuses.add(verified);
  return Object.freeze(verified);
}

function optionalString(value: unknown, code: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, code);
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string") throw new EximbayProtocolError(code);
  return value;
}

export function requireProviderVerifiedEximbayStatus(
  value: unknown,
): asserts value is ProviderVerifiedEximbayStatus {
  if (typeof value !== "object" || value === null || !authorizedVerifiedStatuses.has(value)) {
    throw new EximbayProtocolError("UNTRUSTED_VERIFIED_STATUS");
  }
}
