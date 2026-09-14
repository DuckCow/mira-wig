import { pathToFileURL } from "node:url";
import { runEximbayRetrieveShapeDiagnosticOnce } from "../src/lib/payment/refund/run-eximbay-retrieve-shape-diagnostic-once";
export async function main(): Promise<number> {
  if (process.argv.length !== 2) return 64;
  const result = await runEximbayRetrieveShapeDiagnosticOnce(process.env);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}
