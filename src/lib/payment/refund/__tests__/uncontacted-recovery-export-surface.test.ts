import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import * as publicRecovery from "../reclaim-uncontacted-execution";

const PROJECT_ROOT = process.cwd();
const REFUND_ROOT = path.join(PROJECT_ROOT, "src/lib/payment/refund");

describe("uncontacted recovery export and reachability boundary", () => {
  it("exposes exactly one public runtime operation", () => {
    expect(isDeepStrictEqual(Object.keys(publicRecovery), [
      "reclaimUncontactedRefundExecution",
    ])).toBe(true);
    expect("performUncontactedRefundExecutionRecovery" in publicRecovery).toBe(false);
    expect("classifyUncontactedRefundExecutionState" in publicRecovery).toBe(false);
  });

  it("allows only the dormant worker router as a production caller", () => {
    const production = productionTypeScriptFiles(path.join(PROJECT_ROOT, "src"));
    const callers = production.filter((file) => (
      !file.endsWith("reclaim-uncontacted-execution.ts")
        && readFileSync(file, "utf8").includes("reclaimUncontactedRefundExecution")
    ));
    expect(callers.map((file) => path.basename(file))).toEqual(["worker-router.ts"]);
    const packageAndScripts = [
      path.join(PROJECT_ROOT, "package.json"),
      ...optionalTypeScriptFiles(path.join(PROJECT_ROOT, "scripts")),
    ];
    expect(packageAndScripts.filter((file) => (
      readFileSync(file, "utf8").includes("reclaimUncontactedRefundExecution")
    ))).toEqual([]);
  });

  it("keeps one private persistence owner and one private classifier seam", () => {
    expect(ownerBasenames("performUncontactedRefundExecutionRecovery")).toEqual([
      "reclaim-uncontacted-execution.ts",
      "uncontacted-recovery-persistence.ts",
    ]);
    expect(ownerBasenames("classifyUncontactedRefundExecutionState")).toEqual([
      "uncontacted-recovery-persistence.ts",
      "uncontacted-recovery-state.ts",
    ]);
    expect(ownerBasenames("randomBytes(32)")).toEqual([
      "acquire-lease.ts",
      "refund-recovery-fence.ts",
      "uncontacted-recovery-persistence.ts",
    ]);
  });

  it("contains no provider transport or E2C bridge in the public operation", () => {
    const source = readFileSync(
      path.join(REFUND_ROOT, "reclaim-uncontacted-execution.ts"),
      "utf8",
    );
    expect(source).not.toContain("fetch");
    expect(source).not.toContain("lookup");
    expect(source).not.toContain("cancellation");
    expect(source).not.toContain("worker");
    expect(source).not.toContain("scheduler");
  });
});

function ownerBasenames(symbol: string): string[] {
  return productionTypeScriptFiles(REFUND_ROOT)
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
