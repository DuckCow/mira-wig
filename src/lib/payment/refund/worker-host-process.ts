import {
  parseRefundExecutionWorkerCliArgs,
  workerHostExitCode,
  type RefundExecutionWorkerHostResult,
} from "./worker-host-contract";
import {
  runRefundExecutionWorkerHost,
  type RefundExecutionWorkerHostDependencies,
} from "./run-refund-execution-worker-host";

type HostEnv = Readonly<Record<string, string | undefined>>;
type OutputWriter = Readonly<{ write(value: string): unknown }>;
const SYSTEMIC_FAILURE_LINE = '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n';

export type RefundExecutionWorkerProcessOutput = Readonly<{
  stdout: OutputWriter;
  stderr: OutputWriter;
}>;

export type RefundExecutionWorkerResultSerializer = (
  result: RefundExecutionWorkerHostResult,
) => string;

export async function runRefundExecutionWorkerProcess<Database>(
  args: unknown,
  env: HostEnv,
  output: RefundExecutionWorkerProcessOutput,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
  serialize: RefundExecutionWorkerResultSerializer = JSON.stringify,
): Promise<number> {
  const parsed = parseRefundExecutionWorkerCliArgs(args);
  const result = parsed.ok
    ? await safeRunHost(parsed.command, env, dependencies)
    : parsed.result;
  const prepared = prepareOutput(result, output, serialize);
  try {
    await prepared.destination.write(prepared.line);
    return prepared.exitCode;
  } catch {
    return 1;
  }
}

function prepareOutput(
  result: RefundExecutionWorkerHostResult,
  output: RefundExecutionWorkerProcessOutput,
  serialize: RefundExecutionWorkerResultSerializer,
): Readonly<{ destination: OutputWriter; line: string; exitCode: number }> {
  const exitCode = workerHostExitCode(result);
  try {
    const serialized = serialize(result);
    if (typeof serialized !== "string") throw new Error("INVALID_SERIALIZED_RESULT");
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
