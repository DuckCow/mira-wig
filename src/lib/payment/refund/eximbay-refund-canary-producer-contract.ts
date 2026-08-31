import { createHash } from "node:crypto";

export const EXIMBAY_CANARY_EXACT_MID = "1849705C64";
export const EXIMBAY_CANARY_EXACT_SECRET_RESOURCE =
  "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key";
export const EXIMBAY_CANARY_EXACT_SECRET_VERSION = "1";
export const EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION =
  "mira-refund-eximbay-canary-attestation/v1";
export const EXIMBAY_CANARY_MERCHANT_BINDING_VERSION =
  "mira-refund-eximbay-sandbox-merchant-account/v1";
export const EXIMBAY_CANARY_CREDENTIAL_BINDING_VERSION =
  "mira-refund-eximbay-sandbox-credential-generation/v1";
export const EXIMBAY_CANARY_RUNTIME_READBACK_VERSION =
  "mira-refund-eximbay-canary-runtime-readback/v1";
export const EXIMBAY_CANARY_EXACT_PROJECT = "mira-refund-sandbox-0001";
export const EXIMBAY_CANARY_EXACT_REGION = "asia-northeast3";
export const EXIMBAY_CANARY_EXACT_JOB = "mira-eximbay-refund-canary";
export const EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT =
  "mira-eximbay-canary@mira-refund-sandbox-0001.iam.gserviceaccount.com";
export const EXIMBAY_CANARY_EXACT_IMAGE =
  "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:8e167a2a9eeeabe82feef0488c69f3b527a00cb0b8497d2d3c20289c72633baf";
export const EXIMBAY_CANARY_EXACT_DATABASE_SECRET = "mira-p3e-sbx-canary-database-url";
export const EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION = "1";
export const EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION =
  "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' "
  + "&& resource.service == 'sqladmin.googleapis.com'";
export const EXIMBAY_CANARY_APPROVAL_TTL_MS = 30 * 60 * 1_000;
export const EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS = 30 * 60 * 1_000;
export const EXIMBAY_CANARY_TARGET_ID_VERSION =
  "mira-refund-eximbay-canary-refund-attempt/v1";
export const EXIMBAY_CANARY_TARGET_REASON =
  "Attended fresh synthetic Eximbay SANDBOX canary full refund.";
export const EXIMBAY_CANARY_EXACT_ROUTING_RULE = "cfa.us.card.usd";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_NAME = "Mira Eximbay Canary";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_PHONE = "+1-202-555-0100";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_POSTAL_CODE = "10001";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_AREA = "NY";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_CITY = "Synthetic City";
export const EXIMBAY_CANARY_EXACT_SYNTHETIC_ADDRESS = "1 Synthetic Avenue";
export const EXIMBAY_CANARY_SYNTHETIC_EMAIL =
  /^mira-eximbay-canary\+[A-Za-z0-9._-]{1,64}@example\.test$/u;
export const EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS = Object.freeze({
  runtimeContractSha256: "9c0735317a2d7222c384cf7241858c24e6a4939fce18fd1d4a83922d8ad32703",
  imagePolicySha256: "5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876",
  preflightContractSha256: "c954c44e399f02121a95e99353f7eadf75377a1c425480249caa95695a737611",
  terraformMainSha256: "fcd0520e723d5d581235ce3005a681f37d323eae2125d39f437158819f57bb26",
  terraformLocalsSha256: "f6350470adbf97e92c7d39e79483ed7b623a7b183e9a00802bd71231ab11ad62",
  terraformVariablesSha256: "609a8553cbdb5a541126778d7e0725c188c9f148d38a4fcae7481e7f2fac3339",
});

const RELEASE_BINDING_VERSION = "mira-refund-eximbay-canary-release/v1";
const IMAGE_BINDING_VERSION = "mira-refund-eximbay-canary-image/v1";
const PREFLIGHT_JOB_BINDING_VERSION = "mira-refund-eximbay-canary-preflight-job/v1";
const CANARY_JOB_BINDING_VERSION = "mira-refund-eximbay-canary-job/v1";
const SECRET_GENERATION_BINDING_VERSION = "mira-refund-eximbay-canary-secret-generation/v1";
const DIGEST = /^[0-9a-f]{64}$/u;
const BOUNDED_ID = /^[A-Za-z0-9._:@/-]{1,512}$/u;

export type EximbayCanaryProducerErrorCode =
  | "ATTESTATION_INVALID"
  | "PAYMENT_ID_INVALID"
  | "PAYMENT_NOT_ELIGIBLE"
  | "SYNTHETIC_IDENTITY_INVALID"
  | "SALE_NOT_FRESH"
  | "REFUND_CONTAMINATION"
  | "TARGET_ALREADY_MATERIALIZED"
  | "TARGET_REQUEST_FAILED"
  | "TARGET_CLAIM_FAILED"
  | "TARGET_POSTCONDITION_FAILED"
  | "TARGET_SEAL_FAILED"
  | "RUNTIME_READBACK_INVALID"
  | "ISSUER_PRINCIPAL_INVALID"
  | "APPROVAL_ALREADY_EXISTS"
  | "APPROVAL_EVIDENCE_INVALID"
  | "APPROVAL_INSERT_FAILED"
  | "DATABASE_TIME_UNAVAILABLE"
  | "COMMITTED_CONTRACT_DRIFT"
  | "CLI_ARGUMENTS_INVALID"
  | "DATABASE_URL_REQUIRED"
  | "INPUT_FILE_INVALID";

export class EximbayCanaryProducerError extends Error {
  readonly code: EximbayCanaryProducerErrorCode;

  constructor(code: EximbayCanaryProducerErrorCode) {
    super(code);
    this.name = "EximbayCanaryProducerError";
    this.code = code;
  }
}

const ATTESTATION_KEYS = Object.freeze([
  "controlledNonCustomerContactAttested",
  "formatVersion",
  "mid",
  "mode",
  "noCustomerPiiAttested",
  "officialTestCredentialMaterialized",
  "provider",
  "secretResource",
  "secretVersion",
  "syntheticIdentityAttested",
].sort());

export type EximbayCanaryAttendedAttestation = Readonly<{
  formatVersion: typeof EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION;
  provider: "EXIMBAY";
  mode: "SANDBOX";
  mid: typeof EXIMBAY_CANARY_EXACT_MID;
  secretResource: typeof EXIMBAY_CANARY_EXACT_SECRET_RESOURCE;
  secretVersion: typeof EXIMBAY_CANARY_EXACT_SECRET_VERSION;
  officialTestCredentialMaterialized: true;
  syntheticIdentityAttested: true;
  controlledNonCustomerContactAttested: true;
  noCustomerPiiAttested: true;
}>;

export type EximbayCanaryContractDigests = Readonly<{
  runtimeContractSha256: string;
  imagePolicySha256: string;
  preflightContractSha256: string;
  terraformMainSha256: string;
  terraformLocalsSha256: string;
  terraformVariablesSha256: string;
}>;

export type EximbayCanaryTargetAuthority = Readonly<{
  targetBindingDigest: string;
  syntheticProvenanceDigest: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
}>;

export type EximbayCanaryRuntimeBindings = EximbayCanaryTargetAuthority & Readonly<{
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
}>;

export type EximbayCanaryRuntimeReadback = Readonly<{
  formatVersion: typeof EXIMBAY_CANARY_RUNTIME_READBACK_VERSION;
  projectId: typeof EXIMBAY_CANARY_EXACT_PROJECT;
  region: typeof EXIMBAY_CANARY_EXACT_REGION;
  jobName: typeof EXIMBAY_CANARY_EXACT_JOB;
  jobUid: string;
  jobGeneration: string;
  serviceAccountEmail: typeof EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT;
  imageDigestUri: typeof EXIMBAY_CANARY_EXACT_IMAGE;
  arguments: readonly ["eximbay-canary-once"];
  taskCount: 1;
  parallelism: 1;
  maxRetries: 0;
  taskTimeoutSeconds: 150;
  automaticTrigger: false;
  executionCount: 0;
  resourceCount: 5;
  cloudSqlClientCondition: typeof EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION;
  databaseSecretAccessor: true;
  providerSecretAccessor: true;
  invokerBindingCount: 0;
  schedulerTargetCount: 0;
  providerContactAuthorized: false;
  databaseSecretId: typeof EXIMBAY_CANARY_EXACT_DATABASE_SECRET;
  databaseSecretVersion: typeof EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION;
  providerSecretResource: typeof EXIMBAY_CANARY_EXACT_SECRET_RESOURCE;
  providerSecretVersion: typeof EXIMBAY_CANARY_EXACT_SECRET_VERSION;
  mid: typeof EXIMBAY_CANARY_EXACT_MID;
  authority: EximbayCanaryRuntimeBindings;
}>;

type MerchantAuthorityInput = Readonly<{
  provider?: unknown;
  mode?: unknown;
  mid?: unknown;
}>;

type CredentialAuthorityInput = MerchantAuthorityInput & Readonly<{
  secretResource: unknown;
  secretVersion: unknown;
  merchantAccountBindingId: unknown;
}>;

export function deriveEximbayCanaryMerchantAccountBindingId(
  input: MerchantAuthorityInput,
): string {
  if (!exactMerchantAuthority(input)) {
    throw new Error("EXIMBAY_CANARY_MERCHANT_AUTHORITY_INVALID");
  }
  return digest([
    EXIMBAY_CANARY_MERCHANT_BINDING_VERSION,
    "EXIMBAY",
    "SANDBOX",
    EXIMBAY_CANARY_EXACT_MID,
  ]);
}

export function deriveEximbayCanaryCredentialGenerationBindingId(
  input: CredentialAuthorityInput,
): string {
  if (!exactCredentialAuthority(input)) {
    throw new Error("EXIMBAY_CANARY_CREDENTIAL_AUTHORITY_INVALID");
  }
  return digest([
    EXIMBAY_CANARY_CREDENTIAL_BINDING_VERSION,
    "EXIMBAY",
    "SANDBOX",
    EXIMBAY_CANARY_EXACT_MID,
    EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    input.merchantAccountBindingId,
  ]);
}

export function parseEximbayCanaryAttestation(
  value: unknown,
): EximbayCanaryAttendedAttestation | null {
  if (!isRecord(value) || !hasExactKeys(value, ATTESTATION_KEYS)) return null;
  const valid = [
    exactMerchantAuthority(value),
    value.formatVersion === EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION,
    value.secretResource === EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    value.secretVersion === EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    value.officialTestCredentialMaterialized === true,
    value.syntheticIdentityAttested === true,
    value.controlledNonCustomerContactAttested === true,
    value.noCustomerPiiAttested === true,
  ].every(Boolean);
  if (!valid) return null;
  return Object.freeze({
    formatVersion: EXIMBAY_CANARY_ATTENDED_ATTESTATION_VERSION,
    provider: "EXIMBAY",
    mode: "SANDBOX",
    mid: EXIMBAY_CANARY_EXACT_MID,
    secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    officialTestCredentialMaterialized: true,
    syntheticIdentityAttested: true,
    controlledNonCustomerContactAttested: true,
    noCustomerPiiAttested: true,
  });
}

export function deriveEximbayCanaryRuntimeBindings(
  contracts: EximbayCanaryContractDigests,
  target: EximbayCanaryTargetAuthority,
): EximbayCanaryRuntimeBindings {
  if (!validContractDigests(contracts) || !validTargetAuthority(target)) {
    throw new Error("EXIMBAY_CANARY_RUNTIME_BINDING_INPUT_INVALID");
  }
  const releaseBindingDigest = digest([
    RELEASE_BINDING_VERSION,
    contracts.runtimeContractSha256,
    contracts.imagePolicySha256,
    contracts.preflightContractSha256,
    contracts.terraformMainSha256,
    contracts.terraformLocalsSha256,
    contracts.terraformVariablesSha256,
  ]);
  const imageBindingDigest = digest([
    IMAGE_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_IMAGE,
    "d24f98c7fd30f79842c860e5ac70baf3ed7dbc7f7f4beed4dfd8ee516d530a07",
    198,
    4,
    contracts.imagePolicySha256,
  ]);
  const preflightJobBindingDigest = digest([
    PREFLIGHT_JOB_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_PROJECT,
    EXIMBAY_CANARY_EXACT_REGION,
    "mira-p3e-sbx-refund-preflight",
    contracts.preflightContractSha256,
    imageBindingDigest,
  ]);
  const secretGenerationBindingDigest = digest([
    SECRET_GENERATION_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    target.credentialGenerationBindingId,
  ]);
  const canaryJobBindingDigest = digest([
    CANARY_JOB_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_PROJECT,
    EXIMBAY_CANARY_EXACT_REGION,
    EXIMBAY_CANARY_EXACT_JOB,
    EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
    EXIMBAY_CANARY_EXACT_IMAGE,
    ["eximbay-canary-once"],
    1,
    1,
    0,
    150,
    false,
    releaseBindingDigest,
    imageBindingDigest,
    preflightJobBindingDigest,
    secretGenerationBindingDigest,
    target.targetBindingDigest,
    target.syntheticProvenanceDigest,
    target.merchantAccountBindingId,
    target.credentialGenerationBindingId,
    EXIMBAY_CANARY_EXACT_MID,
  ]);
  return Object.freeze({
    ...target,
    releaseBindingDigest,
    canaryJobBindingDigest,
    preflightJobBindingDigest,
    imageBindingDigest,
    secretGenerationBindingDigest,
  });
}

export function requireEximbayCanaryExactContractDigests(
  contracts: EximbayCanaryContractDigests,
): void {
  if (!validContractDigests(contracts)) {
    throw new EximbayCanaryProducerError("COMMITTED_CONTRACT_DRIFT");
  }
}

export function deriveEximbayCanaryRefundAttemptId(paymentId: string): string {
  return `eximbay-canary-${digest([
    EXIMBAY_CANARY_TARGET_ID_VERSION, paymentId,
  ]).slice(0, 40)}`;
}

export function parseEximbayCanaryRuntimeReadback(
  value: unknown,
  expected: EximbayCanaryRuntimeBindings,
): EximbayCanaryRuntimeReadback | null {
  if (!runtimeReadbackEnvelopeMatches(value)) return null;
  if (!runtimeAuthorityMatches(value.authority, expected)) return null;
  return Object.freeze({
    formatVersion: EXIMBAY_CANARY_RUNTIME_READBACK_VERSION,
    projectId: EXIMBAY_CANARY_EXACT_PROJECT,
    region: EXIMBAY_CANARY_EXACT_REGION,
    jobName: EXIMBAY_CANARY_EXACT_JOB,
    jobUid: value.jobUid,
    jobGeneration: value.jobGeneration,
    serviceAccountEmail: EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
    imageDigestUri: EXIMBAY_CANARY_EXACT_IMAGE,
    arguments: Object.freeze(["eximbay-canary-once"] as const),
    taskCount: 1,
    parallelism: 1,
    maxRetries: 0,
    taskTimeoutSeconds: 150,
    automaticTrigger: false,
    executionCount: 0,
    resourceCount: 5,
    cloudSqlClientCondition: EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION,
    databaseSecretAccessor: true,
    providerSecretAccessor: true,
    invokerBindingCount: 0,
    schedulerTargetCount: 0,
    providerContactAuthorized: false,
    databaseSecretId: EXIMBAY_CANARY_EXACT_DATABASE_SECRET,
    databaseSecretVersion: EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION,
    providerSecretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    providerSecretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    mid: EXIMBAY_CANARY_EXACT_MID,
    authority: expected,
  });
}

export function extractEximbayCanaryRuntimeTargetAuthority(
  value: unknown,
): EximbayCanaryTargetAuthority | null {
  if (!runtimeReadbackEnvelopeMatches(value)) return null;
  const authority = value.authority;
  const expectedKeys = [
    "canaryJobBindingDigest", "credentialGenerationBindingId", "imageBindingDigest",
    "merchantAccountBindingId", "preflightJobBindingDigest", "releaseBindingDigest",
    "secretGenerationBindingDigest", "syntheticProvenanceDigest", "targetBindingDigest",
  ].sort();
  if (!hasExactKeys(authority, expectedKeys)) return null;
  const target = {
    targetBindingDigest: authority.targetBindingDigest,
    syntheticProvenanceDigest: authority.syntheticProvenanceDigest,
    merchantAccountBindingId: authority.merchantAccountBindingId,
    credentialGenerationBindingId: authority.credentialGenerationBindingId,
  };
  return validTargetAuthorityValues(target)
    ? Object.freeze(target)
    : null;
}

function exactCredentialAuthority(input: CredentialAuthorityInput): boolean {
  if (!exactMerchantAuthority(input)) return false;
  if (input.secretResource !== EXIMBAY_CANARY_EXACT_SECRET_RESOURCE
    || input.secretVersion !== EXIMBAY_CANARY_EXACT_SECRET_VERSION) return false;
  const expectedMerchant = deriveEximbayCanaryMerchantAccountBindingId(input);
  return input.merchantAccountBindingId === expectedMerchant;
}

function exactMerchantAuthority(input: MerchantAuthorityInput): boolean {
  return input.provider === "EXIMBAY"
    && input.mode === "SANDBOX"
    && input.mid === EXIMBAY_CANARY_EXACT_MID;
}

function validContractDigests(input: EximbayCanaryContractDigests): boolean {
  return [
    input.runtimeContractSha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.runtimeContractSha256,
    input.imagePolicySha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.imagePolicySha256,
    input.preflightContractSha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.preflightContractSha256,
    input.terraformMainSha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformMainSha256,
    input.terraformLocalsSha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformLocalsSha256,
    input.terraformVariablesSha256 === EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.terraformVariablesSha256,
  ].every(Boolean);
}

function validTargetAuthority(input: EximbayCanaryTargetAuthority): boolean {
  if (!validTargetAuthorityValues(input)) return false;
  const merchant = deriveEximbayCanaryMerchantAccountBindingId({
    provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
  });
  const credential = deriveEximbayCanaryCredentialGenerationBindingId({
    provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
    secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    merchantAccountBindingId: merchant,
  });
  return input.merchantAccountBindingId === merchant
    && input.credentialGenerationBindingId === credential;
}

function validTargetAuthorityValues(
  input: Readonly<Record<string, unknown>>,
): input is EximbayCanaryTargetAuthority {
  return [input.targetBindingDigest, input.syntheticProvenanceDigest,
    input.merchantAccountBindingId, input.credentialGenerationBindingId]
    .every((value) => typeof value === "string" && DIGEST.test(value));
}

function runtimeReadbackHasExactKeys(value: Readonly<Record<string, unknown>>): boolean {
  return hasExactKeys(value, [
    "arguments", "authority", "automaticTrigger", "cloudSqlClientCondition",
    "databaseSecretAccessor", "databaseSecretId", "databaseSecretVersion", "executionCount",
    "formatVersion", "imageDigestUri", "invokerBindingCount", "jobGeneration", "jobName",
    "jobUid", "maxRetries", "mid", "parallelism", "projectId", "providerContactAuthorized",
    "providerSecretAccessor", "providerSecretResource", "providerSecretVersion", "region",
    "resourceCount", "schedulerTargetCount", "serviceAccountEmail", "taskCount",
    "taskTimeoutSeconds",
  ].sort());
}

function runtimeReadbackIdentityMatches(value: Readonly<Record<string, unknown>>): boolean {
  return [
    value.formatVersion === EXIMBAY_CANARY_RUNTIME_READBACK_VERSION,
    value.projectId === EXIMBAY_CANARY_EXACT_PROJECT,
    value.region === EXIMBAY_CANARY_EXACT_REGION,
    value.jobName === EXIMBAY_CANARY_EXACT_JOB,
    value.serviceAccountEmail === EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
    value.imageDigestUri === EXIMBAY_CANARY_EXACT_IMAGE,
    value.databaseSecretId === EXIMBAY_CANARY_EXACT_DATABASE_SECRET,
    value.databaseSecretVersion === EXIMBAY_CANARY_EXACT_DATABASE_SECRET_VERSION,
    value.providerSecretResource === EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    value.providerSecretVersion === EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    value.mid === EXIMBAY_CANARY_EXACT_MID,
    value.cloudSqlClientCondition === EXIMBAY_CANARY_EXACT_CLOUD_SQL_CONDITION,
  ].every(Boolean);
}

function runtimeReadbackShapeMatches(value: Readonly<Record<string, unknown>>): boolean {
  return [
    Array.isArray(value.arguments),
    Array.isArray(value.arguments) && value.arguments.length === 1,
    Array.isArray(value.arguments) && value.arguments[0] === "eximbay-canary-once",
    value.taskCount === 1,
    value.parallelism === 1,
    value.maxRetries === 0,
    value.taskTimeoutSeconds === 150,
    value.automaticTrigger === false,
    value.executionCount === 0,
    value.resourceCount === 5,
    value.databaseSecretAccessor === true,
    value.providerSecretAccessor === true,
    value.invokerBindingCount === 0,
    value.schedulerTargetCount === 0,
    value.providerContactAuthorized === false,
  ].every(Boolean);
}

function runtimeReadbackEnvelopeMatches(
  value: unknown,
): value is Record<string, unknown> & Readonly<{
  jobUid: string;
  jobGeneration: string;
  authority: Record<string, unknown>;
}> {
  if (!isRecord(value)) return false;
  return [
    runtimeReadbackHasExactKeys(value),
    runtimeReadbackIdentityMatches(value),
    runtimeReadbackShapeMatches(value),
    boundedIdentifier(value.jobUid),
    boundedIdentifier(value.jobGeneration),
    isRecord(value.authority),
  ].every(Boolean);
}

function runtimeAuthorityMatches(
  value: Readonly<Record<string, unknown>>,
  expected: EximbayCanaryRuntimeBindings,
): boolean {
  const expectedKeys = Object.keys(expected).sort();
  if (!hasExactKeys(value, expectedKeys)) return false;
  return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function boundedIdentifier(value: unknown): value is string {
  return typeof value === "string" && BOUNDED_ID.test(value) && !/\p{Cc}/u.test(value);
}

function digest(values: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
