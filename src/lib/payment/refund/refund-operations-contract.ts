import { types as nodeTypes } from "node:util";

export const REFUND_OPERATIONS_PROCESS_FORMAT_VERSION =
  "mira-refund-operations-process/v1";

export type RefundOperationsCommand =
  | Readonly<{ kind: "MANUAL" }>
  | Readonly<{ kind: "RECONCILE" }>
  | Readonly<{ kind: "CREDENTIAL" }>;

export type RefundOperationsProcessCommand =
  | RefundOperationsCommand["kind"]
  | "INVALID";

export type RefundOperationsFailureCode =
  | "INVALID_HOST_INPUT"
  | "CONFIG_INVALID"
  | "MIGRATIONS_NOT_READY"
  | "DATABASE_UNAVAILABLE"
  | "SYSTEMIC_FAILURE";

export type RefundOperationsFailure = Readonly<{
  ok: false;
  code: RefundOperationsFailureCode;
}>;

export type ManualReviewCase = Readonly<{
  caseRef: string;
  ageSeconds: number;
  contactMarkerPresent: boolean;
  authorizationEvidenceCount: number;
  contactEvidenceCount: number;
}>;

export type ManualReviewQueueResult = Readonly<{
  ok: true;
  code: "MANUAL_REVIEW_QUEUE";
  summary: Readonly<{ count: number; oldestAgeSeconds: number | null }>;
  cases: readonly ManualReviewCase[];
  truncated: boolean;
}>;

export const REFUND_RECONCILIATION_CLASSIFICATIONS = Object.freeze([
  "POSSIBLE_CONTACT",
  "MANUAL_REVIEW",
  "CONTACTED_DEADLINE_WARNING",
  "CONTACTED_DEADLINE_CRITICAL",
] as const);

export type RefundReconciliationClassification =
  (typeof REFUND_RECONCILIATION_CLASSIFICATIONS)[number];

const REFUND_RECONCILIATION_COMPATIBLE_CLASSIFICATION_KEYS = Object.freeze([
  "MANUAL_REVIEW",
  "POSSIBLE_CONTACT",
  "POSSIBLE_CONTACT|MANUAL_REVIEW",
  "POSSIBLE_CONTACT|CONTACTED_DEADLINE_WARNING",
  "POSSIBLE_CONTACT|MANUAL_REVIEW|CONTACTED_DEADLINE_WARNING",
  "POSSIBLE_CONTACT|CONTACTED_DEADLINE_CRITICAL",
  "POSSIBLE_CONTACT|MANUAL_REVIEW|CONTACTED_DEADLINE_CRITICAL",
] as const);

export type RefundReconciliationCase = Readonly<{
  caseRef: string;
  classifications: readonly RefundReconciliationClassification[];
  oldestRelevantAgeSeconds: number;
}>;

export type RefundReconciliationSnapshotResult = Readonly<{
  ok: true;
  code: "RECONCILIATION_SNAPSHOT";
  summary: Readonly<{
    caseCount: number;
    possibleContactCount: number;
    manualReviewCount: number;
    contactedWarningCount: number;
    contactedCriticalCount: number;
  }>;
  cases: readonly RefundReconciliationCase[];
  truncated: boolean;
}>;

export type CredentialLifecycleCheckResult = Readonly<{
  ok: true;
  code: "CREDENTIAL_LIFECYCLE_CHECK";
  credentialStatus: "ABSENT" | "CONFIGURED";
  secretValidation: "NOT_PERFORMED";
  rotationCapability: "SINGLE_ACTIVE_ONLY";
  historicalGenerationResolution: false;
  revocationReadiness: "NOT_PROVABLE";
}>;

export type RefundOperationsHostResult =
  | ManualReviewQueueResult
  | RefundReconciliationSnapshotResult
  | CredentialLifecycleCheckResult
  | RefundOperationsFailure;

export type RefundOperationsProcessObservation = Readonly<{
  formatVersion: typeof REFUND_OPERATIONS_PROCESS_FORMAT_VERSION;
  command: RefundOperationsProcessCommand;
  operationDurationMs: number;
}>;

export type ObservedRefundOperationsResult = RefundOperationsHostResult & Readonly<{
  process: RefundOperationsProcessObservation;
}>;

const EXIT_CODES: Readonly<Record<RefundOperationsHostResult["code"], number>> = Object.freeze({
  MANUAL_REVIEW_QUEUE: 0,
  RECONCILIATION_SNAPSHOT: 0,
  CREDENTIAL_LIFECYCLE_CHECK: 0,
  INVALID_HOST_INPUT: 64,
  CONFIG_INVALID: 78,
  MIGRATIONS_NOT_READY: 78,
  DATABASE_UNAVAILABLE: 1,
  SYSTEMIC_FAILURE: 1,
});

const MANUAL_RESULT_KEYS = Object.freeze(["ok", "code", "summary", "cases", "truncated"] as const);
const MANUAL_SUMMARY_KEYS = Object.freeze(["count", "oldestAgeSeconds"] as const);
const MANUAL_CASE_KEYS = Object.freeze([
  "caseRef", "ageSeconds", "contactMarkerPresent",
  "authorizationEvidenceCount", "contactEvidenceCount",
] as const);
const RECONCILIATION_RESULT_KEYS = MANUAL_RESULT_KEYS;
const RECONCILIATION_SUMMARY_KEYS = Object.freeze([
  "caseCount", "possibleContactCount", "manualReviewCount",
  "contactedWarningCount", "contactedCriticalCount",
] as const);
const RECONCILIATION_CASE_KEYS = Object.freeze([
  "caseRef", "classifications", "oldestRelevantAgeSeconds",
] as const);
const CREDENTIAL_RESULT_KEYS = Object.freeze([
  "ok", "code", "credentialStatus", "secretValidation", "rotationCapability",
  "historicalGenerationResolution", "revocationReadiness",
] as const);
const FAILURE_KEYS = Object.freeze(["ok", "code"] as const);

export function parseRefundOperationsCliArgs(
  value: unknown,
): Readonly<{ ok: true; command: RefundOperationsCommand }>
  | Readonly<{ ok: false; result: RefundOperationsFailure }> {
  const args = exactStringArray(value);
  if (!args || args.length !== 1) return parseFailure();
  if (args[0] === "manual") return parsedCommand("MANUAL");
  if (args[0] === "reconcile") return parsedCommand("RECONCILE");
  if (args[0] === "credential") return parsedCommand("CREDENTIAL");
  return parseFailure();
}

export function refundOperationsExitCode(result: RefundOperationsHostResult): number {
  return EXIT_CODES[result.code];
}

export function refundOperationsFailure(
  code: RefundOperationsFailureCode,
): RefundOperationsFailure {
  return Object.freeze({ ok: false, code });
}

export function credentialLifecycleCheck(
  status: "ABSENT" | "CONFIGURED",
): CredentialLifecycleCheckResult {
  return Object.freeze({
    ok: true,
    code: "CREDENTIAL_LIFECYCLE_CHECK",
    credentialStatus: status,
    secretValidation: "NOT_PERFORMED",
    rotationCapability: "SINGLE_ACTIVE_ONLY",
    historicalGenerationResolution: false,
    revocationReadiness: "NOT_PROVABLE",
  });
}

export function sanitizeRefundOperationsResult(value: unknown): RefundOperationsHostResult | null {
  const descriptors = exactObjectDescriptors(value);
  if (!descriptors) return null;
  const code = dataProperty(descriptors.code);
  if (code === "MANUAL_REVIEW_QUEUE") return sanitizeManualResult(descriptors);
  if (code === "RECONCILIATION_SNAPSHOT") return sanitizeReconciliationResult(descriptors);
  if (code === "CREDENTIAL_LIFECYCLE_CHECK") return sanitizeCredentialResult(descriptors);
  return sanitizeFailure(descriptors);
}

function sanitizeManualResult(
  descriptors: PropertyDescriptorMap,
): ManualReviewQueueResult | null {
  if (!hasExactKeys(descriptors, MANUAL_RESULT_KEYS)
    || dataProperty(descriptors.ok) !== true) return null;
  const summary = manualSummary(dataProperty(descriptors.summary));
  const cases = exactArray(dataProperty(descriptors.cases), manualCase);
  const truncated = dataProperty(descriptors.truncated);
  if (!summary || !cases || typeof truncated !== "boolean"
    || !validManualResult(summary.count, cases, truncated)) return null;
  return Object.freeze({
    ok: true,
    code: "MANUAL_REVIEW_QUEUE",
    summary,
    cases: Object.freeze(cases),
    truncated,
  });
}

function validManualResult(
  count: number,
  cases: readonly ManualReviewCase[],
  truncated: boolean,
): boolean {
  return cases.length <= 50 && count >= cases.length
    && truncated === (count > cases.length) && manualCasesOrdered(cases);
}

function manualSummary(value: unknown): ManualReviewQueueResult["summary"] | null {
  const descriptors = exactDataObjectDescriptors(value, MANUAL_SUMMARY_KEYS);
  if (!descriptors) return null;
  const count = nonnegativeSafeInteger(dataProperty(descriptors.count));
  const oldestValue = dataProperty(descriptors.oldestAgeSeconds);
  const oldestAgeSeconds = oldestValue === null ? null : nonnegativeSafeInteger(oldestValue);
  if (count === null || oldestAgeSeconds === null && oldestValue !== null
    || (count === 0) !== (oldestAgeSeconds === null)) return null;
  return Object.freeze({ count, oldestAgeSeconds });
}

function manualCase(value: unknown): ManualReviewCase | null {
  const descriptors = exactDataObjectDescriptors(value, MANUAL_CASE_KEYS);
  if (!descriptors) return null;
  const caseRef = dataProperty(descriptors.caseRef);
  const ageSeconds = nonnegativeSafeInteger(dataProperty(descriptors.ageSeconds));
  const contactMarkerPresent = dataProperty(descriptors.contactMarkerPresent);
  const authorizationEvidenceCount = nonnegativeSafeInteger(
    dataProperty(descriptors.authorizationEvidenceCount),
  );
  const contactEvidenceCount = nonnegativeSafeInteger(
    dataProperty(descriptors.contactEvidenceCount),
  );
  if (!isOpaqueCaseReference(caseRef) || ageSeconds === null
    || typeof contactMarkerPresent !== "boolean"
    || authorizationEvidenceCount === null || contactEvidenceCount === null) return null;
  return Object.freeze({
    caseRef, ageSeconds, contactMarkerPresent,
    authorizationEvidenceCount, contactEvidenceCount,
  });
}

function sanitizeReconciliationResult(
  descriptors: PropertyDescriptorMap,
): RefundReconciliationSnapshotResult | null {
  if (!hasExactKeys(descriptors, RECONCILIATION_RESULT_KEYS)
    || dataProperty(descriptors.ok) !== true) return null;
  const summary = reconciliationSummary(dataProperty(descriptors.summary));
  const cases = exactArray(dataProperty(descriptors.cases), reconciliationCase);
  const truncated = dataProperty(descriptors.truncated);
  if (!summary || !cases || typeof truncated !== "boolean"
    || !validReconciliationResult(summary, cases, truncated)) return null;
  return Object.freeze({
    ok: true,
    code: "RECONCILIATION_SNAPSHOT",
    summary,
    cases: Object.freeze(cases),
    truncated,
  });
}

function reconciliationSummary(value: unknown): RefundReconciliationSnapshotResult["summary"] | null {
  const descriptors = exactDataObjectDescriptors(value, RECONCILIATION_SUMMARY_KEYS);
  if (!descriptors) return null;
  const counts = RECONCILIATION_SUMMARY_KEYS.map((key) => (
    nonnegativeSafeInteger(dataProperty(descriptors[key]))
  ));
  if (!counts.every((count): count is number => count !== null)) return null;
  const [
    caseCount,
    possibleContactCount,
    manualReviewCount,
    contactedWarningCount,
    contactedCriticalCount,
  ] = counts;
  if ([possibleContactCount, manualReviewCount, contactedWarningCount, contactedCriticalCount]
      .some((count) => count > caseCount)
    || contactedWarningCount + contactedCriticalCount > possibleContactCount) return null;
  return Object.freeze({
    caseCount,
    possibleContactCount,
    manualReviewCount,
    contactedWarningCount,
    contactedCriticalCount,
  });
}

function reconciliationCase(value: unknown): RefundReconciliationCase | null {
  const descriptors = exactDataObjectDescriptors(value, RECONCILIATION_CASE_KEYS);
  if (!descriptors) return null;
  const caseRef = dataProperty(descriptors.caseRef);
  const classifications = exactArray(
    dataProperty(descriptors.classifications), reconciliationClassification,
  );
  const oldestRelevantAgeSeconds = nonnegativeSafeInteger(
    dataProperty(descriptors.oldestRelevantAgeSeconds),
  );
  if (!isOpaqueCaseReference(caseRef) || !classifications || classifications.length === 0
    || oldestRelevantAgeSeconds === null || !canonicalClassifications(classifications)) return null;
  return Object.freeze({
    caseRef,
    classifications: Object.freeze(classifications),
    oldestRelevantAgeSeconds,
  });
}

function sanitizeCredentialResult(
  descriptors: PropertyDescriptorMap,
): CredentialLifecycleCheckResult | null {
  if (!hasExactKeys(descriptors, CREDENTIAL_RESULT_KEYS)) return null;
  const status = credentialStatus(dataProperty(descriptors.credentialStatus));
  const exact = [
    dataProperty(descriptors.ok) === true,
    status !== null,
    dataProperty(descriptors.secretValidation) === "NOT_PERFORMED",
    dataProperty(descriptors.rotationCapability) === "SINGLE_ACTIVE_ONLY",
    dataProperty(descriptors.historicalGenerationResolution) === false,
    dataProperty(descriptors.revocationReadiness) === "NOT_PROVABLE",
  ].every(Boolean);
  return exact && status ? credentialLifecycleCheck(status) : null;
}

function sanitizeFailure(
  descriptors: PropertyDescriptorMap,
): RefundOperationsFailure | null {
  if (!hasExactKeys(descriptors, FAILURE_KEYS) || dataProperty(descriptors.ok) !== false) {
    return null;
  }
  const code = dataProperty(descriptors.code);
  return isFailureCode(code) ? refundOperationsFailure(code) : null;
}

function exactStringArray(value: unknown): readonly string[] | null {
  return exactArray(value, (item) => typeof item === "string" ? item : null);
}

function exactArray<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (nodeTypes.isProxy(value) || !Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (!keys.every((key) => key === "length" || isArrayIndex(key, value.length))) return null;
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = dataProperty(descriptors[String(index)]);
    const parsed = read(item);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}

function exactObjectDescriptors(value: unknown): PropertyDescriptorMap | null {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return Object.getOwnPropertyDescriptors(value);
}

function exactDataObjectDescriptors(
  value: unknown,
  keys: readonly string[],
): PropertyDescriptorMap | null {
  const descriptors = exactObjectDescriptors(value);
  return descriptors && hasExactKeys(descriptors, keys) ? descriptors : null;
}

function hasExactKeys(
  descriptors: PropertyDescriptorMap,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(descriptors);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key))
    && expected.every((key) => dataDescriptor(descriptors[key]));
}

function dataDescriptor(descriptor: PropertyDescriptor | undefined): boolean {
  return descriptor?.enumerable === true
    && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function dataProperty(descriptor: PropertyDescriptor | undefined): unknown {
  return dataDescriptor(descriptor) ? descriptor?.value : undefined;
}

function nonnegativeSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isOpaqueCaseReference(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value === value.trim();
}

function reconciliationClassification(value: unknown): RefundReconciliationClassification | null {
  for (const classification of REFUND_RECONCILIATION_CLASSIFICATIONS) {
    if (classification === value) return classification;
  }
  return null;
}

function credentialStatus(value: unknown): "ABSENT" | "CONFIGURED" | null {
  if (value === "ABSENT") return "ABSENT";
  return value === "CONFIGURED" ? "CONFIGURED" : null;
}

function canonicalClassifications(values: readonly RefundReconciliationClassification[]): boolean {
  if (new Set(values).size !== values.length
    || values.includes("CONTACTED_DEADLINE_WARNING")
      && values.includes("CONTACTED_DEADLINE_CRITICAL")) return false;
  return values.every((value, index) => (
    index === 0 || classificationIndex(values[index - 1]) < classificationIndex(value)
  )) && isRefundReconciliationClassificationSetCompatible(values);
}

export function isRefundReconciliationClassificationSetCompatible(
  values: readonly RefundReconciliationClassification[],
): boolean {
  const key = values.join("|");
  return REFUND_RECONCILIATION_COMPATIBLE_CLASSIFICATION_KEYS.some(
    (compatible) => compatible === key,
  );
}

function classificationIndex(value: RefundReconciliationClassification): number {
  return REFUND_RECONCILIATION_CLASSIFICATIONS.indexOf(value);
}

function manualCasesOrdered(cases: readonly ManualReviewCase[]): boolean {
  return new Set(cases.map((item) => item.caseRef)).size === cases.length
    && cases.every((current, index) => {
    const previous = cases[index - 1];
    return !previous || previous.ageSeconds >= current.ageSeconds;
    });
}

function reconciliationCasesOrdered(cases: readonly RefundReconciliationCase[]): boolean {
  return new Set(cases.map((item) => item.caseRef)).size === cases.length
    && cases.every((current, index) => {
    const previous = cases[index - 1];
    if (!previous) return true;
    const previousSeverity = caseSeverity(previous.classifications);
    const currentSeverity = caseSeverity(current.classifications);
    if (previousSeverity !== currentSeverity) return previousSeverity > currentSeverity;
    if (previous.oldestRelevantAgeSeconds !== current.oldestRelevantAgeSeconds) {
      return previous.oldestRelevantAgeSeconds > current.oldestRelevantAgeSeconds;
    }
    return compareCodePointStrings(previous.caseRef, current.caseRef) < 0;
    });
}

function validReconciliationResult(
  summary: RefundReconciliationSnapshotResult["summary"],
  cases: readonly RefundReconciliationCase[],
  truncated: boolean,
): boolean {
  if (cases.length > 100 || summary.caseCount < cases.length
    || truncated !== (summary.caseCount > cases.length)
    || truncated && cases.length !== 100
    || !reconciliationCasesOrdered(cases)) return false;
  const returnedCounts = reconciliationClassificationCounts(cases);
  const summaryCounts = [
    summary.possibleContactCount,
    summary.manualReviewCount,
    summary.contactedWarningCount,
    summary.contactedCriticalCount,
  ];
  return returnedCounts.every((count, index) => (
    count <= summaryCounts[index]
      && (truncated || count === summaryCounts[index])
  ));
}

function reconciliationClassificationCounts(
  cases: readonly RefundReconciliationCase[],
): readonly number[] {
  return REFUND_RECONCILIATION_CLASSIFICATIONS.map((classification) => (
    cases.filter((item) => item.classifications.includes(classification)).length
  ));
}

function compareCodePointStrings(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? -1);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? -1);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function caseSeverity(classifications: readonly RefundReconciliationClassification[]): number {
  if (classifications.includes("CONTACTED_DEADLINE_CRITICAL")) return 4;
  if (classifications.includes("CONTACTED_DEADLINE_WARNING")) return 3;
  if (classifications.includes("MANUAL_REVIEW")) return 2;
  return 1;
}

function isArrayIndex(key: string | symbol, length: number): boolean {
  return typeof key === "string" && /^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < length;
}

function isFailureCode(value: unknown): value is RefundOperationsFailureCode {
  return value === "INVALID_HOST_INPUT" || value === "CONFIG_INVALID"
    || value === "MIGRATIONS_NOT_READY" || value === "DATABASE_UNAVAILABLE"
    || value === "SYSTEMIC_FAILURE";
}

function parsedCommand(kind: RefundOperationsCommand["kind"]) {
  return Object.freeze({ ok: true as const, command: Object.freeze({ kind }) });
}

function parseFailure() {
  return Object.freeze({
    ok: false as const,
    result: refundOperationsFailure("INVALID_HOST_INPUT"),
  });
}
