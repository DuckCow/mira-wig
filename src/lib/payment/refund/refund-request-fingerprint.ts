import { createHash } from "crypto";
import {
  PaymentMode,
  PaymentProvider,
} from "@prisma/client";

const SERIALIZATION_VERSION = "refund-provider-request/v1";
const POSTGRES_INT_MAX = 2_147_483_647;

export type RefundRequestFingerprintInput = Readonly<{
  provider: PaymentProvider;
  mode: PaymentMode;
  providerPaymentReference: string;
  amountMinor: number;
  currency: string;
  providerOperationKey: string;
}>;

export type CanonicalRefundRequestFacts = Readonly<{
  provider: PaymentProvider;
  mode: PaymentMode;
  providerPaymentReference: string;
  amountMinor: number;
  currency: string;
  providerOperationKey: string;
}>;

export class RefundRequestFingerprintInputError extends Error {
  constructor() {
    super("Refund request fingerprint input is invalid.");
    this.name = "RefundRequestFingerprintInputError";
  }
}

export function normalizeRefundRequestFingerprintInput(
  input: RefundRequestFingerprintInput,
): CanonicalRefundRequestFacts {
  const providerPaymentReference = normalizeOpaque(input.providerPaymentReference);
  const providerOperationKey = normalizeOpaque(input.providerOperationKey);
  const currency = normalizeCurrency(input.currency);
  if (!Object.values(PaymentProvider).includes(input.provider)
    || !Object.values(PaymentMode).includes(input.mode)
    || !providerPaymentReference || !providerOperationKey || !currency
    || !isPositivePostgresInteger(input.amountMinor)) {
    throw new RefundRequestFingerprintInputError();
  }
  return Object.freeze({
    provider: input.provider,
    mode: input.mode,
    providerPaymentReference,
    amountMinor: input.amountMinor,
    currency,
    providerOperationKey,
  });
}

export function serializeRefundRequestFingerprintInput(
  input: RefundRequestFingerprintInput,
): string {
  const facts = normalizeRefundRequestFingerprintInput(input);
  return JSON.stringify([
    SERIALIZATION_VERSION,
    facts.provider,
    facts.mode,
    facts.providerPaymentReference,
    facts.amountMinor,
    facts.currency,
    facts.providerOperationKey,
  ]);
}

export function fingerprintRefundRequest(input: RefundRequestFingerprintInput): string {
  return createHash("sha256")
    .update(serializeRefundRequestFingerprintInput(input), "utf8")
    .digest("hex");
}

function normalizeOpaque(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCurrency(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function isPositivePostgresInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= POSTGRES_INT_MAX;
}
