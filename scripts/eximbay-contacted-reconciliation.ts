import { pathToFileURL } from "node:url";
import {
  runEximbayContactedReconciliationOnce,
  type EximbayContactedReconciliationResult,
} from "../src/lib/payment/refund/run-eximbay-contacted-reconciliation-once";
import {
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
} from "../src/lib/payment/refund/eximbay-contacted-reconciliation-environment";

type OutputWriter = Readonly<{ write(value: string): unknown }>;

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: Readonly<Record<string, string | undefined>> = process.env,
  output: Readonly<{ stdout: OutputWriter; stderr: OutputWriter }> = Object.freeze({
    stdout: process.stdout,
    stderr: process.stderr,
  }),
  run: typeof runEximbayContactedReconciliationOnce = runEximbayContactedReconciliationOnce,
): Promise<number> {
  if (args.length !== 0) return writeStatic(output.stderr, invalidInputResult(), 64);
  let result: EximbayContactedReconciliationResult;
  try {
    result = await run(env);
  } catch {
    result = internalFailureResult();
  }
  return writeStatic(
    result.ok ? output.stdout : output.stderr,
    result,
    result.ok ? 0 : result.code === "CONFIG_INVALID" ? 78 : 1,
  );
}

function invalidInputResult(): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: false,
    code: "CONFIG_INVALID",
    terminalClass: "HOST_FAILURE",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    providerRetrieveCount: 0,
    durableRelease: "NOT_REPORTED",
  });
}

function internalFailureResult(): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: false,
    code: "INTERNAL_FAILURE",
    terminalClass: "HOST_FAILURE",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    providerRetrieveCount: 0,
    durableRelease: "NOT_REPORTED",
  });
}

async function writeStatic(
  writer: OutputWriter,
  result: EximbayContactedReconciliationResult,
  exitCode: number,
): Promise<number> {
  const line = `${JSON.stringify(result)}\n`;
  try {
    await writer.write(line);
    return exitCode;
  } catch {
    return 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().then((code) => { process.exitCode = code; }).catch(() => {
    process.exitCode = 1;
  });
}
