import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EximbayProtocolError } from "@/lib/payment/providers/eximbay/errors";
import { EXIMBAY_RAW_QUERY_MAX_BYTES } from "@/lib/payment/providers/eximbay/status";
import { hasProhibitedDecodedCharacter, isRecord, requireExactKeys } from "@/lib/payment/providers/eximbay/validation";

export const EXIMBAY_BF4_EVENT_TYPE = "EXIMBAY_STATUS_V1";
export const EXIMBAY_BF4_SCHEMA = "mira.eximbay.bf4-event";
export const EXIMBAY_BF4_VERSION = 1;

export const EximbayBf4Stage = Object.freeze({
  CLAIMED_PRE_VERIFY: "CLAIMED_PRE_VERIFY",
  VERIFY_OUTCOME_UNKNOWN: "VERIFY_OUTCOME_UNKNOWN",
  VERIFIED_PENDING_RETRIEVE: "VERIFIED_PENDING_RETRIEVE",
  RETRIEVE_OUTCOME_UNKNOWN: "RETRIEVE_OUTCOME_UNKNOWN",
  VERIFIED_SALE_PENDING_COMPLETION: "VERIFIED_SALE_PENDING_COMPLETION",
  VERIFIED_NON_SALE_REQUIRES_ADJUDICATION: "VERIFIED_NON_SALE_REQUIRES_ADJUDICATION",
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION: "VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION",
  COMPLETION_RETRYABLE: "COMPLETION_RETRYABLE",
  TERMINAL_PROCESSED: "TERMINAL_PROCESSED",
  TERMINAL_REJECTED: "TERMINAL_REJECTED",
});

export type EximbayBf4Stage = (typeof EximbayBf4Stage)[keyof typeof EximbayBf4Stage];
export type EximbayBf4VerificationDisposition =
  | "NOT_ATTEMPTED"
  | "OUTCOME_UNKNOWN"
  | "ADMITTED"
  | "DEFINITIVELY_REJECTED";
export type EximbayBf4RetrievalDisposition =
  | "NOT_ATTEMPTED"
  | "OUTCOME_UNKNOWN"
  | "ADMITTED_NON_SALE"
  | "ADMITTED_SALE"
  | "ADMITTED_SALE_MISMATCH";
export type EximbayBf4DiagnosticCode =
  | "VERIFY_AMBIGUOUS"
  | "RETRIEVE_AMBIGUOUS"
  | "NON_SALE"
  | "SALE_IDENTITY_MISMATCH"
  | "SALE_MONEY_MISMATCH"
  | "COMPLETION_RETRYABLE"
  | "COMPLETION_TERMINAL"
  | "DEFINITIVE_REJECT";

const EximbayBf4Diagnostic = Object.freeze({
  VERIFY_AMBIGUOUS: "VERIFY_AMBIGUOUS",
  RETRIEVE_AMBIGUOUS: "RETRIEVE_AMBIGUOUS",
  NON_SALE: "NON_SALE",
  SALE_IDENTITY_MISMATCH: "SALE_IDENTITY_MISMATCH",
  SALE_MONEY_MISMATCH: "SALE_MONEY_MISMATCH",
  COMPLETION_RETRYABLE: "COMPLETION_RETRYABLE",
  COMPLETION_TERMINAL: "COMPLETION_TERMINAL",
  DEFINITIVE_REJECT: "DEFINITIVE_REJECT",
});

export interface EximbayBf4Candidate {
  readonly orderId?: string;
  readonly transactionId?: string;
  readonly resultCode?: string;
}

export interface EximbayBf4SaleFacts {
  readonly mid: string;
  readonly providerOrderId: string;
  readonly transactionId: string;
  readonly currency: string;
  readonly amountWire: string;
  readonly amountMinor: number;
  readonly status: "SALE" | "AUTH" | "REGISTERED" | "NONE";
  readonly transactionDate: string;
}

export interface EximbayBf4Timestamps {
  readonly receivedAt: string;
  readonly stageChangedAt: string;
  readonly verifyContactMarkedAt?: string;
  readonly retrieveContactMarkedAt?: string;
  readonly terminalAt?: string;
}

export interface EximbayBf4Envelope {
  readonly schema: typeof EXIMBAY_BF4_SCHEMA;
  readonly version: typeof EXIMBAY_BF4_VERSION;
  readonly stage: EximbayBf4Stage;
  readonly exactRawQuery?: string;
  readonly exactRawSha256: string;
  readonly candidate?: EximbayBf4Candidate;
  readonly verification: EximbayBf4VerificationDisposition;
  readonly retrieval: EximbayBf4RetrievalDisposition;
  readonly saleFacts?: EximbayBf4SaleFacts;
  readonly timestamps: EximbayBf4Timestamps;
  readonly diagnostic?: EximbayBf4DiagnosticCode;
}

const ENVELOPE_REQUIRED_KEYS: readonly string[] = [
  "schema",
  "version",
  "stage",
  "exactRawSha256",
  "verification",
  "retrieval",
  "timestamps",
];
const ENVELOPE_OPTIONAL_KEYS: readonly string[] = [
  "exactRawQuery",
  "candidate",
  "saleFacts",
  "diagnostic",
];
const CANDIDATE_KEYS: readonly string[] = ["orderId", "transactionId", "resultCode"];
const SALE_FACT_KEYS: readonly string[] = [
  "mid",
  "providerOrderId",
  "transactionId",
  "currency",
  "amountWire",
  "amountMinor",
  "status",
  "transactionDate",
];
const TIMESTAMP_REQUIRED_KEYS: readonly string[] = ["receivedAt", "stageChangedAt"];
const TIMESTAMP_OPTIONAL_KEYS: readonly string[] = [
  "verifyContactMarkedAt",
  "retrieveContactMarkedAt",
  "terminalAt",
];
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const STAGES = new Set<string>(Object.values(EximbayBf4Stage));
const VERIFICATION_DISPOSITIONS = new Set<string>([
  "NOT_ATTEMPTED",
  "OUTCOME_UNKNOWN",
  "ADMITTED",
  "DEFINITIVELY_REJECTED",
]);
const RETRIEVAL_DISPOSITIONS = new Set<string>([
  "NOT_ATTEMPTED",
  "OUTCOME_UNKNOWN",
  "ADMITTED_NON_SALE",
  "ADMITTED_SALE",
  "ADMITTED_SALE_MISMATCH",
]);
const DIAGNOSTICS = new Set<string>(Object.values(EximbayBf4Diagnostic));
const SALE_STATUSES = new Set<string>(["SALE", "AUTH", "REGISTERED", "NONE"]);
const RAW_REQUIRED_STAGES = new Set<EximbayBf4Stage>([
  EximbayBf4Stage.CLAIMED_PRE_VERIFY,
  EximbayBf4Stage.VERIFY_OUTCOME_UNKNOWN,
  EximbayBf4Stage.VERIFIED_PENDING_RETRIEVE,
  EximbayBf4Stage.RETRIEVE_OUTCOME_UNKNOWN,
  EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
  EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
]);
const SALE_FACT_REQUIRED_STAGES = new Set<EximbayBf4Stage>([
  EximbayBf4Stage.VERIFIED_SALE_PENDING_COMPLETION,
  EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION,
  EximbayBf4Stage.VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION,
  EximbayBf4Stage.COMPLETION_RETRYABLE,
  EximbayBf4Stage.TERMINAL_PROCESSED,
]);

type DispositionPair = readonly [EximbayBf4VerificationDisposition, EximbayBf4RetrievalDisposition];
const DISPOSITIONS: Readonly<Record<EximbayBf4Stage, readonly DispositionPair[]>> = Object.freeze({
  CLAIMED_PRE_VERIFY: [["NOT_ATTEMPTED", "NOT_ATTEMPTED"]],
  VERIFY_OUTCOME_UNKNOWN: [["OUTCOME_UNKNOWN", "NOT_ATTEMPTED"]],
  VERIFIED_PENDING_RETRIEVE: [["ADMITTED", "NOT_ATTEMPTED"]],
  RETRIEVE_OUTCOME_UNKNOWN: [["ADMITTED", "OUTCOME_UNKNOWN"]],
  VERIFIED_SALE_PENDING_COMPLETION: [["ADMITTED", "ADMITTED_SALE"]],
  VERIFIED_NON_SALE_REQUIRES_ADJUDICATION: [["ADMITTED", "ADMITTED_NON_SALE"]],
  VERIFIED_SALE_MISMATCH_REQUIRES_RECONCILIATION: [["ADMITTED", "ADMITTED_SALE_MISMATCH"]],
  COMPLETION_RETRYABLE: [["ADMITTED", "ADMITTED_SALE"]],
  TERMINAL_PROCESSED: [["ADMITTED", "ADMITTED_SALE"]],
  TERMINAL_REJECTED: [
    ["DEFINITIVELY_REJECTED", "NOT_ATTEMPTED"],
    ["ADMITTED", "ADMITTED_SALE"],
  ],
});

export function exactRawSha256(exactRawQuery: string): string {
  return createHash("sha256").update(exactRawQuery, "utf8").digest("hex");
}

export function eximbayBf4TransactionClaim(transactionId: string): string {
  return `eximbay:status:tx:v1:${createHash("sha256").update(transactionId, "utf8").digest("hex")}`;
}

export function eximbayBf4RawClaim(rawSha256: string): string {
  return `eximbay:status:raw:v1:${requireHash(rawSha256)}`;
}

export function eximbayBf4RejectTombstone(rawSha256: string): string {
  return `eximbay:status:reject:v1:${requireHash(rawSha256)}`;
}

export function validateEximbayBf4Envelope(input: unknown): EximbayBf4Envelope {
  if (!isRecord(input)) return invalidEnvelope();
  requireExactKeys(input, ENVELOPE_REQUIRED_KEYS, ENVELOPE_OPTIONAL_KEYS);
  if (input.schema !== EXIMBAY_BF4_SCHEMA || input.version !== EXIMBAY_BF4_VERSION) {
    return invalidEnvelope();
  }
  const stage = requireStage(input.stage);
  const verification = requireVerification(input.verification);
  const retrieval = requireRetrieval(input.retrieval);
  const envelope: EximbayBf4Envelope = {
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    stage,
    exactRawSha256: requireHash(input.exactRawSha256),
    verification,
    retrieval,
    timestamps: requireTimestamps(input.timestamps),
    ...optionalRaw(input.exactRawQuery),
    ...optionalCandidate(input.candidate),
    ...optionalSaleFacts(input.saleFacts),
    ...optionalDiagnostic(input.diagnostic),
  };
  requireStageConsistency(envelope);
  return Object.freeze(envelope);
}

export function eximbayBf4EnvelopeJson(envelope: EximbayBf4Envelope): Prisma.InputJsonObject {
  const validated = validateEximbayBf4Envelope(envelope);
  return {
    schema: validated.schema,
    version: validated.version,
    stage: validated.stage,
    exactRawSha256: validated.exactRawSha256,
    verification: validated.verification,
    retrieval: validated.retrieval,
    timestamps: timestampsJson(validated.timestamps),
    ...(validated.exactRawQuery === undefined ? {} : { exactRawQuery: validated.exactRawQuery }),
    ...(validated.candidate === undefined ? {} : { candidate: candidateJson(validated.candidate) }),
    ...(validated.saleFacts === undefined ? {} : { saleFacts: saleFactsJson(validated.saleFacts) }),
    ...(validated.diagnostic === undefined ? {} : { diagnostic: validated.diagnostic }),
  };
}

export function minimizeEximbayBf4Envelope(
  envelope: EximbayBf4Envelope,
  replacement: Pick<EximbayBf4Envelope, "stage" | "verification" | "retrieval" | "timestamps"> &
    Partial<Pick<EximbayBf4Envelope, "saleFacts" | "diagnostic">>,
): EximbayBf4Envelope {
  return validateEximbayBf4Envelope({
    schema: EXIMBAY_BF4_SCHEMA,
    version: EXIMBAY_BF4_VERSION,
    exactRawSha256: envelope.exactRawSha256,
    ...replacement,
  });
}

function optionalRaw(value: unknown): { readonly exactRawQuery?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string") return invalidEnvelope();
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > EXIMBAY_RAW_QUERY_MAX_BYTES) return invalidEnvelope();
  return { exactRawQuery: value };
}

function optionalCandidate(value: unknown): { readonly candidate?: EximbayBf4Candidate } {
  if (value === undefined) return {};
  if (!isRecord(value)) return invalidEnvelope();
  requireExactKeys(value, [], CANDIDATE_KEYS);
  const orderId = optionalBoundedText(value.orderId, 512);
  const transactionId = optionalBoundedText(value.transactionId, 512);
  const resultCode = optionalBoundedText(value.resultCode, 64);
  const candidate: EximbayBf4Candidate = {
    ...(orderId === undefined ? {} : { orderId }),
    ...(transactionId === undefined ? {} : { transactionId }),
    ...(resultCode === undefined ? {} : { resultCode }),
  };
  if (Object.keys(candidate).length === 0) return invalidEnvelope();
  return { candidate: Object.freeze(candidate) };
}

function optionalSaleFacts(value: unknown): { readonly saleFacts?: EximbayBf4SaleFacts } {
  if (value === undefined) return {};
  if (!isRecord(value)) return invalidEnvelope();
  requireExactKeys(value, SALE_FACT_KEYS);
  if (!SALE_STATUSES.has(stringValue(value.status))) return invalidEnvelope();
  const status = requireSaleStatus(value.status);
  const amountMinor = value.amountMinor;
  if (!Number.isSafeInteger(amountMinor) || typeof amountMinor !== "number" || amountMinor <= 0) {
    return invalidEnvelope();
  }
  return { saleFacts: Object.freeze({
    mid: requireBoundedText(value.mid, 512),
    providerOrderId: requireBoundedText(value.providerOrderId, 512),
    transactionId: requireBoundedText(value.transactionId, 512),
    currency: requireBoundedText(value.currency, 3),
    amountWire: requireBoundedText(value.amountWire, 64),
    amountMinor,
    status,
    transactionDate: requireBoundedText(value.transactionDate, 32),
  }) };
}

function optionalDiagnostic(value: unknown): { readonly diagnostic?: EximbayBf4DiagnosticCode } {
  if (value === undefined) return {};
  if (typeof value !== "string" || !DIAGNOSTICS.has(value)) return invalidEnvelope();
  return { diagnostic: requireDiagnostic(value) };
}

function requireTimestamps(value: unknown): EximbayBf4Timestamps {
  if (!isRecord(value)) return invalidEnvelope();
  requireExactKeys(value, TIMESTAMP_REQUIRED_KEYS, TIMESTAMP_OPTIONAL_KEYS);
  const verifyContactMarkedAt = optionalTimestamp(value.verifyContactMarkedAt);
  const retrieveContactMarkedAt = optionalTimestamp(value.retrieveContactMarkedAt);
  const terminalAt = optionalTimestamp(value.terminalAt);
  return Object.freeze({
    receivedAt: requireIsoTimestamp(value.receivedAt),
    stageChangedAt: requireIsoTimestamp(value.stageChangedAt),
    ...(verifyContactMarkedAt === undefined ? {} : { verifyContactMarkedAt }),
    ...(retrieveContactMarkedAt === undefined ? {} : { retrieveContactMarkedAt }),
    ...(terminalAt === undefined ? {} : { terminalAt }),
  });
}

function requireStageConsistency(envelope: EximbayBf4Envelope): void {
  const allowed = DISPOSITIONS[envelope.stage];
  const admitted = allowed.some((pair) => (
    pair[0] === envelope.verification && pair[1] === envelope.retrieval
  ));
  if (!admitted) {
    return invalidEnvelope();
  }
  requireRawConsistency(envelope);
  requireSaleFactsConsistency(envelope);
  requireTimestampConsistency(envelope);
}

function requireRawConsistency(envelope: EximbayBf4Envelope): void {
  const rawRequired = RAW_REQUIRED_STAGES.has(envelope.stage);
  if (rawRequired !== (envelope.exactRawQuery !== undefined)) return invalidEnvelope();
  const terminal = envelope.stage === EximbayBf4Stage.TERMINAL_PROCESSED
    || envelope.stage === EximbayBf4Stage.TERMINAL_REJECTED;
  if (terminal && envelope.candidate !== undefined) return invalidEnvelope();
}

function requireSaleFactsConsistency(envelope: EximbayBf4Envelope): void {
  const required = SALE_FACT_REQUIRED_STAGES.has(envelope.stage)
    || (envelope.stage === EximbayBf4Stage.TERMINAL_REJECTED
      && envelope.retrieval === "ADMITTED_SALE");
  if (required !== (envelope.saleFacts !== undefined)) return invalidEnvelope();
  if (!envelope.saleFacts) return;
  const nonSale = envelope.stage === EximbayBf4Stage.VERIFIED_NON_SALE_REQUIRES_ADJUDICATION;
  if (nonSale === (envelope.saleFacts.status === "SALE")) return invalidEnvelope();
}

function requireTimestampConsistency(envelope: EximbayBf4Envelope): void {
  const verifyMarked = envelope.stage !== EximbayBf4Stage.CLAIMED_PRE_VERIFY;
  const definitiveReject = envelope.verification === "DEFINITIVELY_REJECTED";
  const retrieveMarked = envelope.retrieval !== "NOT_ATTEMPTED";
  const terminal = envelope.stage === EximbayBf4Stage.TERMINAL_PROCESSED
    || envelope.stage === EximbayBf4Stage.TERMINAL_REJECTED;
  if (verifyMarked !== (envelope.timestamps.verifyContactMarkedAt !== undefined)) return invalidEnvelope();
  if ((retrieveMarked && !definitiveReject) !== (envelope.timestamps.retrieveContactMarkedAt !== undefined)) {
    return invalidEnvelope();
  }
  if (terminal !== (envelope.timestamps.terminalAt !== undefined)) return invalidEnvelope();
}

function requireStage(value: unknown): EximbayBf4Stage {
  if (typeof value !== "string" || !STAGES.has(value)) return invalidEnvelope();
  return stageFromString(value);
}

function stageFromString(value: string): EximbayBf4Stage {
  const match = Object.values(EximbayBf4Stage).find((stage) => stage === value);
  return match ?? invalidEnvelope();
}

function requireVerification(value: unknown): EximbayBf4VerificationDisposition {
  if (typeof value !== "string" || !VERIFICATION_DISPOSITIONS.has(value)) return invalidEnvelope();
  if (value === "NOT_ATTEMPTED" || value === "OUTCOME_UNKNOWN") return value;
  if (value === "ADMITTED" || value === "DEFINITIVELY_REJECTED") return value;
  return invalidEnvelope();
}

function requireRetrieval(value: unknown): EximbayBf4RetrievalDisposition {
  if (typeof value !== "string" || !RETRIEVAL_DISPOSITIONS.has(value)) return invalidEnvelope();
  if (value === "NOT_ATTEMPTED" || value === "OUTCOME_UNKNOWN") return value;
  if (value === "ADMITTED_NON_SALE" || value === "ADMITTED_SALE") return value;
  if (value === "ADMITTED_SALE_MISMATCH") return value;
  return invalidEnvelope();
}

function requireSaleStatus(value: unknown): EximbayBf4SaleFacts["status"] {
  if (value === "SALE" || value === "AUTH" || value === "REGISTERED" || value === "NONE") return value;
  return invalidEnvelope();
}

function requireDiagnostic(value: string): EximbayBf4DiagnosticCode {
  const match = Object.values(EximbayBf4Diagnostic).find((diagnostic) => diagnostic === value);
  return match ?? invalidEnvelope();
}

function optionalBoundedText(
  value: unknown,
  maxBytes: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requireBoundedText(value, maxBytes);
}

function requireBoundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return invalidEnvelope();
  if (hasProhibitedDecodedCharacter(value)) return invalidEnvelope();
  if (new TextEncoder().encode(value).byteLength > maxBytes) return invalidEnvelope();
  return value;
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requireIsoTimestamp(value);
}

function requireIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") return invalidEnvelope();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) return invalidEnvelope();
  return value;
}

function requireHash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) return invalidEnvelope();
  return value;
}

function candidateJson(candidate: EximbayBf4Candidate): Prisma.InputJsonObject {
  return {
    ...(candidate.orderId === undefined ? {} : { orderId: candidate.orderId }),
    ...(candidate.transactionId === undefined ? {} : { transactionId: candidate.transactionId }),
    ...(candidate.resultCode === undefined ? {} : { resultCode: candidate.resultCode }),
  };
}

function saleFactsJson(facts: EximbayBf4SaleFacts): Prisma.InputJsonObject {
  return {
    mid: facts.mid,
    providerOrderId: facts.providerOrderId,
    transactionId: facts.transactionId,
    currency: facts.currency,
    amountWire: facts.amountWire,
    amountMinor: facts.amountMinor,
    status: facts.status,
    transactionDate: facts.transactionDate,
  };
}

function timestampsJson(timestamps: EximbayBf4Timestamps): Prisma.InputJsonObject {
  return {
    receivedAt: timestamps.receivedAt,
    stageChangedAt: timestamps.stageChangedAt,
    ...(timestamps.verifyContactMarkedAt === undefined
      ? {}
      : { verifyContactMarkedAt: timestamps.verifyContactMarkedAt }),
    ...(timestamps.retrieveContactMarkedAt === undefined
      ? {}
      : { retrieveContactMarkedAt: timestamps.retrieveContactMarkedAt }),
    ...(timestamps.terminalAt === undefined ? {} : { terminalAt: timestamps.terminalAt }),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function invalidEnvelope(): never {
  throw new EximbayProtocolError("INVALID_BF4_ENVELOPE");
}
