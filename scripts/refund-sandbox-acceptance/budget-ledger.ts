import { readFile } from "node:fs/promises";
import { fingerprintTossRefundWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import {
  deriveTossRefundCancellationWireRequest,
  TOSS_REFUND_CANCEL_REASON,
  type TossRefundCancellationWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import type { H1ArtifactStore } from "./artifact-store";
import type { H1Scenario } from "./contracts";
import { RunRedactor } from "./redaction";
import type { H1Ledger } from "./run-ledger";
import type { RunLedgerStore } from "./run-ledger";
import { appendRuntimeLedger } from "./runtime-ledger";

export type ProviderCallKind = "GET" | "POST";
export type S3CompletionClassification =
  | "INITIAL_GET_ELIGIBLE"
  | "INITIAL_GET_INELIGIBLE"
  | "INITIAL_GET_REJECTED"
  | "INITIAL_GET_UNAVAILABLE"
  | "POST_ACCEPTED"
  | "POST_MALFORMED"
  | "POST_REJECTED"
  | "POST_UNAVAILABLE"
  | "FINAL_GET_EXACT_SUCCESS"
  | "FINAL_GET_MISMATCH"
  | "FINAL_GET_REJECTED"
  | "FINAL_GET_UNAVAILABLE";

export type S3CompletionEvidence = Readonly<{
  classification: S3CompletionClassification;
  transactionIdentityHmac: string | null;
}>;

export type BudgetRecord = Readonly<{
  scenarioId: H1Scenario;
  kind: ProviderCallKind;
  phase: "INTENT" | "COMPLETED";
  sequence: number;
  request: Readonly<{
    path: string;
    canonicalBody: string | null;
    operationKey: string | null;
    wireFingerprint: string | null;
  }>;
  completionEvidence?: S3CompletionEvidence;
}>;

export type S3HistoryExpectation = Readonly<{
  paymentKey: string;
  providerOperationKey: string;
  cancelAmount: number;
}>;

export type S3Continuation =
  | "FULL_SEQUENCE"
  | "POST_REPLAY"
  | "FINAL_LOOKUP"
  | "DURABLE_PROOF";

export type S3Step = 1 | 2 | 3 | 4;
export type CanonicalS3Call = Readonly<{
  kind: ProviderCallKind;
  request: BudgetRecord["request"];
}>;
export type S3HistoryClassification =
  | Readonly<{ kind: "EMPTY"; completedSteps: 0 }>
  | Readonly<{ kind: "SUCCESSFUL_PREFIX"; completedSteps: 1 | 2 | 3 }>
  | Readonly<{ kind: "COMPLETE_SUCCESS"; completedSteps: 4 }>
  | Readonly<{ kind: "FAILED"; failedStep: S3Step }>
  | Readonly<{ kind: "INCOMPLETE"; incompleteStep: S3Step }>
  | Readonly<{ kind: "MALFORMED" }>;

export type ParsedS3Record = Readonly<{ record: BudgetRecord; index: number }>;
export type PairedS3History = Readonly<{
  kind: "PAIRED";
  records: readonly ParsedS3Record[];
  intents: ReadonlyMap<number, ParsedS3Record>;
  completions: ReadonlyMap<number, ParsedS3Record>;
  maximum: number;
}>;
export type PreparedS3History = PairedS3History
  | Readonly<{ kind: "EMPTY" }>
  | Readonly<{ kind: "MALFORMED" }>;
export type LedgerBudgetConfiguration = Readonly<{
  initialRecords: readonly BudgetRecord[];
  record: (entry: BudgetRecord, result?: unknown) => Promise<void>;
  transactionIdentityHmac: (value: string) => string;
  loadS3State: () => Promise<S3DurableState>;
}>;
export type S3DurableState = Readonly<{
  runId: string;
  revision: number;
  phase: H1Ledger["phase"];
  history: unknown;
}>;

const HEX_64 = /^[0-9a-f]{64}$/;
const COMPLETION_CLASSIFICATIONS: readonly S3CompletionClassification[] = Object.freeze([
  "INITIAL_GET_ELIGIBLE", "INITIAL_GET_INELIGIBLE", "INITIAL_GET_REJECTED",
  "INITIAL_GET_UNAVAILABLE", "POST_ACCEPTED", "POST_MALFORMED", "POST_REJECTED",
  "POST_UNAVAILABLE", "FINAL_GET_EXACT_SUCCESS", "FINAL_GET_MISMATCH",
  "FINAL_GET_REJECTED", "FINAL_GET_UNAVAILABLE",
]);

export async function createLedgerBudgetConfiguration(
  store: RunLedgerStore,
  initial: H1Ledger,
  artifacts: H1ArtifactStore,
): Promise<LedgerBudgetConfiguration> {
  const initialRecords = budgetRecordsFromPayload(initial.payload.callRecords);
  const hmacHex = (await readFile(artifacts.path("raw", "hmac.key"), "utf8")).trim();
  const redactor = new RunRedactor(Buffer.from(hmacHex, "hex"));
  const record = async (entry: BudgetRecord, result?: unknown): Promise<void> => {
    const current = await store.loadLatest();
    const existing = budgetRecordsFromPayload(current?.payload.callRecords);
    const artifact = entry.phase === "COMPLETED"
      ? await artifacts.writeRaw(`call-${String(entry.sequence).padStart(3, "0")}-${entry.kind}.json`, result)
      : null;
    const phase = entry.kind === "POST"
      ? entry.phase === "INTENT" ? "POST_INTENT_RECORDED" : "POST_RESPONSE_RECORDED"
      : current?.phase ?? initial.phase;
    const references = rawReferences(current?.payload.rawArtifactReferences);
    await appendRuntimeLedger(store, current, phase, {
      ...current?.payload,
      callRecords: Object.freeze([...existing, entry]),
      rawArtifactReferences: artifact ? Object.freeze([...references, artifact]) : references,
    });
  };
  return Object.freeze({
    initialRecords,
    record,
    transactionIdentityHmac: (value: string) => redactor.hmac(value) ?? invalidProtectedIdentity(),
    loadS3State: async () => {
      const current = await store.loadLatest();
      if (!current) throw new Error("S3_DURABLE_STATE_REQUIRED");
      return durableS3State(current);
    },
  });
}

export function durableS3State(ledger: H1Ledger): S3DurableState {
  return Object.freeze({
    runId: ledger.runId,
    revision: ledger.revision,
    phase: ledger.phase,
    history: ledger.payload.callRecords ?? Object.freeze([]),
  });
}

export function budgetRecordsFromPayload(value: unknown): readonly BudgetRecord[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw invalidBudgetLedger();
  return Object.freeze(value.map((entry) => parseBudgetRecord(entry)));
}

export function prepareS3History(value: unknown): PreparedS3History {
  const records = parseS3Records(value);
  if (!records) return Object.freeze({ kind: "MALFORMED" });
  if (records.length === 0) return Object.freeze({ kind: "EMPTY" });
  const intents = new Map<number, ParsedS3Record>();
  const completions = new Map<number, ParsedS3Record>();
  for (const entry of records) {
    const target = entry.record.phase === "INTENT" ? intents : completions;
    if (target.has(entry.record.sequence)) return Object.freeze({ kind: "MALFORMED" });
    target.set(entry.record.sequence, entry);
  }
  const orphan = [...completions.keys()].some((sequence) => !intents.has(sequence));
  if (intents.size === 0 || orphan) return Object.freeze({ kind: "MALFORMED" });
  const maximum = Math.max(...intents.keys(), ...completions.keys());
  if (maximum > 4 || maximum !== intents.size) return Object.freeze({ kind: "MALFORMED" });
  return Object.freeze({ kind: "PAIRED", records, intents, completions, maximum });
}

export function protectedGetRequest(paymentKey: string): BudgetRecord["request"] {
  return emptyProtectedRequest(`/v1/payments/${encodeURIComponent(paymentKey)}`);
}

export function protectedPostRequest(
  wire: TossRefundCancellationWireRequest,
  canonicalBody: string,
): BudgetRecord["request"] {
  const prefix = "/v1/payments/";
  const suffix = "/cancel";
  if (!wire.path.startsWith(prefix) || !wire.path.endsWith(suffix)) {
    throw new Error("PROVIDER_REQUEST_PATH_INVALID");
  }
  const paymentKey = decodeURIComponent(wire.path.slice(prefix.length, -suffix.length));
  return Object.freeze({
    path: wire.path,
    canonicalBody,
    operationKey: wire.idempotencyKey,
    wireFingerprint: fingerprintTossRefundWireRequest({
      paymentKey,
      providerOperationKey: wire.idempotencyKey,
      cancelAmount: wire.body.cancelAmount,
    }),
  });
}

export function canonicalS3Requests(
  expectation: S3HistoryExpectation,
): readonly CanonicalS3Call[] | null {
  try {
    const wire = deriveTossRefundCancellationWireRequest({
      paymentKey: expectation.paymentKey,
      providerOperationKey: expectation.providerOperationKey,
      cancelAmount: expectation.cancelAmount,
    });
    const get = protectedGetRequest(expectation.paymentKey);
    const post = protectedPostRequest(wire, JSON.stringify(wire.body));
    return Object.freeze([
      Object.freeze({ kind: "GET", request: get }),
      Object.freeze({ kind: "POST", request: post }),
      Object.freeze({ kind: "POST", request: post }),
      Object.freeze({ kind: "GET", request: get }),
    ]);
  } catch {
    return null;
  }
}

export function canonicalS3Record(
  record: BudgetRecord,
  expected: CanonicalS3Call | undefined,
): boolean {
  if (!expected || record.kind !== expected.kind
    || !sameBudgetRequest(record.request, expected.request)) return false;
  return record.kind === "GET" ? canonicalGetRequest(record.request) : canonicalPostRequest(record.request);
}

export function sameBudgetRequest(
  first: BudgetRecord["request"],
  second: BudgetRecord["request"],
): boolean {
  return isExactRequest(first) && isExactRequest(second)
    && first.path === second.path && first.canonicalBody === second.canonicalBody
    && first.operationKey === second.operationKey
    && first.wireFingerprint === second.wireFingerprint;
}

export function canonicalS3HistoryState(value: unknown): string | null {
  const records = parseS3Records(value);
  return records ? JSON.stringify(records.map((entry) => entry.record)) : null;
}

function canonicalGetRequest(request: BudgetRecord["request"]): boolean {
  return request.path.startsWith("/v1/payments/") && !request.path.endsWith("/cancel")
    && request.canonicalBody === null && request.operationKey === null
    && request.wireFingerprint === null;
}

function canonicalPostRequest(request: BudgetRecord["request"]): boolean {
  const rebuilt = rebuildPostRequest(request);
  return Boolean(rebuilt && sameBudgetRequest(request, rebuilt));
}

function rebuildPostRequest(request: BudgetRecord["request"]): BudgetRecord["request"] | null {
  if (!request.canonicalBody || !request.operationKey || !request.wireFingerprint) return null;
  const prefix = "/v1/payments/";
  const suffix = "/cancel";
  if (!request.path.startsWith(prefix) || !request.path.endsWith(suffix)) return null;
  try {
    const paymentKey = decodeURIComponent(request.path.slice(prefix.length, -suffix.length));
    const parsed: unknown = JSON.parse(request.canonicalBody);
    if (!validCanonicalBody(parsed)) return null;
    const wire = deriveTossRefundCancellationWireRequest({
      paymentKey,
      providerOperationKey: request.operationKey,
      cancelAmount: parsed.cancelAmount,
    });
    return protectedPostRequest(wire, JSON.stringify(wire.body));
  } catch {
    return null;
  }
}

function validCanonicalBody(
  value: unknown,
): value is Readonly<{ cancelReason: string; cancelAmount: unknown }> {
  if (!isRecord(value) || value.cancelReason !== TOSS_REFUND_CANCEL_REASON) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === 2 && keys.every((key) => key === "cancelReason" || key === "cancelAmount");
}

function parseBudgetRecord(value: unknown): BudgetRecord {
  if (!isRecord(value) || !isScenario(value.scenarioId)) throw invalidBudgetLedger();
  if (!isKind(value.kind) || !isPhase(value.phase)) throw invalidBudgetLedger();
  if (!positiveSequence(value.sequence) || !isRequest(value.request)) throw invalidBudgetLedger();
  const completionEvidence = Object.prototype.hasOwnProperty.call(value, "completionEvidence")
    ? parseCompletionEvidence(value.completionEvidence)
    : undefined;
  return Object.freeze({
    scenarioId: value.scenarioId,
    kind: value.kind,
    phase: value.phase,
    sequence: value.sequence,
    request: Object.freeze({ ...value.request }),
    ...(completionEvidence ? { completionEvidence } : {}),
  });
}

function parseCompletionEvidence(value: unknown): S3CompletionEvidence {
  if (!isRecord(value) || !hasExactOwnKeys(value, ["classification", "transactionIdentityHmac"])) {
    throw invalidBudgetLedger();
  }
  if (!isCompletionClassification(value.classification)) throw invalidBudgetLedger();
  const identity = value.transactionIdentityHmac;
  const identityRequired = value.classification === "POST_ACCEPTED"
    || value.classification === "FINAL_GET_EXACT_SUCCESS";
  if (identityRequired && typeof identity === "string" && HEX_64.test(identity)) {
    return Object.freeze({ classification: value.classification, transactionIdentityHmac: identity });
  }
  if (!identityRequired && identity === null) {
    return Object.freeze({ classification: value.classification, transactionIdentityHmac: null });
  }
  throw invalidBudgetLedger();
}

function parseS3Records(value: unknown): readonly ParsedS3Record[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return null;
  const records: ParsedS3Record[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    if (!exactS3RecordShape(entry)) return null;
    try {
      const record = budgetRecordsFromPayload([entry]).at(0);
      if (!record) return null;
      records.push(Object.freeze({ record, index }));
    } catch {
      return null;
    }
  }
  return Object.freeze(records);
}

function exactS3RecordShape(value: unknown): boolean {
  if (!isRecord(value) || value.scenarioId !== "S3" || !isKind(value.kind)
    || !isPhase(value.phase) || !positiveSequence(value.sequence) || !isExactRequest(value.request)) {
    return false;
  }
  const base = ["scenarioId", "kind", "phase", "sequence", "request"];
  return hasExactOwnKeys(value, value.phase === "COMPLETED" ? [...base, "completionEvidence"] : base);
}

function positiveSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRequest(value: unknown): value is BudgetRecord["request"] {
  return isRecord(value) && typeof value.path === "string"
    && nullableString(value.canonicalBody) && nullableString(value.operationKey)
    && nullableString(value.wireFingerprint);
}

function isExactRequest(value: unknown): value is BudgetRecord["request"] {
  return isRequest(value)
    && hasExactOwnKeys(value, ["path", "canonicalBody", "operationKey", "wireFingerprint"]);
}

function isCompletionClassification(value: unknown): value is S3CompletionClassification {
  return typeof value === "string"
    && COMPLETION_CLASSIFICATIONS.some((classification) => classification === value);
}

function emptyProtectedRequest(path: string): BudgetRecord["request"] {
  return Object.freeze({ path, canonicalBody: null, operationKey: null, wireFingerprint: null });
}

function hasExactOwnKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isKind(value: unknown): value is ProviderCallKind {
  return value === "GET" || value === "POST";
}

function isPhase(value: unknown): value is BudgetRecord["phase"] {
  return value === "INTENT" || value === "COMPLETED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScenario(value: unknown): value is H1Scenario {
  return value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6";
}

function invalidBudgetLedger(): Error {
  return new Error("PROVIDER_BUDGET_LEDGER_INVALID");
}

function rawReferences(value: unknown): readonly unknown[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error("RAW_ARTIFACT_LEDGER_INVALID");
  return Object.freeze(value.map((entry: unknown) => entry));
}

function invalidProtectedIdentity(): never {
  throw new Error("S3_TRANSACTION_IDENTITY_PROTECTION_INVALID");
}
