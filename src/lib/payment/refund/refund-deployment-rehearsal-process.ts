import {
  parseRefundDeploymentRehearsalCliArgs,
  refundDeploymentRehearsalExitCode,
  sanitizeRefundDeploymentRehearsalHostResult,
  REFUND_DEPLOYMENT_REHEARSAL_FORMAT_VERSION,
  type RefundDeploymentRehearsalHostResult,
  type RefundDeploymentRehearsalObservedResult,
  type RefundDeploymentRehearsalProcessCommand,
} from "./refund-deployment-rehearsal-contract";
import {
  runRefundDeploymentRehearsal,
  type RefundDeploymentRehearsalDependencies,
} from "./run-refund-deployment-rehearsal";

type RehearsalEnv = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;
type MonotonicClock = () => number;
type Serializer = (result: RefundDeploymentRehearsalObservedResult) => string;

const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';

export interface RefundDeploymentRehearsalProcessOutput {
  stdout: OutputWriter;
  stderr: OutputWriter;
}

export async function runRefundDeploymentRehearsalProcess(
  args: unknown,
  env: RehearsalEnv,
  output: RefundDeploymentRehearsalProcessOutput,
  dependencies: RefundDeploymentRehearsalDependencies,
  serialize: Serializer = JSON.stringify,
  monotonicNow: MonotonicClock = defaultMonotonicNow,
): Promise<number> {
  const startedAt = readClock(monotonicNow);
  if (startedAt === null) return writeStaticFailure(output.stderr);
  const validArgs = parseRefundDeploymentRehearsalCliArgs(args);
  const result = validArgs
    ? await safeRunRehearsal(env, dependencies)
    : Object.freeze({ ok: false, code: "INVALID_HOST_INPUT" } as const);
  const finishedAt = readClock(monotonicNow);
  const duration = durationMs(startedAt, finishedAt);
  if (duration === null) return writeStaticFailure(output.stderr);
  const prepared = prepareOutput(
    result,
    validArgs ? "REHEARSE" : "INVALID",
    duration,
    output,
    serialize,
  );
  try {
    await prepared.destination.write(prepared.line);
    return prepared.exitCode;
  } catch {
    return 1;
  }
}

async function safeRunRehearsal(
  env: RehearsalEnv,
  dependencies: RefundDeploymentRehearsalDependencies,
): Promise<RefundDeploymentRehearsalHostResult> {
  try {
    return await runRefundDeploymentRehearsal(env, dependencies);
  } catch {
    return Object.freeze({ ok: false, code: "SYSTEMIC_FAILURE" });
  }
}

function prepareOutput(
  result: RefundDeploymentRehearsalHostResult,
  command: RefundDeploymentRehearsalProcessCommand,
  operationDurationMs: number,
  output: RefundDeploymentRehearsalProcessOutput,
  serialize: Serializer,
): Readonly<{ destination: OutputWriter; line: string; exitCode: number }> {
  try {
    const sanitized = sanitizeRefundDeploymentRehearsalHostResult(result);
    if (!sanitized) throw new Error("INVALID_REHEARSAL_RESULT");
    const observed: RefundDeploymentRehearsalObservedResult = Object.freeze({
      ...sanitized,
      process: Object.freeze({
        formatVersion: REFUND_DEPLOYMENT_REHEARSAL_FORMAT_VERSION,
        command,
        operationDurationMs,
      }),
    });
    const canonical = JSON.stringify(observed);
    const serialized = serialize(observed);
    if (typeof serialized !== "string" || serialized !== canonical) {
      throw new Error("INVALID_REHEARSAL_SERIALIZATION");
    }
    const exitCode = refundDeploymentRehearsalExitCode(sanitized);
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

function durationMs(startedAt: number, finishedAt: number | null): number | null {
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
