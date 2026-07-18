import { readdirSync, readFileSync } from "fs";
import path from "path";
import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import * as publicAuthority from "../authorize-refund-dispatch";

const PROJECT_ROOT = process.cwd();
const TOSS_FEATURE_ROOT = path.join(
  PROJECT_ROOT,
  "src/lib/payment/refund/providers/toss",
);
const PUBLIC_AUTHORITY_FILE = path.join(TOSS_FEATURE_ROOT, "authorize-refund-dispatch.ts");

describe("Toss refund authorization export and reachability boundary", () => {
  it("exposes only the public authority-bearing operation at runtime", () => {
    expect(isDeepStrictEqual(Object.keys(publicAuthority), [
      "authorizeTossRefundExecutionDispatch",
    ])).toBe(true);
    expect("createTossRefundExecutionAuthorizer" in publicAuthority).toBe(false);
    expect("TossRefundAuthorizerDependencies" in publicAuthority).toBe(false);
  });

  it("keeps the persistence-coupled factory out of public exports", () => {
    const source = readFileSync(PUBLIC_AUTHORITY_FILE, "utf8");

    expect(/export\s+(?:function|const)\s+createTossRefundExecutionAuthorizer/.test(source))
      .toBe(false);
    expect(/export\s+type\s+TossRefundAuthorizerDependencies/.test(source)).toBe(false);
  });

  it("allows only the dormant worker router to import the internal orchestrator", () => {
    const outsideFeature = productionTypeScriptFiles(path.join(PROJECT_ROOT, "src"))
      .filter((file) => !file.startsWith(`${TOSS_FEATURE_ROOT}${path.sep}`));
    const importingFiles = outsideFeature.filter((file) => (
      readFileSync(file, "utf8").includes("refund-authorization-orchestrator")
    ));

    expect(importingFiles.map((file) => path.basename(file))).toEqual(["worker-router.ts"]);
  });

  it("limits the internal factory to its definition and the public authority owner", () => {
    const productionFiles = productionTypeScriptFiles(TOSS_FEATURE_ROOT);
    const owners = productionFiles.filter((file) => (
      readFileSync(file, "utf8").includes("createTossRefundExecutionAuthorizer")
    ));
    const ownerBasenames = owners.map((file) => path.basename(file)).sort();

    expect(isDeepStrictEqual(ownerBasenames, [
      "authorize-refund-dispatch.ts",
      "refund-authorization-orchestrator.ts",
    ])).toBe(true);
  });
});

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionTypeScriptFiles(absolute);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}
