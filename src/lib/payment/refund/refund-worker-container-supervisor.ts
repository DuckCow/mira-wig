import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  inspectRefundExecutionActivationInventory,
  isRefundExecutionWorkerEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  parseCanonicalRefundCloudSqlDatabaseUrl,
} from "./refund-sandbox-provider-free-preflight-environment";
import { parseEximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment";
import {
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
  parseEximbayContactedReconciliationEnvironment,
} from "./eximbay-contacted-reconciliation-environment";
import type {
  EximbayContactedReconciliationDisposition,
  EximbayContactedReconciliationResult,
} from "./run-eximbay-contacted-reconciliation-once";
import {
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
  parseTossRefundCredentialConfig,
} from "./providers/toss/refund-credential-config";
import {
  loadRefundWorkerMigrationInventory,
  refundWorkerMigrationSelfCheckProof,
} from "./worker-migration-inventory";

const CONTRACT_VERSION = "mira-refund-worker-runtime-image-connection/v1";
const NODE_VERSION = "22.23.1";
const PROXY_VERSION = "2.22.0";
const PROXY_READY_URL = "http://127.0.0.1:9801/readiness";
export const PROXY_READINESS_TIMEOUT_MS = 120_000;
export const PROXY_READINESS_POLL_INTERVAL_MS = 250;
const CHILD_OUTPUT_LIMIT_BYTES = 64 * 1024;
const PROXY_STOP_BUDGET_MS = 2_000;
const PROXY_KILL_BUDGET_MS = 1_000;
const INSTANCE_ENV_KEY = "REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME";
const WORKER_BUNDLE = fileURLToPath(new URL("./refund-execution-worker.mjs", import.meta.url));
const PREFLIGHT_BUNDLE = fileURLToPath(
  new URL("./refund-sandbox-provider-free-preflight.mjs", import.meta.url),
);
const EXIMBAY_CANARY_BUNDLE = fileURLToPath(
  new URL("./eximbay-refund-canary.mjs", import.meta.url),
);
const EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE = fileURLToPath(
  new URL("./eximbay-contacted-reconciliation.mjs", import.meta.url),
);
const PROXY_EXECUTABLE = "/usr/local/bin/cloud-sql-proxy";
const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';
const DATABASE_UNAVAILABLE_LINE = '{"ok":false,"code":"DATABASE_UNAVAILABLE"}\n';
const INVALID_HOST_INPUT_LINE = '{"ok":false,"code":"INVALID_HOST_INPUT"}\n';
const CONFIG_INVALID_LINE = '{"ok":false,"code":"CONFIG_INVALID"}\n';

export const REFUND_WORKER_CONTAINER_COMMANDS = Object.freeze([
  "worker-check",
  "worker-health",
  "worker-once",
  "sandbox-preflight",
  "image-self-check",
  "eximbay-canary-once",
  "eximbay-contacted-reconciliation-once",
] as const);

export type RefundWorkerContainerCommand = typeof REFUND_WORKER_CONTAINER_COMMANDS[number];
type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;

type ChildOutputStream = Readonly<{
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  removeListener(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}>;

type SpawnedChild = Readonly<{
  stdout: ChildOutputStream;
  stderr: ChildOutputStream;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(signal: NodeJS.Signals): boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}>;

export type RefundWorkerContainerSupervisorDependencies = Readonly<{
  spawn: (
    executable: string,
    args: readonly string[],
    options: Readonly<{
      env: Readonly<Record<string, string | undefined>>;
      stdio: ["ignore", "pipe", "pipe"];
    }>,
  ) => SpawnedChild;
  fetch: (url: string, init: Readonly<{ signal: AbortSignal }>) => Promise<Readonly<{ ok: boolean }>>;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  proxyReadinessTimeoutMs: number;
  proxyReadinessPollIntervalMs: number;
  proxyExecutable: string;
  workerBundle: string;
  preflightBundle: string;
  eximbayCanaryBundle: string;
  eximbayContactedReconciliationBundle: string;
  inspectSelf: () => Promise<RefundWorkerImageSelfCheck>;
}>;

export type RefundWorkerImageSelfCheck = Readonly<{
  ok: true;
  code: "IMAGE_SELF_CHECK_READY";
  contractVersion: typeof CONTRACT_VERSION;
  nodeVersionCompatible: true;
  architectureCompatible: true;
  proxyVersionCompatible: true;
  workerBundlePresent: true;
  preflightBundlePresent: true;
  eximbayCanaryBundlePresent: true;
  eximbayContactedReconciliationBundlePresent: true;
  migrationCount: number;
  migrationDigest: string;
  nonRoot: true;
}>;

export const defaultRefundWorkerContainerSupervisorDependencies:
RefundWorkerContainerSupervisorDependencies = Object.freeze({
  spawn: (executable, args, options) => spawn(executable, args, {
    env: { ...options.env, NODE_ENV: normalizedNodeEnvironment(options.env.NODE_ENV) },
    stdio: options.stdio,
  }),
  fetch: (url, init) => fetch(url, init),
  sleep: (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }),
  now: () => performance.now(),
  proxyReadinessTimeoutMs: PROXY_READINESS_TIMEOUT_MS,
  proxyReadinessPollIntervalMs: PROXY_READINESS_POLL_INTERVAL_MS,
  proxyExecutable: PROXY_EXECUTABLE,
  workerBundle: WORKER_BUNDLE,
  preflightBundle: PREFLIGHT_BUNDLE,
  eximbayCanaryBundle: EXIMBAY_CANARY_BUNDLE,
  eximbayContactedReconciliationBundle: EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE,
  inspectSelf: inspectRefundWorkerImage,
});

function normalizedNodeEnvironment(
  value: string | undefined,
): "production" | "development" | "test" {
  return value === "development" || value === "test" ? value : "production";
}

export async function runRefundWorkerContainerSupervisor(
  args: unknown,
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies =
  defaultRefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  const command = exactContainerCommand(args);
  if (!command) return writeStatic(output.stderr, INVALID_HOST_INPUT_LINE, 64);
  const direct = directCommand(command, env, output, dependencies);
  if (direct) return direct;
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  const child = command === "sandbox-preflight"
    ? Object.freeze({ executable: process.execPath, args: Object.freeze([dependencies.preflightBundle]) })
    : Object.freeze({
      executable: process.execPath,
      args: Object.freeze([dependencies.workerBundle, command === "worker-check" ? "check" : "health"]),
    });
  return runWithProxy(binding, child, env, output, dependencies);
}

function directCommand(
  command: RefundWorkerContainerCommand,
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> | null {
  if (command === "image-self-check") return runImageSelfCheck(output, dependencies);
  if (command === "eximbay-canary-once") return runEximbayCanaryOnce(env, output, dependencies);
  if (command === "eximbay-contacted-reconciliation-once") {
    return runEximbayContactedReconciliationOnce(env, output, dependencies);
  }
  return command === "worker-once" ? runWorkerOnce(env, output, dependencies) : null;
}

async function runEximbayContactedReconciliationOnce(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  if (!parseEximbayContactedReconciliationEnvironment(env)) {
    return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  }
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  return runWithProxy(binding, Object.freeze({
    executable: process.execPath,
    args: Object.freeze([dependencies.eximbayContactedReconciliationBundle]),
    resultSchema: "EXIMBAY_CONTACTED_RECONCILIATION",
  }), env, output, dependencies);
}

async function runEximbayCanaryOnce(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  if (!parseEximbayRefundCanaryEnvironment(env)) {
    return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  }
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  return runWithProxy(binding, Object.freeze({
    executable: process.execPath,
    args: Object.freeze([dependencies.eximbayCanaryBundle]),
  }), env, output, dependencies);
}

async function runWorkerOnce(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  const staticWorker = Object.freeze({
    executable: process.execPath,
    args: Object.freeze([
      dependencies.workerBundle,
      "run-once",
      "--service", "disabled",
      "--revision", "disabled",
      "--slot", "0",
    ]),
  });
  try {
    if (!isRefundExecutionWorkerEnabled(env)) {
      return runStandaloneChild(staticWorker, env, output, dependencies);
    }
    inspectRefundExecutionActivationInventory(env);
  } catch (error) {
    return error instanceof RefundExecutionActivationConfigError
      ? runStandaloneChild(staticWorker, env, output, dependencies)
      : writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
  const credential = parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  });
  if (credential.status !== "CONFIGURED") {
    return runStandaloneChild(staticWorker, env, output, dependencies);
  }
  const identity = cloudRunTaskIdentity(env);
  if (!identity) return writeStatic(output.stderr, INVALID_HOST_INPUT_LINE, 64);
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  const child = Object.freeze({
    executable: process.execPath,
    args: Object.freeze([
      dependencies.workerBundle,
      "run-once",
      "--service", identity.service,
      "--revision", identity.revision,
      "--slot", identity.slot,
    ]),
  });
  return runWithProxy(binding, child, env, output, dependencies);
}

type DatabaseBinding = Readonly<{ instanceConnectionName: string }>;

function validateDatabaseBinding(env: RuntimeEnvironment): DatabaseBinding | null {
  if (hasConnectionEnvironmentOverride(env)) return null;
  const instance = env[INSTANCE_ENV_KEY];
  if (typeof instance !== "string" || instance.length === 0) return null;
  const database = parseCanonicalRefundCloudSqlDatabaseUrl(env.DATABASE_URL);
  if (!database || database.instanceConnectionName !== instance) return null;
  return Object.freeze({ instanceConnectionName: instance });
}

function hasConnectionEnvironmentOverride(env: RuntimeEnvironment): boolean {
  return Object.entries(env).some(([key, value]) => (
    (key.startsWith("CSQL_PROXY_") || key.startsWith("PG"))
    && typeof value === "string"
    && value.trim().length > 0
  ));
}

type ChildSpecification = Readonly<{
  executable: string;
  args: readonly string[];
  resultSchema?: "EXIMBAY_CONTACTED_RECONCILIATION";
}>;

async function runWithProxy(
  binding: DatabaseBinding,
  childSpecification: ChildSpecification,
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  let proxy: SpawnedChild;
  try {
    proxy = dependencies.spawn(
      dependencies.proxyExecutable,
      proxyArguments(binding.instanceConnectionName),
      childEnvironment(env),
    );
  } catch {
    return writeStatic(output.stderr, DATABASE_UNAVAILABLE_LINE, 1);
  }
  const proxyExit = observeExit(proxy);
  const ready = await waitForProxyReadiness(proxyExit, dependencies);
  if (!ready) {
    await stopChild(proxy, proxyExit, dependencies);
    return writeStatic(output.stderr, DATABASE_UNAVAILABLE_LINE, 1);
  }
  const worker = spawnChild(childSpecification, env, dependencies);
  if (!worker) {
    await stopChild(proxy, proxyExit, dependencies);
    return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
  const signal = forwardTerminationSignals(worker);
  const workerResult = await captureChildResult(worker);
  signal.dispose();
  const proxyFailedWhileRunning = proxy.exitCode !== null || proxy.signalCode !== null;
  const proxyStopped = await stopChild(proxy, proxyExit, dependencies);
  return finalizeProxiedChildResult(
    childSpecification,
    workerResult,
    proxyFailedWhileRunning,
    proxyStopped,
    output,
  );
}

async function finalizeProxiedChildResult(
  childSpecification: ChildSpecification,
  workerResult: ChildResult | null,
  proxyFailedWhileRunning: boolean,
  proxyStopped: boolean,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  const evidence = trustedChildEvidence(childSpecification, workerResult);
  if (!evidence) return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  if (proxyFailedWhileRunning || !proxyStopped) {
    return writeStatic(output.stderr, systemicFailureLine(evidence.providerRetrieveCount), 1);
  }
  return relayChildResult(evidence.result, output);
}

type TrustedChildEvidence = Readonly<{
  result: ChildResult;
  providerRetrieveCount: 0 | 1 | null;
}>;

function trustedChildEvidence(
  specification: ChildSpecification,
  result: ChildResult | null,
): TrustedChildEvidence | null {
  if (!result) return null;
  if (specification.resultSchema !== "EXIMBAY_CONTACTED_RECONCILIATION") {
    return Object.freeze({ result, providerRetrieveCount: null });
  }
  const providerRetrieveCount = validatedContactedReconciliationProviderRetrieveCount(result);
  return providerRetrieveCount === null
    ? null
    : Object.freeze({ result, providerRetrieveCount });
}

function spawnChild(
  specification: ChildSpecification,
  env: RuntimeEnvironment,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): SpawnedChild | null {
  try {
    return dependencies.spawn(
      specification.executable,
      specification.args,
      childEnvironment(env),
    );
  } catch {
    return null;
  }
}

async function runStandaloneChild(
  childSpecification: ChildSpecification,
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  try {
    const child = dependencies.spawn(
      childSpecification.executable,
      childSpecification.args,
      childEnvironment(env),
    );
    const signal = forwardTerminationSignals(child);
    const result = await captureChildResult(child);
    signal.dispose();
    return result
      ? relayChildResult(result, output)
      : writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  } catch {
    return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
}

function proxyArguments(instanceConnectionName: string): readonly string[] {
  return Object.freeze([
    "--private-ip",
    "--unix-socket=/cloudsql",
    "--health-check",
    "--http-address=127.0.0.1",
    "--http-port=9801",
    "--exit-zero-on-sigterm",
    instanceConnectionName,
  ]);
}

function childEnvironment(env: RuntimeEnvironment): Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  stdio: ["ignore", "pipe", "pipe"];
}> {
  return Object.freeze({
    env: { ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForProxyReadiness(
  proxyExit: Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<boolean> {
  const started = dependencies.now();
  const deadline = started + dependencies.proxyReadinessTimeoutMs;
  while (dependencies.now() < deadline) {
    const remaining = deadline - dependencies.now();
    const readiness = probeProxyReadiness(
      dependencies,
      Math.min(dependencies.proxyReadinessPollIntervalMs, remaining),
    );
    const outcome = await Promise.race([
      readiness.then((ready) => Object.freeze({ kind: "READINESS" as const, ready })),
      proxyExit.then(() => Object.freeze({ kind: "EXIT" as const })),
    ]);
    if (outcome.kind === "EXIT") return false;
    if (outcome.ready) return true;
    const afterProbe = deadline - dependencies.now();
    if (afterProbe <= 0) return false;
    await dependencies.sleep(Math.min(
      dependencies.proxyReadinessPollIntervalMs,
      afterProbe,
    ));
  }
  return false;
}

async function probeProxyReadiness(
  dependencies: RefundWorkerContainerSupervisorDependencies,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await dependencies.fetch(PROXY_READY_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

type ChildResult = Readonly<{ line: string; exitCode: number; value: unknown }>;

async function captureChildResult(child: SpawnedChild): Promise<ChildResult | null> {
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let overflow = false;
  const appendStdout = (chunk: Buffer | string) => {
    stdout = boundedAppend(stdout, chunk, () => {
      overflow = true;
    });
  };
  const appendStderr = (chunk: Buffer | string) => {
    stderr = boundedAppend(stderr, chunk, () => {
      overflow = true;
    });
  };
  child.stdout.on("data", appendStdout);
  child.stderr.on("data", appendStderr);
  const exit = await observeExit(child);
  child.stdout.removeListener("data", appendStdout);
  child.stderr.removeListener("data", appendStderr);
  if (overflow || exit.signal !== null || exit.code === null) return null;
  const selected = exit.code === 0 ? stdout : stderr;
  const other = exit.code === 0 ? stderr : stdout;
  const terminal = exactOneJsonLine(selected, other);
  return terminal
    ? Object.freeze({ ...terminal, exitCode: exit.code })
    : null;
}

function boundedAppend(
  existing: Buffer,
  chunk: Buffer | string,
  overflow: () => void,
): Buffer<ArrayBufferLike> {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  if (existing.length + bytes.length > CHILD_OUTPUT_LIMIT_BYTES) {
    overflow();
    return existing;
  }
  return Buffer.concat([existing, bytes]);
}

function exactOneJsonLine(
  selected: Buffer,
  other: Buffer,
): Readonly<{ line: string; value: unknown }> | null {
  if (!hasExactLineTransport(selected, other)) return null;
  const withoutLf = selected.subarray(0, selected.length - 1);
  if (withoutLf.includes(0x0a) || withoutLf.includes(0x0d)) return null;
  const line = selected.toString("utf8");
  try {
    const parsed: unknown = JSON.parse(withoutLf.toString("utf8"));
    return parsed && typeof parsed === "object"
      ? Object.freeze({ line, value: parsed })
      : null;
  } catch {
    return null;
  }
}

const CONTACTED_RECONCILIATION_SUCCESS_KEYS = Object.freeze([
  "checkoutSessionId",
  "code",
  "disposition",
  "durableRelease",
  "ok",
  "providerRetrieveCount",
  "runId",
  "terminalClass",
]);
const CONTACTED_RECONCILIATION_FAILURE_KEYS = Object.freeze([
  "checkoutSessionId",
  "code",
  "durableRelease",
  "ok",
  "providerRetrieveCount",
  "runId",
  "terminalClass",
]);
const CONTACTED_RECONCILIATION_DISPOSITIONS = Object.freeze([
  "RELEASED_AFTER_Q004",
  "REPLAYED_ALREADY_RELEASED",
  "TRANSACTION_OBSERVED",
  "OUTCOME_UNKNOWN",
  "STALE_OR_NOT_ELIGIBLE",
  "RECOVERY_DISABLED",
  "STATE_CHANGED",
] as const satisfies readonly EximbayContactedReconciliationDisposition[]);
type ContactedReconciliationFailureCode = Exclude<
  EximbayContactedReconciliationResult["code"],
  "CONTACTED_RECONCILIATION_COMPLETE"
>;

function validatedContactedReconciliationProviderRetrieveCount(
  terminal: ChildResult,
): 0 | 1 | null {
  const value = terminal.value;
  if (!isPlainRecord(value) || !hasFixedContactedReconciliationIdentity(value)) return null;
  const providerRetrieveCount = value.providerRetrieveCount;
  if (!isProviderRetrieveCount(providerRetrieveCount)) return null;
  if (value.ok === true) {
    return isValidContactedReconciliationSuccess(value, terminal.exitCode)
      ? providerRetrieveCount
      : null;
  }
  if (value.ok !== false) return null;
  return isValidContactedReconciliationFailure(value, terminal.exitCode)
    ? providerRetrieveCount
    : null;
}

function isProviderRetrieveCount(value: unknown): value is 0 | 1 {
  return Object.is(value, 0) || value === 1;
}

function isValidContactedReconciliationSuccess(
  value: Record<string, unknown>,
  exitCode: number,
): boolean {
  if (!isContactedReconciliationDisposition(value.disposition)) return false;
  return [
    hasExactKeys(value, CONTACTED_RECONCILIATION_SUCCESS_KEYS),
    exitCode === 0,
    value.code === "CONTACTED_RECONCILIATION_COMPLETE",
    value.terminalClass === "RECONCILIATION_COMPLETED",
    value.durableRelease === durableReleaseForDisposition(value.disposition),
  ].every(Boolean);
}

function isValidContactedReconciliationFailure(
  value: Record<string, unknown>,
  exitCode: number,
): boolean {
  if (!isContactedReconciliationFailureCode(value.code)) return false;
  return [
    hasExactKeys(value, CONTACTED_RECONCILIATION_FAILURE_KEYS),
    value.terminalClass === "HOST_FAILURE",
    value.durableRelease === "NOT_REPORTED",
    exitCode === contactedReconciliationFailureExitCode(value.code),
  ].every(Boolean);
}

function contactedReconciliationFailureExitCode(
  code: ContactedReconciliationFailureCode,
): 1 | 78 {
  return code === "CONFIG_INVALID" ? 78 : 1;
}

function hasFixedContactedReconciliationIdentity(value: Record<string, unknown>): boolean {
  return value.runId === EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID
    && value.checkoutSessionId === EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
}

function isContactedReconciliationDisposition(
  value: unknown,
): value is typeof CONTACTED_RECONCILIATION_DISPOSITIONS[number] {
  return typeof value === "string"
    && CONTACTED_RECONCILIATION_DISPOSITIONS.some((candidate) => candidate === value);
}

function durableReleaseForDisposition(
  disposition: typeof CONTACTED_RECONCILIATION_DISPOSITIONS[number],
): EximbayContactedReconciliationResult["durableRelease"] {
  if (disposition === "RELEASED_AFTER_Q004") return "PERFORMED";
  return disposition === "REPLAYED_ALREADY_RELEASED"
    ? "OBSERVED_EXISTING"
    : "NOT_REPORTED";
}

function isContactedReconciliationFailureCode(
  value: unknown,
): value is ContactedReconciliationFailureCode {
  return value === "CONFIG_INVALID"
    || value === "CREDENTIAL_UNAVAILABLE"
    || value === "INTERNAL_FAILURE";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Reflect.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index]);
}

function contactedReconciliationSystemicFailureLine(
  providerRetrieveCount: 0 | 1,
): string {
  return `{"ok":false,"code":"SYSTEMIC_FAILURE","providerRetrieveCount":${providerRetrieveCount}}\n`;
}

function systemicFailureLine(providerRetrieveCount: 0 | 1 | null): string {
  return providerRetrieveCount === null
    ? SYSTEMIC_FAILURE_LINE
    : contactedReconciliationSystemicFailureLine(providerRetrieveCount);
}

function hasExactLineTransport(selected: Buffer, other: Buffer): boolean {
  return other.length === 0
    && selected.length >= 3
    && selected[selected.length - 1] === 0x0a;
}

function observeExit(
  child: SpawnedChild,
): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(Object.freeze({ code: child.exitCode, signal: child.signalCode }));
  }
  return new Promise((resolve) => {
    child.once("close", (code, signal) => {
      resolve(Object.freeze({ code, signal }));
    });
  });
}

async function stopChild(
  child: SpawnedChild,
  exit: Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await exit;
    return true;
  }
  child.kill("SIGTERM");
  if (await settlesWithin(exit, PROXY_STOP_BUDGET_MS, dependencies)) return true;
  child.kill("SIGKILL");
  return settlesWithin(exit, PROXY_KILL_BUDGET_MS, dependencies);
}

async function settlesWithin(
  promise: Promise<unknown>,
  milliseconds: number,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    dependencies.sleep(milliseconds).then(() => false),
  ]);
}

function forwardTerminationSignals(worker: SpawnedChild): Readonly<{ dispose: () => void }> {
  let forwarded = false;
  const forward = () => {
    if (forwarded) return;
    forwarded = true;
    worker.kill("SIGTERM");
  };
  process.on("SIGTERM", forward);
  process.on("SIGINT", forward);
  return Object.freeze({
    dispose: () => {
      process.removeListener("SIGTERM", forward);
      process.removeListener("SIGINT", forward);
    },
  });
}

function cloudRunTaskIdentity(
  env: RuntimeEnvironment,
): Readonly<{ service: string; revision: string; slot: string }> | null {
  const job = boundedCloudRunLabel(env.CLOUD_RUN_JOB);
  const execution = boundedCloudRunLabel(env.CLOUD_RUN_EXECUTION);
  const count = exactNonnegativeInteger(env.CLOUD_RUN_TASK_COUNT);
  const index = exactNonnegativeInteger(env.CLOUD_RUN_TASK_INDEX);
  const attempt = exactNonnegativeInteger(env.CLOUD_RUN_TASK_ATTEMPT);
  if (!job || !execution || count !== 1 || index !== 0 || attempt !== 0) return null;
  return Object.freeze({
    service: `job-${digestLabel(job)}`,
    revision: `execution-${digestLabel(execution)}`,
    slot: "task-0-attempt-0",
  });
}

function boundedCloudRunLabel(value: string | undefined): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= 256
    && /^[A-Za-z0-9._-]+$/u.test(value)
    ? value
    : null;
}

function exactNonnegativeInteger(value: string | undefined): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function digestLabel(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function exactContainerCommand(value: unknown): RefundWorkerContainerCommand | null {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype
    || value.length !== 1 || typeof value[0] !== "string") return null;
  return REFUND_WORKER_CONTAINER_COMMANDS.find((command) => command === value[0]) ?? null;
}

async function runImageSelfCheck(
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  try {
    const result = await dependencies.inspectSelf();
    return writeStatic(output.stdout, `${JSON.stringify(result)}\n`, 0);
  } catch {
    return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
}

async function inspectRefundWorkerImage(): Promise<RefundWorkerImageSelfCheck> {
  if (process.versions.node !== NODE_VERSION || process.arch !== "x64"
    || typeof process.getuid !== "function" || process.getuid() === 0) {
    throw new Error("INCOMPATIBLE_RUNTIME");
  }
  await Promise.all([
    access(PROXY_EXECUTABLE, fsConstants.X_OK),
    access(WORKER_BUNDLE, fsConstants.R_OK),
    access(PREFLIGHT_BUNDLE, fsConstants.R_OK),
    access(EXIMBAY_CANARY_BUNDLE, fsConstants.R_OK),
    access(EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE, fsConstants.R_OK),
  ]);
  const version = spawnSync(PROXY_EXECUTABLE, ["--version"], {
    encoding: "utf8",
    timeout: 2_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (version.status !== 0 || !version.stdout.includes(`version ${PROXY_VERSION}`)) {
    throw new Error("INCOMPATIBLE_PROXY");
  }
  const migrations = await loadRefundWorkerMigrationInventory();
  const migrationProof = refundWorkerMigrationSelfCheckProof(migrations);
  return Object.freeze({
    ok: true,
    code: "IMAGE_SELF_CHECK_READY",
    contractVersion: CONTRACT_VERSION,
    nodeVersionCompatible: true,
    architectureCompatible: true,
    proxyVersionCompatible: true,
    workerBundlePresent: true,
    preflightBundlePresent: true,
    eximbayCanaryBundlePresent: true,
    eximbayContactedReconciliationBundlePresent: true,
    migrationCount: migrationProof.migrationCount,
    migrationDigest: migrationProof.migrationDigest,
    nonRoot: true,
  });
}

async function relayChildResult(
  result: ChildResult,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  return writeStatic(result.exitCode === 0 ? output.stdout : output.stderr, result.line, result.exitCode);
}

async function writeStatic(
  writer: OutputWriter,
  line: string,
  exitCode: number,
): Promise<number> {
  try {
    await writer.write(line);
    return exitCode;
  } catch {
    return 1;
  }
}
