import { pathToFileURL } from "node:url";
import { runRefundDeploymentRehearsalProcess } from "../src/lib/payment/refund/refund-deployment-rehearsal-process";
import { defaultRefundDeploymentRehearsalDependencies } from "../src/lib/payment/refund/run-refund-deployment-rehearsal";

export async function main(): Promise<number> {
  const exitCode = await runRefundDeploymentRehearsalProcess(
    process.argv.slice(2),
    process.env,
    { stdout: process.stdout, stderr: process.stderr },
    defaultRefundDeploymentRehearsalDependencies,
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
