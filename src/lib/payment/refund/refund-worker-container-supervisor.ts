import { isRetrieveDiagnosticResult, type RetrieveDiagnosticResult } from "./retrieve-diagnostic-result";
import { diagnosticPaymentId } from "./run-eximbay-retrieve-shape-diagnostic-once";
import { diagnosticFields, isEximbayPreflightDiagnostic } from "./providers/eximbay/preflight-diagnostic";
import { CONTACTED_EVIDENCE_COMMAND_ID } from "./providers/eximbay/contacted-evidence-state";
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
import { hasEximbayRefundCanaryEffectConfiguration, parseEximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment";
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
import type {
  EximbayRefundReentryCleanupFailure,
  EximbayRefundReentryResult,
  EximbayRefundReentryResultCode,
} from "./run-eximbay-refund-reentry-once";
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
const EXIMBAY_CONTACTED_REFUND_EVIDENCE_BUNDLE = fileURLToPath(
  new URL("./eximbay-contacted-refund-evidence.mjs", import.meta.url),
);
const EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE = fileURLToPath(
  new URL("./eximbay-contacted-reconciliation.mjs", import.meta.url),
);
const EXIMBAY_REFUND_REENTRY_BUNDLE = fileURLToPath(
  new URL("./eximbay-refund-reentry.mjs", import.meta.url),
);
const RETRIEVE_DIAGNOSTIC_BUNDLE = fileURLToPath(new URL("./eximbay-retrieve-shape-diagnostic.mjs", import.meta.url));
const PL09_TARGETED_REFUND_EMAIL_DISPATCH_BUNDLE = fileURLToPath(
  new URL("./pl09-targeted-refund-email-dispatch.mjs", import.meta.url),
);
const PROXY_EXECUTABLE = "/usr/local/bin/cloud-sql-proxy";
const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';
const DATABASE_UNAVAILABLE_LINE = '{"ok":false,"code":"DATABASE_UNAVAILABLE"}\n';
const INVALID_HOST_INPUT_LINE = '{"ok":false,"code":"INVALID_HOST_INPUT"}\n';
const CONFIG_INVALID_LINE = '{"ok":false,"code":"CONFIG_INVALID"}\n';

export const REFUND_WORKER_CONTAINER_COMMANDS = Object.freeze([
  "eximbay-contacted-refund-success-close-once",
  "eximbay-contacted-refund-evidence-once",
  "eximbay-retrieve-shape-diagnostic-once",
  "worker-check",
  "worker-health",
  "worker-once",
  "sandbox-preflight",
  "image-self-check",
  "eximbay-canary-once",
  "eximbay-contacted-reconciliation-once",
  "eximbay-refund-reentry-once",
  "pl09-targeted-refund-email-dispatch",
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
  eximbayContactedRefundEvidenceBundle: string;
  eximbayContactedReconciliationBundle: string;
  eximbayRefundReentryBundle: string;
  pl09TargetedRefundEmailDispatchBundle: string;
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
  eximbayRefundReentryBundlePresent: true;
  pl09TargetedRefundEmailDispatchBundlePresent: true;
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
  eximbayContactedRefundEvidenceBundle: EXIMBAY_CONTACTED_REFUND_EVIDENCE_BUNDLE,
  eximbayContactedReconciliationBundle: EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE,
  eximbayRefundReentryBundle: EXIMBAY_REFUND_REENTRY_BUNDLE,
  pl09TargetedRefundEmailDispatchBundle:
    PL09_TARGETED_REFUND_EMAIL_DISPATCH_BUNDLE,
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
  if (["eximbay-contacted-refund-evidence-once", "eximbay-contacted-refund-success-close-once"].includes(command)) {
    return runEximbayContactedRefundEvidenceOnce(env, output, dependencies,
      command === "eximbay-contacted-refund-success-close-once");
  }
  if (command === "eximbay-retrieve-shape-diagnostic-once") {
    return runRetrieveDiagnostic(env, output, dependencies);
  }
  if (command === "image-self-check") return runImageSelfCheck(output, dependencies);
  if (command === "eximbay-canary-once") return runEximbayCanaryOnce(env, output, dependencies);
  if (command === "eximbay-contacted-reconciliation-once") {
    return runEximbayContactedReconciliationOnce(env, output, dependencies);
  }
  const specialized = specializedDirectCommand(command, env, output, dependencies);
  if (specialized) return specialized;
  return command === "worker-once" ? runWorkerOnce(env, output, dependencies) : null;
}

function specializedDirectCommand(
  command: RefundWorkerContainerCommand,
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> | null {
  if (command === "eximbay-refund-reentry-once") {
    return runEximbayRefundReentryOnce(env, output, dependencies);
  }
  return command === "pl09-targeted-refund-email-dispatch"
    ? runPl09TargetedRefundEmailDispatch(env, output, dependencies)
    : null;
}

async function runPl09TargetedRefundEmailDispatch(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  return runWithProxy(binding, Object.freeze({
    executable: process.execPath,
    args: Object.freeze([dependencies.pl09TargetedRefundEmailDispatchBundle]),
  }), env, output, dependencies);
}

async function runEximbayContactedRefundEvidenceOnce(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
  closeSuccess: boolean,
): Promise<number> {
  const binding = validateDatabaseBinding(env);
  if (!binding) return writeStatic(output.stderr, CONFIG_INVALID_LINE, 78);
  return runWithProxy(binding, Object.freeze({
    executable: process.execPath,
    args: Object.freeze([
      closeSuccess
        ? fileURLToPath(new URL("./eximbay-contacted-refund-success-close.mjs", import.meta.url))
        : dependencies.eximbayContactedRefundEvidenceBundle,
      CONTACTED_EVIDENCE_COMMAND_ID,
    ]),
    resultSchema: closeSuccess ? "EXIMBAY_CONTACTED_REFUND_SUCCESS_CLOSE" : "EXIMBAY_CONTACTED_REFUND_EVIDENCE",
  }), env, output, dependencies);
}

async function runRetrieveDiagnostic(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  const binding = validateDatabaseBinding(env);
  if (!binding || !diagnosticPaymentId(env) || !parseEximbayRefundCanaryEnvironment(env)) {
    return writeRetrieveDiagnosticSupervisor(output, null, "NOT_STARTED", "NOT_ATTEMPTED");
  }
  return runWithProxy(binding, {
    executable: process.execPath, args: [RETRIEVE_DIAGNOSTIC_BUNDLE],
    resultSchema: "EXIMBAY_RETRIEVE_DIAGNOSTIC",
  }, env, output, dependencies);
}

async function runEximbayRefundReentryOnce(
  env: RuntimeEnvironment,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  dependencies: RefundWorkerContainerSupervisorDependencies,
): Promise<number> {
  if (!hasEximbayRefundCanaryEffectConfiguration(env)) {
    return writeReentrySupervisorTerminal(output, null, "NOT_ATTEMPTED", "NOT_STARTED");
  }
  const binding = validateDatabaseBinding(env);
  if (!binding) {
    return writeReentrySupervisorTerminal(output, null, "NOT_ATTEMPTED", "NOT_STARTED");
  }
  return runWithProxy(binding, Object.freeze({
    executable: process.execPath,
    args: Object.freeze([dependencies.eximbayRefundReentryBundle]),
    resultSchema: "EXIMBAY_REFUND_REENTRY",
  }), env, output, dependencies);
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
  resultSchema?: "EXIMBAY_CONTACTED_REFUND_SUCCESS_CLOSE" | "EXIMBAY_CONTACTED_REFUND_EVIDENCE" | "EXIMBAY_CONTACTED_RECONCILIATION"
    | "EXIMBAY_REFUND_REENTRY" | "EXIMBAY_RETRIEVE_DIAGNOSTIC";
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
    return proxyStartFailure(childSpecification, output);
  }
  const proxyExit = observeExit(proxy);
  const ready = await waitForProxyReadiness(proxyExit, dependencies);
  if (!ready) {
    await stopChild(proxy, proxyExit, dependencies);
    return proxyReadinessFailure(childSpecification, output);
  }
  const worker = spawnChild(childSpecification, env, dependencies);
  if (!worker) {
    const proxyFailedWhileRunning = proxy.exitCode !== null || proxy.signalCode !== null;
    const proxyStopped = await stopChild(proxy, proxyExit, dependencies);
    return failedChildSpawnResult(
      childSpecification,
      proxyLifecycle(proxyFailedWhileRunning, proxyStopped),
      output,
    );
  }
  const signal = forwardTerminationSignals(worker);
  const workerCapture = await captureChildResult(worker, childSpecification.resultSchema);
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

function proxyStartFailure(
  specification: ChildSpecification,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  if (specification.resultSchema === "EXIMBAY_RETRIEVE_DIAGNOSTIC") {
    return writeRetrieveDiagnosticSupervisor(output, null, "PROXY_START_FAILED", "NOT_ATTEMPTED");
  }
  return specification.resultSchema === "EXIMBAY_REFUND_REENTRY"
    ? writeReentrySupervisorTerminal(output, null, "NOT_ATTEMPTED", "PROXY_START_FAILED")
    : writeStatic(output.stderr, DATABASE_UNAVAILABLE_LINE, 1);
}

function proxyReadinessFailure(
  specification: ChildSpecification,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  if (specification.resultSchema === "EXIMBAY_RETRIEVE_DIAGNOSTIC") {
    return writeRetrieveDiagnosticSupervisor(output, null, "PROXY_READINESS_FAILED", "NOT_ATTEMPTED");
  }
  return specification.resultSchema === "EXIMBAY_REFUND_REENTRY"
    ? writeReentrySupervisorTerminal(output, null, "NOT_ATTEMPTED", "PROXY_READINESS_FAILED")
    : writeStatic(output.stderr, DATABASE_UNAVAILABLE_LINE, 1);
}

function failedChildSpawnResult(
  specification: ChildSpecification,
  lifecycle: ProxyLifecycleState,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  if (specification.resultSchema === "EXIMBAY_RETRIEVE_DIAGNOSTIC") {
    return writeRetrieveDiagnosticSupervisor(output, null, lifecycle, "NOT_ATTEMPTED");
  }
  if (specification.resultSchema === "EXIMBAY_CONTACTED_RECONCILIATION") {
    return writeContactedSystemicFailure(
      output.stderr,
      contactedSupervisorFailureDiagnostic(null, "NOT_ATTEMPTED", lifecycle),
      null,
    );
  }
  if (specification.resultSchema === "EXIMBAY_REFUND_REENTRY") {
    return writeReentrySupervisorTerminal(
      output, null, "NOT_ATTEMPTED", lifecycle, "FAILED",
    );
  }
  return writeStatic(output.stderr, SYSTEMIC_FAILURE_LINE, 1);
}

async function finalizeProxiedChildResult(
  childSpecification: ChildSpecification,
  workerCapture: ChildCapture,
  proxyFailedWhileRunning: boolean,
  proxyStopped: boolean,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  if (childSpecification.resultSchema === "EXIMBAY_RETRIEVE_DIAGNOSTIC") {
    return finalizeRetrieveDiagnostic(workerCapture, proxyFailedWhileRunning, proxyStopped, output);
  }
  const assessment = trustedChildEvidence(childSpecification, workerCapture);
  const lifecycle = proxyLifecycle(proxyFailedWhileRunning, proxyStopped);
  if (childSpecification.resultSchema === "EXIMBAY_REFUND_REENTRY") {
    return writeReentrySupervisorTerminal(
      output,
      workerCapture,
      assessment.validation,
      lifecycle,
      "SUCCEEDED",
      assessment.evidence?.reentryResult ?? null,
    );
  }
  return finalizeLegacyProxiedChildResult(
    childSpecification,
    workerCapture,
    assessment,
    lifecycle,
    proxyFailedWhileRunning,
    proxyStopped,
    output,
  );
}

function finalizeRetrieveDiagnostic(
  capture: ChildCapture,
  proxyFailed: boolean,
  proxyStopped: boolean,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
  const result = capture.result;
  const value = validatedRetrieveDiagnostic(result);
  return writeRetrieveDiagnosticSupervisor(output, value, proxyLifecycle(proxyFailed, proxyStopped),
    value ? "TRUSTED" : "INVALID_DIAGNOSTIC_OUTPUT");
}

function writeRetrieveDiagnosticSupervisor(
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  childResult: RetrieveDiagnosticResult | null,
  lifecycle: ProxyLifecycleState,
  childValidation: "TRUSTED" | "INVALID_DIAGNOSTIC_OUTPUT" | "NOT_ATTEMPTED",
): Promise<number> {
  const ok = childResult?.ok === true && lifecycle === "READY_CLEANUP_CONFIRMED";
  const terminal = { schema: "mira-eximbay-retrieve-shape-diagnostic-supervisor/v1", ok,
    terminalClass: "READ_ONLY_DIAGNOSTIC", childResult, childValidation, proxyLifecycle: lifecycle };
  return writeStatic(output.stdout, `${JSON.stringify(terminal)}\n`, ok ? 0 : 1);
}

function validatedRetrieveDiagnostic(result: ChildResult | null) {
  if (!result || !isRetrieveDiagnosticResult(result.value)) return null;
  if (result.line !== `${JSON.stringify(result.value)}\n`) return null;
  return result.exitCode === (result.value.ok ? 0 : 1) ? result.value : null;
}

async function finalizeLegacyProxiedChildResult(
  childSpecification: ChildSpecification,
  workerCapture: ChildCapture,
  assessment: ReturnType<typeof trustedChildEvidence>,
  lifecycle: ProxyLifecycleState,
  proxyFailedWhileRunning: boolean,
  proxyStopped: boolean,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
): Promise<number> {
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
  if (childSpecification.resultSchema === "EXIMBAY_CONTACTED_REFUND_EVIDENCE"
    || childSpecification.resultSchema === "EXIMBAY_CONTACTED_REFUND_SUCCESS_CLOSE") {
    return writeStatic(
      output.stdout,
      assessment.evidence.result.line,
      assessment.evidence.result.exitCode,
    );
  }
  return relayChildResult(assessment.evidence.result, output);
}

type TrustedChildEvidence = Readonly<{
  result: ChildResult;
  providerRetrieveCount: 0 | 1 | null;
  providerObservation: EximbayContactedProviderObservation | null;
  reentryResult: EximbayRefundReentryResult | null;
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
  if (isContactedRefundSchema(specification.resultSchema)) {
    const validation = validateContactedRefundTerminal(specification.resultSchema, result);
    return validation === "TRUSTED"
      ? Object.freeze({
        evidence: Object.freeze({
          result,
          providerRetrieveCount: null,
          providerObservation: null,
          reentryResult: null,
        }),
        validation,
      })
      : Object.freeze({ evidence: null, validation });
  }
  if (specification.resultSchema === "EXIMBAY_REFUND_REENTRY") {
    const validation = validateEximbayRefundReentryTerminal(result);
    return validation.state === "TRUSTED"
      ? Object.freeze({
        evidence: Object.freeze({
          result,
          providerRetrieveCount: null,
          providerObservation: null,
          reentryResult: validation.result,
        }),
        validation: validation.state,
      })
      : Object.freeze({ evidence: null, validation: validation.state });
  }
  if (specification.resultSchema !== "EXIMBAY_CONTACTED_RECONCILIATION") {
    return Object.freeze({
      evidence: Object.freeze({
        result,
        providerRetrieveCount: null,
        providerObservation: null,
        reentryResult: null,
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
        reentryResult: null,
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
    const capture = await captureChildResult(child, childSpecification.resultSchema);
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
  | "NOT_STARTED"
  | "PROXY_START_FAILED"
  | "PROXY_READINESS_FAILED"
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
  | "INVALID_UTF8"
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
  | "FAILURE_EXIT_CODE_MISMATCH"
  | "REENTRY_KEY_SET_MISMATCH"
  | "REENTRY_SCHEMA_MISMATCH"
  | "REENTRY_CODE_INVALID"
  | "REENTRY_COUNTER_INVALID"
  | "REENTRY_CLEANUP_INVALID"
  | "REENTRY_SEMANTICS_INVALID"
  | "REENTRY_EXIT_CODE_MISMATCH"
  | "EVIDENCE_KEY_SET_MISMATCH"
  | "EVIDENCE_SCHEMA_MISMATCH"
  | "EVIDENCE_SEMANTICS_INVALID"
  | "EVIDENCE_EXIT_CODE_MISMATCH";
type ChildCapture = Readonly<{
  processState: ChildProcessState;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  streamState: ChildStreamState;
  outputOverflow: boolean;
  framing: ChildFramingMetadata;
  result: ChildResult | null;
  validation: ChildValidationState;
}>;
type ChildTerminalUtf8State = "NOT_ATTEMPTED" | "VALID" | "INVALID";
type ChildFramingMetadata = Readonly<{
  stdoutBytes: number;
  stderrBytes: number;
  stdoutLfCount: number;
  stdoutCrCount: number;
  terminalCandidateCount: number;
  terminalUtf8: ChildTerminalUtf8State;
}>;
type TerminalCapture = Readonly<{
  terminal: Readonly<{ line: string; value: unknown }> | null;
  validation: ChildValidationState;
}>;

async function captureChildResult(
  child: SpawnedChild,
  resultSchema?: ChildSpecification["resultSchema"],
): Promise<ChildCapture> {
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stdoutOverflow = false;
  let stderrOverflow = false;
  let stdoutSeen = false;
  let stderrSeen = false;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutLfCount = 0;
  let stdoutCrCount = 0;
  const appendStdout = (chunk: Buffer | string) => {
    stdoutSeen = true;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stdoutBytes = boundedObservedCount(stdoutBytes, bytes.length);
    stdoutLfCount = boundedObservedCount(stdoutLfCount, countByte(bytes, 0x0a));
    stdoutCrCount = boundedObservedCount(stdoutCrCount, countByte(bytes, 0x0d));
    stdout = boundedAppend(stdout, bytes, () => {
      stdoutOverflow = true;
    });
  };
  const appendStderr = (chunk: Buffer | string) => {
    stderrSeen = true;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stderrBytes = boundedObservedCount(stderrBytes, bytes.length);
    stderr = boundedAppend(stderr, bytes, () => {
      stderrOverflow = true;
    });
  };
  child.stdout.on("data", appendStdout);
  child.stderr.on("data", appendStderr);
  const exit = await observeExit(child);
  child.stdout.removeListener("data", appendStdout);
  child.stderr.removeListener("data", appendStderr);
  const processState = childProcessState(exit);
  const streams = childStreamState(stdoutSeen, stderrSeen);
  const overflow = stdoutOverflow || stderrOverflow;
  const framing = childFramingMetadata({
    stdoutBytes,
    stderrBytes,
    stdoutLfCount,
    stdoutCrCount,
    stdout,
    stdoutOverflow,
  });
  if (overflow) {
    return childCapture(processState, exit, streams, true, framing, null, "OUTPUT_OVERFLOW");
  }
  if (exit.signal !== null) {
    return childCapture(processState, exit, streams, false, framing, null, "SIGNAL_TERMINATION");
  }
  if (exit.code === null) {
    return childCapture(
      processState, exit, streams, false, framing, null, "CLOSE_STATE_UNAVAILABLE",
    );
  }
  return captureCompletedChildResult({
    processState,
    exitCode: exit.code,
    streams,
    framing,
    stdout,
    stderr,
    resultSchema,
  });
}

function captureCompletedChildResult(input: Readonly<{
  processState: ChildProcessState;
  exitCode: number;
  streams: ChildStreamState;
  framing: ChildFramingMetadata;
  stdout: Buffer;
  stderr: Buffer;
  resultSchema?: ChildSpecification["resultSchema"];
}>): ChildCapture {
  const exit = Object.freeze({ code: input.exitCode, signal: null });
  const reentry = input.resultSchema === "EXIMBAY_REFUND_REENTRY";
  const diagnostic = input.resultSchema === "EXIMBAY_RETRIEVE_DIAGNOSTIC";
  const contactedEvidence = isContactedRefundSchema(input.resultSchema);
  const useStdout = [
    reentry,
    diagnostic,
    contactedEvidence && (input.exitCode === 0 || input.exitCode === 1),
    input.exitCode === 0,
  ].some(Boolean);
  const selected = useStdout ? input.stdout : input.stderr;
  const other = otherChildStream(input, reentry || contactedEvidence, useStdout);
  const terminal = exactOneJsonLine(selected, other, reentry || diagnostic || contactedEvidence);
  return terminal.terminal
    ? childCapture(
      input.processState,
      exit,
      input.streams,
      false,
      input.framing,
      Object.freeze({ ...terminal.terminal, exitCode: input.exitCode }),
      "TRUSTED",
    )
    : childCapture(
      input.processState, exit, input.streams, false, input.framing, null, terminal.validation,
    );
}

function otherChildStream(input: Readonly<{ stdout: Buffer; stderr: Buffer }>, reentry: boolean, useStdout: boolean): Buffer {
  if (reentry) return Buffer.alloc(0);
  return useStdout ? input.stderr : input.stdout;
}

function childCapture(
  processState: ChildProcessState,
  exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>,
  streamState: ChildStreamState,
  outputOverflow: boolean,
  framing: ChildFramingMetadata,
  result: ChildResult | null,
  validation: ChildValidationState,
): ChildCapture {
  return Object.freeze({
    processState,
    exitCode: exit.code,
    signal: exit.signal,
    streamState,
    outputOverflow,
    framing,
    result,
    validation,
  });
}

function childFramingMetadata(input: Readonly<{
  stdoutBytes: number;
  stderrBytes: number;
  stdoutLfCount: number;
  stdoutCrCount: number;
  stdout: Buffer;
  stdoutOverflow: boolean;
}>): ChildFramingMetadata {
  return Object.freeze({
    stdoutBytes: input.stdoutBytes,
    stderrBytes: input.stderrBytes,
    stdoutLfCount: input.stdoutLfCount,
    stdoutCrCount: input.stdoutCrCount,
    terminalCandidateCount: input.stdoutLfCount,
    terminalUtf8: input.stdoutOverflow
      ? "NOT_ATTEMPTED"
      : fatalUtf8State(input.stdout),
  });
}

function boundedObservedCount(current: number, increment: number): number {
  return Math.min(CHILD_OUTPUT_LIMIT_BYTES + 1, current + increment);
}

function countByte(bytes: Buffer, expected: number): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === expected) count += 1;
  }
  return count;
}

function fatalUtf8State(bytes: Buffer): ChildTerminalUtf8State {
  if (bytes.length === 0) return "NOT_ATTEMPTED";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "VALID";
  } catch {
    return "INVALID";
  }
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
  fatalUtf8 = false,
): TerminalCapture {
  const transportFailure = terminalTransportFailure(selected, other);
  if (transportFailure) return transportFailure;
  const withoutLf = selected.subarray(0, selected.length - 1);
  if (withoutLf.includes(0x0a) || withoutLf.includes(0x0d)) {
    return Object.freeze({ terminal: null, validation: "LINE_CONTRACT_VIOLATION" });
  }
  const decoded = decodeTerminalLine(selected, withoutLf, fatalUtf8);
  if (!decoded) {
    return Object.freeze({ terminal: null, validation: "INVALID_UTF8" });
  }
  return parseTerminalJson(decoded);
}

function parseTerminalJson(
  decoded: Readonly<{ line: string; json: string }>,
): TerminalCapture {
  try {
    const parsed: unknown = JSON.parse(decoded.json);
    return parsed && typeof parsed === "object"
      ? Object.freeze({
        terminal: Object.freeze({ line: decoded.line, value: parsed }),
        validation: "TRUSTED",
      })
      : Object.freeze({ terminal: null, validation: "NON_OBJECT_JSON" });
  } catch {
    return Object.freeze({ terminal: null, validation: "INVALID_JSON" });
  }
}

function decodeTerminalLine(
  selected: Buffer,
  withoutLf: Buffer,
  fatalUtf8: boolean,
): Readonly<{ line: string; json: string }> | null {
  try {
    return Object.freeze({
      line: new TextDecoder("utf-8", { fatal: fatalUtf8 }).decode(selected),
      json: new TextDecoder("utf-8", { fatal: fatalUtf8 }).decode(withoutLf),
    });
  } catch {
    return null;
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

const EXIMBAY_REFUND_REENTRY_KEYS = Object.freeze([
  "cancellationCount",
  "cleanupFailures",
  "code",
  "ok",
  "preflightRetrieveCount",
  "reconciliationLookupCount",
  "reentry",
  "schema",
  "terminalClass",
]);

const CONTACTED_REFUND_EVIDENCE_KEYS = Object.freeze([
  "currencyMatch",
  "databaseDisconnected",
  "diagnosticCode",
  "firstFailure",
  "httpStatus",
  "inquiryCount",
  "jsonValid",
  "originalTransactionBindingMatch",
  "parserResult",
  "providerResponseSuccess",
  "providerStatusClass",
  "refundAmountMatch",
  "refundDatePresent",
  "refundIdMatch",
  "refundTransactionIdPresent",
  "schema",
  "shapeDiagnostic",
  "terminalClass",
]);
const CONTACTED_REFUND_PARSER_RESULTS = new Set<string>([
  "MATCHED_REFUND_TRANSACTION",
  "NO_MATCHING_REFUND_TRANSACTION",
  "PROVIDER_DEFINITIVE_ERROR",
  "UNKNOWN_SHAPE",
  "IDENTITY_MISMATCH",
  "MONEY_MISMATCH",
  "UNESTABLISHED",
]);
const CONTACTED_REFUND_FIRST_FAILURES = new Set<string>([
  "TARGET_MISMATCH",
  "CONFIG_INVALID",
  "INTERNAL_FAILURE",
  "DATABASE_DISCONNECT_FAILED",
  "DATABASE_READ_FAILED",
  "TARGET_UNAVAILABLE",
  "CREDENTIAL_UNAVAILABLE",
  "TRANSPORT_FAILURE",
  "NON_2XX",
  "INVALID_CONTENT_TYPE",
  "BODY_TOO_LARGE",
  "TOO_MANY_RESPONSE_CHUNKS",
  "INVALID_RESPONSE_CHUNK",
  "INVALID_UTF8",
  "INVALID_JSON",
  "DUPLICATE_JSON_KEY",
  "ROOT_NOT_OBJECT",
  "ROOT_UNKNOWN_KEY",
  "RESCODE_INVALID",
  "RESMSG_INVALID",
  "CARD_INFO_INVALID",
  "OTHER_PARAM_INVALID",
  "MID_MISSING_OR_INVALID",
  "PAYMENT_NOT_OBJECT",
  "PAYMENT_UNKNOWN_KEY",
  "PAYMENT_REQUIRED_FIELD_MISSING",
  "PAYMENT_FIELD_INVALID",
  "TRANSACTION_DATE_INVALID",
  "PROVIDER_NON_SUCCESS",
  "ORIGINAL_TRANSACTION_BINDING",
  "ORIGINAL_MONEY",
  "UNSUPPORTED_STATUS",
  "REFUND_ID",
  "REFUND_TRANSACTION_ID_MISSING",
  "REFUND_AMOUNT",
  "REFUND_TYPE_MISMATCH",
  "BALANCE_MISMATCH",
  "CONTRADICTORY_NONE",
]);

function isContactedRefundSchema(schema: ChildSpecification["resultSchema"]): boolean {
  return schema === "EXIMBAY_CONTACTED_REFUND_EVIDENCE" || schema === "EXIMBAY_CONTACTED_REFUND_SUCCESS_CLOSE";
}

function validateContactedRefundTerminal(
  schema: ChildSpecification["resultSchema"], terminal: ChildResult,
): ChildValidationState {
  return schema === "EXIMBAY_CONTACTED_REFUND_SUCCESS_CLOSE"
    ? validateContactedClosureTerminal(terminal) : validateContactedRefundEvidenceTerminal(terminal);
}

function validateContactedClosureTerminal(terminal: ChildResult): ChildValidationState {
  const value = terminal.value;
  if (!isPlainRecord(value) || !hasExactKeys(value,
    ["diagnosticCode", "inquiryCount", "outcome", "parserResult", "schema"])) return "EVIDENCE_KEY_SET_MISMATCH";
  if (value.schema !== "mira-eximbay-contacted-refund-success-close/v1"
    || value.diagnosticCode !== "CONTACTED_REFUND_EVIDENCE") return "EVIDENCE_SCHEMA_MISMATCH";
  if (!validContactedClosureValues(value)) return "EVIDENCE_SEMANTICS_INVALID";
  return terminal.exitCode === (value.outcome === "CLOSED" ? 0 : 1)
    ? "TRUSTED" : "EVIDENCE_EXIT_CODE_MISMATCH";
}

function validContactedClosureValues(value: Record<string, unknown>): boolean {
  if (!["CLOSED", "REJECTED", "PERSISTENCE_FAILED"].includes(String(value.outcome))
    || !CONTACTED_REFUND_PARSER_RESULTS.has(String(value.parserResult))) return false;
  if (value.inquiryCount !== 0 && value.inquiryCount !== 1) return false;
  return value.outcome === "REJECTED" || (value.inquiryCount === 1
    && value.parserResult === "MATCHED_REFUND_TRANSACTION");
}

function validateContactedRefundEvidenceTerminal(
  terminal: ChildResult,
): ChildValidationState {
  const value = terminal.value;
  if (!isPlainRecord(value)) return "INVALID_RECORD";
  if (!hasExactKeys(value, CONTACTED_REFUND_EVIDENCE_KEYS)) {
    return "EVIDENCE_KEY_SET_MISMATCH";
  }
  if (!hasContactedRefundEvidenceEnvelope(value)) return "EVIDENCE_SCHEMA_MISMATCH";
  if (!validContactedRefundEvidenceValues(value)) return "EVIDENCE_SEMANTICS_INVALID";
  const expectedExitCode = contactedRefundEvidenceExitCode(value);
  return terminal.exitCode === expectedExitCode ? "TRUSTED" : "EVIDENCE_EXIT_CODE_MISMATCH";
}

function hasContactedRefundEvidenceEnvelope(value: Record<string, unknown>): boolean {
  return value.schema === "mira-eximbay-contacted-refund-evidence/v1"
    && value.diagnosticCode === "CONTACTED_REFUND_EVIDENCE"
    && value.terminalClass === "READ_ONLY_CONTACTED_REFUND_EVIDENCE";
}

function contactedRefundEvidenceExitCode(value: Record<string, unknown>): 0 | 1 {
  return value.databaseDisconnected === true
    && value.parserResult === "MATCHED_REFUND_TRANSACTION" ? 0 : 1;
}

function validContactedRefundEvidenceValues(value: Record<string, unknown>): boolean {
  if (!validContactedRefundEvidenceScalars(value)) return false;
  if (!validContactedRefundFirstFailure(value)) return false;
  if (!validContactedRefundShapeDiagnostic(value)) return false;
  return validContactedRefundInquiryState(value);
}

const CONTACTED_VALUE_CLASSES = new Set<string>([
  "ABSENT", "NOT_STRING", "EMPTY_OR_WHITESPACE_ONLY", "TRIM_MISMATCH",
  "CONTROL_OR_SURROGATE", "OVER_MAX_TEXT_UNITS", "OVER_MAX_UTF8_BYTES",
  "FORMAT_INVALID", "VALID", "NOT_OBJECT",
]);
const CONTACTED_ROOT_FIELDS = Object.freeze([
  "rescode", "resmsg", "mid", "payment", "card_info", "other_param",
]);
const CONTACTED_ROOT_REQUIRED_FIELDS = Object.freeze(["rescode", "resmsg", "mid", "payment"]);
const CONTACTED_PAYMENT_FIELDS = Object.freeze([
  "status", "order_id", "currency", "amount", "transaction_id", "transaction_date",
  "auth_code", "balance", "payment_method", "paypal_payer_id", "refund_id",
  "refund_transaction_id", "refund_amount",
]);
const CONTACTED_PAYMENT_REQUIRED_FIELDS = Object.freeze([
  "status", "order_id", "currency", "amount", "transaction_id", "transaction_date",
]);
const CONTACTED_CARD_FIELDS = Object.freeze(["card_number1", "card_number4", "cardno1", "cardno4"]);
const CONTACTED_OTHER_PARAM_FIELDS = Object.freeze(["param1", "param2"]);

function validContactedRefundShapeDiagnostic(value: Record<string, unknown>): boolean {
  if (value.shapeDiagnostic === null) return value.jsonValid !== true;
  if (value.jsonValid !== true || !isPlainRecord(value.shapeDiagnostic)) return false;
  const shape = value.shapeDiagnostic;
  if (!hasExactKeys(shape, ["cardInfo", "otherParam", "payment", "root"])) return false;
  if (!validContactedRootDiagnostic(shape.root)) return false;
  if (!validContactedPaymentDiagnostic(shape.payment)) return false;
  if (!validContactedOptionalDiagnostic(shape.cardInfo, CONTACTED_CARD_FIELDS)) return false;
  return validContactedOptionalDiagnostic(shape.otherParam, CONTACTED_OTHER_PARAM_FIELDS);
}

function validContactedRootDiagnostic(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.valueClass === "NOT_OBJECT") return hasExactKeys(value, ["valueClass"]);
  return validContactedRecordDiagnostic(
    value, CONTACTED_ROOT_FIELDS, CONTACTED_ROOT_REQUIRED_FIELDS,
  );
}

function validContactedPaymentDiagnostic(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (value.valueClass === "ABSENT" || value.valueClass === "NOT_OBJECT") {
    return hasExactKeys(value, ["valueClass"]);
  }
  return validContactedRecordDiagnostic(
    value, CONTACTED_PAYMENT_FIELDS, CONTACTED_PAYMENT_REQUIRED_FIELDS,
  );
}

function validContactedRecordDiagnostic(
  value: Record<string, unknown>, fieldNames: readonly string[], requiredNames: readonly string[],
): boolean {
  if (!hasExactKeys(value, [
    "exactKeysValid", "fields", "knownKeyPresence", "missingRequiredKeys",
    "unknownKeyClass", "valueClass",
  ])) return false;
  if (value.valueClass !== "VALID" || typeof value.exactKeysValid !== "boolean") return false;
  if (!validContactedUnknownKeyClass(value.unknownKeyClass)) return false;
  if (value.exactKeysValid !== (value.unknownKeyClass === "NONE")) return false;
  if (!validContactedKnownKeyPresence(value.knownKeyPresence, fieldNames)) return false;
  if (!validContactedMissingRequiredKeys(
    value.missingRequiredKeys, requiredNames, value.knownKeyPresence,
  )) return false;
  return validContactedFieldClasses(value.fields, fieldNames, value.knownKeyPresence);
}

function validContactedOptionalDiagnostic(value: unknown, fieldNames: readonly string[]): boolean {
  if (!isPlainRecord(value)) return false;
  if (!validContactedOptionalEnvelope(value)) return false;
  if (!validContactedUnknownKeyClass(value.unknownKeyClass)) return false;
  if (!validContactedKnownKeyPresence(value.knownKeyPresence, fieldNames)) return false;
  if (!validContactedFieldClasses(value.fields, fieldNames, value.knownKeyPresence)) return false;
  return validContactedOptionalSemantics(value, fieldNames);
}

function validContactedOptionalEnvelope(value: Record<string, unknown>): value is Record<string, unknown> & {
  present: boolean; objectValid: boolean;
} {
  if (!hasExactKeys(value, [
    "fields", "knownKeyPresence", "objectValid", "present", "unknownKeyClass",
  ])) return false;
  return typeof value.present === "boolean" && typeof value.objectValid === "boolean";
}

function validContactedOptionalSemantics(
  value: Record<string, unknown> & { present: boolean; objectValid: boolean },
  fieldNames: readonly string[],
): boolean {
  if (!value.present) return value.objectValid === false && emptyDiagnosticObject(value, fieldNames);
  if (!value.objectValid) return true;
  const fields = value.fields;
  if (!isPlainRecord(fields)) return false;
  return value.unknownKeyClass === "NONE"
    && fieldNames.every((key) => fields[key] === "ABSENT" || fields[key] === "VALID");
}

function validContactedKnownKeyPresence(
  value: unknown, knownKeys: readonly string[],
): boolean {
  return isPlainRecord(value)
    && hasExactKeys(value, [...knownKeys].sort())
    && knownKeys.every((key) => typeof value[key] === "boolean");
}

function validContactedMissingRequiredKeys(
  value: unknown, requiredNames: readonly string[], presence: unknown,
): boolean {
  if (!Array.isArray(value) || !isPlainRecord(presence)) return false;
  const expected = requiredNames.filter((key) => presence[key] === false);
  return value.length === expected.length
    && value.every((key, index) => key === expected[index]);
}

function validContactedFieldClasses(
  value: unknown, fieldNames: readonly string[], presence: unknown,
): boolean {
  if (!isPlainRecord(value) || !isPlainRecord(presence)) return false;
  if (!hasExactKeys(value, [...fieldNames].sort())) return false;
  return fieldNames.every((key) => validContactedFieldClass(value[key], presence[key] === true));
}

function validContactedFieldClass(value: unknown, present: boolean): boolean {
  if (typeof value !== "string" || !CONTACTED_VALUE_CLASSES.has(value)) return false;
  return present ? value !== "ABSENT" : value === "ABSENT";
}

function validContactedUnknownKeyClass(value: unknown): boolean {
  return value === "NONE" || value === "ONE" || value === "MULTIPLE";
}

function emptyDiagnosticObject(value: Record<string, unknown>, fieldNames: readonly string[]): boolean {
  if (value.unknownKeyClass !== "NONE") return false;
  const presence = value.knownKeyPresence;
  if (!isPlainRecord(presence)) return false;
  const fields = value.fields;
  if (!isPlainRecord(fields)) return false;
  return fieldNames.every((key) => presence[key] === false
    && fields[key] === "ABSENT");
}

function validContactedRefundFirstFailure(value: Record<string, unknown>): boolean {
  const successfulMatch = value.parserResult === "MATCHED_REFUND_TRANSACTION"
    || value.parserResult === "NO_MATCHING_REFUND_TRANSACTION";
  if (successfulMatch) return value.firstFailure === null;
  return typeof value.firstFailure === "string"
    && CONTACTED_REFUND_FIRST_FAILURES.has(value.firstFailure);
}

function validContactedRefundInquiryState(value: Record<string, unknown>): boolean {
  if (value.inquiryCount === 0) {
    return value.httpStatus === null && value.jsonValid === null
      && value.parserResult === "UNESTABLISHED"
      && nullEvidenceFacts(value);
  }
  return value.databaseDisconnected === true;
}

function validContactedRefundEvidenceScalars(value: Record<string, unknown>): boolean {
  return typeof value.databaseDisconnected === "boolean"
    && isProviderRetrieveCount(value.inquiryCount)
    && typeof value.parserResult === "string"
    && CONTACTED_REFUND_PARSER_RESULTS.has(value.parserResult)
    && validContactedRefundEvidenceNullableBooleans(value)
    && validContactedRefundProviderStatusClass(value.providerStatusClass)
    && validContactedRefundHttpStatus(value.httpStatus);
}

function validContactedRefundEvidenceNullableBooleans(value: Record<string, unknown>): boolean {
  return [
    value.jsonValid,
    value.providerResponseSuccess,
    value.refundIdMatch,
    value.originalTransactionBindingMatch,
    value.currencyMatch,
    value.refundAmountMatch,
    value.refundTransactionIdPresent,
    value.refundDatePresent,
  ].every(isNullableBoolean);
}

function validContactedRefundProviderStatusClass(value: unknown): boolean {
  return value === null || value === "REFUND" || value === "PARTIAL_REFUND"
    || value === "NONE" || value === "OTHER";
}

function validContactedRefundHttpStatus(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function nullEvidenceFacts(value: Record<string, unknown>): boolean {
  return [
    value.providerStatusClass,
    value.providerResponseSuccess,
    value.refundIdMatch,
    value.originalTransactionBindingMatch,
    value.currencyMatch,
    value.refundAmountMatch,
    value.refundTransactionIdPresent,
    value.refundDatePresent,
  ].every((member) => member === null);
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

type ReentryTerminalValidation =
  | Readonly<{ state: "TRUSTED"; result: EximbayRefundReentryResult }>
  | Readonly<{ state: ChildValidationFailureState }>;

function validateEximbayRefundReentryTerminal(
  terminal: ChildResult,
): ReentryTerminalValidation {
  const value = terminal.value;
  if (!isPlainRecord(value)) return reentryValidationFailure("INVALID_RECORD");
  const shapeFailure = reentryShapeFailure(value);
  if (shapeFailure) return reentryValidationFailure(shapeFailure);
  const cleanupFailures = validReentryCleanupFailures(value.cleanupFailures);
  if (!cleanupFailures) return reentryValidationFailure("REENTRY_CLEANUP_INVALID");
  if (!validReentrySemantics(value)) return reentryValidationFailure("REENTRY_SEMANTICS_INVALID");
  const expectedExitCode = value.ok && cleanupFailures.length === 0 ? 0 : 1;
  if (terminal.exitCode !== expectedExitCode) {
    return reentryValidationFailure("REENTRY_EXIT_CODE_MISMATCH");
  }
  return Object.freeze({
    state: "TRUSTED",
    result: Object.freeze({
      schema: "mira-refund-eximbay-reentry-result/v1",
      ok: value.ok,
      code: value.code,
      terminalClass: value.terminalClass,
      preflightRetrieveCount: value.preflightRetrieveCount,
      reconciliationLookupCount: 0,
      cancellationCount: value.cancellationCount,
      reentry: "FORBIDDEN",
      cleanupFailures,
      ...diagnosticFields(value.diagnostic),
    }),
  });
}

function reentryShapeFailure(
  value: Record<string, unknown>,
): ChildValidationFailureState | null {
  const keys = Object.hasOwn(value, "diagnostic")
    ? [...EXIMBAY_REFUND_REENTRY_KEYS, "diagnostic"].sort() : EXIMBAY_REFUND_REENTRY_KEYS;
  if (Object.hasOwn(value, "diagnostic") && !isEximbayPreflightDiagnostic(value.diagnostic)) return "REENTRY_SEMANTICS_INVALID";
  if (!hasExactKeys(value, keys)) {
    return "REENTRY_KEY_SET_MISMATCH";
  }
  if (value.schema !== "mira-refund-eximbay-reentry-result/v1") {
    return "REENTRY_SCHEMA_MISMATCH";
  }
  if (![typeof value.ok === "boolean", isEximbayRefundReentryCode(value.code)].every(Boolean)) {
    return "REENTRY_CODE_INVALID";
  }
  return [
    isProviderRetrieveCount(value.preflightRetrieveCount),
    value.reconciliationLookupCount === 0,
    isProviderRetrieveCount(value.cancellationCount),
  ].every(Boolean) ? null : "REENTRY_COUNTER_INVALID";
}

function reentryValidationFailure(
  state: ChildValidationFailureState,
): ReentryTerminalValidation {
  return Object.freeze({ state });
}

function validReentrySemantics(value: Record<string, unknown>): value is Record<string, unknown> & {
  ok: boolean;
  code: EximbayRefundReentryResultCode;
  terminalClass: EximbayRefundReentryResult["terminalClass"];
  preflightRetrieveCount: 0 | 1;
  cancellationCount: 0 | 1;
  reentry: "FORBIDDEN";
} {
  if (value.reentry !== "FORBIDDEN") return false;
  const retrieve = value.preflightRetrieveCount;
  const cancel = value.cancellationCount;
  if (!isProviderRetrieveCount(retrieve)) return false;
  if (!isProviderRetrieveCount(cancel)) return false;
  if (cancel === 1) {
    if (retrieve !== 1) return false;
  }
  if (value.ok === true) {
    return validSuccessfulReentrySemantics(value, retrieve, cancel);
  }
  return validFailedReentrySemantics(value, retrieve, cancel);
}

function validSuccessfulReentrySemantics(
  value: Record<string, unknown>,
  retrieve: 0 | 1,
  cancel: 0 | 1,
): boolean {
  return [
    !Object.hasOwn(value, "diagnostic"),
    value.code === "KNOWN_SUCCESS",
    value.terminalClass === "REFUND_SUCCEEDED",
    retrieve === 1,
    cancel === 1,
  ].every(Boolean);
}

function validFailedReentrySemantics(
  value: Record<string, unknown>,
  retrieve: 0 | 1,
  cancel: 0 | 1,
): boolean {
  if (value.code === "KNOWN_SUCCESS") return false;
  if (!consistentPreflightEffects(value.diagnostic, retrieve, cancel)) return false;
  const effectPossible = [retrieve, cancel].some((count) => count === 1);
  const expectedTerminal = effectPossible ? "PROVIDER_EFFECT_POSSIBLE" : "SAFE_STOP";
  if (value.terminalClass !== expectedTerminal) {
    return false;
  }
  if (cancel === 1) return value.code === "CANCEL_CONTACT_MAY_HAVE_OCCURRED";
  if (retrieve === 1) return value.code === "RETRIEVE_CONTACTED";
  return !["RETRIEVE_CONTACTED", "CANCEL_CONTACT_MAY_HAVE_OCCURRED"].includes(
    String(value.code),
  );
}

function consistentPreflightEffects(
  diagnostic: unknown,
  retrieve: 0 | 1,
  cancel: 0 | 1,
): boolean {
  if (diagnostic === undefined) return true;
  if (!isEximbayPreflightDiagnostic(diagnostic)) return false;
  // The continuation catch can run before or after provider contact.
  if (diagnostic.stage === "LEASE_CONTINUATION") return true;
  if (cancel !== 0) return false;
  // Only authorizeR1's reused-observation exception lacks a current response.
  if (diagnostic.stage === "DISPATCH_AUTHORIZATION" && diagnostic.responseReceived === null) {
    return retrieve === 0;
  }
  // Retrieve and observation failures follow exactly one retrieve invocation;
  // fresh dispatch failures occur after that response was admitted.
  return retrieve === 1;
}

const EXIMBAY_REFUND_REENTRY_CODES = new Set<string>([
  "KNOWN_SUCCESS",
  "NO_PROVIDER_CONTACT",
  "RETRIEVE_CONTACTED",
  "CANCEL_CONTACT_MAY_HAVE_OCCURRED",
  "MANUAL_REVIEW",
  "OVERLAP_SKIPPED",
  "TARGET_MISMATCH",
  "CONFIG_MISMATCH",
  "CREDENTIAL_UNAVAILABLE",
  "INTERNAL_FAILURE",
]);

function isEximbayRefundReentryCode(value: unknown): value is EximbayRefundReentryResultCode {
  return typeof value === "string" && EXIMBAY_REFUND_REENTRY_CODES.has(value);
}

function validReentryCleanupFailures(
  value: unknown,
): readonly EximbayRefundReentryCleanupFailure[] | null {
  if (!Array.isArray(value)) return null;
  if (Reflect.getPrototypeOf(value) !== Array.prototype) return null;
  if (value.length === 0) return Object.freeze([]);
  if (value.length === 1) return singleReentryCleanupFailure(value[0]);
  if (value.length === 2) return pairedReentryCleanupFailures(value);
  return null;
}

function singleReentryCleanupFailure(
  value: unknown,
): readonly EximbayRefundReentryCleanupFailure[] | null {
  if (value === "ADMISSION_CLEANUP_FAILED") {
    return Object.freeze(["ADMISSION_CLEANUP_FAILED"]);
  }
  return value === "DATABASE_DISCONNECT_FAILED"
    ? Object.freeze(["DATABASE_DISCONNECT_FAILED"])
    : null;
}

function pairedReentryCleanupFailures(
  value: readonly unknown[],
): readonly EximbayRefundReentryCleanupFailure[] | null {
  return [
    value[0] === "ADMISSION_CLEANUP_FAILED",
    value[1] === "DATABASE_DISCONNECT_FAILED",
  ].every(Boolean)
    ? Object.freeze(["ADMISSION_CLEANUP_FAILED", "DATABASE_DISCONNECT_FAILED"])
    : null;
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

type ReentryChildSpawnState = "NOT_ATTEMPTED" | "FAILED" | "SUCCEEDED";
type ReentryHostCode =
  | "COMPLETE"
  | "CONFIG_INVALID"
  | "PROXY_START_FAILED"
  | "PROXY_READINESS_FAILED"
  | "CHILD_SPAWN_FAILED"
  | "CHILD_EVIDENCE_INVALID"
  | "PROXY_LIFECYCLE_FAILED";

function writeReentrySupervisorTerminal(
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }>,
  capture: ChildCapture | null,
  validation: ChildValidationState,
  lifecycle: ProxyLifecycleState,
  childSpawnState: ReentryChildSpawnState = "NOT_ATTEMPTED",
  childResult: EximbayRefundReentryResult | null = null,
): Promise<number> {
  const hostOk = reentryHostIsOk(childSpawnState, validation, lifecycle);
  const ok = reentrySupervisorIsOk(hostOk, childResult);
  const terminal = Object.freeze({
    schema: "mira-refund-eximbay-reentry-supervisor/v2",
    ok,
    childOperationResult: Object.freeze({
      evidence: childResult ? "TRUSTWORTHY" : "UNKNOWN",
      result: childResult,
      providerEffects: reentryProviderEffects(childResult),
    }),
    hostResult: Object.freeze({
      ok: hostOk,
      code: reentryHostCode(childSpawnState, validation, lifecycle),
      childSpawnState,
      ...reentryChildProcessResult(capture),
      childValidation: validation,
      proxyLifecycle: lifecycle,
    }),
  });
  return writeStatic(output.stdout, `${JSON.stringify(terminal)}\n`, ok ? 0 : 1);
}

function reentryHostIsOk(
  childSpawnState: ReentryChildSpawnState,
  validation: ChildValidationState,
  lifecycle: ProxyLifecycleState,
): boolean {
  return [
    childSpawnState === "SUCCEEDED",
    validation === "TRUSTED",
    lifecycle === "READY_CLEANUP_CONFIRMED",
  ].every(Boolean);
}

function reentrySupervisorIsOk(
  hostOk: boolean,
  childResult: EximbayRefundReentryResult | null,
): boolean {
  if (!childResult) return false;
  return [hostOk, childResult.ok, childResult.cleanupFailures.length === 0].every(Boolean);
}

function reentryProviderEffects(childResult: EximbayRefundReentryResult | null) {
  return childResult
    ? Object.freeze({
      preflightRetrieveCount: childResult.preflightRetrieveCount,
      reconciliationLookupCount: childResult.reconciliationLookupCount,
      cancellationCount: childResult.cancellationCount,
    })
    : Object.freeze({
      preflightRetrieveCount: null,
      reconciliationLookupCount: null,
      cancellationCount: null,
    });
}

function reentryChildProcessResult(capture: ChildCapture | null) {
  return capture
    ? Object.freeze({
      childProcessState: capture.processState,
      childExitCode: capture.exitCode,
      childSignal: capture.signal,
      childStreamState: capture.streamState,
      childOutputOverflow: capture.outputOverflow,
      childFraming: capture.framing,
    })
    : Object.freeze({
      childProcessState: "NOT_STARTED",
      childExitCode: null,
      childSignal: null,
      childStreamState: "NOT_CAPTURED",
      childOutputOverflow: false,
      childFraming: Object.freeze({
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutLfCount: 0,
        stdoutCrCount: 0,
        terminalCandidateCount: 0,
        terminalUtf8: "NOT_ATTEMPTED",
      }),
    });
}

function reentryHostCode(
  childSpawnState: ReentryChildSpawnState,
  validation: ChildValidationState,
  lifecycle: ProxyLifecycleState,
): ReentryHostCode {
  if (lifecycle === "NOT_STARTED") return "CONFIG_INVALID";
  if (lifecycle === "PROXY_START_FAILED") return "PROXY_START_FAILED";
  if (lifecycle === "PROXY_READINESS_FAILED") return "PROXY_READINESS_FAILED";
  if (childSpawnState === "FAILED") return "CHILD_SPAWN_FAILED";
  if (validation !== "TRUSTED") return "CHILD_EVIDENCE_INVALID";
  return lifecycle === "READY_CLEANUP_CONFIRMED"
    ? "COMPLETE"
    : "PROXY_LIFECYCLE_FAILED";
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
    access(EXIMBAY_CONTACTED_REFUND_EVIDENCE_BUNDLE, fsConstants.R_OK),
    access(EXIMBAY_CONTACTED_RECONCILIATION_BUNDLE, fsConstants.R_OK),
    access(EXIMBAY_REFUND_REENTRY_BUNDLE, fsConstants.R_OK),
    access(RETRIEVE_DIAGNOSTIC_BUNDLE, fsConstants.R_OK),
    access(PL09_TARGETED_REFUND_EMAIL_DISPATCH_BUNDLE, fsConstants.R_OK),
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
    eximbayRefundReentryBundlePresent: true,
    pl09TargetedRefundEmailDispatchBundlePresent: true,
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
