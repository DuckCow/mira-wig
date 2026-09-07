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
  EximbayContactedProviderObservation,
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
const CONTACTED_SUPERVISOR_FAILURE_EVENT =
  "CONTACTED_RECONCILIATION_SUPERVISOR_FAILURE";
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
    const proxyFailedWhileRunning = proxy.exitCode !== null || proxy.signalCode !== null;
    const proxyStopped = await stopChild(proxy, proxyExit, dependencies);
    if (childSpecification.resultSchema === "EXIMBAY_CONTACTED_RECONCILIATION") {
      return writeContactedSystemicFailure(
        output.stderr,
        contactedSupervisorFailureDiagnostic(
          null,
          "NOT_ATTEMPTED",
          proxyLifecycle(proxyFailedWhileRunning, proxyStopped),
        ),
        null,
      );
    }
    return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
  const signal = forwardTerminationSignals(worker);
  const workerCapture = await captureChildResult(worker);
  signal.dispose();
  const proxyFailedWhileRunning = proxy.exitCode !== null || proxy.signalCode !== null;
  const proxyStopped = await stopChild(proxy, proxyExit, dependencies);
  return finalizeProxiedChildResult(
    childSpecification,
    workerCapture,
    proxyFailedWhileRunning,
    proxyStopped,
    output,
  );
}

async function finalizeProxiedChildResult(
  childSpecification: ChildSpecification,
  workerCapture: ChildCapture,
  proxyFailedWhileRunning: boolean,
  proxyStopped: boolean,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  const assessment = trustedChildEvidence(childSpecification, workerCapture);
  const lifecycle = proxyLifecycle(proxyFailedWhileRunning, proxyStopped);
  if (!assessment.evidence) {
    return childSpecification.resultSchema === "EXIMBAY_CONTACTED_RECONCILIATION"
      ? writeContactedSystemicFailure(
        output.stderr,
        contactedSupervisorFailureDiagnostic(
          workerCapture,
          assessment.validation,
          lifecycle,
        ),
        null,
      )
      : writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
  }
  if (proxyFailedWhileRunning || !proxyStopped) {
    return childSpecification.resultSchema === "EXIMBAY_CONTACTED_RECONCILIATION"
      ? writeContactedSystemicFailure(
        output.stderr,
        contactedSupervisorFailureDiagnostic(workerCapture, assessment.validation, lifecycle),
        assessment.evidence.providerRetrieveCount,
        assessment.evidence.providerObservation,
      )
      : writeStatic(
        output.stderr,
        systemicFailureLine(assessment.evidence.providerRetrieveCount),
        1,
      );
  }
  return relayChildResult(assessment.evidence.result, output);
}

type TrustedChildEvidence = Readonly<{
  result: ChildResult;
  providerRetrieveCount: 0 | 1 | null;
  providerObservation: EximbayContactedProviderObservation | null;
}>;

function trustedChildEvidence(
  specification: ChildSpecification,
  capture: ChildCapture,
): Readonly<{
  evidence: TrustedChildEvidence | null;
  validation: ChildValidationState;
}> {
  const result = capture.result;
  if (!result) return Object.freeze({ evidence: null, validation: capture.validation });
  if (specification.resultSchema !== "EXIMBAY_CONTACTED_RECONCILIATION") {
    return Object.freeze({
      evidence: Object.freeze({
        result,
        providerRetrieveCount: null,
        providerObservation: null,
      }),
      validation: "TRUSTED",
    });
  }
  const validation = validateContactedReconciliationTerminal(result);
  return validation.state === "TRUSTED"
    ? Object.freeze({
      evidence: Object.freeze({
        result,
        providerRetrieveCount: validation.providerRetrieveCount,
        providerObservation: validation.providerObservation,
      }),
      validation: validation.state,
    })
    : Object.freeze({ evidence: null, validation: validation.state });
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
    const capture = await captureChildResult(child);
    signal.dispose();
    return capture.result
      ? relayChildResult(capture.result, output)
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
type ChildProcessState = "NORMAL_EXIT" | "SIGNAL_TERMINATION" | "CLOSE_STATE_UNAVAILABLE";
type ChildStreamState = "NOT_CAPTURED" | "EMPTY" | "STDOUT_ONLY" | "STDERR_ONLY" | "BOTH";
type ProxyLifecycleState =
  | "READY_CLEANUP_CONFIRMED"
  | "READY_PREMATURE_EXIT"
  | "READY_CLEANUP_UNCONFIRMED";
type ChildValidationState =
  | "NOT_ATTEMPTED"
  | "TRUSTED"
  | "OUTPUT_OVERFLOW"
  | "SIGNAL_TERMINATION"
  | "CLOSE_STATE_UNAVAILABLE"
  | "MISSING_TERMINAL"
  | "STREAM_CONTRACT_VIOLATION"
  | "LINE_CONTRACT_VIOLATION"
  | "INVALID_JSON"
  | "NON_OBJECT_JSON"
  | "INVALID_RECORD"
  | "FIXED_IDENTITY_MISMATCH"
  | "INVALID_PROVIDER_RETRIEVE_COUNT"
  | "INVALID_PROVIDER_OBSERVATION"
  | "INVALID_OK"
  | "SUCCESS_DISPOSITION_INVALID"
  | "SUCCESS_KEY_SET_MISMATCH"
  | "SUCCESS_EXIT_CODE_MISMATCH"
  | "SUCCESS_CODE_MISMATCH"
  | "SUCCESS_TERMINAL_CLASS_MISMATCH"
  | "SUCCESS_DURABLE_RELEASE_MISMATCH"
  | "FAILURE_CODE_INVALID"
  | "FAILURE_KEY_SET_MISMATCH"
  | "FAILURE_TERMINAL_CLASS_MISMATCH"
  | "FAILURE_DURABLE_RELEASE_MISMATCH"
  | "FAILURE_EXIT_CODE_MISMATCH";
type ChildCapture = Readonly<{
  processState: ChildProcessState;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  streamState: ChildStreamState;
  outputOverflow: boolean;
  result: ChildResult | null;
  validation: ChildValidationState;
}>;
type TerminalCapture = Readonly<{
  terminal: Readonly<{ line: string; value: unknown }> | null;
  validation: ChildValidationState;
}>;

async function captureChildResult(child: SpawnedChild): Promise<ChildCapture> {
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let overflow = false;
  let stdoutSeen = false;
  let stderrSeen = false;
  const appendStdout = (chunk: Buffer | string) => {
    stdoutSeen = true;
    stdout = boundedAppend(stdout, chunk, () => {
      overflow = true;
    });
  };
  const appendStderr = (chunk: Buffer | string) => {
    stderrSeen = true;
    stderr = boundedAppend(stderr, chunk, () => {
      overflow = true;
    });
  };
  child.stdout.on("data", appendStdout);
  child.stderr.on("data", appendStderr);
  const exit = await observeExit(child);
  child.stdout.removeListener("data", appendStdout);
  child.stderr.removeListener("data", appendStderr);
  const processState = childProcessState(exit);
  const streams = childStreamState(stdoutSeen, stderrSeen);
  if (overflow) {
    return childCapture(processState, exit, streams, true, null, "OUTPUT_OVERFLOW");
  }
  if (exit.signal !== null) {
    return childCapture(processState, exit, streams, false, null, "SIGNAL_TERMINATION");
  }
  if (exit.code === null) {
    return childCapture(processState, exit, streams, false, null, "CLOSE_STATE_UNAVAILABLE");
  }
  const selected = exit.code === 0 ? stdout : stderr;
  const other = exit.code === 0 ? stderr : stdout;
  const terminal = exactOneJsonLine(selected, other);
  return terminal.terminal
    ? childCapture(
      processState,
      exit,
      streams,
      false,
      Object.freeze({ ...terminal.terminal, exitCode: exit.code }),
      "TRUSTED",
    )
    : childCapture(processState, exit, streams, false, null, terminal.validation);
}

function childCapture(
  processState: ChildProcessState,
  exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>,
  streamState: ChildStreamState,
  outputOverflow: boolean,
  result: ChildResult | null,
  validation: ChildValidationState,
): ChildCapture {
  return Object.freeze({
    processState,
    exitCode: exit.code,
    signal: exit.signal,
    streamState,
    outputOverflow,
    result,
    validation,
  });
}

function childProcessState(
  exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>,
): ChildProcessState {
  if (exit.signal !== null) return "SIGNAL_TERMINATION";
  return exit.code === null ? "CLOSE_STATE_UNAVAILABLE" : "NORMAL_EXIT";
}

function childStreamState(stdoutSeen: boolean, stderrSeen: boolean): ChildStreamState {
  if (stdoutSeen && stderrSeen) return "BOTH";
  if (stdoutSeen) return "STDOUT_ONLY";
  return stderrSeen ? "STDERR_ONLY" : "EMPTY";
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
): TerminalCapture {
  const transportFailure = terminalTransportFailure(selected, other);
  if (transportFailure) return transportFailure;
  const withoutLf = selected.subarray(0, selected.length - 1);
  if (withoutLf.includes(0x0a) || withoutLf.includes(0x0d)) {
    return Object.freeze({ terminal: null, validation: "LINE_CONTRACT_VIOLATION" });
  }
  const line = selected.toString("utf8");
  try {
    const parsed: unknown = JSON.parse(withoutLf.toString("utf8"));
    return parsed && typeof parsed === "object"
      ? Object.freeze({ terminal: Object.freeze({ line, value: parsed }), validation: "TRUSTED" })
      : Object.freeze({ terminal: null, validation: "NON_OBJECT_JSON" });
  } catch {
    return Object.freeze({ terminal: null, validation: "INVALID_JSON" });
  }
}

function terminalTransportFailure(selected: Buffer, other: Buffer): TerminalCapture | null {
  if (other.length > 0) {
    return Object.freeze({ terminal: null, validation: "STREAM_CONTRACT_VIOLATION" });
  }
  if (selected.length === 0) {
    return Object.freeze({ terminal: null, validation: "MISSING_TERMINAL" });
  }
  return hasExactLineTransport(selected)
    ? null
    : Object.freeze({ terminal: null, validation: "LINE_CONTRACT_VIOLATION" });
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
const CONTACTED_RECONCILIATION_OBSERVED_SUCCESS_KEYS = Object.freeze([
  ...CONTACTED_RECONCILIATION_SUCCESS_KEYS,
  "providerObservation",
].sort());
const CONTACTED_RECONCILIATION_FAILURE_KEYS = Object.freeze([
  "checkoutSessionId",
  "code",
  "durableRelease",
  "ok",
  "providerRetrieveCount",
  "runId",
  "terminalClass",
]);
const CONTACTED_RECONCILIATION_CLEANUP_FAILURE_KEYS = Object.freeze([
  ...CONTACTED_RECONCILIATION_FAILURE_KEYS,
  "cleanupFailure",
].sort());
const CONTACTED_RECONCILIATION_OBSERVED_CLEANUP_FAILURE_KEYS = Object.freeze([
  ...CONTACTED_RECONCILIATION_CLEANUP_FAILURE_KEYS,
  "providerObservation",
].sort());
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

type ChildValidationFailureState = Exclude<ChildValidationState, "TRUSTED">;
type ContactedTerminalValidation =
  | Readonly<{
      state: "TRUSTED";
      providerRetrieveCount: 0 | 1;
      providerObservation: EximbayContactedProviderObservation | null;
    }>
  | Readonly<{ state: ChildValidationFailureState }>;

function validateContactedReconciliationTerminal(
  terminal: ChildResult,
): ContactedTerminalValidation {
  const value = terminal.value;
  if (!isPlainRecord(value)) return validationFailure("INVALID_RECORD");
  if (!hasFixedContactedReconciliationIdentity(value)) {
    return validationFailure("FIXED_IDENTITY_MISMATCH");
  }
  const providerRetrieveCount = value.providerRetrieveCount;
  if (!isProviderRetrieveCount(providerRetrieveCount)) {
    return validationFailure("INVALID_PROVIDER_RETRIEVE_COUNT");
  }
  if (value.ok === true) {
    const state = validateContactedReconciliationSuccess(value, terminal.exitCode);
    return state === "TRUSTED"
      ? Object.freeze({
        state,
        providerRetrieveCount,
        providerObservation: contactedProviderObservation(value),
      })
      : validationFailure(state);
  }
  if (value.ok !== false) return validationFailure("INVALID_OK");
  const state = validateContactedReconciliationFailure(value, terminal.exitCode);
  return state === "TRUSTED"
    ? Object.freeze({
      state,
      providerRetrieveCount,
      providerObservation: contactedProviderObservation(value),
    })
    : validationFailure(state);
}

function validationFailure(state: ChildValidationFailureState): ContactedTerminalValidation {
  return Object.freeze({ state });
}

function isProviderRetrieveCount(value: unknown): value is 0 | 1 {
  return Object.is(value, 0) || value === 1;
}

function validateContactedReconciliationSuccess(
  value: Record<string, unknown>,
  exitCode: number,
): ChildValidationState {
  if (!isContactedReconciliationDisposition(value.disposition)) {
    return "SUCCESS_DISPOSITION_INVALID";
  }
  const hasObservation = Object.hasOwn(value, "providerObservation");
  const observation = contactedProviderObservation(value);
  const expectedKeys = contactedSuccessExpectedKeys(value.disposition);
  if (!hasExactKeys(value, expectedKeys)) {
    return "SUCCESS_KEY_SET_MISMATCH";
  }
  if (!validSuccessObservationShape(
    value.disposition,
    hasObservation,
    observation,
    value.providerRetrieveCount,
  )) {
    return "INVALID_PROVIDER_OBSERVATION";
  }
  if (exitCode !== 0) return "SUCCESS_EXIT_CODE_MISMATCH";
  if (value.code !== "CONTACTED_RECONCILIATION_COMPLETE") return "SUCCESS_CODE_MISMATCH";
  if (value.terminalClass !== "RECONCILIATION_COMPLETED") {
    return "SUCCESS_TERMINAL_CLASS_MISMATCH";
  }
  return value.durableRelease === durableReleaseForDisposition(value.disposition)
    ? "TRUSTED"
    : "SUCCESS_DURABLE_RELEASE_MISMATCH";
}

function contactedSuccessExpectedKeys(
  disposition: EximbayContactedReconciliationDisposition,
): readonly string[] {
  return disposition === "TRANSACTION_OBSERVED"
    ? CONTACTED_RECONCILIATION_OBSERVED_SUCCESS_KEYS
    : CONTACTED_RECONCILIATION_SUCCESS_KEYS;
}

function validSuccessObservationShape(
  disposition: EximbayContactedReconciliationDisposition,
  hasObservation: boolean,
  observation: EximbayContactedProviderObservation | null,
  providerRetrieveCount: unknown,
): boolean {
  if (disposition !== "TRANSACTION_OBSERVED") return !hasObservation;
  return observation !== null && providerRetrieveCount === 1;
}

function validateContactedReconciliationFailure(
  value: Record<string, unknown>,
  exitCode: number,
): ChildValidationState {
  if (!isContactedReconciliationFailureCode(value.code)) return "FAILURE_CODE_INVALID";
  const hasObservation = Object.hasOwn(value, "providerObservation");
  const observation = contactedProviderObservation(value);
  const cleanupFailed = value.cleanupFailure === "DATABASE_DISCONNECT_FAILED";
  const expectedKeys = contactedFailureExpectedKeys(cleanupFailed, hasObservation);
  if (!hasExactKeys(value, expectedKeys)) {
    return "FAILURE_KEY_SET_MISMATCH";
  }
  if (!validFailureObservationShape(
    hasObservation,
    observation,
    cleanupFailed,
    value.providerRetrieveCount,
  )) return "INVALID_PROVIDER_OBSERVATION";
  if (!cleanupFailureCodeMatches(cleanupFailed, value.code)) return "FAILURE_CODE_INVALID";
  if (value.terminalClass !== "HOST_FAILURE") return "FAILURE_TERMINAL_CLASS_MISMATCH";
  if (value.durableRelease !== "NOT_REPORTED") return "FAILURE_DURABLE_RELEASE_MISMATCH";
  return exitCode === contactedReconciliationFailureExitCode(value.code)
    ? "TRUSTED"
    : "FAILURE_EXIT_CODE_MISMATCH";
}

function cleanupFailureCodeMatches(cleanupFailed: boolean, code: unknown): boolean {
  return !cleanupFailed || code === "INTERNAL_FAILURE";
}

function contactedFailureExpectedKeys(
  cleanupFailed: boolean,
  hasObservation: boolean,
): readonly string[] {
  if (!cleanupFailed) return CONTACTED_RECONCILIATION_FAILURE_KEYS;
  return hasObservation
    ? CONTACTED_RECONCILIATION_OBSERVED_CLEANUP_FAILURE_KEYS
    : CONTACTED_RECONCILIATION_CLEANUP_FAILURE_KEYS;
}

function validFailureObservationShape(
  hasObservation: boolean,
  observation: EximbayContactedProviderObservation | null,
  cleanupFailed: boolean,
  providerRetrieveCount: unknown,
): boolean {
  if (!hasObservation) return observation === null;
  return observation !== null && cleanupFailed && providerRetrieveCount === 1;
}

function contactedProviderObservation(
  value: Record<string, unknown>,
): EximbayContactedProviderObservation | null {
  return isValidContactedProviderObservation(value.providerObservation)
    ? value.providerObservation
    : null;
}

function isValidContactedProviderObservation(
  value: unknown,
): value is EximbayContactedProviderObservation {
  if (!isPlainRecord(value)
    || !hasExactKeys(value, ["application", "providerResult", "schema", "version"])
    || value.schema !== "eximbay.contacted-reconciliation.provider-observation"
    || value.version !== 1
    || !isValidContactedObservationApplication(value.application)) return false;
  return isValidContactedProviderResult(value.providerResult, value.application);
}

function isValidContactedObservationApplication(
  value: unknown,
): value is EximbayContactedProviderObservation["application"] {
  if (!isPlainRecord(value)) return false;
  if (!hasExactKeys(value, [
    "checkoutSessionId",
    "expectedAmountMinor",
    "expectedCurrency",
    "operationRunId",
    "paymentId",
    "providerOrderId",
  ])) return false;
  return [
    value.operationRunId === EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    value.checkoutSessionId === EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    isBoundedTerminalText(value.paymentId, 512),
    isBoundedTerminalText(value.providerOrderId, 512),
    isNonnegativeSafeInteger(value.expectedAmountMinor),
    isSupportedExpectedCurrency(value.expectedCurrency),
  ].every(Boolean);
}

function isValidContactedProviderResult(
  value: unknown,
  application: EximbayContactedProviderObservation["application"],
): value is EximbayContactedProviderObservation["providerResult"] {
  if (!isPlainRecord(value)) return false;
  if (![hasExactKeys(value, ["admission", "binding", "mode", "provider", "resultCode"]),
    value.mode === "SANDBOX",
    isBoundedTerminalText(value.resultCode, 64),
    isPlainRecord(value.binding),
  ].every(Boolean)) return false;
  if (!isPlainRecord(value.binding)
    || !hasExactKeys(value.binding, ["merchant", "money", "providerOrder"])) return false;
  if (value.admission === "TRANSACTION_DETAIL_ADMITTED") {
    return value.resultCode === "0000"
      && isValidContactedTransactionDetail(value.provider, value.binding, application);
  }
  return isValidContactedHeaderObservation(value);
}

function isValidContactedHeaderObservation(value: Record<string, unknown>): boolean {
  if (!isPlainRecord(value.binding)) return false;
  if (![
    value.provider === null,
    value.binding.merchant === "NOT_ESTABLISHED",
    value.binding.providerOrder === "NOT_ESTABLISHED",
    value.binding.money === "NOT_ESTABLISHED",
  ].every(Boolean)) return false;
  if (value.admission === "INCOMPLETE_TRANSACTION_DETAIL") return value.resultCode === "0000";
  return [
    value.admission === "PROVIDER_NON_SUCCESS",
    value.resultCode !== "0000",
    value.resultCode !== "Q004",
  ].every(Boolean);
}

function isValidContactedTransactionDetail(
  provider: unknown,
  binding: Record<string, unknown>,
  application: EximbayContactedProviderObservation["application"],
): boolean {
  if (!isPlainRecord(provider)) return false;
  if (!hasExactKeys(provider, [
    "amount",
    "currency",
    "orderId",
    "status",
    "transactionDate",
    "transactionId",
  ])) return false;
  if (![
    isObservedBinding(binding.merchant),
    isObservedBinding(binding.providerOrder),
    isObservedBinding(binding.money),
    isBoundedTerminalText(provider.transactionId, 512),
    isBoundedTerminalText(provider.orderId, 512),
    isProviderCurrency(provider.currency),
    isProviderAmount(provider.amount),
    isProviderStatus(provider.status),
    isTransactionDate(provider.transactionDate),
  ].every(Boolean)) return false;
  const orderMatches = provider.orderId === application.providerOrderId;
  const moneyMatches = provider.currency === application.expectedCurrency
    && provider.amount === expectedAmountWire(application);
  return [
    bindingMatches(binding.providerOrder, orderMatches),
    bindingMatches(binding.money, moneyMatches),
  ].every(Boolean);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSupportedExpectedCurrency(value: unknown): value is "USD" | "JPY" {
  return value === "USD" || value === "JPY";
}

function isTransactionDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{14}$/u.test(value);
}

function isObservedBinding(value: unknown): value is "MATCH" | "MISMATCH" {
  return value === "MATCH" || value === "MISMATCH";
}

function bindingMatches(value: unknown, matches: boolean): boolean {
  return value === (matches ? "MATCH" : "MISMATCH");
}

function isProviderCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/u.test(value);
}

function isProviderAmount(value: unknown): value is string {
  return isBoundedTerminalText(value, 64)
    && /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value);
}

function isProviderStatus(value: unknown): value is "SALE" | "AUTH" | "REGISTERED" | "NONE" {
  return value === "SALE" || value === "AUTH" || value === "REGISTERED" || value === "NONE";
}

function expectedAmountWire(
  application: EximbayContactedProviderObservation["application"],
): string {
  if (application.expectedCurrency === "JPY") return String(application.expectedAmountMinor);
  const digits = String(application.expectedAmountMinor).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function isBoundedTerminalText(value: unknown, maxBytes: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value === value.trim()
    && !hasInvalidTerminalCharacter(value)
    && Buffer.byteLength(value, "utf8") <= maxBytes;
}

function hasInvalidTerminalCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isTerminalControlCode(code)) return true;
    if (isHighSurrogateCode(code)) {
      const next = value.charCodeAt(index + 1);
      if (!isLowSurrogateCode(next)) return true;
      index += 1;
    } else if (isLowSurrogateCode(code)) return true;
  }
  return false;
}

function isTerminalControlCode(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function isHighSurrogateCode(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogateCode(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
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

type ContactedSupervisorFailureDiagnostic = Readonly<{
  event: typeof CONTACTED_SUPERVISOR_FAILURE_EVENT;
  childSpawnState: "FAILED" | "SUCCEEDED";
  childProcessState: "NOT_STARTED" | ChildProcessState;
  childExitCode: number | null;
  childSignal: NodeJS.Signals | null;
  childStreamState: ChildStreamState;
  childOutputOverflow: boolean;
  childValidation: ChildValidationState;
  proxyLifecycle: ProxyLifecycleState;
}>;

function contactedSupervisorFailureDiagnostic(
  capture: ChildCapture | null,
  validation: ChildValidationState,
  lifecycle: ProxyLifecycleState,
): ContactedSupervisorFailureDiagnostic {
  if (!capture) {
    return Object.freeze({
      event: CONTACTED_SUPERVISOR_FAILURE_EVENT,
      childSpawnState: "FAILED",
      childProcessState: "NOT_STARTED",
      childExitCode: null,
      childSignal: null,
      childStreamState: "NOT_CAPTURED",
      childOutputOverflow: false,
      childValidation: validation,
      proxyLifecycle: lifecycle,
    });
  }
  return Object.freeze({
    event: CONTACTED_SUPERVISOR_FAILURE_EVENT,
    childSpawnState: "SUCCEEDED",
    childProcessState: capture.processState,
    childExitCode: capture.exitCode,
    childSignal: capture.signal,
    childStreamState: capture.streamState,
    childOutputOverflow: capture.outputOverflow,
    childValidation: validation,
    proxyLifecycle: lifecycle,
  });
}

function proxyLifecycle(
  failedWhileRunning: boolean,
  stopped: boolean,
): ProxyLifecycleState {
  if (failedWhileRunning) return "READY_PREMATURE_EXIT";
  return stopped ? "READY_CLEANUP_CONFIRMED" : "READY_CLEANUP_UNCONFIRMED";
}

function writeContactedSystemicFailure(
  writer: OutputWriter,
  diagnostic: ContactedSupervisorFailureDiagnostic,
  providerRetrieveCount: 0 | 1 | null,
  providerObservation: EximbayContactedProviderObservation | null = null,
): Promise<number> {
  const output = `${JSON.stringify(diagnostic)}\n${systemicFailureLine(
    providerRetrieveCount,
    providerObservation,
  )}`;
  return writeStatic(writer, output, 1);
}

function contactedReconciliationSystemicFailureLine(
  providerRetrieveCount: 0 | 1,
  providerObservation: EximbayContactedProviderObservation | null,
): string {
  const result = providerObservation
    ? Object.freeze({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      providerRetrieveCount,
      providerObservation,
    })
    : Object.freeze({ ok: false, code: "SYSTEMIC_FAILURE", providerRetrieveCount });
  return `${JSON.stringify(result)}\n`;
}

function systemicFailureLine(
  providerRetrieveCount: 0 | 1 | null,
  providerObservation: EximbayContactedProviderObservation | null = null,
): string {
  return providerRetrieveCount === null
    ? SYSTEMIC_FAILURE_LINE
    : contactedReconciliationSystemicFailureLine(providerRetrieveCount, providerObservation);
}

function hasExactLineTransport(selected: Buffer): boolean {
  return selected.length >= 3
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
