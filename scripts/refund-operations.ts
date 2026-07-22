import { pathToFileURL } from "node:url";
import { runRefundOperationsProcess } from "../src/lib/payment/refund/refund-operations-process";
import { defaultRefundOperationsHostDependencies } from "../src/lib/payment/refund/run-refund-operations-host";

export async function main(): Promise<number> {
  const exitCode = await runRefundOperationsProcess(
    process.argv.slice(2),
    process.env,
    { stdout: process.stdout, stderr: process.stderr },
    defaultRefundOperationsHostDependencies,
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
