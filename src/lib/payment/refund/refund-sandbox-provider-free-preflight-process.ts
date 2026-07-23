import {
  parseRefundSandboxProviderFreePreflightCliArgs,
  refundSandboxProviderFreePreflightExitCode,
  refundSandboxProviderFreePreflightFailure,
  sanitizeRefundSandboxProviderFreePreflightResult,
  REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_FORMAT_VERSION,
  type RefundSandboxProviderFreePreflightResult,
} from "./refund-sandbox-provider-free-preflight-contract";
import {
  runRefundSandboxProviderFreePreflight,
  type RefundSandboxProviderFreePreflightDependencies,
} from "./run-refund-sandbox-provider-free-preflight";

type PreflightEnv = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;
type MonotonicClock = () => number;
const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';

export type RefundSandboxProviderFreePreflightProcessOutput = Readonly<{
  stdout: OutputWriter;
  stderr: OutputWriter;
}>;

export async function runRefundSandboxProviderFreePreflightProcess<Database>(
  args: unknown,
  env: PreflightEnv,
  output: RefundSandboxProviderFreePreflightProcessOutput,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
  serialize: (result: unknown) => string = JSON.stringify,
  monotonicNow: MonotonicClock = defaultMonotonicNow,
): Promise<number> {
  const startedAt = readClock(monotonicNow);
  if (startedAt === null) return writeStaticFailure(output.stderr);
  const validArgs = parseRefundSandboxProviderFreePreflightCliArgs(args);
  const result = validArgs
    ? await safeRun(env, dependencies)
    : refundSandboxProviderFreePreflightFailure("INVALID_HOST_INPUT");
  const finishedAt = readClock(monotonicNow);
  const duration = operationDuration(startedAt, finishedAt);
  if (duration === null) return writeStaticFailure(output.stderr);
  const prepared = prepareOutput(result, validArgs ? "PREFLIGHT" : "INVALID", duration, output, serialize);
  try {
    await prepared.destination.write(prepared.line);
    return prepared.exitCode;
  } catch {
    return 1;
  }
}

async function safeRun<Database>(
  env: PreflightEnv,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
): Promise<RefundSandboxProviderFreePreflightResult> {
  try {
    return await runRefundSandboxProviderFreePreflight(env, dependencies);
  } catch {
    return refundSandboxProviderFreePreflightFailure("SYSTEMIC_FAILURE");
  }
}

function prepareOutput(
  result: RefundSandboxProviderFreePreflightResult,
  command: "PREFLIGHT" | "INVALID",
  operationDurationMs: number,
  output: RefundSandboxProviderFreePreflightProcessOutput,
  serialize: (result: unknown) => string,
) {
  try {
    const sanitized = sanitizeRefundSandboxProviderFreePreflightResult(result);
    if (!sanitized) throw new Error("INVALID_PREFLIGHT_RESULT");
    const observed = Object.freeze({
      ...sanitized,
      process: Object.freeze({
        formatVersion: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_FORMAT_VERSION,
        command,
        operationDurationMs,
      }),
    });
    const canonical = JSON.stringify(observed);
    const serialized = serialize(observed);
    if (typeof serialized !== "string" || serialized !== canonical) {
      throw new Error("INVALID_PREFLIGHT_SERIALIZATION");
    }
    const exitCode = refundSandboxProviderFreePreflightExitCode(sanitized);
    return Object.freeze({
      destination: exitCode === 0 ? output.stdout : output.stderr,
      line: `${serialized}\n`,
      exitCode,
    });
  } catch {
    return Object.freeze({ destination: output.stderr, line: SYSTEMIC_FAILURE_LINE, exitCode: 1 });
  }
}

function readClock(clock: MonotonicClock): number | null {
  try {
    const value = clock();
    return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  } catch {
    return null;
  }
}

function operationDuration(startedAt: number, finishedAt: number | null): number | null {
  if (finishedAt === null || finishedAt < startedAt) return null;
  const duration = Math.floor(finishedAt - startedAt);
  return Number.isSafeInteger(duration) && duration >= 0 ? duration : null;
}

async function writeStaticFailure(destination: OutputWriter): Promise<number> {
  try {
    await destination.write(SYSTEMIC_FAILURE_LINE);
  } catch {
    return 1;
  }
  return 1;
}

function defaultMonotonicNow(): number {
  return performance.now();
}
