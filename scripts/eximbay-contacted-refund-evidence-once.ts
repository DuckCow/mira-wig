import { pathToFileURL } from "node:url";
import { runEximbayContactedRefundEvidenceOnce } from "../src/lib/payment/refund/run-eximbay-contacted-refund-evidence-once";

// Existing specialized worker CLI convention; worker-image dispatch is explicit and one-shot.
export async function main(): Promise<number> {
  if (process.argv.length !== 3) return 64;
  const result = await runEximbayContactedRefundEvidenceOnce(process.argv[2], process.env);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.databaseDisconnected && result.parserResult === "MATCHED_REFUND_TRANSACTION" ? 0 : 1;
}
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
