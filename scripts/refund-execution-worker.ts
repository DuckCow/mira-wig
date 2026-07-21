import { pathToFileURL } from "node:url";
import { defaultRefundExecutionWorkerHostDependencies } from "../src/lib/payment/refund/run-refund-execution-worker-host";
import { createProcessRefundExecutionWorkerHostLifecycle } from "../src/lib/payment/refund/worker-host-lifecycle";
import { runRefundExecutionWorkerProcess } from "../src/lib/payment/refund/worker-host-process";

export async function main(): Promise<number> {
  const dependencies = Object.freeze({
    ...defaultRefundExecutionWorkerHostDependencies,
    createLifecycle: createProcessRefundExecutionWorkerHostLifecycle,
  });
  const exitCode = await runRefundExecutionWorkerProcess(
    process.argv.slice(2),
    process.env,
    { stdout: process.stdout, stderr: process.stderr },
    dependencies,
  );
  process.exitCode = exitCode;
  return exitCode;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch(() => {
    process.exitCode = 1;
  });
}
