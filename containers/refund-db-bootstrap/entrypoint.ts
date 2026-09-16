import { applyRefundAuthorizationCutover as applyCanonicalCutover,
  REFUND_AUTHORIZATION_CUTOVER_MODE as CANONICAL_CUTOVER_MODE } from "../../scripts/refund-canonical-authorization-cutover.js";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  APPLICATION_CREDENTIAL_MODE,
  APPLICATION_ROLES,
  CANARY_CREDENTIAL_RECOVERY_MODE,
  ApplicationCredentialFailure,
  generateApplicationCredential,
  materializeApplicationCredentials,
  recoverCanaryApplicationCredential,
  RestSecretMetadataClient,
  setApplicationPasswords,
  setCanaryApplicationPassword,
  verifyApplicationPasswordLogins,
  verifyCanaryApplicationPasswordLogin,
  type ApplicationCredential,
  type ApplicationRole,
} from "./application-credentials.js";
import {
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_JOB,
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE,
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
  CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION,
  CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION_UID,
  readContactedReconciliationBusinessState,
  type FixedReadbackQuery,
} from "./contacted-reconciliation-business-state-readback.js";
import {
  REFUND_READINESS_BUSINESS_STATE_READBACK_JOB,
  REFUND_READINESS_BUSINESS_STATE_READBACK_MODE,
  REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
  readRefundReadinessBusinessState,
} from "./refund-readiness-business-state-readback.js";
import {
  setPl09DispatcherRoleGrants,
  applyBusinessStateReadbackRoleGrants,
  applyContactedReconciliationRoleGrants,
  applyEximbayP3eCanaryRoleGrants,
  applyRefundReadinessReadbackRoleGrants,
  applySyntheticSaleRoleGrants,
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  EximbayP3eDatabaseBootstrapError,
  materializeSyntheticSaleMarketPrecondition,
  revokeBusinessStateReadbackRoleGrants,
  revokeRefundReadinessReadbackRoleGrants,
  restoreCanaryRefundRoleGrants,
  verifyExactEffectivePrivileges,
} from
  "../../scripts/eximbay-p3e-database-bootstrap.js";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "../../src/lib/payment/refund/worker-migration-inventory.js";

import {
  applyRefundAuthorizationCutover,
  REFUND_AUTHORIZATION_CUTOVER_MODE,
  RefundAuthorizationCutoverFailure,
  validCutoverApplicationRole,
} from "../../scripts/refund-authorization-cutover.js";
export { REFUND_AUTHORIZATION_CUTOVER_MODE } from "../../scripts/refund-authorization-cutover.js";

export { CANONICAL_CUTOVER_MODE };

const PROJECT_ID = "mira-refund-sandbox-0001";
const REGION = "asia-northeast3";
const INSTANCE = "mira-p3e-sbx-refund-pg18";
const CONNECTION_NAME = `${PROJECT_ID}:${REGION}:${INSTANCE}`;
const DATABASE_NAME = "refund_sandbox";
const JOB_NAME = "mira-p3e-sbx-refund-db-bootstrap";
const SERVICE_ACCOUNT_ID = "mira-p3e-sbx-db-bootstrap";
const IAM_DATABASE_USERNAME = `${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam`;
const IMAGE_PREFIX = `${REGION}-docker.pkg.dev/${PROJECT_ID}/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:`;
const SOURCE_COMMIT_FILE = "/bootstrap-source-commit";
const PROXY_EXECUTABLE = "/usr/local/bin/cloud-sql-proxy";
const ROLE_BOOTSTRAP_EXECUTABLE = "/app/scripts/eximbay-p3e-database-bootstrap.mjs";
const TARGET_PRODUCER_EXECUTABLE = "/app/scripts/eximbay-refund-canary-target-producer.mjs";
const PRISMA_EXECUTABLE = "/app/node_modules/prisma/build/index.js";
const MIGRATIONS_DIRECTORY = "/app/prisma/migrations";
const READINESS_URL = "http://127.0.0.1:9801/readiness";
const READINESS_TIMEOUT_MS = 120_000;
const READINESS_POLL_MS = 250;
export const PROXY_DIAGNOSTIC_BYTE_LIMIT = 4_096;
export const PRODUCER_RESULT_BYTE_LIMIT = 16_384;
export const PL09_DISPATCHER_ROLE_GRANT_MODE = "apply-pl09-dispatcher-role-grants" as const;
export const PL09_DISPATCHER_ROLE_REVOKE_MODE = "revoke-pl09-dispatcher-role-grants" as const;
export const CANARY_ROLE_GRANT_MODE = "apply-canary-role-grants" as const;
export const SYNTHETIC_SALE_ROLE_GRANT_MODE = "apply-synthetic-sale-role-grants" as const;
export const CONTACTED_RECONCILIATION_ROLE_GRANT_MODE =
  "apply-contacted-reconciliation-role-grants" as const;
export const BUSINESS_STATE_READBACK_ROLE_GRANT_MODE =
  "apply-business-state-readback-role-grants" as const;
export const BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE =
  "revoke-business-state-readback-role-grants" as const;
export const REFUND_READINESS_READBACK_ROLE_GRANT_MODE =
  "apply-refund-readiness-readback-role-grants" as const;
export const REFUND_READINESS_READBACK_ROLE_REVOKE_MODE =
  "revoke-refund-readiness-readback-role-grants" as const;
export const SYNTHETIC_SALE_MARKET_PRECONDITION_MODE =
  "materialize-synthetic-sale-market-precondition" as const;
export const CANARY_REFUND_ROLE_RESTORE_MODE = "restore-canary-refund-role-grants" as const;
export const MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE = "materialize-eximbay-canary-target" as const;
export const ISSUE_EXIMBAY_CANARY_APPROVAL_MODE = "issue-eximbay-canary-approval" as const;

export const BOOTSTRAP_FAILURE_CODES = Object.freeze([
  "PROXY_START_FAILED",
  "PROXY_EARLY_EXIT",
  "PROXY_READY_TIMEOUT",
  "DB_CONNECT_FAILED",
  "LEDGER_READ_FAILED",
  "LEDGER_REJECTED",
  "ROLE_AUTHORITY_POSTCONDITION_FAILED",
  "RUNTIME_LOCAL_FAILED",
  "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT",
  "SECRET_METADATA_UNAVAILABLE",
  "SECRET_VERSION_BASELINE_DRIFT",
  "APPLICATION_PASSWORD_TRANSACTION_FAILED",
  "APPLICATION_PASSWORD_LOGIN_FAILED",
  "SECRET_VERSION_ADD_FAILED",
  "SECRET_VERSION_ADD_AMBIGUOUS_ZERO",
  "SECRET_VERSION_ADD_AMBIGUOUS_ONE",
  "SECRET_VERSION_ADD_AMBIGUOUS_DRIFT",
  "SECRET_VERSION_POSTCONDITION_FAILED",
] as const);

export const PROXY_FAILURE_CLASSES = Object.freeze([
  "PROXY_CREDENTIAL_SOURCE_FAILED",
  "PROXY_SQLADMIN_PERMISSION_DENIED",
  "PROXY_SQLADMIN_REQUEST_FAILED",
  "PROXY_INSTANCE_CONFIG_FAILED",
  "PROXY_LISTENER_FAILED",
  "PROXY_EARLY_EXIT_UNCLASSIFIED",
] as const);

export const PROXY_TRANSPORT_CLASSES = Object.freeze([
  "TOKEN",
  "DNS",
  "CONNECT",
  "TLS",
  "TIMEOUT",
  "RESET",
  "OTHER",
] as const);

export const SQLADMIN_REQUEST_PHASE = "INSTANCE_METADATA" as const;
export const SQLADMIN_REQUEST_HOST = "sqladmin.googleapis.com" as const;

type BootstrapFailureCode = (typeof BOOTSTRAP_FAILURE_CODES)[number];
type RuntimeBindings = Readonly<{
  targetBindingDigest: string;
  syntheticProvenanceDigest: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
}>;
export type MaterializedTargetProducerResult = Readonly<{
  ok: true;
  code: "EXIMBAY_CANARY_TARGET_MATERIALIZED";
  paymentId: string;
  checkoutSessionId: string;
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  providerOperationBindingId: string;
  targetBindingDigest: string;
  syntheticProvenanceDigest: string;
  runtimeBindings: RuntimeBindings;
}>;
export type IssuedApprovalProducerResult = Readonly<{
  ok: true;
  code: "EXIMBAY_CANARY_APPROVAL_ISSUED";
  approvalId: string;
  commandId: string;
  approvedAt: string;
  expiresAt: string;
  approvalEvidenceDigest: string;
  targetBindingDigest: string;
}>;
export type ProducerResult = MaterializedTargetProducerResult | IssuedApprovalProducerResult;
export type ProxyFailureClass = (typeof PROXY_FAILURE_CLASSES)[number];
export type ProxyTransportClass = (typeof PROXY_TRANSPORT_CLASSES)[number];
export type SqlAdminRequestSubtype = Readonly<{
  requestPhase: typeof SQLADMIN_REQUEST_PHASE;
  host: typeof SQLADMIN_REQUEST_HOST;
  httpStatus?: number;
  transportClass?: ProxyTransportClass;
  timeout?: true;
}>;
type SafeFailureDetails = Readonly<{
  proxyExitCode?: number | null;
  proxySignal?: string | null;
  proxyDiagnosticAvailable?: boolean;
  proxyFailureClass?: ProxyFailureClass;
  validatedProducerResult?: ProducerResult;
}> & Partial<SqlAdminRequestSubtype>;
type SafeFailureRecord = Readonly<{ code: "REFUND_AUTHORIZATION_CUTOVER_STOP"; phase: string; migrationState: string }> & SafeFailureDetails | Readonly<{
  code: BootstrapFailureCode;
  secretResourceName?: string;
  versionCount?: number;
}> & SafeFailureDetails;
type ProxyStartObservation = { failed: boolean };
type ProxyReadinessProcess = Pick<ChildProcess, "exitCode" | "signalCode">;
type ProxyDiagnosticStream = Pick<NodeJS.ReadableStream, "on">;
export type ProxyDiagnosticSummary = {
  observedBytes: number;
  truncated: boolean;
  failureClass: Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null;
  requestSubtype: SqlAdminRequestSubtype | null;
};
export type ProxyReadinessDependencies = Readonly<{
  now: () => number;
  fetchReadiness: () => Promise<boolean>;
  wait: (milliseconds: number) => Promise<void>;
}>;
export type ProxyLifetimeDependencies<Result> = Readonly<{
  awaitReadiness: () => Promise<void>;
  databaseWork: () => Promise<Result>;
  stopProxy: () => Promise<void>;
}>;

export const PROXY_STDIO = Object.freeze(["ignore", "pipe", "pipe"] as const);
const proxyDiagnosticSettled = new WeakMap<ProxyDiagnosticSummary, Promise<void>>();

class BootstrapStageFailure extends Error {
  readonly record: SafeFailureRecord;

  constructor(code: BootstrapFailureCode, details: SafeFailureDetails = {}) {
    super(code);
    this.name = "BootstrapStageFailure";
    this.record = Object.freeze({ code, ...details });
  }
}

export type BootstrapMode = "check" | "apply" | typeof REFUND_AUTHORIZATION_CUTOVER_MODE | typeof CANONICAL_CUTOVER_MODE | typeof APPLICATION_CREDENTIAL_MODE
  | typeof CANARY_CREDENTIAL_RECOVERY_MODE | typeof CANARY_ROLE_GRANT_MODE
  | typeof SYNTHETIC_SALE_ROLE_GRANT_MODE | typeof CANARY_REFUND_ROLE_RESTORE_MODE
  | typeof CONTACTED_RECONCILIATION_ROLE_GRANT_MODE
  | typeof BUSINESS_STATE_READBACK_ROLE_GRANT_MODE
  | typeof BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE
  | typeof REFUND_READINESS_READBACK_ROLE_GRANT_MODE
  | typeof PL09_DISPATCHER_ROLE_GRANT_MODE
  | typeof PL09_DISPATCHER_ROLE_REVOKE_MODE
  | typeof REFUND_READINESS_READBACK_ROLE_REVOKE_MODE
  | typeof CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE
  | typeof REFUND_READINESS_BUSINESS_STATE_READBACK_MODE
  | typeof SYNTHETIC_SALE_MARKET_PRECONDITION_MODE
  | typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE;

type BootstrapEnvironment = Readonly<Record<string, string | undefined>>;
type Output = Readonly<{
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}>;

export type RuntimeConfiguration = Readonly<{
  mode: BootstrapMode;
  sourceCommit: string;
  imageDigestUri: string;
  databaseUrl: string;
  producerInput?: ProducerInput;
  cutoverApplicationRole?: string;
}>;

export type ProducerInput = Readonly<{
  paymentId: string;
  attestationJson: string;
  runtimeReadbackJson?: string;
  issuerPrincipalId?: string;
}>;

export type ProducerChildObservation = Readonly<{
  stdout: AsyncIterable<unknown> | null;
  waitForExit: () => Promise<number | null>;
  terminate: () => void;
}>;

type LedgerRow = Readonly<{
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}>;

export type RuntimeDependencies = Readonly<{
  readSourceCommit: () => Promise<string>;
  loadMigrationInventory: () => Promise<RefundWorkerMigrationInventory>;
  execute: (
    configuration: RuntimeConfiguration,
    inventory: RefundWorkerMigrationInventory,
  ) => Promise<Readonly<Record<string, unknown>>>;
}>;

const defaultOutput = Object.freeze({ stdout: process.stdout, stderr: process.stderr });

export const defaultRuntimeDependencies = Object.freeze<RuntimeDependencies>({
  readSourceCommit: () => readFile(SOURCE_COMMIT_FILE, "utf8"),
  loadMigrationInventory: () => loadRefundWorkerMigrationInventory(MIGRATIONS_DIRECTORY),
  execute: runWithProxy,
});

export async function runDatabaseBootstrapEntrypoint(
  args: readonly string[] = process.argv.slice(2),
  env: BootstrapEnvironment = process.env,
  output: Output = defaultOutput,
  dependencies: RuntimeDependencies = defaultRuntimeDependencies,
): Promise<number> {
  const mode = parseMode(args);
  if (!mode || hasForbiddenEnvironment(env)) return invalidInput(output);

  let sourceCommit: string;
  let inventory: RefundWorkerMigrationInventory;
  try {
    [sourceCommit, inventory] = await Promise.all([
      dependencies.readSourceCommit(),
      dependencies.loadMigrationInventory(),
    ]);
  } catch {
    return invalidInput(output);
  }
  const configuration = parseConfiguration(mode, env, sourceCommit.trim(), inventory);
  if (!configuration) return invalidInput(output);

  try {
    const result = await dependencies.execute(configuration, inventory);
    output.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return 0;
  } catch (error) {
    output.stderr.write(`${JSON.stringify({ ok: false, ...safeFailureRecord(error) })}\n`);
    return 1;
  }
}

export function proxyArguments(automaticIamAuthentication = true): readonly string[] {
  return Object.freeze([
    "--structured-logs",
    "--private-ip",
    ...(automaticIamAuthentication ? ["--auto-iam-authn"] : []),
    "--unix-socket=/cloudsql",
    "--health-check",
    "--http-address=127.0.0.1",
    "--http-port=9801",
    "--exit-zero-on-sigterm",
    CONNECTION_NAME,
  ]);
}

function parseMode(args: readonly string[]): BootstrapMode | null {
  if (args.length !== 1) return null;
  const candidate = args[0];
  if (candidate && isBootstrapMode(candidate)) return candidate;
  return null;
}

function isBootstrapMode(value: string): value is BootstrapMode {
  return [
    "check", "apply", REFUND_AUTHORIZATION_CUTOVER_MODE, CANONICAL_CUTOVER_MODE, CANARY_ROLE_GRANT_MODE, SYNTHETIC_SALE_ROLE_GRANT_MODE,
    CONTACTED_RECONCILIATION_ROLE_GRANT_MODE, BUSINESS_STATE_READBACK_ROLE_GRANT_MODE,
    BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE,
    REFUND_READINESS_READBACK_ROLE_GRANT_MODE,
    REFUND_READINESS_READBACK_ROLE_REVOKE_MODE,
    PL09_DISPATCHER_ROLE_GRANT_MODE, PL09_DISPATCHER_ROLE_REVOKE_MODE,
    CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE,
    REFUND_READINESS_BUSINESS_STATE_READBACK_MODE,
    SYNTHETIC_SALE_MARKET_PRECONDITION_MODE,
    CANARY_REFUND_ROLE_RESTORE_MODE, MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
    ISSUE_EXIMBAY_CANARY_APPROVAL_MODE, APPLICATION_CREDENTIAL_MODE,
    CANARY_CREDENTIAL_RECOVERY_MODE,
  ].includes(value);
}

function parseConfiguration(
  mode: BootstrapMode,
  env: BootstrapEnvironment,
  embeddedSourceCommit: string,
  inventory: RefundWorkerMigrationInventory,
): RuntimeConfiguration | null {
  const sourceCommit = env.MIRA_DB_BOOTSTRAP_SOURCE_COMMIT;
  const imageDigestUri = env.MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI;
  if (!matchesExactTarget(mode, env)
    || !matchesExactTask(mode, env)
    || !matchesExactReadbackAuthority(mode, env)
    || !matchesExactSource(sourceCommit, embeddedSourceCommit)
    || !matchesExactImage(imageDigestUri)
    || !matchesInventoryAndCutoverRole(mode, env, inventory)) return null;
  const cutoverApplicationRole = env.MIRA_DB_BOOTSTRAP_APPLICATION_ROLE;
  const producerInput = parseProducerInput(mode, env);
  if (isProducerMode(mode) && !producerInput) return null;
  return Object.freeze({
    mode,
    sourceCommit,
    imageDigestUri,
    databaseUrl: databaseUrl(mode),
    ...(producerInput ? { producerInput } : {}),
    cutoverApplicationRole,
  });
}

function matchesInventoryAndCutoverRole(mode: BootstrapMode, env: BootstrapEnvironment, inventory: RefundWorkerMigrationInventory): boolean {
  return matchesExactMigrations(env, inventory) && validCutoverRoleConfiguration(mode, env.MIRA_DB_BOOTSTRAP_APPLICATION_ROLE);
}

function validCutoverRoleConfiguration(mode: BootstrapMode, role: string | undefined): boolean {
  return [REFUND_AUTHORIZATION_CUTOVER_MODE, CANONICAL_CUTOVER_MODE].includes(mode) ? validCutoverApplicationRole(role) : role === undefined;
}

function parseProducerInput(mode: BootstrapMode, env: BootstrapEnvironment): ProducerInput | null {
  if (!isProducerMode(mode)) return null;
  const paymentId = env.MIRA_DB_BOOTSTRAP_PAYMENT_ID;
  const attestationJson = boundedJson(env.MIRA_DB_BOOTSTRAP_ATTESTATION_JSON);
  if (!paymentId || !/^[a-zA-Z0-9_-]{1,128}$/u.test(paymentId) || !attestationJson) return null;
  if (mode === MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE) {
    if (env.MIRA_DB_BOOTSTRAP_RUNTIME_READBACK_JSON || env.MIRA_DB_BOOTSTRAP_ISSUER_PRINCIPAL_ID) return null;
    return Object.freeze({ paymentId, attestationJson });
  }
  return parseApprovalProducerInput(env, paymentId, attestationJson);
}

function parseApprovalProducerInput(
  env: BootstrapEnvironment,
  paymentId: string,
  attestationJson: string,
): ProducerInput | null {
  const runtimeReadbackJson = boundedJson(env.MIRA_DB_BOOTSTRAP_RUNTIME_READBACK_JSON);
  const issuerPrincipalId = env.MIRA_DB_BOOTSTRAP_ISSUER_PRINCIPAL_ID;
  if (!runtimeReadbackJson || !issuerPrincipalId
    || !/^[A-Za-z0-9@._:-]{1,256}$/u.test(issuerPrincipalId)) return null;
  return Object.freeze({ paymentId, attestationJson, runtimeReadbackJson, issuerPrincipalId });
}

function boundedJson(value: string | undefined): string | null {
  if (!value || Buffer.byteLength(value) < 2 || Buffer.byteLength(value) > 65_536) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? value : null;
  } catch {
    return null;
  }
}

function matchesExactTarget(mode: BootstrapMode, env: BootstrapEnvironment): boolean {
  const databaseUsername = isBusinessStateReadbackMode(mode)
    ? CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE
    : IAM_DATABASE_USERNAME;
  return env.MIRA_DB_BOOTSTRAP_PROJECT_ID === PROJECT_ID
    && env.MIRA_DB_BOOTSTRAP_REGION === REGION
    && env.MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME === CONNECTION_NAME
    && env.MIRA_DB_BOOTSTRAP_DATABASE_NAME === DATABASE_NAME
    && env.MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME === databaseUsername;
}

function matchesExactTask(mode: BootstrapMode, env: BootstrapEnvironment): boolean {
  const jobName = mode === CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE
    ? CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_JOB
    : mode === REFUND_READINESS_BUSINESS_STATE_READBACK_MODE
      ? REFUND_READINESS_BUSINESS_STATE_READBACK_JOB
    : JOB_NAME;
  return env.CLOUD_RUN_JOB === jobName
    && isNonblank(env.CLOUD_RUN_EXECUTION)
    && env.CLOUD_RUN_TASK_COUNT === "1"
    && env.CLOUD_RUN_TASK_INDEX === "0"
    && env.CLOUD_RUN_TASK_ATTEMPT === "0";
}

function matchesExactReadbackAuthority(
  mode: BootstrapMode,
  env: BootstrapEnvironment,
): boolean {
  const values = [
    env.MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID,
    env.MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID,
    env.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION,
    env.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION_UID,
  ];
  if (mode !== CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE) {
    return values.every((value) => !isNonblank(value));
  }
  return values[0] === "a764f61f4e4ba799ab16b318a676db65"
    && values[1] === "cmthg2mzu000001s6iuvx7u5x"
    && values[2] === CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION
    && values[3] === CONTACTED_RECONCILIATION_HISTORICAL_EXECUTION_UID;
}

function matchesExactSource(
  sourceCommit: string | undefined,
  embeddedSourceCommit: string,
): sourceCommit is string {
  return typeof sourceCommit === "string"
    && /^[0-9a-f]{40}$/u.test(sourceCommit)
    && embeddedSourceCommit === sourceCommit;
}

function matchesExactImage(imageDigestUri: string | undefined): imageDigestUri is string {
  return typeof imageDigestUri === "string"
    && new RegExp(`^${escapeRegex(IMAGE_PREFIX)}[0-9a-f]{64}$`, "u").test(imageDigestUri);
}

function matchesExactMigrations(
  env: BootstrapEnvironment,
  inventory: RefundWorkerMigrationInventory,
): boolean {
  return env.MIRA_DB_BOOTSTRAP_MIGRATION_COUNT === String(inventory.migrationCount)
    && env.MIRA_DB_BOOTSTRAP_MIGRATION_SHA256 === inventory.migrationDigest;
}

function hasForbiddenEnvironment(env: BootstrapEnvironment): boolean {
  return Object.entries(env).some(([key, value]) => isNonblank(value) && (
    key === "DATABASE_URL"
    || key === "GOOGLE_APPLICATION_CREDENTIALS"
    || key.startsWith("PG")
    || key.startsWith("CSQL_PROXY_")
    || key.startsWith("MIRA_REFUND_READBACK_")
    || key.startsWith("TOSS_")
    || key.startsWith("EXIMBAY_")
  ));
}

async function runWithProxy(
  configuration: RuntimeConfiguration,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const mode = configuration.mode;
  if ([REFUND_AUTHORIZATION_CUTOVER_MODE, CANONICAL_CUTOVER_MODE].includes(mode)) {
    return runProxySession(true, async () => {
      const database = new Client({ connectionString: configuration.databaseUrl });
      try {
        await requireDatabaseConnection(() => database.connect());
        const applyCutover = mode === CANONICAL_CUTOVER_MODE ? applyCanonicalCutover : applyRefundAuthorizationCutover;
        return await applyCutover(database, {
          databaseName: DATABASE_NAME, applicationRole: configuration.cutoverApplicationRole ?? "",
        }, inventory, () => deployPrismaMigrations(configuration.databaseUrl));
      } finally { await database.end(); }
    });
  }
  if (mode === CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE) {
    return runProxySession(true, () => executeBusinessStateReadback(configuration.databaseUrl));
  }
  if (mode === REFUND_READINESS_BUSINESS_STATE_READBACK_MODE) {
    return runProxySession(true, () => executeRefundReadinessReadback(configuration.databaseUrl));
  }
  if (isProducerMode(mode)) {
    return runProducerProxySession(configuration, inventory);
  }
  if (mode === SYNTHETIC_SALE_MARKET_PRECONDITION_MODE) {
    return runProxySession(true, () => executeSyntheticSaleMarketPrecondition(
      configuration.databaseUrl,
      inventory,
    ));
  }
  if (isAclLifecycleMode(mode)) {
    return runProxySession(true, () => executeAclLifecycleMode(
      configuration.databaseUrl,
      inventory,
      mode,
    ));
  }
  if (configuration.mode === CANARY_ROLE_GRANT_MODE) {
    return runProxySession(true, () => applyCanaryRoleGrants(
      configuration.databaseUrl,
      inventory,
    ));
  }
  if (configuration.mode === CANARY_CREDENTIAL_RECOVERY_MODE) {
    return recoverCanaryApplicationCredential({
      secretManager: new RestSecretMetadataClient(),
      generateCredential: generateApplicationCredential,
      generateAndSetCanaryPassword: (generateCredentialValue) => runProxySession(
        true,
        () => commitCanaryApplicationPassword(
          configuration.databaseUrl,
          inventory,
          generateCredentialValue,
        ),
      ),
      verifyCanaryPasswordLogin: (credential) => runProxySession(
        false,
        () => verifyCanaryApplicationPasswordLogin(credential),
      ),
    });
  }
  if (configuration.mode === APPLICATION_CREDENTIAL_MODE) {
    return materializeApplicationCredentials({
      secretManager: new RestSecretMetadataClient(),
      generateCredential: generateApplicationCredential,
      generateAndSetPasswords: (generateCredentialValue) => runProxySession(
        true,
        () => commitApplicationPasswords(
          configuration.databaseUrl,
          inventory,
          generateCredentialValue,
        ),
      ),
      verifyPasswordLogins: (credentials) => runProxySession(
        false,
        () => verifyApplicationPasswordLogins(credentials),
      ),
    });
  }
  return runProxySession(true, () => configuration.mode === "check"
    ? checkDatabase(configuration.databaseUrl, inventory)
    : applyDatabase(configuration.databaseUrl, inventory));
}

async function runProducerProxySession(
  configuration: RuntimeConfiguration,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  let producerResult: ProducerResult | null = null;
  try {
    return await runProxySession(true, async () => {
      const completed = await runProducerMode(configuration, inventory);
      producerResult = completed.validatedProducerResult;
      return completed;
    });
  } catch (error) {
    if (!producerResult || hasValidatedProducerResult(error)) throw error;
    throw producerResultFailure(producerResult);
  }
}

function isProducerMode(
  mode: BootstrapMode,
): mode is typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE {
  return mode === MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE || mode === ISSUE_EXIMBAY_CANARY_APPROVAL_MODE;
}

async function runProducerMode(
  configuration: RuntimeConfiguration,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<{
  code: ProducerResult["code"];
  mode: typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE;
  migrationCount: number;
  completedMigrationCount: number;
  providerEffects: 0;
  validatedProducerResult: ProducerResult;
}>> {
  const mode = configuration.mode;
  if (!isProducerMode(mode)) throw new Error("BOOTSTRAP_PRODUCER_MODE_INVALID");
  const input = configuration.producerInput;
  if (!input) throw new Error("BOOTSTRAP_PRODUCER_INPUT_MISSING");
  const database = new Client({ connectionString: configuration.databaseUrl });
  try {
    await requireDatabaseConnection(() => database.connect());
    const completed = await requireExactMigrationPrefix(database, inventory);
    if (completed !== inventory.migrationCount) ledgerRejected();
  } finally {
    await database.end().catch(() => undefined);
  }
  const attestationPath = "/tmp/refund-db-bootstrap/eximbay-canary-attestation.json";
  const readbackPath = "/tmp/refund-db-bootstrap/eximbay-canary-runtime-readback.json";
  const cleanup = () => Promise.all([
    rm(attestationPath, { force: true }),
    rm(readbackPath, { force: true }),
  ]).then(() => undefined);
  let result: Readonly<{
    code: ProducerResult["code"];
    mode: typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE;
    migrationCount: number;
    completedMigrationCount: number;
    providerEffects: 0;
    validatedProducerResult: ProducerResult;
  }>;
  try {
    await writeFile(attestationPath, input.attestationJson, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const args = mode === MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE
      ? ["materialize-target", "--payment-id", input.paymentId, "--attestation", attestationPath]
      : await approvalProducerArgs(input, attestationPath, readbackPath);
    const producerResult = await runProducerChild(
      mode, input, args, configuration.databaseUrl,
    );
    result = Object.freeze({
      code: producerResult.code,
      mode,
      migrationCount: inventory.migrationCount,
      completedMigrationCount: inventory.migrationCount,
      providerEffects: 0 as const,
      validatedProducerResult: producerResult,
    });
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
  return finalizeProducerResult(result, cleanup);
}

async function runProducerChild(
  mode: typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
  input: ProducerInput,
  args: readonly string[],
  databaseUrlValue: string,
): Promise<ProducerResult> {
  const child = spawn(process.execPath, [TARGET_PRODUCER_EXECUTABLE, ...args], {
    env: childEnvironment(databaseUrlValue),
    stdio: ["ignore", "pipe", "ignore"],
  });
  return captureProducerChildResult(mode, input, {
    stdout: child.stdout,
    waitForExit: () => childExit(child),
    terminate: () => { child.kill("SIGKILL"); },
  });
}

export async function captureProducerChildResult(
  mode: typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
  input: ProducerInput,
  observation: ProducerChildObservation,
): Promise<ProducerResult> {
  const exitPromise = observation.waitForExit();
  const bytes = await readBoundedProducerStdout(observation, exitPromise);
  const result = parseProducerResult(mode, input, bytes);
  if (!result) {
    await exitPromise.catch(() => undefined);
    throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
  }
  let exit: number | null;
  try {
    exit = await exitPromise;
  } catch {
    throw producerResultFailure(result);
  }
  if (exit !== 0) throw producerResultFailure(result);
  return result;
}

async function readBoundedProducerStdout(
  observation: ProducerChildObservation,
  exitPromise: Promise<number | null>,
): Promise<Buffer> {
  if (!observation.stdout) throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
  const chunks: Buffer[] = [];
  let observedBytes = 0;
  try {
    for await (const chunk of observation.stdout) {
      const buffer = producerOutputChunk(chunk);
      observedBytes += buffer.byteLength;
      if (observedBytes > PRODUCER_RESULT_BYTE_LIMIT) {
        throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    observation.terminate();
    await exitPromise.catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, observedBytes);
}

function producerOutputChunk(value: unknown): Buffer {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
}

export function parseProducerResult(
  mode: typeof MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE | typeof ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
  input: ProducerInput,
  bytes: Uint8Array,
): ProducerResult | null {
  if (bytes.byteLength < 2 || bytes.byteLength > PRODUCER_RESULT_BYTE_LIMIT) return null;
  let source: string;
  let value: unknown;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const json = source.endsWith("\n") ? source.slice(0, -1) : source;
    value = JSON.parse(json);
    if (JSON.stringify(value) !== json) return null;
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  return mode === MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE
    ? parseMaterializedTargetResult(value, input.paymentId)
    : parseIssuedApprovalResult(value, approvalInputTargetDigest(input));
}

const MATERIALIZED_TARGET_RESULT_KEYS = Object.freeze([
  "checkoutSessionId", "code", "commandId", "ok", "orderId", "paymentId",
  "providerOperationBindingId", "refundAttemptId", "runtimeBindings",
  "syntheticProvenanceDigest", "targetBindingDigest",
].sort());
const RUNTIME_BINDING_KEYS = Object.freeze([
  "canaryJobBindingDigest", "credentialGenerationBindingId", "imageBindingDigest",
  "merchantAccountBindingId", "preflightJobBindingDigest", "releaseBindingDigest",
  "secretGenerationBindingDigest", "syntheticProvenanceDigest", "targetBindingDigest",
].sort());
const ISSUED_APPROVAL_RESULT_KEYS = Object.freeze([
  "approvalEvidenceDigest", "approvalId", "approvedAt", "code", "commandId", "expiresAt",
  "ok", "targetBindingDigest",
].sort());
const PAYMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const PRISMA_CUID = /^c[a-z0-9]{24}$/u;
const REFUND_ATTEMPT_ID = /^eximbay-canary-[0-9a-f]{40}$/u;
const APPROVAL_ID = /^eximbay-canary-approval-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function parseMaterializedTargetResult(
  value: Readonly<Record<string, unknown>>,
  requestedPaymentId: string,
): MaterializedTargetProducerResult | null {
  if (!hasExactKeys(value, MATERIALIZED_TARGET_RESULT_KEYS)
    || value.ok !== true || value.code !== "EXIMBAY_CANARY_TARGET_MATERIALIZED") return null;
  try {
    const paymentId = requireMatchingString(value.paymentId, PAYMENT_ID);
    const checkoutSessionId = requireMatchingString(value.checkoutSessionId, PRISMA_CUID);
    const orderId = requireMatchingString(value.orderId, PRISMA_CUID);
    const refundAttemptId = requireMatchingString(value.refundAttemptId, REFUND_ATTEMPT_ID);
    const commandId = requireMatchingString(value.commandId, PRISMA_CUID);
    const providerOperationBindingId = requireMatchingString(value.providerOperationBindingId, PRISMA_CUID);
    const targetBindingDigest = requireMatchingString(value.targetBindingDigest, SHA256);
    const syntheticProvenanceDigest = requireMatchingString(value.syntheticProvenanceDigest, SHA256);
    const runtimeBindings = parseRuntimeBindings(value.runtimeBindings);
    if (!runtimeBindings || !materializedResultCorresponds(
      paymentId, requestedPaymentId, targetBindingDigest, syntheticProvenanceDigest, runtimeBindings,
    )) return null;
    return Object.freeze({
      ok: true, code: "EXIMBAY_CANARY_TARGET_MATERIALIZED", paymentId, checkoutSessionId, orderId,
      refundAttemptId, commandId, providerOperationBindingId, targetBindingDigest,
      syntheticProvenanceDigest, runtimeBindings,
    });
  } catch {
    return null;
  }
}

function parseRuntimeBindings(value: unknown): RuntimeBindings | null {
  if (!isRecord(value) || !hasExactKeys(value, RUNTIME_BINDING_KEYS)) return null;
  try {
    return Object.freeze({
      targetBindingDigest: requireMatchingString(value.targetBindingDigest, SHA256),
      syntheticProvenanceDigest: requireMatchingString(value.syntheticProvenanceDigest, SHA256),
      merchantAccountBindingId: requireMatchingString(value.merchantAccountBindingId, SHA256),
      credentialGenerationBindingId: requireMatchingString(value.credentialGenerationBindingId, SHA256),
      releaseBindingDigest: requireMatchingString(value.releaseBindingDigest, SHA256),
      canaryJobBindingDigest: requireMatchingString(value.canaryJobBindingDigest, SHA256),
      preflightJobBindingDigest: requireMatchingString(value.preflightJobBindingDigest, SHA256),
      imageBindingDigest: requireMatchingString(value.imageBindingDigest, SHA256),
      secretGenerationBindingDigest: requireMatchingString(value.secretGenerationBindingDigest, SHA256),
    });
  } catch {
    return null;
  }
}

function parseIssuedApprovalResult(
  value: Readonly<Record<string, unknown>>,
  inputTargetBindingDigest: string | null,
): IssuedApprovalProducerResult | null {
  if (!hasExactKeys(value, ISSUED_APPROVAL_RESULT_KEYS)
    || value.ok !== true || value.code !== "EXIMBAY_CANARY_APPROVAL_ISSUED") return null;
  try {
    const approvalId = requireMatchingString(value.approvalId, APPROVAL_ID);
    const commandId = requireMatchingString(value.commandId, PRISMA_CUID);
    const approvedAt = requireIsoTimestamp(value.approvedAt);
    const expiresAt = requireIsoTimestamp(value.expiresAt);
    const approvalEvidenceDigest = requireMatchingString(value.approvalEvidenceDigest, SHA256);
    const targetBindingDigest = requireMatchingString(value.targetBindingDigest, SHA256);
    if (targetBindingDigest !== inputTargetBindingDigest
      || Date.parse(expiresAt) - Date.parse(approvedAt) !== 30 * 60 * 1_000) return null;
    return Object.freeze({
      ok: true, code: "EXIMBAY_CANARY_APPROVAL_ISSUED", approvalId, commandId, approvedAt,
      expiresAt, approvalEvidenceDigest, targetBindingDigest,
    });
  } catch {
    return null;
  }
}

function materializedResultCorresponds(
  paymentId: string,
  requestedPaymentId: string,
  targetBindingDigest: string,
  syntheticProvenanceDigest: string,
  runtimeBindings: RuntimeBindings,
): boolean {
  return paymentId === requestedPaymentId
    && runtimeBindings.targetBindingDigest === targetBindingDigest
    && runtimeBindings.syntheticProvenanceDigest === syntheticProvenanceDigest;
}

function approvalInputTargetDigest(input: ProducerInput): string | null {
  if (!input.runtimeReadbackJson) return null;
  try {
    const value: unknown = JSON.parse(input.runtimeReadbackJson);
    if (!isRecord(value) || !isRecord(value.authority)) return null;
    return matchingString(value.authority.targetBindingDigest, SHA256);
  } catch {
    return null;
  }
}

function matchingString(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function requireMatchingString(value: unknown, pattern: RegExp): string {
  const result = matchingString(value, pattern);
  if (!result) throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
  return result;
}

function requireIsoTimestamp(value: unknown): string {
  const result = requireMatchingString(value, ISO_MILLISECONDS);
  if (new Date(result).toISOString() !== result) {
    throw new Error("BOOTSTRAP_PRODUCER_RESULT_INVALID");
  }
  return result;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function finalizeProducerResult<Result extends Readonly<{
  validatedProducerResult: ProducerResult;
}>>(
  result: Result,
  cleanup: () => Promise<void>,
): Promise<Result> {
  try {
    await cleanup();
    return result;
  } catch {
    throw producerResultFailure(result.validatedProducerResult);
  }
}

function producerResultFailure(result: ProducerResult): BootstrapStageFailure {
  return new BootstrapStageFailure("RUNTIME_LOCAL_FAILED", { validatedProducerResult: result });
}

function hasValidatedProducerResult(error: unknown): boolean {
  return error instanceof BootstrapStageFailure && Boolean(error.record.validatedProducerResult);
}

async function approvalProducerArgs(
  input: ProducerInput,
  attestationPath: string,
  readbackPath: string,
): Promise<readonly string[]> {
  if (!input.runtimeReadbackJson || !input.issuerPrincipalId) {
    throw new Error("BOOTSTRAP_PRODUCER_INPUT_MISSING");
  }
  await writeFile(readbackPath, input.runtimeReadbackJson, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return [
    "issue-approval", "--payment-id", input.paymentId, "--attestation", attestationPath,
    "--runtime-readback", readbackPath, "--issuer-principal", input.issuerPrincipalId,
  ];
}

function isAclLifecycleMode(
  mode: BootstrapMode,
): mode is typeof SYNTHETIC_SALE_ROLE_GRANT_MODE
  | typeof CONTACTED_RECONCILIATION_ROLE_GRANT_MODE
  | typeof BUSINESS_STATE_READBACK_ROLE_GRANT_MODE
  | typeof BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE
  | typeof REFUND_READINESS_READBACK_ROLE_GRANT_MODE
  | typeof PL09_DISPATCHER_ROLE_GRANT_MODE
  | typeof PL09_DISPATCHER_ROLE_REVOKE_MODE
  | typeof REFUND_READINESS_READBACK_ROLE_REVOKE_MODE
  | typeof CANARY_REFUND_ROLE_RESTORE_MODE {
  return mode === SYNTHETIC_SALE_ROLE_GRANT_MODE
    || mode === CONTACTED_RECONCILIATION_ROLE_GRANT_MODE
    || mode === BUSINESS_STATE_READBACK_ROLE_GRANT_MODE
    || mode === BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE
    || mode === REFUND_READINESS_READBACK_ROLE_GRANT_MODE
    || mode === PL09_DISPATCHER_ROLE_GRANT_MODE
    || mode === PL09_DISPATCHER_ROLE_REVOKE_MODE
    || mode === REFUND_READINESS_READBACK_ROLE_REVOKE_MODE
    || mode === CANARY_REFUND_ROLE_RESTORE_MODE;
}

async function executeAclLifecycleMode(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
  mode: typeof SYNTHETIC_SALE_ROLE_GRANT_MODE
    | typeof CONTACTED_RECONCILIATION_ROLE_GRANT_MODE
    | typeof BUSINESS_STATE_READBACK_ROLE_GRANT_MODE
    | typeof BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE
    | typeof REFUND_READINESS_READBACK_ROLE_GRANT_MODE
    | typeof PL09_DISPATCHER_ROLE_GRANT_MODE
    | typeof PL09_DISPATCHER_ROLE_REVOKE_MODE
    | typeof REFUND_READINESS_READBACK_ROLE_REVOKE_MODE
    | typeof CANARY_REFUND_ROLE_RESTORE_MODE,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const dependencies = {
      ...defaultEximbayP3eDatabaseBootstrapDependencies,
      verifyExactLedger: async (transaction: Client) => {
        const completed = await requireExactMigrationPrefix(transaction, inventory);
        if (completed !== inventory.migrationCount) ledgerRejected();
      },
    };
    const input = {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "refund_sandbox" as const,
    };
    const result = mode === PL09_DISPATCHER_ROLE_GRANT_MODE || mode === PL09_DISPATCHER_ROLE_REVOKE_MODE
      ? await setPl09DispatcherRoleGrants(database, input, dependencies, mode === PL09_DISPATCHER_ROLE_GRANT_MODE)
      : mode === SYNTHETIC_SALE_ROLE_GRANT_MODE
      ? await applySyntheticSaleRoleGrants(database, input, dependencies)
      : mode === CONTACTED_RECONCILIATION_ROLE_GRANT_MODE
        ? await applyContactedReconciliationRoleGrants(database, input, dependencies)
        : mode === BUSINESS_STATE_READBACK_ROLE_GRANT_MODE
          ? await applyBusinessStateReadbackRoleGrants(database, input, dependencies)
          : mode === BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE
            ? await revokeBusinessStateReadbackRoleGrants(database, input, dependencies)
            : mode === REFUND_READINESS_READBACK_ROLE_GRANT_MODE
              ? await applyRefundReadinessReadbackRoleGrants(database, input, dependencies)
              : mode === REFUND_READINESS_READBACK_ROLE_REVOKE_MODE
                ? await revokeRefundReadinessReadbackRoleGrants(database, input, dependencies)
                : await restoreCanaryRefundRoleGrants(database, input, dependencies);
    return Object.freeze({
      code: result.code,
      mode,
      migrationCount: inventory.migrationCount,
      completedMigrationCount: inventory.migrationCount,
      artifacts: result.artifacts,
      roleGrantPostcondition: result.postcondition,
      migrationMutation: false,
      businessRowMutation: false,
      providerEffects: 0,
    });
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function executeBusinessStateReadback(
  databaseUrlValue: string,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const query: FixedReadbackQuery = async (sql, parameters = []) => {
      const result = await database.query<Record<string, unknown>>(sql, [...parameters]);
      return result.rows;
    };
    return await readContactedReconciliationBusinessState(query);
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function executeRefundReadinessReadback(
  databaseUrlValue: string,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const query: FixedReadbackQuery = async (sql, parameters = []) => {
      const result = await database.query<Record<string, unknown>>(sql, [...parameters]);
      return result.rows;
    };
    return await readRefundReadinessBusinessState(query);
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function executeSyntheticSaleMarketPrecondition(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const result = await materializeSyntheticSaleMarketPrecondition(database, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "refund_sandbox",
    }, {
      verifyExactLedger: async (transaction) => {
        const completed = await requireExactMigrationPrefix(transaction, inventory);
        if (completed !== inventory.migrationCount) ledgerRejected();
      },
    });
    return Object.freeze({
      code: result.code,
      mode: SYNTHETIC_SALE_MARKET_PRECONDITION_MODE,
      disposition: result.disposition,
      market: result.market,
      postconditionRowCount: result.postconditionRowCount,
      migrationCount: inventory.migrationCount,
      completedMigrationCount: inventory.migrationCount,
      businessRowMutation: result.disposition === "CREATED" ? 1 : 0,
      secretManagerEffects: 0,
      providerEffects: 0,
    });
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function runProxySession<Result>(
  automaticIamAuthentication: boolean,
  databaseWork: () => Promise<Result>,
): Promise<Result> {
  const startObservation: ProxyStartObservation = { failed: false };
  let proxy: ChildProcess;
  try {
    proxy = spawn(PROXY_EXECUTABLE, [...proxyArguments(automaticIamAuthentication)], {
      env: minimalProxyEnvironment(),
      stdio: [...PROXY_STDIO],
    });
  } catch {
    throw new BootstrapStageFailure("PROXY_START_FAILED");
  }
  proxy.once("error", () => { startObservation.failed = true; });
  const diagnostics = Object.freeze([
    consumeProxyDiagnosticStream(proxy.stdout),
    consumeProxyDiagnosticStream(proxy.stderr),
  ]);
  return retainProxyThroughDatabaseWork({
    awaitReadiness: () => awaitProxyReadiness(proxy, startObservation, diagnostics),
    databaseWork,
    stopProxy: () => stopProxy(proxy),
  });
}

async function commitApplicationPasswords(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
  generateCredentialValue: (role: ApplicationRole) => ApplicationCredential,
): Promise<readonly ApplicationCredential[]> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const completed = await requireExactMigrationPrefix(database, inventory);
    if (completed !== inventory.migrationCount) ledgerRejected();
    await verifyExactEffectivePrivileges(database);
    const credentials = APPLICATION_ROLES.map(generateCredentialValue);
    await setApplicationPasswords(database, credentials, verifyExactEffectivePrivileges);
    return credentials;
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function commitCanaryApplicationPassword(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
  generateCredentialValue: (role: ApplicationRole) => ApplicationCredential,
): Promise<ApplicationCredential> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const completed = await requireExactMigrationPrefix(database, inventory);
    if (completed !== inventory.migrationCount) ledgerRejected();
    await verifyExactEffectivePrivileges(database);
    const credential = generateCredentialValue("mira_refund_canary");
    await setCanaryApplicationPassword(
      database,
      credential,
      verifyExactEffectivePrivileges,
    );
    return credential;
  } finally {
    await database.end().catch(() => undefined);
  }
}

export async function retainProxyThroughDatabaseWork<Result>(
  dependencies: ProxyLifetimeDependencies<Result>,
): Promise<Result> {
  let primaryFailure = false;
  try {
    await dependencies.awaitReadiness();
    return await dependencies.databaseWork();
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    if (primaryFailure) {
      await dependencies.stopProxy().catch(() => undefined);
    } else {
      await dependencies.stopProxy();
    }
  }
}

async function checkDatabase(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const completed = await requireExactMigrationPrefix(database, inventory);
    return Object.freeze({
      code: "DB_BOOTSTRAP_CHECK_READY",
      mode: "check",
      migrationCount: inventory.migrationCount,
      completedMigrationCount: completed,
      databaseMutation: false,
    });
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function applyCanaryRoleGrants(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const database = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => database.connect());
    const result = await applyEximbayP3eCanaryRoleGrants(database, {
      admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
      environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
      targetDatabaseName: "refund_sandbox",
    }, {
      ...defaultEximbayP3eDatabaseBootstrapDependencies,
      verifyExactLedger: async (transaction) => {
        const completed = await requireExactMigrationPrefix(transaction, inventory);
        if (completed !== inventory.migrationCount) ledgerRejected();
      },
    });
    return Object.freeze({
      code: result.code,
      mode: CANARY_ROLE_GRANT_MODE,
      migrationCount: inventory.migrationCount,
      completedMigrationCount: inventory.migrationCount,
      artifact: result.artifact,
      roleGrantPostcondition: result.postcondition,
      migrationMutation: false,
      businessRowMutation: false,
      secretManagerEffects: 0,
      providerEffects: 0,
    });
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function applyDatabase(
  databaseUrlValue: string,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const before = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => before.connect());
    await requireExactMigrationPrefix(before, inventory);
  } finally {
    await before.end().catch(() => undefined);
  }

  await deployPrismaMigrations(databaseUrlValue);

  const after = new Client({ connectionString: databaseUrlValue });
  try {
    await requireDatabaseConnection(() => after.connect());
    const completed = await requireExactMigrationPrefix(after, inventory);
    if (completed !== inventory.migrationCount) ledgerRejected();
  } finally {
    await after.end().catch(() => undefined);
  }

  await requireSuccessfulChild(ROLE_BOOTSTRAP_EXECUTABLE, [], databaseUrlValue, true);
  return Object.freeze({
    code: "DB_BOOTSTRAP_APPLY_COMPLETE",
    mode: "apply",
    migrationCount: inventory.migrationCount,
    completedMigrationCount: inventory.migrationCount,
    roleGrantPostcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
  });
}

async function deployPrismaMigrations(databaseUrlValue: string): Promise<void> {
  await requireSuccessfulChild(PRISMA_EXECUTABLE, [
    "migrate",
    "deploy",
    "--config",
    "/app/prisma.config.ts",
    "--schema",
    "/app/prisma/schema.prisma",
  ], databaseUrlValue);

}

async function requireExactMigrationPrefix(
  database: Client,
  inventory: RefundWorkerMigrationInventory,
): Promise<number> {
  const ledger = await requireLedgerRead(() => database.query<{ ledger: string | null }>(
    "SELECT to_regclass('public._prisma_migrations')::text AS ledger",
  ));
  if (ledger.rows[0]?.ledger === null) {
    const tables = await requireLedgerRead(() => database.query<{ tableName: string }>(`
      SELECT tablename AS "tableName"
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `));
    if (tables.rows.length !== 0) ledgerRejected();
    return 0;
  }
  const result = await requireLedgerRead(() => database.query<LedgerRow>(`
    SELECT migration_name AS "migrationName", checksum,
      finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
    FROM "_prisma_migrations"
    ORDER BY started_at, migration_name
  `));
  requireExactLedgerRows(result.rows, inventory);
  return result.rows.length;
}

export function requireExactLedgerRows(
  rows: readonly LedgerRow[],
  inventory: RefundWorkerMigrationInventory,
): void {
  if (rows.length > inventory.entries.length) ledgerRejected();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expected = inventory.entries[index];
    if (!row || !expected
      || row.migrationName !== expected.name
      || row.checksum !== expected.sha256
      || row.finishedAt === null
      || row.rolledBackAt !== null) ledgerRejected();
  }
}

export async function requireDatabaseConnection<Result>(connect: () => Promise<Result>): Promise<void> {
  try {
    await connect();
  } catch {
    throw new BootstrapStageFailure("DB_CONNECT_FAILED");
  }
}

export async function requireLedgerRead<Result>(read: () => Promise<Result>): Promise<Result> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof BootstrapStageFailure) throw error;
    throw new BootstrapStageFailure("LEDGER_READ_FAILED");
  }
}

function ledgerRejected(): never {
  throw new BootstrapStageFailure("LEDGER_REJECTED");
}

function safeFailureRecord(error: unknown): SafeFailureRecord {
  if (error instanceof RefundAuthorizationCutoverFailure) return Object.freeze({
    code: "REFUND_AUTHORIZATION_CUTOVER_STOP", phase: error.phase, migrationState: error.migrationState,
  });
  if (error instanceof BootstrapStageFailure) return error.record;
  if (error instanceof EximbayP3eDatabaseBootstrapError
    && (error.code === "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT"
      || error.code === "ROLE_AUTHORITY_POSTCONDITION_FAILED")) {
    return Object.freeze({ code: error.code });
  }
  if (error instanceof ApplicationCredentialFailure) {
    return Object.freeze({
      code: error.code,
      ...(error.secretResourceName
        ? { secretResourceName: error.secretResourceName }
        : {}),
      ...(error.versionCount === undefined
        ? {}
        : { versionCount: error.versionCount }),
    });
  }
  return Object.freeze({ code: "RUNTIME_LOCAL_FAILED" });
}

export function consumeProxyDiagnosticStream(
  stream: ProxyDiagnosticStream | null,
): ProxyDiagnosticSummary {
  const summary: ProxyDiagnosticSummary = {
    observedBytes: 0,
    truncated: false,
    failureClass: null,
    requestSubtype: null,
  };
  let pending = "";
  let settle = Promise.resolve();
  if (stream) {
    settle = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        classifyPendingProxyLine(summary, pending);
        pending = "";
        resolve();
      };
      stream.on("end", finish);
      stream.on("close", finish);
      stream.on("error", finish);
    });
  }
  proxyDiagnosticSettled.set(summary, settle);
  stream?.on("data", (chunk: unknown) => {
    const bytes = diagnosticChunkBytes(chunk);
    if (bytes === 0) return;
    const remaining = PROXY_DIAGNOSTIC_BYTE_LIMIT - summary.observedBytes;
    summary.observedBytes += Math.min(remaining, bytes);
    if (bytes > remaining) summary.truncated = true;
    if (remaining <= 0) return;
    const accepted = diagnosticChunkBuffer(chunk).subarray(0, remaining);
    pending += accepted.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) classifyPendingProxyLine(summary, line);
  });
  return summary;
}

function diagnosticChunkBytes(chunk: unknown): number {
  if (typeof chunk === "string") return Buffer.byteLength(chunk);
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

function diagnosticChunkBuffer(chunk: unknown): Buffer {
  if (typeof chunk === "string") return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.alloc(0);
}

function classifyPendingProxyLine(summary: ProxyDiagnosticSummary, line: string): void {
  const classification = classifyProxyStructuredLogLineDetails(line);
  if (!classification) return;
  summary.failureClass = classification.failureClass;
  summary.requestSubtype = classification.requestSubtype;
}

export function classifyProxyStructuredLogLine(
  line: string,
): Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null {
  return classifyProxyStructuredLogLineDetails(line)?.failureClass ?? null;
}

export function classifyProxyStructuredLogLineDetails(
  line: string,
): Readonly<{
  failureClass: Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED">;
  requestSubtype: SqlAdminRequestSubtype | null;
}> | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const message = proxyStructuredErrorMessage(value);
  if (message === null) return null;
  return classifyProxyStructuredErrorMessage(message);
}

function classifyProxyStructuredErrorMessage(
  message: string,
): Readonly<{
  failureClass: Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED">;
  requestSubtype: SqlAdminRequestSubtype | null;
}> | null {
  const instanceFailure = classifyProxyInstanceResolutionFailure(message);
  if (instanceFailure) return instanceFailure;
  if (isProxyCredentialSourceFailure(message)) {
    return Object.freeze({
      failureClass: "PROXY_CREDENTIAL_SOURCE_FAILED",
      requestSubtype: null,
    });
  }
  if (isProxyListenerFailure(message)) {
    return Object.freeze({ failureClass: "PROXY_LISTENER_FAILED", requestSubtype: null });
  }
  return null;
}

function classifyProxyInstanceResolutionFailure(
  message: string,
): Readonly<{
  failureClass: Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED">;
  requestSubtype: SqlAdminRequestSubtype | null;
}> | null {
  const instancePrefix = `[${CONNECTION_NAME}] could not resolve instance version: `;
  const sqlAdminPrefix = `${instancePrefix}failed to get instance: refresh error: `
    + `failed to get instance metadata (connection name = "${CONNECTION_NAME}"): `;
  if (message.startsWith(sqlAdminPrefix)) {
    const requestFailure = message.slice(sqlAdminPrefix.length);
    if (/^googleapi: Error 403(?:\b|:)/u.test(requestFailure)) {
      return Object.freeze({
        failureClass: "PROXY_SQLADMIN_PERMISSION_DENIED",
        requestSubtype: null,
      });
    }
    if (/^(?:googleapi: (?:Error \d{3}(?:\b|:)|got HTTP response code \d{3} with body:)|(?:Get|Post) "https:\/\/sqladmin\.googleapis\.com\/)/u
      .test(requestFailure)) {
      return Object.freeze({
        failureClass: "PROXY_SQLADMIN_REQUEST_FAILED",
        requestSubtype: classifySqlAdminRequestSubtype(requestFailure),
      });
    }
  }
  if (/^\[[^\]\r\n]{1,255}\] could not resolve instance version: config error: invalid instance connection name, expected PROJECT:REGION:INSTANCE \(connection name = "[^"\r\n]{1,255}"\)$/u
    .test(message)) {
    return Object.freeze({
      failureClass: "PROXY_INSTANCE_CONFIG_FAILED",
      requestSubtype: null,
    });
  }
  return null;
}

function classifySqlAdminRequestSubtype(requestFailure: string): SqlAdminRequestSubtype | null {
  const base = Object.freeze({
    requestPhase: SQLADMIN_REQUEST_PHASE,
    host: SQLADMIN_REQUEST_HOST,
  });
  const httpStatus = googleApiHttpStatus(requestFailure);
  if (httpStatus !== null) return Object.freeze({ ...base, httpStatus });

  const urlError = /^(Get|Post) "([^"\r\n]{1,3072})": ([^\r\n]{1,3072})$/u.exec(requestFailure);
  if (!urlError || !isExactMetadataRequestUrl(urlError[1], urlError[2])) {
    return null;
  }
  const cause = urlError[3] ?? "";
  const timeout = isExplicitTimeout(cause) ? true : undefined;
  const transportClass = classifyTransportCause(cause);
  return Object.freeze({
    ...base,
    transportClass,
    ...(timeout ? { timeout } : {}),
  });
}

function googleApiHttpStatus(value: string): number | null {
  const match = /^googleapi: (?:Error (\d{3})(?:\b|:)|got HTTP response code (\d{3}) with body:)/u
    .exec(value);
  const candidate = match?.[1] ?? match?.[2];
  if (!candidate) return null;
  const status = Number(candidate);
  return status >= 100 && status <= 599 ? status : null;
}

function isExactMetadataRequestUrl(method: string | undefined, value: string | undefined): boolean {
  if (method !== "Get" || !value) return false;
  let requestUrl: URL;
  try {
    requestUrl = new URL(value);
  } catch {
    return false;
  }
  return requestUrl.protocol === "https:"
    && requestUrl.hostname === SQLADMIN_REQUEST_HOST
    && requestUrl.port === ""
    && requestUrl.username === ""
    && requestUrl.password === ""
    && requestUrl.pathname === `/sql/v1beta4/projects/${PROJECT_ID}/instances/${INSTANCE}/connectSettings`
    && requestUrl.hash === "";
}

function classifyTransportCause(cause: string): ProxyTransportClass {
  if (/^credentials: (?:cannot fetch token:|invalid token JSON from metadata:|incomplete token received from metadata(?:$|:))/u
    .test(cause)) return "TOKEN";
  if (/^(?:dial tcp(?:4|6)?: )?lookup sqladmin\.googleapis\.com(?: on [^\r\n]+)?: /u
    .test(cause)) return "DNS";
  if (/^dial tcp(?:4|6)? .+: connect: (?:connection refused|network is unreachable|no route to host|host is unreachable)$/u
    .test(cause)) return "CONNECT";
  if (/^(?:remote error: tls:|tls: (?:failed to verify certificate:|handshake failure|first record does not look like a TLS handshake)|x509: )/u
    .test(cause)) return "TLS";
  if (/^(?:(?:read|write) tcp .+: (?:read|write): )?(?:connection reset by peer|broken pipe)$/u
    .test(cause)) return "RESET";
  if (isExplicitTimeout(cause)) return "TIMEOUT";
  return "OTHER";
}

function isExplicitTimeout(cause: string): boolean {
  return /(?:^|: )(?:context deadline exceeded|i\/o timeout|net\/http: TLS handshake timeout|net\/http: request canceled while waiting for connection|Client\.Timeout exceeded while awaiting headers)$/u
    .test(cause);
}

function isProxyCredentialSourceFailure(message: string): boolean {
  const terminalPrefix =
    "The proxy has encountered a terminal error: unable to start: error initializing dialer: ";
  return message.startsWith(`${terminalPrefix}failed to create default credentials:`)
    || message.startsWith(`${terminalPrefix}failed to create scoped credentials:`);
}

function isProxyListenerFailure(message: string): boolean {
  return message.startsWith(`[${CONNECTION_NAME}] could not mount unix socket "/cloudsql": `)
    || message.startsWith(`[${CONNECTION_NAME}] could not listen to address `);
}

function proxyStructuredErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("severity" in value) || !("timestamp" in value) || !("message" in value)) return null;
  if (value.severity !== "ERROR"
    || typeof value.timestamp !== "string"
    || !Number.isFinite(Date.parse(value.timestamp))
    || typeof value.message !== "string") return null;
  return value.message;
}

async function requireSuccessfulChild(
  executable: string,
  args: readonly string[],
  databaseUrlValue: string,
  roleBootstrap = false,
): Promise<void> {
  const childEnv = childEnvironment(databaseUrlValue);
  if (roleBootstrap) {
    childEnv.EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION =
      "EXPLICIT_EXIMBAY_P3E_SANDBOX_DATABASE_BOOTSTRAP";
    childEnv.EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT = "SANDBOX";
  }
  const child = spawn(process.execPath, [executable, ...args], {
    env: childEnv,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const exit = await childExit(child);
  if (exit !== 0) throw new Error("BOOTSTRAP_CHILD_FAILED");
}

function childEnvironment(databaseUrlValue: string): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: databaseUrlValue,
    CHECKPOINT_DISABLE: "1",
    HOME: "/tmp/refund-db-bootstrap",
    NODE_ENV: "production",
    PATH: "/usr/local/bin:/usr/bin:/bin",
  };
}

const defaultProxyReadinessDependencies = Object.freeze<ProxyReadinessDependencies>({
  now: Date.now,
  fetchReadiness: async () => {
    const response = await fetch(READINESS_URL, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  },
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

export async function awaitProxyReadiness(
  proxy: ProxyReadinessProcess,
  startObservation: Readonly<ProxyStartObservation>,
  diagnostics: readonly ProxyDiagnosticSummary[],
  dependencies: ProxyReadinessDependencies = defaultProxyReadinessDependencies,
): Promise<void> {
  const deadline = dependencies.now() + READINESS_TIMEOUT_MS;
  while (dependencies.now() < deadline) {
    if (startObservation.failed) throw new BootstrapStageFailure("PROXY_START_FAILED");
    if (proxy.exitCode !== null) {
      await Promise.all(diagnostics.map((summary) =>
        proxyDiagnosticSettled.get(summary) ?? Promise.resolve()));
      throw new BootstrapStageFailure("PROXY_EARLY_EXIT", {
        proxyExitCode: proxy.exitCode,
        proxySignal: proxy.signalCode,
        proxyDiagnosticAvailable: diagnostics.some((summary) =>
          summary.observedBytes > 0 || summary.truncated),
        ...proxyFailureDetails(diagnostics),
      });
    }
    try {
      if (await dependencies.fetchReadiness()) return;
    } catch {
      // A bounded local readiness miss is expected while the Proxy starts.
    }
    await dependencies.wait(READINESS_POLL_MS);
  }
  throw new BootstrapStageFailure("PROXY_READY_TIMEOUT");
}

function proxyFailureDetails(diagnostics: readonly ProxyDiagnosticSummary[]): SafeFailureDetails {
  const classified = diagnostics.find((summary) => summary.failureClass !== null);
  if (!classified?.failureClass) {
    return Object.freeze({ proxyFailureClass: "PROXY_EARLY_EXIT_UNCLASSIFIED" });
  }
  return Object.freeze({
    proxyFailureClass: classified.failureClass,
    ...(classified.requestSubtype ?? {}),
  });
}

async function stopProxy(proxy: ChildProcess): Promise<void> {
  if (proxy.exitCode !== null) return;
  proxy.kill("SIGTERM");
  await Promise.race([
    childExit(proxy),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (proxy.exitCode === null) proxy.kill("SIGKILL");
}

function childExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
}

function minimalProxyEnvironment(): NodeJS.ProcessEnv {
  return {
    HOME: "/tmp/refund-db-bootstrap",
    NODE_ENV: "production",
    PATH: "/usr/local/bin:/usr/bin:/bin",
  };
}

function databaseUrl(mode: BootstrapMode): string {
  const socket = `/cloudsql/${CONNECTION_NAME}`;
  const username = isBusinessStateReadbackMode(mode)
    ? REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE
    : IAM_DATABASE_USERNAME;
  return `postgresql://${encodeURIComponent(username)}@localhost/${DATABASE_NAME}?host=${encodeURIComponent(socket)}`;
}

function isBusinessStateReadbackMode(mode: BootstrapMode): boolean {
  return mode === CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE
    || mode === REFUND_READINESS_BUSINESS_STATE_READBACK_MODE;
}

function invalidInput(output: Output): number {
  output.stderr.write('{"ok":false,"code":"INVALID_BOOTSTRAP_RUNTIME_INPUT"}\n');
  return 64;
}

function isNonblank(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await runDatabaseBootstrapEntrypoint();
}
