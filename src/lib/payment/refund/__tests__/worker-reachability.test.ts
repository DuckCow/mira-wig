import { readFileSync, readdirSync } from "fs";
import { basename, join } from "path";
import { describe, expect, it } from "vitest";

const REFUND_ROOT = join(process.cwd(), "src/lib/payment/refund");
const WORKER_FILES = [
  "run-refund-execution-worker-cycle.ts",
  "worker-allocation.ts",
  "worker-contract.ts",
  "worker-preflight.ts",
  "worker-result-classification.ts",
  "worker-router.ts",
  "worker-selector.ts",
].map((name) => join(REFUND_ROOT, name));

describe("refund execution worker reachability", () => {
  it("has one dormant entrypoint and no production caller or REQUESTED-claim reachability", () => {
    const production = productionTypeScriptFiles(REFUND_ROOT);
    const invocations = occurrences(production, /runRefundExecutionWorkerCycle\s*\(/g);
    expect(invocations).toEqual(["run-refund-execution-worker-cycle.ts"]);
    expect(occurrences(WORKER_FILES, /claimRefundExecution|claimRefundAttemptForExecution/g))
      .toEqual([]);
  });

  it("routes through private factories without real transports, hosts, schedulers, or logging", () => {
    const source = WORKER_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).toContain("createTossRefundExecutionAuthorizer");
    expect(source).toContain("createTossRefundContactExecutor");
    expect(source).toContain("createTossRefundRecoveryOperation");
    expect(source).not.toMatch(/authorize-refund-dispatch|execute-toss-refund-contact|recover-toss-refund-execution/);
    expect(source).not.toMatch(/\bfetch\s*\(|console\.|setInterval|setTimeout|cron|scheduler|signal/iu);
  });
});

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function occurrences(files: readonly string[], pattern: RegExp): string[] {
  return files.flatMap((file) => readFileSync(file, "utf8").match(pattern)?.map(() => basename(file)) ?? []);
}
