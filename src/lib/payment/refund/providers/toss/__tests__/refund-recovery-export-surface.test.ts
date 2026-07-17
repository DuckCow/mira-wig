import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import * as publicRecovery from "../recover-toss-refund-execution";

const PROJECT_ROOT = process.cwd();
const FEATURE_ROOT = path.join(PROJECT_ROOT, "src/lib/payment/refund/providers/toss");

describe("Toss recovery export and reachability boundary", () => {
  it("exposes exactly one runtime recovery operation", () => {
    expect(isDeepStrictEqual(Object.keys(publicRecovery), ["recoverTossRefundExecution"]))
      .toBe(true);
    expect("createTossRefundRecoveryOperation" in publicRecovery).toBe(false);
    expect("acquireTossRecoveryFence" in publicRecovery).toBe(false);
    expect("applyTossRecoveryLookupSuccess" in publicRecovery).toBe(false);
    expect("parkTossRecoveryProviderConflict" in publicRecovery).toBe(false);
  });

  it("has no production route, action, admin, worker, reconciliation, or script caller", () => {
    const production = productionTypeScriptFiles(path.join(PROJECT_ROOT, "src"));
    const callers = production.filter((file) => (
      !file.endsWith("recover-toss-refund-execution.ts")
        && readFileSync(file, "utf8").includes("recoverTossRefundExecution")
    ));
    expect(callers).toEqual([]);
    const packageAndScripts = [
      path.join(PROJECT_ROOT, "package.json"),
      ...optionalTypeScriptFiles(path.join(PROJECT_ROOT, "scripts")),
    ];
    expect(packageAndScripts.filter((file) => (
      readFileSync(file, "utf8").includes("recoverTossRefundExecution")
    ))).toEqual([]);
  });

  it("keeps each persistence authority internal and singly reachable", () => {
    expect(ownerBasenames("createTossRefundRecoveryOperation")).toEqual([
      "recover-toss-refund-execution.ts",
      "refund-recovery-orchestrator.ts",
    ]);
    expect(ownerBasenames("acquireTossRecoveryFence")).toEqual([
      "refund-recovery-fence.ts",
      "refund-recovery-orchestrator.ts",
    ]);
    expect(ownerBasenames("applyTossRecoveryLookupSuccess")).toEqual([
      "refund-recovery-orchestrator.ts",
      "refund-recovery-result-application.ts",
    ]);
    expect(ownerBasenames("parkTossRecoveryProviderConflict")).toEqual([
      "refund-recovery-conflict-parking.ts",
      "refund-recovery-orchestrator.ts",
    ]);
  });

  it("retains zero public ordinal-admission or cancellation-POST bridge", () => {
    const publicSource = readFileSync(
      path.join(FEATURE_ROOT, "recover-toss-refund-execution.ts"),
      "utf8",
    );
    expect(publicSource).not.toContain("refund-recovery-ordinal-plan");
    expect(publicSource).not.toContain("refund-cancellation-http");
    expect(publicSource).not.toContain("executeTossRefundContact");
  });
});

function ownerBasenames(symbol: string): string[] {
  return productionTypeScriptFiles(FEATURE_ROOT)
    .filter((file) => readFileSync(file, "utf8").includes(symbol))
    .map((file) => path.basename(file))
    .sort();
}

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionTypeScriptFiles(absolute);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function optionalTypeScriptFiles(root: string): string[] {
  try {
    return productionTypeScriptFiles(root);
  } catch {
    return [];
  }
}
