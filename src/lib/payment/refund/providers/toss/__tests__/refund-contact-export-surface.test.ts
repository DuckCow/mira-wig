import { readdirSync, readFileSync } from "fs";
import path from "path";
import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import * as publicContact from "../execute-toss-refund-contact";

const PROJECT_ROOT = process.cwd();
const FEATURE_ROOT = path.join(PROJECT_ROOT, "src/lib/payment/refund/providers/toss");

describe("Toss contact export and reachability boundary", () => {
  it("exposes exactly one runtime public operation", () => {
    expect(isDeepStrictEqual(Object.keys(publicContact), ["executeTossRefundContact"])).toBe(true);
    expect("createTossRefundContactExecutor" in publicContact).toBe(false);
    expect("applyTossContactSuccess" in publicContact).toBe(false);
    expect("createTossRefundCancellationPort" in publicContact).toBe(false);
  });

  it("has no route, action, admin, worker, script, or reconciliation caller", () => {
    const production = productionTypeScriptFiles(path.join(PROJECT_ROOT, "src"));
    const callers = production.filter((file) => (
      !file.endsWith("execute-toss-refund-contact.ts")
      && readFileSync(file, "utf8").includes("executeTossRefundContact")
    ));
    expect(callers).toEqual([]);
    const packageAndScripts = [
      path.join(PROJECT_ROOT, "package.json"),
      ...existingTypeScriptFiles(path.join(PROJECT_ROOT, "scripts")),
    ];
    expect(packageAndScripts.filter((file) => (
      readFileSync(file, "utf8").includes("executeTossRefundContact")
    ))).toEqual([]);
  });

  it("limits the internal orchestrator to its definition and public contact owner", () => {
    expect(ownerBasenames("createTossRefundContactExecutor")).toEqual([
      "execute-toss-refund-contact.ts",
      "refund-contact-orchestrator.ts",
    ]);
  });

  it("limits the private Toss E4 bridge to the successful contact continuation", () => {
    expect(ownerBasenames("applyTossContactSuccess")).toEqual([
      "refund-contact-orchestrator.ts",
      "refund-contact-result-application.ts",
    ]);
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

function existingTypeScriptFiles(root: string): string[] {
  try {
    return productionTypeScriptFiles(root);
  } catch {
    return [];
  }
}
