import { createHmac } from "node:crypto";

export class RunRedactor {
  readonly #key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("HMAC_KEY_INVALID");
    this.#key = Buffer.from(key);
  }

  hmac(value: string | null): string | null {
    if (value === null) return null;
    return createHmac("sha256", this.#key).update(value, "utf8").digest("hex");
  }
}

export const SANITIZED_REPORT_KEYS = [
  "formatVersion", "runId", "scenarioId", "repositoryCommit", "policyHashes",
  "runnerSourceHash", "migrationFingerprint", "scenarioInputHash", "startedAt",
  "finishedAt", "provider", "mode", "amount", "currency", "paymentKeyHmac",
  "operationKeyHmac", "wireFingerprintHmac", "transactionKeyHmac", "getCount",
  "postCount", "normalizedProviderOutcome", "httpStatusClass", "staticLocalResultCodes",
  "localProjection", "booleans", "rawArtifacts", "scenarioLimitations", "s6Executed",
  "completionMarker",
] as const;

const POLICY_HASH_KEYS = [
  "docs/payment_policy/refund_execution_v1.md",
  "docs/payment_policy/refund_execution_v2.md",
  "docs/payment_policy/refund_execution_v3.md",
  "docs/payment_policy/refund_execution_toss_v1.md",
  "docs/payment_policy/refund_execution_toss_recovery_v1.md",
] as const;
const LOCAL_PROJECTION_KEYS = [
  "commandStatus", "attemptStatus", "orderStatus", "dispatchCount", "latestOrdinal",
  "contactProofCount", "evidenceCount", "transitionCount", "leaseCleared",
] as const;
const BOOLEAN_KEYS = [
  "sameOperationKey", "sameBody", "sameTransactionKey", "singleCancellation",
  "noSecondPost", "recoveredByLookup", "cleanupComplete",
] as const;
const RAW_ARTIFACT_KEYS = ["hash", "size"] as const;
const RAW_SENSITIVE_KEYS = new Set([
  "authorization", "authorizationheader", "basic", "secret", "secretkey",
  "credential", "credentialsecret", "paymentkey", "providerpaymentkey",
  "operationkey", "provideroperationkey", "transactionkey", "providerorderid",
  "providerrefundid", "rawbody", "requestbody", "responsebody", "providerbody",
  "providerresponse", "providerrequest", "localorderid", "localpaymentid",
  "localcommandid", "localrefundattemptid", "ordertoken", "leasetoken",
]);
const COMMAND_STATUSES = ["READY", "LEASED", "WAITING_EVIDENCE", "WAITING_RETRY", "PARKED", "DONE"];
const ATTEMPT_STATUSES = [
  "REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL",
  "MANUAL_REVIEW", "CANCELLED",
];
const ORDER_STATUSES = ["PAID", "CANCELLED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED"];
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const RUN_ID = /^sbx-\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const STATIC_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
const MAX_STATIC_CODES = 16;
const MAX_RAW_ARTIFACTS = 64;
const MAX_RAW_ARTIFACT_BYTES = 1_048_576;

class EvidenceValidationError extends Error {}

export function assertSanitizedEvidence(value: unknown): void {
  try {
    assertNoRawSensitiveKeys(value, new WeakSet<object>());
    validateReport(value);
  } catch (error) {
    if (error instanceof EvidenceValidationError) throw error;
    throw schemaFailure();
  }
}

function validateReport(value: unknown): void {
  if (!isExactDataRecord(value, SANITIZED_REPORT_KEYS)) throw schemaFailure();
  const scenarioId = validateIdentity(value);
  validateTimingAndPayment(value);
  validateHmacsAndCounts(value);
  validateEvidenceSections(value, scenarioId);
}

function validateIdentity(value: Record<string, unknown>): string {
  if (value.formatVersion !== "mira-toss-sbx-sanitized/v1") throw schemaFailure();
  if (typeof value.runId !== "string" || !RUN_ID.test(value.runId)) throw schemaFailure();
  if (!isScenario(value.scenarioId)) throw schemaFailure();
  if (!isHash(value.repositoryCommit, HEX_40)) throw schemaFailure();
  validatePolicyHashes(value.policyHashes);
  for (const hash of [value.runnerSourceHash, value.migrationFingerprint, value.scenarioInputHash]) {
    if (!isHash(hash, HEX_64)) throw schemaFailure();
  }
  return value.scenarioId;
}

function validateTimingAndPayment(value: Record<string, unknown>): void {
  if (!isNullableTimestamp(value.startedAt) || !isTimestamp(value.finishedAt)) throw schemaFailure();
  if (value.provider !== "TOSS" || value.mode !== "SANDBOX") throw schemaFailure();
  if (!isIntegerBetween(value.amount, 1, 2_147_483_647) || value.currency !== "KRW") {
    throw schemaFailure();
  }
}

function validateHmacsAndCounts(value: Record<string, unknown>): void {
  for (const hmac of [
    value.paymentKeyHmac, value.operationKeyHmac,
    value.wireFingerprintHmac, value.transactionKeyHmac,
  ]) {
    if (hmac !== null && !isHash(hmac, HEX_64)) throw schemaFailure();
  }
  if (!isIntegerBetween(value.getCount, 0, 20) || !isIntegerBetween(value.postCount, 0, 7)) {
    throw schemaFailure();
  }
}

function validateEvidenceSections(value: Record<string, unknown>, scenarioId: string): void {
  validateResultCodes(value.normalizedProviderOutcome, value.staticLocalResultCodes);
  if (value.httpStatusClass !== null) throw schemaFailure();
  validateLocalProjection(value.localProjection);
  validateBooleans(value.booleans);
  validateRawArtifacts(value.rawArtifacts);
  validateLimitations(scenarioId, value.scenarioLimitations);
  if (typeof value.s6Executed !== "boolean" || value.completionMarker !== "SEALED") {
    throw schemaFailure();
  }
}

function validatePolicyHashes(value: unknown): void {
  if (!isExactDataRecord(value, POLICY_HASH_KEYS)) throw schemaFailure();
  if (!POLICY_HASH_KEYS.every((key) => isHash(value[key], HEX_64))) throw schemaFailure();
}

function validateResultCodes(outcome: unknown, codes: unknown): void {
  if (!isStaticCodeArray(codes)) throw schemaFailure();
  if (outcome === null) {
    if (codes.length !== 0) throw schemaFailure();
    return;
  }
  if (!isStaticCodeArray(outcome) || outcome.length !== codes.length) throw schemaFailure();
  if (outcome.some((entry, index) => entry !== codes[index])) throw schemaFailure();
}

function validateLocalProjection(value: unknown): void {
  if (!isExactDataRecord(value, LOCAL_PROJECTION_KEYS)) throw schemaFailure();
  if (!isNullableEnum(value.commandStatus, COMMAND_STATUSES)) throw schemaFailure();
  if (!isNullableEnum(value.attemptStatus, ATTEMPT_STATUSES)) throw schemaFailure();
  if (!isNullableEnum(value.orderStatus, ORDER_STATUSES)) throw schemaFailure();
  for (const key of [
    "dispatchCount", "latestOrdinal", "contactProofCount", "evidenceCount", "transitionCount",
  ] as const) {
    if (!isIntegerBetween(value[key], 0, 2_147_483_647)) throw schemaFailure();
  }
  if (typeof value.leaseCleared !== "boolean") throw schemaFailure();
}

function validateBooleans(value: unknown): void {
  if (!isExactDataRecord(value, BOOLEAN_KEYS)) throw schemaFailure();
  if (!BOOLEAN_KEYS.every((key) => isBooleanOrNull(value[key]))) throw schemaFailure();
}

function validateRawArtifacts(value: unknown): void {
  if (!isDataArray(value) || value.length > MAX_RAW_ARTIFACTS) throw schemaFailure();
  for (const artifact of value) {
    if (!isExactDataRecord(artifact, RAW_ARTIFACT_KEYS)) throw schemaFailure();
    if (!isHash(artifact.hash, HEX_64)) throw schemaFailure();
    if (!isIntegerBetween(artifact.size, 0, MAX_RAW_ARTIFACT_BYTES)) throw schemaFailure();
  }
}

function validateLimitations(scenarioId: string, value: unknown): void {
  if (!isDataArray(value)) throw schemaFailure();
  const expected = scenarioId === "S2"
    ? ["Process-level response discard; not TCP-level loss."]
    : scenarioId === "S5"
      ? ["Ordinal-2 application path; provider duplicate POST is covered by S3."]
      : [];
  if (value.length !== expected.length
    || value.some((entry, index) => entry !== expected[index])) throw schemaFailure();
}

function assertNoRawSensitiveKeys(value: unknown, seen: WeakSet<object>): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && RAW_SENSITIVE_KEYS.has(key.toLowerCase())) {
      throw forbiddenFailure();
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) assertNoRawSensitiveKeys(descriptor.value, seen);
  }
}

function isExactDataRecord(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => {
    if (typeof key !== "string" || !expected.includes(key)) return false;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  return keys.every((key) => {
    if (key === "length") return true;
    if (typeof key !== "string" || !/^\d+$/.test(key)) return false;
    const index = Number(key);
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return Number.isSafeInteger(index) && index >= 0 && index < value.length
      && Boolean(descriptor && "value" in descriptor);
  });
}

function isStaticCodeArray(value: unknown): value is string[] {
  return isDataArray(value) && value.length <= MAX_STATIC_CODES
    && value.every((entry) => typeof entry === "string" && STATIC_CODE.test(entry));
}

function isScenario(value: unknown): value is string {
  return value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6";
}

function isHash(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= minimum && value <= maximum;
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isNullableEnum(value: unknown, allowed: readonly string[]): value is string | null {
  return value === null || (typeof value === "string" && allowed.includes(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function schemaFailure(): EvidenceValidationError {
  return new EvidenceValidationError("SANITIZED_EVIDENCE_SCHEMA_INVALID");
}

function forbiddenFailure(): EvidenceValidationError {
  return new EvidenceValidationError("SANITIZED_EVIDENCE_FORBIDDEN_FIELD");
}
