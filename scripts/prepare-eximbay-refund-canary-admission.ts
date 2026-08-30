import { pathToFileURL } from "node:url";
import { runEximbayRefundCanaryPreparationProcess } from
  "../src/lib/payment/refund/prepare-eximbay-refund-canary-admission";

export function main(): Promise<number> {
  return runEximbayRefundCanaryPreparationProcess(
    process.argv.slice(2),
    process.env,
    Object.freeze({ stdout: process.stdout, stderr: process.stderr }),
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await main();
}
