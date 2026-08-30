import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "../../src/lib/payment/refund/worker-migration-inventory.js";

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
const PRISMA_EXECUTABLE = "/app/node_modules/prisma/build/index.js";
const MIGRATIONS_DIRECTORY = "/app/prisma/migrations";
const READINESS_URL = "http://127.0.0.1:9801/readiness";
const READINESS_TIMEOUT_MS = 120_000;
const READINESS_POLL_MS = 250;
export const PROXY_DIAGNOSTIC_BYTE_LIMIT = 4_096;

export const BOOTSTRAP_FAILURE_CODES = Object.freeze([
  "PROXY_START_FAILED",
  "PROXY_EARLY_EXIT",
  "PROXY_READY_TIMEOUT",
  "DB_CONNECT_FAILED",
  "LEDGER_READ_FAILED",
  "LEDGER_REJECTED",
  "RUNTIME_LOCAL_FAILED",
] as const);

export const PROXY_FAILURE_CLASSES = Object.freeze([
  "PROXY_CREDENTIAL_SOURCE_FAILED",
  "PROXY_SQLADMIN_PERMISSION_DENIED",
  "PROXY_SQLADMIN_REQUEST_FAILED",
  "PROXY_INSTANCE_CONFIG_FAILED",
  "PROXY_LISTENER_FAILED",
  "PROXY_EARLY_EXIT_UNCLASSIFIED",
] as const);

type BootstrapFailureCode = (typeof BOOTSTRAP_FAILURE_CODES)[number];
export type ProxyFailureClass = (typeof PROXY_FAILURE_CLASSES)[number];
type SafeFailureDetails = Readonly<{
  proxyExitCode?: number | null;
  proxySignal?: string | null;
  proxyDiagnosticAvailable?: boolean;
  proxyFailureClass?: ProxyFailureClass;
}>;
type SafeFailureRecord = Readonly<{ code: BootstrapFailureCode }> & SafeFailureDetails;
type ProxyStartObservation = { failed: boolean };
type ProxyReadinessProcess = Pick<ChildProcess, "exitCode" | "signalCode">;
type ProxyDiagnosticStream = Pick<NodeJS.ReadableStream, "on">;
export type ProxyDiagnosticSummary = {
  observedBytes: number;
  truncated: boolean;
  failureClass: Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null;
};
export type ProxyReadinessDependencies = Readonly<{
  now: () => number;
  fetchReadiness: () => Promise<boolean>;
  wait: (milliseconds: number) => Promise<void>;
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

export type BootstrapMode = "check" | "apply";

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

export function proxyArguments(): readonly string[] {
  return Object.freeze([
    "--structured-logs",
    "--private-ip",
    "--auto-iam-authn",
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
  if (args[0] === "check" || args[0] === "apply") return args[0];
  return null;
}

function parseConfiguration(
  mode: BootstrapMode,
  env: BootstrapEnvironment,
  embeddedSourceCommit: string,
  inventory: RefundWorkerMigrationInventory,
): RuntimeConfiguration | null {
  const sourceCommit = env.MIRA_DB_BOOTSTRAP_SOURCE_COMMIT;
  const imageDigestUri = env.MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI;
  if (!matchesExactTarget(env)
    || !matchesExactTask(env)
    || !matchesExactSource(sourceCommit, embeddedSourceCommit)
    || !matchesExactImage(imageDigestUri)
    || !matchesExactMigrations(env, inventory)) return null;
  return Object.freeze({
    mode,
    sourceCommit,
    imageDigestUri,
    databaseUrl: databaseUrl(),
  });
}

function matchesExactTarget(env: BootstrapEnvironment): boolean {
  return env.MIRA_DB_BOOTSTRAP_PROJECT_ID === PROJECT_ID
    && env.MIRA_DB_BOOTSTRAP_REGION === REGION
    && env.MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME === CONNECTION_NAME
    && env.MIRA_DB_BOOTSTRAP_DATABASE_NAME === DATABASE_NAME
    && env.MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME === IAM_DATABASE_USERNAME;
}

function matchesExactTask(env: BootstrapEnvironment): boolean {
  return env.CLOUD_RUN_JOB === JOB_NAME
    && isNonblank(env.CLOUD_RUN_EXECUTION)
    && env.CLOUD_RUN_TASK_COUNT === "1"
    && env.CLOUD_RUN_TASK_INDEX === "0"
    && env.CLOUD_RUN_TASK_ATTEMPT === "0";
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
    || key.startsWith("TOSS_")
    || key.startsWith("EXIMBAY_")
  ));
}

async function runWithProxy(
  configuration: RuntimeConfiguration,
  inventory: RefundWorkerMigrationInventory,
): Promise<Readonly<Record<string, unknown>>> {
  const startObservation: ProxyStartObservation = { failed: false };
  let proxy: ChildProcess;
  try {
    proxy = spawn(PROXY_EXECUTABLE, [...proxyArguments()], {
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
  try {
    await awaitProxyReadiness(proxy, startObservation, diagnostics);
    return configuration.mode === "check"
      ? checkDatabase(configuration.databaseUrl, inventory)
      : applyDatabase(configuration.databaseUrl, inventory);
  } finally {
    await stopProxy(proxy);
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

  await requireSuccessfulChild(PRISMA_EXECUTABLE, [
    "migrate",
    "deploy",
    "--config",
    "/app/prisma.config.ts",
    "--schema",
    "/app/prisma/schema.prisma",
  ], databaseUrlValue);

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
  return error instanceof BootstrapStageFailure
    ? error.record
    : Object.freeze({ code: "RUNTIME_LOCAL_FAILED" });
}

export function consumeProxyDiagnosticStream(
  stream: ProxyDiagnosticStream | null,
): ProxyDiagnosticSummary {
  const summary: ProxyDiagnosticSummary = {
    observedBytes: 0,
    truncated: false,
    failureClass: null,
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
  const failureClass = classifyProxyStructuredLogLine(line);
  if (failureClass) summary.failureClass = failureClass;
}

export function classifyProxyStructuredLogLine(
  line: string,
): Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null {
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
): Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null {
  const instanceFailure = classifyProxyInstanceResolutionFailure(message);
  if (instanceFailure) return instanceFailure;
  if (isProxyCredentialSourceFailure(message)) return "PROXY_CREDENTIAL_SOURCE_FAILED";
  if (isProxyListenerFailure(message)) return "PROXY_LISTENER_FAILED";
  return null;
}

function classifyProxyInstanceResolutionFailure(
  message: string,
): Exclude<ProxyFailureClass, "PROXY_EARLY_EXIT_UNCLASSIFIED"> | null {
  const instancePrefix = `[${CONNECTION_NAME}] could not resolve instance version: `;
  const sqlAdminPrefix = `${instancePrefix}failed to get instance: refresh error: `
    + `failed to get instance metadata (connection name = "${CONNECTION_NAME}"): `;
  if (message.startsWith(sqlAdminPrefix)) {
    const requestFailure = message.slice(sqlAdminPrefix.length);
    if (/^googleapi: Error 403(?:\b|:)/u.test(requestFailure)) {
      return "PROXY_SQLADMIN_PERMISSION_DENIED";
    }
    if (/^(?:googleapi: Error \d{3}(?:\b|:)|(?:Get|Post) "https:\/\/sqladmin\.googleapis\.com\/)/u
      .test(requestFailure)) return "PROXY_SQLADMIN_REQUEST_FAILED";
  }
  if (/^\[[^\]\r\n]{1,255}\] could not resolve instance version: config error: invalid instance connection name, expected PROJECT:REGION:INSTANCE \(connection name = "[^"\r\n]{1,255}"\)$/u
    .test(message)) {
    return "PROXY_INSTANCE_CONFIG_FAILED";
  }
  return null;
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
  const childEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: databaseUrlValue,
    HOME: "/tmp/refund-db-bootstrap",
    NODE_ENV: "production",
    PATH: "/usr/local/bin:/usr/bin:/bin",
  };
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
        proxyFailureClass: diagnostics.find((summary) =>
          summary.failureClass !== null)?.failureClass
          ?? "PROXY_EARLY_EXIT_UNCLASSIFIED",
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

function databaseUrl(): string {
  const socket = `/cloudsql/${CONNECTION_NAME}`;
  return `postgresql://${encodeURIComponent(IAM_DATABASE_USERNAME)}@localhost/${DATABASE_NAME}?host=${encodeURIComponent(socket)}`;
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
