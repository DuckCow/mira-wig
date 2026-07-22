import {
  parseRefundOperationsCliArgs,
  refundOperationsExitCode,
  refundOperationsFailure,
  sanitizeRefundOperationsResult,
  REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
  type ObservedRefundOperationsResult,
  type RefundOperationsHostResult,
  type RefundOperationsProcessCommand,
} from "./refund-operations-contract";
import {
  runRefundOperationsHost,
  type RefundOperationsHostDependencies,
} from "./run-refund-operations-host";

type OperationsEnv = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;
type PreparedOutput = Readonly<{ destination: OutputWriter; line: string; exitCode: number }>;
type MonotonicClock = () => number;
type ResultSerializer = (result: ObservedRefundOperationsResult) => string;

const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';

export type RefundOperationsProcessOutput = Readonly<{
  stdout: OutputWriter;
  stderr: OutputWriter;
}>;

export async function runRefundOperationsProcess<Database>(
  args: unknown,
  env: OperationsEnv,
  output: RefundOperationsProcessOutput,
  dependencies: RefundOperationsHostDependencies<Database>,
  serialize: ResultSerializer = JSON.stringify,
  monotonicNow: MonotonicClock = defaultMonotonicNow,
): Promise<number> {
  const startedAt = readMonotonicClock(monotonicNow);
  if (startedAt === null) return writeStaticFailure(output.stderr);
  const parsed = parseRefundOperationsCliArgs(args);
  const result = parsed.ok
    ? await safeRunHost(parsed.command, env, dependencies)
    : parsed.result;
  const finishedAt = readMonotonicClock(monotonicNow);
  const duration = operationDuration(startedAt, finishedAt);
  if (duration === null) return writeStaticFailure(output.stderr);
  const command = parsed.ok ? parsed.command.kind : "INVALID";
  const prepared = prepareOutput(result, command, duration, output, serialize);
  try {
    await prepared.destination.write(prepared.line);
    return prepared.exitCode;
  } catch {
    return 1;
  }
}

function prepareOutput(
  result: RefundOperationsHostResult,
  command: RefundOperationsProcessCommand,
  operationDurationMs: number,
  output: RefundOperationsProcessOutput,
  serialize: ResultSerializer,
): PreparedOutput {
  try {
    const sanitized = sanitizeRefundOperationsResult(result);
    if (!sanitized) throw new Error("INVALID_OPERATIONS_RESULT");
    const observed: ObservedRefundOperationsResult = Object.freeze({
      ...sanitized,
      process: Object.freeze({
        formatVersion: REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
        command,
        operationDurationMs,
      }),
    });
    const exitCode = refundOperationsExitCode(sanitized);
    const canonical = JSON.stringify(observed);
    const serialized = serialize(observed);
    if (typeof serialized !== "string" || serialized !== canonical) {
      throw new Error("INVALID_SERIALIZED_OPERATIONS_RESULT");
    }
    return Object.freeze({
      destination: exitCode === 0 ? output.stdout : output.stderr,
      line: `${serialized}\n`,
      exitCode,
    });
  } catch {
    return Object.freeze({ destination: output.stderr, line: SYSTEMIC_FAILURE_LINE, exitCode: 1 });
  }
}

async function safeRunHost<Database>(
  command: Parameters<typeof runRefundOperationsHost<Database>>[0],
  env: OperationsEnv,
  dependencies: RefundOperationsHostDependencies<Database>,
): Promise<RefundOperationsHostResult> {
  try {
    return await runRefundOperationsHost(command, env, dependencies);
  } catch {
    return refundOperationsFailure("SYSTEMIC_FAILURE");
  }
}

function readMonotonicClock(clock: MonotonicClock): number | null {
  try {
    const value = clock();
    return typeof value === "number" && Number.isFinite(value)
      && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
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
