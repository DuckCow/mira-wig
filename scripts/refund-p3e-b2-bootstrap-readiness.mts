import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";

export const TB1_CONTRACT_VERSION =
  "mira-refund-p3e-b2-trusted-project-bootstrap-readiness/v1";
export const TB1_EVIDENCE_SCOPE = "PROJECT_BOOTSTRAP_READINESS";
export const TB1_CANONICALIZATION = "RFC8785_JCS_RESTRICTED_DOMAIN_V1";
export const TB1_BOOTSTRAP_API_SET_SHA256 =
  "2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7";
export const TB1_PRINCIPAL_FINGERPRINT_TRUTH =
  "CORRELATION_FINGERPRINT_NOT_ANONYMIZATION";
export const TB1_MAX_AGE_SECONDS = 900;
export const TB1_FUTURE_CLOCK_ALLOWANCE_SECONDS = 60;
export const TB1_MAX_EVIDENCE_BYTES = 64 * 1024;
export const TB1_MAX_STDOUT_BYTES = 64 * 1024;
export const TB1_MAX_STDERR_BYTES = 4 * 1024;
export const TB1_COMMAND_TIMEOUT_MS = 30_000;
export const TB1_MAX_READ_ATTEMPTS = 3;
export const TB1_MAX_CANONICAL_DEPTH = 64;
export const TB1_MAX_CANONICAL_NODES = 10_000;
export const TB1_JSON_SCHEMA_ROLE =
  "STRUCTURAL_PREFILTER_ONLY_NOT_READINESS_AUTHORITY";
export const TB1_EVIDENCE_WRITER = "DEFERRED";
export const TB1_OUTPUT_PATH_CHECK =
  "ADVISORY_PREFLIGHT_ONLY_NOT_A_WRITE_SAFETY_BOUNDARY";
export const TB1_INJECTED_DEPENDENCY_FAILURES =
  "STATIC_BOUNDED_NO_RAW_CAUSE_PROPAGATION";
export const TB1_CANONICAL_ARRAY_WORK_BOUND =
  "LENGTH_REJECTED_BEFORE_LENGTH_PROPORTIONAL_WORK";

export const TB1_BOOTSTRAP_APIS = Object.freeze([
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com",
] as const);

export const TB1_DISPOSITIONS = Object.freeze([
  "READY_FOR_STATE_BUCKET_PACKAGE",
  "BOOTSTRAP_API_ACTIVATION_REQUIRED",
  "BILLING_NOT_READY",
  "PROJECT_NOT_DEDICATED_OR_INVALID",
  "OBSERVATION_INCOMPLETE",
  "EVIDENCE_STALE_OR_UNTRUSTED",
  "INDEPENDENT_REVIEW_REQUIRED",
] as const);

export const TB1_APPROVED_SOURCE_APIS = Object.freeze([
  "cloudresourcemanager.googleapis.com/v3/projects.get",
  "cloudbilling.googleapis.com/v1/projects.getBillingInfo",
  "serviceusage.googleapis.com/v1/services.list",
] as const);

export type Tb1Disposition = (typeof TB1_DISPOSITIONS)[number];
export type Tb1CommandKind =
  | "PROJECT_GET"
  | "BILLING_INFO_GET"
  | "BOOTSTRAP_SERVICES_LIST"
  | "GCLOUD_VERSION"
  | "COLLECTOR_IDENTITY";
export type Tb1CommandFailure =
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "NOT_FOUND"
  | "PROJECT_MISMATCH"
  | "MALFORMED_OUTPUT"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "COMMAND_FAILED"
  | "RETRY_EXHAUSTED"
  | "EXECUTOR_REJECTED"
  | "RETRY_WAIT_REJECTED"
  | "PATH_CANONICALIZATION_FAILED";
export type Tb1CommandAttemptStatus =
  | "SUCCESS"
  | "TRANSIENT_429"
  | "TRANSIENT_5XX"
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "NOT_FOUND"
  | "PROJECT_MISMATCH"
  | "MALFORMED_OUTPUT"
  | "COMMAND_FAILED";

export type Tb1CommandAttemptResult = Readonly<{
  status: Tb1CommandAttemptStatus;
  stdout: Uint8Array;
  stderr: Uint8Array;
}>;

export type Tb1CommandExecutionRequest = Readonly<{
  executable: "gcloud";
  args: readonly string[];
  env: Readonly<{ CLOUDSDK_CONFIG: string }>;
  timeoutMs: typeof TB1_COMMAND_TIMEOUT_MS;
}>;

export type Tb1CommandDependencies = Readonly<{
  canonicalizePath(path: string): Promise<string>;
  execute(request: Tb1CommandExecutionRequest): Promise<Tb1CommandAttemptResult>;
  wait(delayMs: number): Promise<void>;
}>;

type Tb1CommandSuccess =
  | Readonly<{
    ok: true;
    kind: "PROJECT_GET";
    projectId: string;
    projectNumber: string;
    lifecycleState: "ACTIVE";
    responseSha256: string;
    attemptCount: number;
  }>
  | Readonly<{
    ok: true;
    kind: "BILLING_INFO_GET";
    projectId: string;
    billingEnabled: boolean;
    responseSha256: string;
    attemptCount: number;
  }>
  | Readonly<{
    ok: true;
    kind: "BOOTSTRAP_SERVICES_LIST";
    observations: readonly Readonly<{
      name: (typeof TB1_BOOTSTRAP_APIS)[number];
      state: (typeof API_STATES)[number];
      consumerProjectNumber: string;
    }>[];
    responseSha256: string;
    attemptCount: number;
  }>
  | Readonly<{
    ok: true;
    kind: "GCLOUD_VERSION";
    version: string;
    responseSha256: string;
    attemptCount: number;
  }>
  | Readonly<{
    ok: true;
    kind: "COLLECTOR_IDENTITY";
    principalClass: "USER" | "SERVICE_ACCOUNT";
    principalIdentifierSha256: string;
    responseSha256: string;
    attemptCount: number;
  }>;

export type Tb1CommandResult =
  | Tb1CommandSuccess
  | Readonly<{
    ok: false;
    reason: Tb1CommandFailure;
    attemptCount: number;
  }>;

export type Tb1OutputPathPreflight =
  | Readonly<{
    reject: false;
    status: "ADVISORY_EXTERNAL_CANDIDATE_NOT_WRITE_AUTHORIZATION";
  }>
  | Readonly<{
    reject: true;
    reason:
      | "PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID"
      | "PATH_PREFLIGHT_CANONICALIZATION_FAILED";
  }>;

export type Tb1EvidenceEvaluation =
  | Readonly<{
    ok: true;
    disposition: Tb1Disposition;
    evidence: Readonly<Record<string, unknown>>;
    canonicalEvidence: string;
    evidenceSha256: string;
  }>
  | Readonly<{
    ok: false;
    reason: "EVIDENCE_INVALID";
  }>;

const OUTER_KEYS = Object.freeze([
  "contractVersion",
  "evidenceScope",
  "project",
  "billing",
  "operators",
  "bootstrapApis",
  "collection",
  "sources",
  "downstreamAuthority",
  "review",
  "integrity",
]);
const PROJECT_KEYS = Object.freeze([
  "projectId",
  "projectNumber",
  "lifecycleState",
  "bindingSource",
  "bindingResponseSha256",
]);
const BILLING_KEYS = Object.freeze([
  "classification",
  "accountIdentifierRetained",
  "observationSource",
]);
const OPERATORS_KEYS = Object.freeze(["collector", "reviewer"]);
const COLLECTOR_KEYS = Object.freeze([
  "principalClass",
  "principalIdentifierSha256",
]);
const REVIEWER_PRESENT_KEYS = Object.freeze([
  "status",
  "principalClass",
  "principalIdentifierSha256",
]);
const REVIEWER_ABSENT_KEYS = Object.freeze(["status"]);
const BOOTSTRAP_APIS_KEYS = Object.freeze(["names", "setSha256", "observations"]);
const API_OBSERVATION_KEYS = Object.freeze([
  "name",
  "state",
  "consumerProjectNumber",
]);
const COLLECTION_KEYS = Object.freeze([
  "startedAt",
  "completedAt",
  "maxAgeSeconds",
]);
const SOURCE_KEYS = Object.freeze(["tool", "toolVersion", "api", "responseSha256"]);
const DOWNSTREAM_AUTHORITY_KEYS = Object.freeze([
  "apiMutationAuthorized",
  "stateAuthorityAuthorized",
  "denyAuthorityAuthorized",
  "foundationAuthorityAuthorized",
  "runtimeAuthorityAuthorized",
  "jobExecutionAuthorized",
  "providerContactAuthorized",
]);
const REVIEW_PRESENT_KEYS = Object.freeze(["disposition", "reviewedAt"]);
const REVIEW_ABSENT_KEYS = Object.freeze(["disposition"]);
const INTEGRITY_KEYS = Object.freeze([
  "canonicalization",
  "algorithm",
  "evidenceSha256",
]);
const PROJECT_COMMAND_KEYS = Object.freeze([
  "projectId",
  "projectNumber",
  "lifecycleState",
]);
const BILLING_COMMAND_KEYS = Object.freeze(["projectId", "billingEnabled"]);
const SERVICE_COMMAND_KEYS = Object.freeze(["config", "state", "parent"]);
const SERVICE_CONFIG_KEYS = Object.freeze(["name"]);
const VERSION_COMMAND_KEYS = Object.freeze(["Google Cloud SDK"]);
const IDENTITY_COMMAND_KEYS = Object.freeze(["account"]);
const PRINCIPAL_CLASSES = Object.freeze([
  "USER",
  "SERVICE_ACCOUNT",
  "WORKLOAD_IDENTITY",
] as const);
const API_STATES = Object.freeze(["ENABLED", "DISABLED", "UNOBSERVABLE"] as const);
const BILLING_CLASSIFICATIONS = Object.freeze([
  "ENABLED_ACTIVE",
  "DISABLED",
  "UNOBSERVABLE",
] as const);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const FORBIDDEN_PROJECT_CLASS_PATTERN =
  /(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)/u;
const PROJECT_NUMBER_PATTERN = /^[1-9][0-9]*$/u;
const TOOL_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u;
const UTC_TIMESTAMP_PATTERN =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?Z$/u;
const EMAIL_PATTERN =
  /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}/u;
const EXACT_PRINCIPAL_IDENTIFIER_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/u;
const SERVICE_ACCOUNT_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+\.iam\.gserviceaccount\.com$/u;
const SENSITIVE_PATTERNS = Object.freeze([
  /billingAccounts\//iu,
  /\bya29\.[A-Za-z0-9._-]+/u,
  /\bBearer\s+[A-Za-z0-9._-]+/iu,
  /access[_-]?token/iu,
  /refresh[_-]?token/iu,
  /client[_-]?secret/iu,
  /private[_-]?key/iu,
  /GOOGLE_APPLICATION_CREDENTIALS/u,
  /DATABASE_URL/u,
  /postgres(?:ql)?:\/\//iu,
  /\/Users\//u,
  /\/home\//u,
  /\.config\/gcloud/u,
  /api\.tosspayments\.com/iu,
  /api\.paypal\.com/iu,
  /paymentKey/u,
  /customerKey/u,
  /orderId/u,
  /(?:password|secret)[=: _-]+[A-Za-z0-9]/iu,
]);
const JSON_WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

export function parseAndEvaluateTb1Evidence(
  raw: string,
  authoritativeNowMs: number,
): Tb1EvidenceEvaluation {
  if (!validAuthoritativeNow(authoritativeNowMs)) return invalidEvidence();
  const evidence = validatedEvidenceFromRaw(raw);
  if (!evidence) return invalidEvidence();
  const timestamps = readEvidenceTimestamps(evidence);
  if (!timestamps) return invalidEvidence();
  const disposition = currentDisposition(evidence, timestamps, authoritativeNowMs);
  if (!disposition) return invalidEvidence();

  const reconstructed = reconstructEvidence(evidence);
  if (!reconstructed) return invalidEvidence();
  const immutableEvidence = deepFreezeTb1(reconstructed);
  const canonicalEvidence = canonicalizeTb1Restricted(immutableEvidence);
  const evidenceSha256 = computeTb1EvidenceDigest(immutableEvidence);
  return Object.freeze({
    ok: true,
    disposition,
    evidence: immutableEvidence,
    canonicalEvidence,
    evidenceSha256,
  });
}

function validatedEvidenceFromRaw(raw: string): Record<string, unknown> | null {
  if (Buffer.byteLength(raw, "utf8") > TB1_MAX_EVIDENCE_BYTES) return null;
  if (containsSensitiveMaterial(raw)) return null;
  const parsed = parseRestrictedJson(raw);
  if (!tb1EvidencePassesStructuralSchemaPrefilter(parsed)) return null;
  const evidence = exactRecord(parsed, OUTER_KEYS);
  if (!evidence || containsSensitiveDecodedValue(evidence)) return null;
  return validateEvidenceSemantics(evidence) && validEvidenceDigest(evidence)
    ? evidence
    : null;
}

export function canonicalizeTb1Restricted(value: unknown): string {
  try {
    return canonicalizeRestrictedValue(value, 0, {
      active: new WeakSet<object>(),
      nodeCount: 0,
    });
  } catch {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
}

type CanonicalizationState = {
  active: WeakSet<object>;
  nodeCount: number;
};

function canonicalizeRestrictedValue(
  value: unknown,
  depth: number,
  state: CanonicalizationState,
): string {
  if (depth > TB1_MAX_CANONICAL_DEPTH) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  state.nodeCount += 1;
  if (state.nodeCount > TB1_MAX_CANONICAL_NODES) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  const scalar = canonicalizeRestrictedScalar(value);
  if (scalar !== null) return scalar;
  if (typeof value !== "object" || value === null) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  if (state.active.has(value)) throw new Error("TB1_CANONICALIZATION_REJECTED");
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      return canonicalizeRestrictedArray(value, depth, state);
    }
    return canonicalizeRestrictedObject(value, depth, state);
  } finally {
    state.active.delete(value);
  }
}

function canonicalizeRestrictedScalar(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return canonicalString(value);
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  return String(value);
}

function canonicalizeRestrictedArray(
  value: readonly unknown[],
  depth: number,
  state: CanonicalizationState,
): string {
  const length = admittedCanonicalArrayLength(value, state);
  validateCanonicalArrayShape(value, length);
  const values: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("TB1_CANONICALIZATION_REJECTED");
    }
    values.push(canonicalizeRestrictedValue(descriptor.value, depth + 1, state));
  }
  return `[${values.join(",")}]`;
}

function admittedCanonicalArrayLength(
  value: readonly unknown[],
  state: CanonicalizationState,
): number {
  const length: unknown = value.length;
  const remainingNodeCapacity = TB1_MAX_CANONICAL_NODES - state.nodeCount;
  if (!Number.isSafeInteger(length) || typeof length !== "number"
    || length < 0 || length > remainingNodeCapacity) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  return length;
}

function validateCanonicalArrayShape(
  value: readonly unknown[],
  length: number,
): void {
  const keys = canonicalArrayOwnKeys(value, length);
  validateCanonicalArrayIndexes(keys, length);
  validateCanonicalArrayLengthDescriptor(value, length);
}

function canonicalArrayOwnKeys(
  value: readonly unknown[],
  length: number,
): readonly PropertyKey[] {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")
    || keys.length !== length + 1) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  return keys;
}

function validateCanonicalArrayIndexes(
  keys: readonly PropertyKey[],
  length: number,
): void {
  for (let index = 0; index < length; index += 1) {
    if (keys[index] !== String(index)) {
      throw new Error("TB1_CANONICALIZATION_REJECTED");
    }
  }
  if (keys[length] !== "length") throw new Error("TB1_CANONICALIZATION_REJECTED");
}

function validateCanonicalArrayLengthDescriptor(
  value: readonly unknown[],
  length: number,
): void {
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)
    || lengthDescriptor.value !== length || lengthDescriptor.enumerable) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
}

function canonicalizeRestrictedObject(
  value: object,
  depth: number,
  state: CanonicalizationState,
): string {
  if (Reflect.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    throw new Error("TB1_CANONICALIZATION_REJECTED");
  }
  const entries: string[] = [];
  for (const key of ownKeys.map(String).sort()) {
    if (!wellFormedUnicode(key)) throw new Error("TB1_CANONICALIZATION_REJECTED");
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("TB1_CANONICALIZATION_REJECTED");
    }
    entries.push(
      `${canonicalString(key)}:${canonicalizeRestrictedValue(
        descriptor.value,
        depth + 1,
        state,
      )}`,
    );
  }
  return `{${entries.join(",")}}`;
}

function canonicalString(value: string): string {
  if (!wellFormedUnicode(value)) throw new Error("TB1_CANONICALIZATION_REJECTED");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("TB1_CANONICALIZATION_REJECTED");
  return encoded;
}

export function computeTb1EvidenceDigest(value: unknown): string {
  const evidence = exactRecord(value, OUTER_KEYS);
  if (!evidence) throw new Error("TB1_DIGEST_INPUT_REJECTED");
  const integrity = exactRecord(evidence.integrity, INTEGRITY_KEYS);
  if (!integrity) throw new Error("TB1_DIGEST_INPUT_REJECTED");
  const preimage = {
    ...evidence,
    integrity: {
      canonicalization: integrity.canonicalization,
      algorithm: integrity.algorithm,
    },
  };
  return sha256(canonicalizeTb1Restricted(preimage));
}

export function buildTb1ReadOnlyCommand(
  kind: Tb1CommandKind,
  projectId: string,
): readonly string[] {
  if (!validProjectId(projectId)) throw new Error("TB1_PROJECT_ID_REJECTED");
  switch (kind) {
    case "PROJECT_GET":
      return Object.freeze([
        "projects", "describe", projectId,
        "--format=json(projectId,projectNumber,lifecycleState)",
      ]);
    case "BILLING_INFO_GET":
      return Object.freeze([
        "beta", "billing", "projects", "describe", projectId,
        "--format=json(projectId,billingEnabled)",
      ]);
    case "BOOTSTRAP_SERVICES_LIST":
      return Object.freeze([
        "services", "list", `--project=${projectId}`, "--available",
        `--filter=config.name:(${TB1_BOOTSTRAP_APIS.join(" OR ")})`,
        "--format=json(config.name,state,parent)",
      ]);
    case "GCLOUD_VERSION":
      return Object.freeze(["version", "--format=json"]);
    case "COLLECTOR_IDENTITY":
      return Object.freeze([
        "auth", "list", "--filter=status:ACTIVE", "--format=json(account)",
      ]);
    default:
      throw new Error("TB1_COMMAND_KIND_REJECTED");
  }
}

export function approvedTb1ReadOnlyCommand(
  args: readonly string[],
  projectId: string,
): boolean {
  if (!validProjectId(projectId)) return false;
  const kinds: readonly Tb1CommandKind[] = [
    "PROJECT_GET",
    "BILLING_INFO_GET",
    "BOOTSTRAP_SERVICES_LIST",
    "GCLOUD_VERSION",
    "COLLECTOR_IDENTITY",
  ];
  return kinds.some((kind) => sameStrings(args, buildTb1ReadOnlyCommand(kind, projectId)));
}

export async function executeTb1ReadOnlyCommand(
  input: Readonly<{
    kind: Tb1CommandKind;
    args: readonly string[];
    projectId: string;
    cloudSdkConfigPath: string;
    repositoryRoot: string;
  }>,
  dependencies: Tb1CommandDependencies,
): Promise<Tb1CommandResult> {
  try {
    return await executeTb1ReadOnlyCommandBoundary(input, dependencies);
  } catch {
    return commandFailure("COMMAND_FAILED", 0);
  }
}

async function executeTb1ReadOnlyCommandBoundary(
  input: Readonly<{
    kind: Tb1CommandKind;
    args: readonly string[];
    projectId: string;
    cloudSdkConfigPath: string;
    repositoryRoot: string;
  }>,
  dependencies: Tb1CommandDependencies,
): Promise<Tb1CommandResult> {
  if (!validCommandKind(input.kind)
    || !approvedTb1ReadOnlyCommand(input.args, input.projectId)
    || !sameStrings(input.args, buildTb1ReadOnlyCommand(input.kind, input.projectId))) {
    return commandFailure("COMMAND_FAILED", 0);
  }
  const externalConfig = await externalCanonicalPath(
    input.cloudSdkConfigPath,
    input.repositoryRoot,
    dependencies,
  );
  if (!externalConfig.ok) {
    return commandFailure(
      externalConfig.reason === "CANONICALIZATION_FAILED"
        ? "PATH_CANONICALIZATION_FAILED"
        : "COMMAND_FAILED",
      0,
    );
  }

  return executeWithBoundedRetries(
    input.kind,
    input.args,
    input.projectId,
    externalConfig.path,
    dependencies,
  );
}

export async function preflightRejectRepositoryContainedOutputPath(
  outputPath: string,
  repositoryRoot: string,
  canonicalizePath: (path: string) => Promise<string>,
): Promise<Tb1OutputPathPreflight> {
  try {
    if (!isAbsolute(outputPath) || !isAbsolute(repositoryRoot)) {
      return pathPreflightRejected("PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID");
    }
    const [canonicalOutput, canonicalRoot] = await Promise.all([
      canonicalizePath(outputPath),
      canonicalizePath(repositoryRoot),
    ]);
    return pathIsOutside(canonicalOutput, canonicalRoot)
      ? Object.freeze({
        reject: false,
        status: "ADVISORY_EXTERNAL_CANDIDATE_NOT_WRITE_AUTHORIZATION",
      })
      : pathPreflightRejected("PATH_PREFLIGHT_REPOSITORY_CONTAINED_OR_INVALID");
  } catch {
    return pathPreflightRejected("PATH_PREFLIGHT_CANONICALIZATION_FAILED");
  }
}

function pathPreflightRejected(
  reason: Extract<Tb1OutputPathPreflight, { reject: true }>["reason"],
): Tb1OutputPathPreflight {
  return Object.freeze({ reject: true, reason });
}

export function tb1EvidencePassesStructuralSchemaPrefilter(value: unknown): boolean {
  const evidence = exactRecord(value, OUTER_KEYS);
  if (!evidence) return false;
  if (evidence.contractVersion !== TB1_CONTRACT_VERSION
    || evidence.evidenceScope !== TB1_EVIDENCE_SCOPE) return false;
  const validSections = [
    validStructuralProject(evidence.project),
    validBilling(evidence.billing),
    validStructuralOperators(evidence.operators),
    validBootstrapApis(evidence.bootstrapApis),
    validStructuralCollection(evidence.collection),
    validSources(evidence.sources),
    validDownstreamAuthority(evidence.downstreamAuthority),
    validStructuralReview(evidence.review, evidence.operators),
    validIntegrity(evidence.integrity),
  ];
  return validSections.every(Boolean);
}

function validateEvidenceSemantics(evidence: Record<string, unknown>): boolean {
  const project = exactRecord(evidence.project, PROJECT_KEYS);
  return project !== null
    && validProjectId(project.projectId)
    && validIndependentOperators(evidence.operators)
    && validProjectObservationBinding(evidence.project, evidence.bootstrapApis)
    && validCollectionOrdering(evidence.collection);
}

function validStructuralProject(value: unknown): boolean {
  const project = exactRecord(value, PROJECT_KEYS);
  return project !== null
    && validProjectIdGrammar(project.projectId)
    && validProjectNumber(project.projectNumber)
    && project.lifecycleState === "ACTIVE"
    && project.bindingSource === "cloudresourcemanager.googleapis.com/v3/projects.get"
    && validSha256(project.bindingResponseSha256);
}

function validBilling(value: unknown): boolean {
  const billing = exactRecord(value, BILLING_KEYS);
  return billing !== null
    && includesString(BILLING_CLASSIFICATIONS, billing.classification)
    && billing.accountIdentifierRetained === false
    && billing.observationSource ===
      "cloudbilling.googleapis.com/v1/projects.getBillingInfo";
}

function validStructuralOperators(value: unknown): boolean {
  const operators = exactRecord(value, OPERATORS_KEYS);
  if (!operators) return false;
  const collector = validPrincipalRecord(operators.collector, COLLECTOR_KEYS);
  if (!collector) return false;

  const absent = exactRecord(operators.reviewer, REVIEWER_ABSENT_KEYS);
  if (absent?.status === "ABSENT") return true;
  const reviewer = validPrincipalRecord(operators.reviewer, REVIEWER_PRESENT_KEYS);
  return reviewer !== null && reviewer.status === "PRESENT";
}

function validIndependentOperators(value: unknown): boolean {
  const operators = exactRecord(value, OPERATORS_KEYS);
  if (!operators) return false;
  const collector = validPrincipalRecord(operators.collector, COLLECTOR_KEYS);
  const reviewer = validPrincipalRecord(operators.reviewer, REVIEWER_PRESENT_KEYS);
  if (exactRecord(operators.reviewer, REVIEWER_ABSENT_KEYS)?.status === "ABSENT") {
    return collector !== null;
  }
  return collector !== null
    && reviewer !== null
    && reviewer.principalIdentifierSha256 !== collector.principalIdentifierSha256;
}

function validPrincipalRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const principal = exactRecord(value, keys);
  if (!principal
    || !includesString(PRINCIPAL_CLASSES, principal.principalClass)
    || !validSha256(principal.principalIdentifierSha256)) return null;
  return principal;
}

function validBootstrapApis(value: unknown): boolean {
  const apis = exactRecord(value, BOOTSTRAP_APIS_KEYS);
  if (!apis || apis.setSha256 !== TB1_BOOTSTRAP_API_SET_SHA256) return false;
  if (!exactStringArray(apis.names, TB1_BOOTSTRAP_APIS)) return false;
  if (!Array.isArray(apis.observations)
    || apis.observations.length !== TB1_BOOTSTRAP_APIS.length) return false;
  return apis.observations.every((observation, index) => (
    validApiObservation(observation, TB1_BOOTSTRAP_APIS[index])
  ));
}

function validApiObservation(value: unknown, expectedName: string): boolean {
  const observation = exactRecord(value, API_OBSERVATION_KEYS);
  return observation !== null
    && observation.name === expectedName
    && includesString(API_STATES, observation.state)
    && validProjectNumber(observation.consumerProjectNumber);
}

function validProjectObservationBinding(projectValue: unknown, apisValue: unknown): boolean {
  const project = exactRecord(projectValue, PROJECT_KEYS);
  const apis = exactRecord(apisValue, BOOTSTRAP_APIS_KEYS);
  if (!project || !apis || !Array.isArray(apis.observations)) return false;
  return apis.observations.every((value) => (
    exactRecord(value, API_OBSERVATION_KEYS)?.consumerProjectNumber === project.projectNumber
  ));
}

function validStructuralCollection(value: unknown): boolean {
  const collection = exactRecord(value, COLLECTION_KEYS);
  if (!collection || collection.maxAgeSeconds !== TB1_MAX_AGE_SECONDS) return false;
  const startedAtMs = utcTimestampMs(collection.startedAt);
  const completedAtMs = utcTimestampMs(collection.completedAt);
  return startedAtMs !== null && completedAtMs !== null;
}

function validCollectionOrdering(value: unknown): boolean {
  const collection = exactRecord(value, COLLECTION_KEYS);
  if (!collection) return false;
  const startedAtMs = utcTimestampMs(collection.startedAt);
  const completedAtMs = utcTimestampMs(collection.completedAt);
  return startedAtMs !== null && completedAtMs !== null && completedAtMs >= startedAtMs;
}

function validSources(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== TB1_APPROVED_SOURCE_APIS.length) return false;
  return value.every((sourceValue, index) => {
    const source = exactRecord(sourceValue, SOURCE_KEYS);
    return source !== null
      && source.tool === "gcloud"
      && typeof source.toolVersion === "string"
      && TOOL_VERSION_PATTERN.test(source.toolVersion)
      && source.api === TB1_APPROVED_SOURCE_APIS[index]
      && validSha256(source.responseSha256);
  });
}

function validDownstreamAuthority(value: unknown): boolean {
  const authority = exactRecord(value, DOWNSTREAM_AUTHORITY_KEYS);
  return authority !== null
    && DOWNSTREAM_AUTHORITY_KEYS.every((key) => authority[key] === false);
}

function validStructuralReview(value: unknown, operatorsValue: unknown): boolean {
  const operators = exactRecord(operatorsValue, OPERATORS_KEYS);
  if (!operators) return false;
  const reviewerAbsent = exactRecord(operators.reviewer, REVIEWER_ABSENT_KEYS)?.status === "ABSENT";
  if (reviewerAbsent) {
    const review = exactRecord(value, REVIEW_ABSENT_KEYS);
    return review?.disposition === "INDEPENDENT_REVIEW_REQUIRED";
  }

  const review = exactRecord(value, REVIEW_PRESENT_KEYS);
  return review !== null
    && includesString(TB1_DISPOSITIONS, review.disposition)
    && utcTimestampMs(review.reviewedAt) !== null;
}

function validIntegrity(value: unknown): boolean {
  const integrity = exactRecord(value, INTEGRITY_KEYS);
  return integrity !== null
    && integrity.canonicalization === TB1_CANONICALIZATION
    && integrity.algorithm === "SHA-256"
    && validSha256(integrity.evidenceSha256);
}

function validEvidenceDigest(evidence: Record<string, unknown>): boolean {
  const integrity = exactRecord(evidence.integrity, INTEGRITY_KEYS);
  if (!integrity || typeof integrity.evidenceSha256 !== "string") return false;
  try {
    return computeTb1EvidenceDigest(evidence) === integrity.evidenceSha256;
  } catch {
    return false;
  }
}

function currentDisposition(
  evidence: Record<string, unknown>,
  timestamps: Readonly<{
    completedAtMs: number;
    reviewedAtMs: number | null;
  }>,
  authoritativeNowMs: number,
): Tb1Disposition | null {
  const latestAdmittedTimestamp =
    authoritativeNowMs + TB1_FUTURE_CLOCK_ALLOWANCE_SECONDS * 1_000;
  if (timestamps.completedAtMs > latestAdmittedTimestamp
    || timestamps.reviewedAtMs !== null
      && timestamps.reviewedAtMs > latestAdmittedTimestamp) {
    return null;
  }
  if (authoritativeNowMs - timestamps.completedAtMs > TB1_MAX_AGE_SECONDS * 1_000) {
    return "EVIDENCE_STALE_OR_UNTRUSTED";
  }
  const expected = sealedDisposition(evidence);
  const review = plainDataRecord(evidence.review);
  if (!expected || !review || review.disposition !== expected) return null;
  return expected;
}

function sealedDisposition(evidence: Record<string, unknown>): Tb1Disposition | null {
  const operators = exactRecord(evidence.operators, OPERATORS_KEYS);
  const billing = exactRecord(evidence.billing, BILLING_KEYS);
  const apis = exactRecord(evidence.bootstrapApis, BOOTSTRAP_APIS_KEYS);
  if (!operators || !billing || !apis || !Array.isArray(apis.observations)) return null;
  if (exactRecord(operators.reviewer, REVIEWER_ABSENT_KEYS)?.status === "ABSENT") {
    return "INDEPENDENT_REVIEW_REQUIRED";
  }
  return reviewedDisposition(billing.classification, apis.observations);
}

function reviewedDisposition(
  billingClassification: unknown,
  observations: readonly unknown[],
): Tb1Disposition {
  if (billingClassification === "DISABLED") return "BILLING_NOT_READY";
  if (billingClassification === "UNOBSERVABLE"
    || apiStatePresent(observations, "UNOBSERVABLE")) {
    return "OBSERVATION_INCOMPLETE";
  }
  if (apiStatePresent(observations, "DISABLED")) {
    return "BOOTSTRAP_API_ACTIVATION_REQUIRED";
  }
  return "READY_FOR_STATE_BUCKET_PACKAGE";
}

function readEvidenceTimestamps(
  evidence: Record<string, unknown>,
): Readonly<{
  startedAtMs: number;
  completedAtMs: number;
  reviewedAtMs: number | null;
}> | null {
  const collection = exactRecord(evidence.collection, COLLECTION_KEYS);
  if (!collection) return null;
  const startedAtMs = utcTimestampMs(collection.startedAt);
  const completedAtMs = utcTimestampMs(collection.completedAt);
  if (startedAtMs === null || completedAtMs === null || completedAtMs < startedAtMs) return null;
  const review = plainDataRecord(evidence.review);
  let reviewedAtMs: number | null = null;
  if (review && "reviewedAt" in review) {
    reviewedAtMs = utcTimestampMs(review.reviewedAt);
    if (reviewedAtMs === null || reviewedAtMs < completedAtMs) return null;
  }
  return Object.freeze({ startedAtMs, completedAtMs, reviewedAtMs });
}

async function executeWithBoundedRetries(
  kind: Tb1CommandKind,
  args: readonly string[],
  projectId: string,
  externalConfig: string,
  dependencies: Tb1CommandDependencies,
): Promise<Tb1CommandResult> {
  for (let attempt = 1; attempt <= TB1_MAX_READ_ATTEMPTS; attempt += 1) {
    const attemptResult = await invokeCommandAttempt(
      args,
      externalConfig,
      dependencies.execute,
    );
    if (!attemptResult.ok) return commandFailure("EXECUTOR_REJECTED", attempt);
    const { decoded, observedBytes } = attemptResult;
    if (!decoded.ok) return commandFailure(decoded.reason, attempt);
    if (decoded.status === "SUCCESS") {
      const sanitized = parseSanitizedCommandResult(
        kind,
        decoded.stdout,
        observedBytes,
        projectId,
      );
      if (!sanitized || containsSensitiveDecodedValue(sanitized)) {
        return commandFailure("MALFORMED_OUTPUT", attempt);
      }
      return deepFreezeTb1({ ok: true, ...sanitized, attemptCount: attempt });
    }
    if (!transientStatus(decoded.status)) {
      return commandFailure(commandReason(decoded.status), attempt);
    }
    if (await retryWaitRejected(attempt, dependencies.wait)) {
      return commandFailure("RETRY_WAIT_REJECTED", attempt);
    }
  }
  return commandFailure("RETRY_EXHAUSTED", TB1_MAX_READ_ATTEMPTS);
}

type DecodedCommandAttempt =
  | Readonly<{
    ok: true;
    status: Tb1CommandAttemptStatus;
    stdout: string;
  }>
  | Readonly<{
    ok: false;
    reason: "OUTPUT_LIMIT_EXCEEDED" | "MALFORMED_OUTPUT";
  }>;

type InvokedCommandAttempt =
  | Readonly<{
    ok: true;
    decoded: DecodedCommandAttempt;
    observedBytes: Uint8Array;
  }>
  | Readonly<{ ok: false }>;

async function invokeCommandAttempt(
  args: readonly string[],
  externalConfig: string,
  execute: Tb1CommandDependencies["execute"],
): Promise<InvokedCommandAttempt> {
  try {
    const observed = await execute(Object.freeze({
      executable: "gcloud",
      args: Object.freeze([...args]),
      env: Object.freeze({ CLOUDSDK_CONFIG: externalConfig }),
      timeoutMs: TB1_COMMAND_TIMEOUT_MS,
    }));
    return Object.freeze({
      ok: true,
      decoded: boundedDecodedAttempt(observed),
      observedBytes: observed.stdout,
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

async function retryWaitRejected(
  attempt: number,
  wait: Tb1CommandDependencies["wait"],
): Promise<boolean> {
  if (attempt >= TB1_MAX_READ_ATTEMPTS) return false;
  try {
    await wait(attempt === 1 ? 250 : 1_000);
    return false;
  } catch {
    return true;
  }
}

function boundedDecodedAttempt(value: Tb1CommandAttemptResult): DecodedCommandAttempt {
  if (value.stdout.byteLength > TB1_MAX_STDOUT_BYTES
    || value.stderr.byteLength > TB1_MAX_STDERR_BYTES) {
    return Object.freeze({ ok: false, reason: "OUTPUT_LIMIT_EXCEEDED" });
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const stdout = decoder.decode(value.stdout);
    const stderr = decoder.decode(value.stderr);
    if (containsSensitiveMaterial(stderr)) {
      return Object.freeze({ ok: false, reason: "MALFORMED_OUTPUT" });
    }
    return Object.freeze({ ok: true, status: value.status, stdout });
  } catch {
    return Object.freeze({ ok: false, reason: "MALFORMED_OUTPUT" });
  }
}

type Tb1SanitizedCommandPayload =
  | Readonly<{
    kind: "PROJECT_GET";
    projectId: string;
    projectNumber: string;
    lifecycleState: "ACTIVE";
    responseSha256: string;
  }>
  | Readonly<{
    kind: "BILLING_INFO_GET";
    projectId: string;
    billingEnabled: boolean;
    responseSha256: string;
  }>
  | Readonly<{
    kind: "BOOTSTRAP_SERVICES_LIST";
    observations: readonly Readonly<{
      name: (typeof TB1_BOOTSTRAP_APIS)[number];
      state: (typeof API_STATES)[number];
      consumerProjectNumber: string;
    }>[];
    responseSha256: string;
  }>
  | Readonly<{
    kind: "GCLOUD_VERSION";
    version: string;
    responseSha256: string;
  }>
  | Readonly<{
    kind: "COLLECTOR_IDENTITY";
    principalClass: "USER" | "SERVICE_ACCOUNT";
    principalIdentifierSha256: string;
    responseSha256: string;
  }>;

function parseSanitizedCommandResult(
  kind: Tb1CommandKind,
  raw: string,
  rawBytes: Uint8Array,
  projectId: string,
): Tb1SanitizedCommandPayload | null {
  const parsed = parseRestrictedJson(raw);
  if (parsed === null || decodedCommandContainsSensitive(parsed, kind)) return null;
  const responseSha256 = sha256Bytes(rawBytes);
  switch (kind) {
    case "PROJECT_GET":
      return parseProjectCommandResult(parsed, projectId, responseSha256);
    case "BILLING_INFO_GET":
      return parseBillingCommandResult(parsed, projectId, responseSha256);
    case "BOOTSTRAP_SERVICES_LIST":
      return parseServicesCommandResult(parsed, responseSha256);
    case "GCLOUD_VERSION":
      return parseVersionCommandResult(parsed, responseSha256);
    case "COLLECTOR_IDENTITY":
      return parseIdentityCommandResult(parsed, responseSha256);
    default:
      return null;
  }
}

function parseProjectCommandResult(
  value: unknown,
  projectId: string,
  responseSha256: string,
): Tb1SanitizedCommandPayload | null {
  const project = exactRecord(value, PROJECT_COMMAND_KEYS);
  if (!project || project.projectId !== projectId
    || !validProjectNumber(project.projectNumber)
    || project.lifecycleState !== "ACTIVE") return null;
  return Object.freeze({
    kind: "PROJECT_GET",
    projectId,
    projectNumber: project.projectNumber,
    lifecycleState: "ACTIVE",
    responseSha256,
  });
}

function parseBillingCommandResult(
  value: unknown,
  projectId: string,
  responseSha256: string,
): Tb1SanitizedCommandPayload | null {
  const billing = exactRecord(value, BILLING_COMMAND_KEYS);
  if (!billing || billing.projectId !== projectId
    || typeof billing.billingEnabled !== "boolean") return null;
  return Object.freeze({
    kind: "BILLING_INFO_GET",
    projectId,
    billingEnabled: billing.billingEnabled,
    responseSha256,
  });
}

function parseServicesCommandResult(
  value: unknown,
  responseSha256: string,
): Tb1SanitizedCommandPayload | null {
  if (!Array.isArray(value) || value.length !== TB1_BOOTSTRAP_APIS.length) return null;
  const observations: {
    name: (typeof TB1_BOOTSTRAP_APIS)[number];
    state: (typeof API_STATES)[number];
    consumerProjectNumber: string;
  }[] = [];
  let expectedProjectNumber: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const expectedName = TB1_BOOTSTRAP_APIS[index];
    const observation = parseServiceObservation(value[index], expectedName);
    if (!observation) return null;
    if (expectedProjectNumber !== null
      && observation.consumerProjectNumber !== expectedProjectNumber) return null;
    expectedProjectNumber ??= observation.consumerProjectNumber;
    observations.push(observation);
  }
  return Object.freeze({
    kind: "BOOTSTRAP_SERVICES_LIST",
    observations: Object.freeze(observations),
    responseSha256,
  });
}

function parseServiceObservation(
  value: unknown,
  expectedName: (typeof TB1_BOOTSTRAP_APIS)[number],
): Readonly<{
  name: (typeof TB1_BOOTSTRAP_APIS)[number];
  state: (typeof API_STATES)[number];
  consumerProjectNumber: string;
}> | null {
  const item = exactRecord(value, SERVICE_COMMAND_KEYS);
  const config = item ? exactRecord(item.config, SERVICE_CONFIG_KEYS) : null;
  if (!item || !config || config.name !== expectedName
    || !includesString(API_STATES, item.state)
    || typeof item.parent !== "string") return null;
  const projectNumber = serviceParentProjectNumber(item.parent, expectedName);
  return projectNumber
    ? Object.freeze({
      name: expectedName,
      state: item.state,
      consumerProjectNumber: projectNumber,
    })
    : null;
}

function serviceParentProjectNumber(parent: string, service: string): string | null {
  const prefix = "projects/";
  const suffix = `/services/${service}`;
  if (!parent.startsWith(prefix) || !parent.endsWith(suffix)) return null;
  const projectNumber = parent.slice(prefix.length, -suffix.length);
  return validProjectNumber(projectNumber) ? projectNumber : null;
}

function parseVersionCommandResult(
  value: unknown,
  responseSha256: string,
): Tb1SanitizedCommandPayload | null {
  const version = exactRecord(value, VERSION_COMMAND_KEYS);
  if (!version || typeof version["Google Cloud SDK"] !== "string"
    || !TOOL_VERSION_PATTERN.test(version["Google Cloud SDK"])) return null;
  return Object.freeze({
    kind: "GCLOUD_VERSION",
    version: version["Google Cloud SDK"],
    responseSha256,
  });
}

function parseIdentityCommandResult(
  value: unknown,
  responseSha256: string,
): Tb1SanitizedCommandPayload | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const identity = exactRecord(value[0], IDENTITY_COMMAND_KEYS);
  if (!identity || typeof identity.account !== "string"
    || Buffer.byteLength(identity.account, "utf8") > 320
    || !EXACT_PRINCIPAL_IDENTIFIER_PATTERN.test(identity.account)
    || containsSensitiveString(identity.account, true)) return null;
  const principalClass = SERVICE_ACCOUNT_PATTERN.test(identity.account)
    ? "SERVICE_ACCOUNT"
    : "USER";
  return Object.freeze({
    kind: "COLLECTOR_IDENTITY",
    principalClass,
    principalIdentifierSha256: sha256(identity.account),
    responseSha256,
  });
}

async function externalCanonicalPath(
  candidate: string,
  repositoryRoot: string,
  dependencies: Pick<Tb1CommandDependencies, "canonicalizePath">,
): Promise<
  | Readonly<{ ok: true; path: string }>
  | Readonly<{
    ok: false;
    reason: "CONTAINED_OR_INVALID" | "CANONICALIZATION_FAILED";
  }>
> {
  if (!isAbsolute(candidate) || !isAbsolute(repositoryRoot)) {
    return Object.freeze({ ok: false, reason: "CONTAINED_OR_INVALID" });
  }
  try {
    const [canonicalCandidate, canonicalRoot] = await Promise.all([
      dependencies.canonicalizePath(candidate),
      dependencies.canonicalizePath(repositoryRoot),
    ]);
    return pathIsOutside(canonicalCandidate, canonicalRoot)
      ? Object.freeze({ ok: true, path: canonicalCandidate })
      : Object.freeze({ ok: false, reason: "CONTAINED_OR_INVALID" });
  } catch {
    return Object.freeze({ ok: false, reason: "CANONICALIZATION_FAILED" });
  }
}

function pathIsOutside(candidate: string, root: string): boolean {
  const relationship = relative(root, candidate);
  return relationship === ".."
    || relationship.startsWith(`..${sep}`)
    || isAbsolute(relationship);
}

function commandReason(status: Tb1CommandAttemptStatus): Tb1CommandFailure {
  if (status === "AUTHENTICATION_FAILED") return status;
  if (status === "AUTHORIZATION_FAILED") return status;
  if (status === "NOT_FOUND") return status;
  if (status === "PROJECT_MISMATCH") return status;
  if (status === "MALFORMED_OUTPUT") return status;
  return "COMMAND_FAILED";
}

function transientStatus(status: Tb1CommandAttemptStatus): boolean {
  return status === "TRANSIENT_429" || status === "TRANSIENT_5XX";
}

function commandFailure(reason: Tb1CommandFailure, attemptCount: number): Tb1CommandResult {
  return Object.freeze({ ok: false, reason, attemptCount });
}

function validCommandKind(value: unknown): value is Tb1CommandKind {
  return value === "PROJECT_GET"
    || value === "BILLING_INFO_GET"
    || value === "BOOTSTRAP_SERVICES_LIST"
    || value === "GCLOUD_VERSION"
    || value === "COLLECTOR_IDENTITY";
}

function validProjectIdGrammar(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}

function validProjectId(value: unknown): value is string {
  return validProjectIdGrammar(value)
    && !FORBIDDEN_PROJECT_CLASS_PATTERN.test(value);
}

function validProjectNumber(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 16 || !PROJECT_NUMBER_PATTERN.test(value)) {
    return false;
  }
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0;
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function validAuthoritativeNow(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function apiStatePresent(observations: readonly unknown[], state: string): boolean {
  return observations.some((value) => exactRecord(value, API_OBSERVATION_KEYS)?.state === state);
}

function utcTimestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null;
  const date = new Date(milliseconds);
  const expected = [
    Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]),
    Number(match[5]), Number(match[6]),
  ];
  const observed = [
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(),
    date.getUTCMinutes(), date.getUTCSeconds(),
  ];
  return expected.every((part, index) => observed[index] === part) ? milliseconds : null;
}

function exactStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function reconstructEvidence(
  evidence: Record<string, unknown>,
): Record<string, unknown> | null {
  try {
    return reconstructValidatedEvidence(evidence);
  } catch {
    return null;
  }
}

function reconstructValidatedEvidence(
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  const project = requiredExactRecord(evidence.project, PROJECT_KEYS);
  const billing = requiredExactRecord(evidence.billing, BILLING_KEYS);
  const operators = requiredExactRecord(evidence.operators, OPERATORS_KEYS);
  const bootstrapApis = requiredExactRecord(evidence.bootstrapApis, BOOTSTRAP_APIS_KEYS);
  const collection = requiredExactRecord(evidence.collection, COLLECTION_KEYS);
  const downstream = requiredExactRecord(
    evidence.downstreamAuthority,
    DOWNSTREAM_AUTHORITY_KEYS,
  );
  const integrity = requiredExactRecord(evidence.integrity, INTEGRITY_KEYS);
  const collector = requiredExactRecord(operators.collector, COLLECTOR_KEYS);
  const observations = reconstructObservations(
    requiredArray(bootstrapApis.observations),
  );
  const sources = reconstructSources(requiredArray(evidence.sources));

  return {
    contractVersion: evidence.contractVersion,
    evidenceScope: evidence.evidenceScope,
    project: {
      projectId: project.projectId,
      projectNumber: project.projectNumber,
      lifecycleState: project.lifecycleState,
      bindingSource: project.bindingSource,
      bindingResponseSha256: project.bindingResponseSha256,
    },
    billing: {
      classification: billing.classification,
      accountIdentifierRetained: billing.accountIdentifierRetained,
      observationSource: billing.observationSource,
    },
    operators: {
      collector: {
        principalClass: collector.principalClass,
        principalIdentifierSha256: collector.principalIdentifierSha256,
      },
      reviewer: reconstructReviewer(operators.reviewer),
    },
    bootstrapApis: {
      names: [...TB1_BOOTSTRAP_APIS],
      setSha256: bootstrapApis.setSha256,
      observations,
    },
    collection: {
      startedAt: collection.startedAt,
      completedAt: collection.completedAt,
      maxAgeSeconds: collection.maxAgeSeconds,
    },
    sources,
    downstreamAuthority: Object.fromEntries(
      DOWNSTREAM_AUTHORITY_KEYS.map((key) => [key, downstream[key]]),
    ),
    review: reconstructReview(evidence.review),
    integrity: {
      canonicalization: integrity.canonicalization,
      algorithm: integrity.algorithm,
      evidenceSha256: integrity.evidenceSha256,
    },
  };
}

function reconstructObservations(
  values: readonly unknown[],
): Record<string, unknown>[] {
  const observations: Record<string, unknown>[] = [];
  for (const value of values) {
    const observation = requiredExactRecord(value, API_OBSERVATION_KEYS);
    observations.push({
      name: observation.name,
      state: observation.state,
      consumerProjectNumber: observation.consumerProjectNumber,
    });
  }
  return observations;
}

function reconstructSources(values: readonly unknown[]): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  for (const value of values) {
    const source = requiredExactRecord(value, SOURCE_KEYS);
    sources.push({
      tool: source.tool,
      toolVersion: source.toolVersion,
      api: source.api,
      responseSha256: source.responseSha256,
    });
  }
  return sources;
}

function reconstructReviewer(value: unknown): Record<string, unknown> {
  const absent = exactRecord(value, REVIEWER_ABSENT_KEYS);
  if (absent?.status === "ABSENT") return { status: "ABSENT" };
  const present = requiredExactRecord(value, REVIEWER_PRESENT_KEYS);
  return {
    status: present.status,
    principalClass: present.principalClass,
    principalIdentifierSha256: present.principalIdentifierSha256,
  };
}

function reconstructReview(value: unknown): Record<string, unknown> {
  const absent = exactRecord(value, REVIEW_ABSENT_KEYS);
  if (absent) return { disposition: absent.disposition };
  const present = requiredExactRecord(value, REVIEW_PRESENT_KEYS);
  return {
    disposition: present.disposition,
    reviewedAt: present.reviewedAt,
  };
}

function requiredExactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const record = exactRecord(value, keys);
  if (!record) throw new Error("TB1_RECONSTRUCTION_REJECTED");
  return record;
}

function requiredArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("TB1_RECONSTRUCTION_REJECTED");
  return value;
}

function deepFreezeTb1<Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreezeTb1(descriptor.value);
  }
  return Object.freeze(value);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  const record = plainDataRecord(value);
  if (!record) return null;
  const keys = Object.keys(record);
  if (keys.length !== expectedKeys.length
    || !keys.every((key) => expectedKeys.includes(key))) return null;
  return record;
}

function plainDataRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (!Object.values(descriptors).every(
    (descriptor) => "value" in descriptor && descriptor.enumerable,
  )) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includesString<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function containsSensitiveMaterial(raw: string): boolean {
  return containsSensitiveString(raw, false);
}

function containsSensitiveString(value: string, allowPrincipal: boolean): boolean {
  return (!allowPrincipal && EMAIL_PATTERN.test(value))
    || SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

function decodedCommandContainsSensitive(
  value: unknown,
  kind: Tb1CommandKind,
): boolean {
  if (kind !== "COLLECTOR_IDENTITY") return containsSensitiveDecodedValue(value);
  if (!Array.isArray(value) || value.length !== 1) {
    return containsSensitiveDecodedValue(value);
  }
  const identity = exactRecord(value[0], IDENTITY_COMMAND_KEYS);
  if (!identity || typeof identity.account !== "string") {
    return containsSensitiveDecodedValue(value);
  }
  return containsSensitiveString(identity.account, true);
}

function containsSensitiveDecodedValue(value: unknown): boolean {
  if (typeof value === "string") return containsSensitiveString(value, false);
  if (typeof value !== "object" || value === null) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return true;
    if (containsSensitiveDecodedValue(descriptor.value)) return true;
  }
  return false;
}

function invalidEvidence(): Tb1EvidenceEvaluation {
  return Object.freeze({ ok: false, reason: "EVIDENCE_INVALID" });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseRestrictedJson(raw: string): unknown {
  try {
    new RestrictedJsonScanner(raw).scan();
    const parsed: unknown = JSON.parse(raw);
    canonicalizeTb1Restricted(parsed);
    return parsed;
  } catch {
    return null;
  }
}

class RestrictedJsonScanner {
  private index = 0;

  constructor(private readonly raw: string) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.index !== this.raw.length) throw new Error("TB1_JSON_REJECTED");
  }

  private scanValue(depth: number): void {
    if (depth > TB1_MAX_CANONICAL_DEPTH) throw new Error("TB1_JSON_REJECTED");
    const token = this.raw[this.index];
    if (token === "{") {
      this.scanObject(depth + 1);
      return;
    }
    if (token === "[") {
      this.scanArray(depth + 1);
      return;
    }
    if (token === "\"") {
      this.scanString();
      return;
    }
    if (token === "t") {
      this.scanLiteral("true");
      return;
    }
    if (token === "f") {
      this.scanLiteral("false");
      return;
    }
    if (token === "n") {
      this.scanLiteral("null");
      return;
    }
    this.scanNumber();
  }

  private scanObject(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.consume("}")) return;
    while (this.index < this.raw.length) {
      const key = this.scanString();
      if (keys.has(key)) throw new Error("TB1_DUPLICATE_JSON_KEY");
      keys.add(key);
      this.skipWhitespace();
      this.require(":");
      this.skipWhitespace();
      this.scanValue(depth);
      this.skipWhitespace();
      if (this.consume("}")) return;
      this.require(",");
      this.skipWhitespace();
    }
    throw new Error("TB1_JSON_REJECTED");
  }

  private scanArray(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.consume("]")) return;
    while (this.index < this.raw.length) {
      this.scanValue(depth);
      this.skipWhitespace();
      if (this.consume("]")) return;
      this.require(",");
      this.skipWhitespace();
    }
    throw new Error("TB1_JSON_REJECTED");
  }

  private scanString(): string {
    if (this.raw[this.index] !== "\"") throw new Error("TB1_JSON_REJECTED");
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.raw.length) {
      const code = this.raw.charCodeAt(this.index);
      if (this.stringEnded(escaped, code)) return this.finishString(start);
      this.rejectControlCharacter(escaped, code);
      escaped = !escaped && code === 0x5c;
      this.index += 1;
    }
    throw new Error("TB1_JSON_REJECTED");
  }

  private stringEnded(escaped: boolean, code: number): boolean {
    return !escaped && code === 0x22;
  }

  private rejectControlCharacter(escaped: boolean, code: number): void {
    if (!escaped && code < 0x20) throw new Error("TB1_JSON_REJECTED");
  }

  private finishString(start: number): string {
    this.index += 1;
    const decoded: unknown = JSON.parse(this.raw.slice(start, this.index));
    if (typeof decoded !== "string" || !wellFormedUnicode(decoded)) {
      throw new Error("TB1_JSON_REJECTED");
    }
    return decoded;
  }

  private scanNumber(): void {
    const start = this.index;
    while (this.index < this.raw.length && /[0-9eE+.-]/u.test(this.raw[this.index] ?? "")) {
      this.index += 1;
    }
    const token = this.raw.slice(start, this.index);
    if (!/^(0|[1-9][0-9]*)$/u.test(token)) throw new Error("TB1_NUMBER_REJECTED");
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      throw new Error("TB1_NUMBER_REJECTED");
    }
  }

  private scanLiteral(expected: "true" | "false" | "null"): void {
    if (!this.raw.startsWith(expected, this.index)) throw new Error("TB1_JSON_REJECTED");
    this.index += expected.length;
  }

  private skipWhitespace(): void {
    while (JSON_WHITESPACE.has(this.raw[this.index] ?? "")) this.index += 1;
  }

  private require(expected: ":" | ","): void {
    if (!this.consume(expected)) throw new Error("TB1_JSON_REJECTED");
  }

  private consume(expected: string): boolean {
    if (this.raw[this.index] !== expected) return false;
    this.index += 1;
    return true;
  }
}
