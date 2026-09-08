import { pathToFileURL } from "node:url";
import { runEximbayRefundReentryOnce } from
  "../src/lib/payment/refund/run-eximbay-refund-reentry-once";

export async function main(): Promise<number> {
  if (process.argv.length !== 2) return 64;
  const result = await runEximbayRefundReentryOnce(process.env);
  const line = `${JSON.stringify(result)}\n`;
  const clean = result.cleanupFailures.length === 0;
  (result.ok && clean ? process.stdout : process.stderr).write(line);
  return result.ok && clean ? 0 : 1;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().then((code) => { process.exitCode = code; }).catch(() => {
    process.exitCode = 1;
  });
}
