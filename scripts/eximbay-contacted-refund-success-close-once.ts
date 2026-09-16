import { pathToFileURL } from "node:url";
import { runEximbayContactedRefundSuccessCloseOnce } from "../src/lib/payment/refund/run-eximbay-contacted-refund-success-close-once";

export async function main(): Promise<number> {
  if (process.argv.length !== 3) return 64;
  const result = await runEximbayContactedRefundSuccessCloseOnce(process.argv[2], process.env);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.outcome === "CLOSED" ? 0 : 1;
}
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
