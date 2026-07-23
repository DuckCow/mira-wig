import { pathToFileURL } from "node:url";
import { runRefundSandboxProviderFreePreflightProcess } from
  "../src/lib/payment/refund/refund-sandbox-provider-free-preflight-process";
import { defaultRefundSandboxProviderFreePreflightDependencies } from
  "../src/lib/payment/refund/run-refund-sandbox-provider-free-preflight";

export async function main(
  args: unknown = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env,
  output = Object.freeze({ stdout: process.stdout, stderr: process.stderr }),
): Promise<number> {
  return runRefundSandboxProviderFreePreflightProcess(
    args,
    env,
    output,
    defaultRefundSandboxProviderFreePreflightDependencies,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
