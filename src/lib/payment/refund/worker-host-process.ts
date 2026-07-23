import {
  parseRefundExecutionWorkerCliArgs,
  REFUND_WORKER_PROCESS_FORMAT_VERSION,
  workerHostExitCode,
  type RefundExecutionWorkerHostResult,
} from "./worker-host-contract";
import {
  runRefundExecutionWorkerHost,
  type RefundExecutionWorkerHostDependencies,
} from "./run-refund-execution-worker-host";

type HostEnv = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;
type PreparedOutput = Readonly<{ destination: OutputWriter; line: string; exitCode: number }>;
const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';

export { REFUND_WORKER_PROCESS_FORMAT_VERSION } from "./worker-host-contract";

export type RefundExecutionWorkerProcessCommand = "CHECK" | "HEALTH" | "RUN_ONCE" | "INVALID";
export type RefundExecutionWorkerProcessObservation = Readonly<{
  formatVersion: typeof REFUND_WORKER_PROCESS_FORMAT_VERSION;
  command: RefundExecutionWorkerProcessCommand;
  operationDurationMs: number;
}>;
export type ObservedRefundExecutionWorkerHostResult = RefundExecutionWorkerHostResult & Readonly<{
  process: RefundExecutionWorkerProcessObservation;
}>;
export type RefundExecutionWorkerMonotonicClock = () => number;

export type RefundExecutionWorkerProcessOutput = Readonly<{
  stdout: OutputWriter;
  stderr: OutputWriter;
}>;

export type RefundExecutionWorkerResultSerializer = (
  result: ObservedRefundExecutionWorkerHostResult,
) => string;

export async function runRefundExecutionWorkerProcess<Database>(
  args: unknown,
  env: HostEnv,
  output: RefundExecutionWorkerProcessOutput,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
  serialize: RefundExecutionWorkerResultSerializer = JSON.stringify,
  monotonicNow: RefundExecutionWorkerMonotonicClock = defaultMonotonicNow,
): Promise<number> {
  const startedAt = readMonotonicClock(monotonicNow);
  if (startedAt === null) return writeStaticSystemicFailure(output.stderr);
  const parsed = parseRefundExecutionWorkerCliArgs(args);
  const result = parsed.ok
    ? await safeRunHost(parsed.command, env, dependencies)
    : parsed.result;
  const finishedAt = readMonotonicClock(monotonicNow);
  const duration = operationDuration(startedAt, finishedAt);
  if (duration === null) return writeStaticSystemicFailure(output.stderr);
  const command = parsed.ok ? processCommand(parsed.command.kind) : "INVALID";
  const prepared = prepareOutput(result, command, duration, output, serialize);
  try {
    await prepared.destination.write(prepared.line);
    return prepared.exitCode;
  } catch {
    return 1;
  }
}

function prepareOutput(
  result: RefundExecutionWorkerHostResult,
  command: RefundExecutionWorkerProcessCommand,
  operationDurationMs: number,
  output: RefundExecutionWorkerProcessOutput,
  serialize: RefundExecutionWorkerResultSerializer,
): PreparedOutput {
  try {
    const observed = observeResult(result, command, operationDurationMs);
    const exitCode = workerHostExitCode(observed);
    const canonical = JSON.stringify(observed);
    const serialized = serialize(observed);
    if (typeof serialized !== "string" || serialized !== canonical) {
      throw new Error("INVALID_SERIALIZED_RESULT");
    }
    return Object.freeze({
      destination: exitCode === 0 ? output.stdout : output.stderr,
      line: `${serialized}\n`,
      exitCode,
    });
  } catch {
    return staticSystemicFailureOutput(output.stderr);
  }
}

function observeResult(
  result: RefundExecutionWorkerHostResult,
  command: RefundExecutionWorkerProcessCommand,
  operationDurationMs: number,
): ObservedRefundExecutionWorkerHostResult {
  return Object.freeze({
    ...result,
    process: Object.freeze({
      formatVersion: REFUND_WORKER_PROCESS_FORMAT_VERSION,
      command,
      operationDurationMs,
    }),
  });
}

function processCommand(
  kind: Parameters<typeof safeRunHost>[0]["kind"],
): Exclude<RefundExecutionWorkerProcessCommand, "INVALID"> {
  if (kind === "CHECK") return "CHECK";
  if (kind === "HEALTH") return "HEALTH";
  return "RUN_ONCE";
}

function readMonotonicClock(clock: RefundExecutionWorkerMonotonicClock): number | null {
  try {
    const value = clock();
    return typeof value === "number"
      && Number.isFinite(value)
      && value >= 0
      && value <= Number.MAX_SAFE_INTEGER
      ? value
      : null;
  } catch {
    return null;
  }
}

function operationDuration(startedAt: number, finishedAt: number | null): number | null {
  if (finishedAt === null || finishedAt < startedAt) return null;
  const duration = Math.floor(finishedAt - startedAt);
  return Number.isSafeInteger(duration) && duration >= 0 ? duration : null;
}

async function writeStaticSystemicFailure(destination: OutputWriter): Promise<number> {
  try {
    await destination.write(staticSystemicFailureOutput(destination).line);
  } catch {
    return 1;
  }
  return 1;
}

function staticSystemicFailureOutput(destination: OutputWriter): PreparedOutput {
  return Object.freeze({ destination, line: SYSTEMIC_FAILURE_LINE, exitCode: 1 });
}

function defaultMonotonicNow(): number {
  return performance.now();
}

async function safeRunHost<Database>(
  command: Parameters<typeof runRefundExecutionWorkerHost<Database>>[0],
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  try {
    return await runRefundExecutionWorkerHost(command, env, dependencies);
  } catch {
    return Object.freeze({ ok: false, code: "SYSTEMIC_FAILURE" });
  }
}
