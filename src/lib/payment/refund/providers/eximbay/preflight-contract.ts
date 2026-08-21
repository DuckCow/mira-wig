import { createHash } from "crypto";
import { PaymentMode, PaymentProvider } from "@prisma/client";
import { requireEximbayCurrency, type EximbayCurrency } from "@/lib/payment/providers/eximbay/types";
import { requireExactText } from "@/lib/payment/providers/eximbay/validation";

export const EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION =
  "refund-provider-eximbay-inquiry/v1";
export const EXIMBAY_REFUND_INQUIRY_PARSER_VERSION =
  "refund-provider-eximbay-inquiry-parser/v1";
export const EXIMBAY_REFUND_OBSERVATION_FINGERPRINT_VERSION =
  "refund-eximbay-preflight-observation/v1";
export const EXIMBAY_REFUND_OPERATION_FAMILY_VERSION = "eximbay-refund-family-v1";
export const EXIMBAY_REFUND_CANCEL_WIRE_VERSION =
  "refund-provider-eximbay-cancel-wire/v1";

const POSTGRES_INT_MAX = 2_147_483_647;
const IDENTIFIER_MAX_BYTES = 512;
const BINDING_LABEL = /^[A-Za-z0-9._-]{1,64}$/u;
const UTF8_ENCODER = new TextEncoder();

export type EximbayRefundType = "F" | "P";

export type EximbayRefundPreflightConfigInput = Readonly<{
  mode: PaymentMode;
  mid: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
}>;

export type EximbayRefundPreflightConfig = Readonly<{
  mode: "SANDBOX";
  mid: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
}>;

export type EximbayRefundPreflightFacts = Readonly<{
  mid: string;
  providerOrderId: string;
  providerTransactionId: string;
  providerStatus: "SALE";
  currency: EximbayCurrency;
  originalAmount: number;
  refundableBalance: number;
}>;

export type EximbayRefundPreflightFactsInput = Readonly<{
  mid: unknown;
  providerOrderId: unknown;
  providerTransactionId: unknown;
  providerStatus: unknown;
  currency: unknown;
  originalAmount: unknown;
  refundableBalance: unknown;
}>;

export type EximbayRefundObservationFingerprintInput = Readonly<{
  refundAttemptId: string;
  commandId: string;
  bindingId: string;
  observingLeaseGeneration: number;
  provider: "EXIMBAY";
  mode: "SANDBOX";
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  wireContractVersion: typeof EXIMBAY_REFUND_CANCEL_WIRE_VERSION;
  facts: EximbayRefundPreflightFacts;
  observedAt: Date;
}>;

export type EximbayRefundClassificationInput = Readonly<{
  requestedAmount: number;
  paymentAmount: number;
  paymentCurrency: string;
  successfulRefundAmount: number;
  historyCoherent: boolean;
  observation: EximbayRefundPreflightFacts;
}>;

export type EximbayRefundClassification =
  | Readonly<{ ok: true; refundType: EximbayRefundType }>
  | Readonly<{ ok: false; code: "REFUND_NOT_LAWFUL" }>;

export function createEximbayRefundPreflightConfig(
  input: EximbayRefundPreflightConfigInput,
): EximbayRefundPreflightConfig {
  if (input.mode !== PaymentMode.SANDBOX) throw new Error("INVALID_EXIMBAY_REFUND_MODE");
  const mid = boundedIdentifier(input.mid);
  if (!mid) throw new Error("INVALID_EXIMBAY_REFUND_MID");
  if (!BINDING_LABEL.test(input.merchantAccountBindingId)
    || !BINDING_LABEL.test(input.credentialGenerationBindingId)) {
    throw new Error("INVALID_EXIMBAY_REFUND_BINDING");
  }
  return Object.freeze({
    mode: PaymentMode.SANDBOX,
    mid,
    merchantAccountBindingId: input.merchantAccountBindingId,
    credentialGenerationBindingId: input.credentialGenerationBindingId,
  });
}

export function boundedEximbayRefundIdentifier(value: unknown): string | null {
  return boundedIdentifier(value);
}

export function normalizeEximbayRefundPreflightFacts(
  input: EximbayRefundPreflightFactsInput,
): EximbayRefundPreflightFacts | null {
  const mid = boundedIdentifier(input.mid);
  const providerOrderId = boundedIdentifier(input.providerOrderId);
  const providerTransactionId = boundedIdentifier(input.providerTransactionId);
  const currency = admittedCurrency(input.currency);
  const amounts = admittedAmounts(input.originalAmount, input.refundableBalance);
  if ([mid, providerOrderId, providerTransactionId, currency].some((value) => value === null)) {
    return null;
  }
  if (input.providerStatus !== "SALE" || !amounts) return null;
  if (!mid || !providerOrderId || !providerTransactionId || !currency) return null;
  return Object.freeze({
    mid,
    providerOrderId,
    providerTransactionId,
    providerStatus: "SALE",
    currency,
    originalAmount: amounts.originalAmount,
    refundableBalance: amounts.refundableBalance,
  });
}

export function serializeEximbayRefundObservationFingerprint(
  input: EximbayRefundObservationFingerprintInput,
): string {
  const facts = normalizeEximbayRefundPreflightFacts(input.facts);
  if (!facts || !validFingerprintAuthority(input)) {
    throw new Error("INVALID_EXIMBAY_REFUND_OBSERVATION_FINGERPRINT_INPUT");
  }
  return JSON.stringify([
    EXIMBAY_REFUND_OBSERVATION_FINGERPRINT_VERSION,
    input.refundAttemptId,
    input.commandId,
    input.bindingId,
    input.observingLeaseGeneration,
    input.provider,
    input.mode,
    input.merchantAccountBindingId,
    input.credentialGenerationBindingId,
    input.wireContractVersion,
    EXIMBAY_REFUND_INQUIRY_CONTRACT_VERSION,
    EXIMBAY_REFUND_INQUIRY_PARSER_VERSION,
    facts.mid,
    facts.providerOrderId,
    facts.providerTransactionId,
    facts.providerStatus,
    facts.currency,
    facts.originalAmount,
    facts.refundableBalance,
    input.observedAt.toISOString(),
  ]);
}

export function fingerprintEximbayRefundObservation(
  input: EximbayRefundObservationFingerprintInput,
): string {
  return createHash("sha256")
    .update(serializeEximbayRefundObservationFingerprint(input), "utf8")
    .digest("hex");
}

export function classifyEximbayRefundType(
  input: EximbayRefundClassificationInput,
): EximbayRefundClassification {
  if (!classificationIsLawful(input)) return blockedClassification();
  const full = input.requestedAmount === input.observation.originalAmount
    && input.successfulRefundAmount === 0
    && input.observation.refundableBalance === input.observation.originalAmount;
  return Object.freeze({ ok: true, refundType: full ? "F" : "P" });
}

export function deriveEximbayRefundOperationFamily(
  refundAttemptIdempotencyKey: string,
  providerTransactionId: string,
  amount: number,
  currency: string,
): Readonly<{ key: string; fingerprint: string }> {
  const logicalKey = exactText(refundAttemptIdempotencyKey);
  const transactionId = boundedIdentifier(providerTransactionId);
  if (!logicalKey || !transactionId || !positivePostgresInteger(amount)) {
    throw new Error("INVALID_EXIMBAY_REFUND_OPERATION_FAMILY");
  }
  let admittedCurrency: EximbayCurrency;
  try {
    admittedCurrency = requireEximbayCurrency(currency);
  } catch {
    throw new Error("INVALID_EXIMBAY_REFUND_OPERATION_FAMILY");
  }
  const preimage = JSON.stringify([
    EXIMBAY_REFUND_OPERATION_FAMILY_VERSION,
    logicalKey,
    transactionId,
    amount,
    admittedCurrency,
  ]);
  const digest = createHash("sha256").update(preimage, "utf8").digest("hex");
  return Object.freeze({
    key: `${EXIMBAY_REFUND_OPERATION_FAMILY_VERSION}-${digest}`,
    fingerprint: digest,
  });
}

function classificationIsLawful(input: EximbayRefundClassificationInput): boolean {
  const observation = normalizeEximbayRefundPreflightFacts(input.observation);
  if (!observation) return false;
  return [
    input.historyCoherent,
    positivePostgresInteger(input.requestedAmount),
    positivePostgresInteger(input.paymentAmount),
    nonnegativePostgresInteger(input.successfulRefundAmount),
    input.paymentCurrency === observation.currency,
    input.paymentAmount === observation.originalAmount,
    observation.refundableBalance > 0,
    input.requestedAmount <= observation.refundableBalance,
    input.successfulRefundAmount <= input.paymentAmount,
    observation.refundableBalance === input.paymentAmount - input.successfulRefundAmount,
  ].every(Boolean);
}

function validFingerprintAuthority(input: EximbayRefundObservationFingerprintInput): boolean {
  return [
    exactText(input.refundAttemptId) !== null,
    exactText(input.commandId) !== null,
    exactText(input.bindingId) !== null,
    positivePostgresInteger(input.observingLeaseGeneration),
    input.provider === PaymentProvider.EXIMBAY,
    input.mode === PaymentMode.SANDBOX,
    BINDING_LABEL.test(input.merchantAccountBindingId),
    BINDING_LABEL.test(input.credentialGenerationBindingId),
    input.wireContractVersion === EXIMBAY_REFUND_CANCEL_WIRE_VERSION,
    Number.isFinite(input.observedAt.getTime()),
  ].every(Boolean);
}

function admittedCurrency(value: unknown): EximbayCurrency | null {
  try {
    return requireEximbayCurrency(value);
  } catch {
    return null;
  }
}

function admittedAmounts(
  originalAmount: unknown,
  refundableBalance: unknown,
): Readonly<{ originalAmount: number; refundableBalance: number }> | null {
  if (!positivePostgresInteger(originalAmount)
    || !nonnegativePostgresInteger(refundableBalance)
    || refundableBalance > originalAmount) return null;
  return Object.freeze({ originalAmount, refundableBalance });
}

function boundedIdentifier(value: unknown): string | null {
  try {
    const text = requireExactText(value, "INVALID_EXIMBAY_REFUND_IDENTIFIER");
    return UTF8_ENCODER.encode(text).byteLength <= IDENTIFIER_MAX_BYTES ? text : null;
  } catch {
    return null;
  }
}

function exactText(value: unknown): string | null {
  try {
    return requireExactText(value, "INVALID_EXIMBAY_REFUND_TEXT");
  } catch {
    return null;
  }
}

function positivePostgresInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 1 && value <= POSTGRES_INT_MAX;
}

function nonnegativePostgresInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 0 && value <= POSTGRES_INT_MAX;
}

function blockedClassification(): EximbayRefundClassification {
  return Object.freeze({ ok: false, code: "REFUND_NOT_LAWFUL" });
}
