import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionSourceFiles,
  repositoryPath,
  resolveRepositoryImport,
  reverseReachableFiles,
  walkProductionSource,
} from "./production-reachability-scanner";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/refund-worker-deployment-rehearsal.ts");
const REFUND_ROOT = join(ROOT, "src/lib/payment/refund");
const PROCESS = join(REFUND_ROOT, "refund-deployment-rehearsal-process.ts");
const RUNNER = join(REFUND_ROOT, "run-refund-deployment-rehearsal.ts");
const CHILD = join(REFUND_ROOT, "refund-deployment-rehearsal-child.ts");
const CONTRACT = join(REFUND_ROOT, "refund-deployment-rehearsal-contract.ts");
const ENVIRONMENT = join(REFUND_ROOT, "refund-deployment-rehearsal-environment.ts");
const EXIT_POLICY = join(REFUND_ROOT, "refund-deployment-exit-policy.ts");
const EXACT = join(REFUND_ROOT, "refund-deployment-rehearsal-exact.ts");
const DOCUMENT = join(ROOT, "docs/payment_policy/refund_worker_deployment_rehearsal_v1.md");
const RELATED_DOCUMENTS = Object.freeze([
  join(ROOT, "docs/payment_policy/refund_worker_operations_runbook_v1.md"),
  join(ROOT, "docs/payment_policy/refund_worker_host_v1.md"),
  join(ROOT, "docs/payment_policy/refund_worker_lifecycle_v1.md"),
  join(ROOT, "docs/payment_policy/refund_worker_observability_v1.md"),
]);

describe("refund deployment rehearsal reachability and documentation", () => {
  it("exposes exactly one inert no-argument package command", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) throw new Error("Invalid package scripts.");
    expect(packageJson.scripts["refund:worker:rehearse"]).toBe(
      "node --import tsx scripts/refund-worker-deployment-rehearsal.ts",
    );
    expect(packageJson.scripts).toMatchObject({
      "refund:worker:check": "node --import tsx scripts/refund-execution-worker.ts check",
      "refund:worker:health": "node --import tsx scripts/refund-execution-worker.ts health",
      "refund:worker:once": "node --import tsx scripts/refund-execution-worker.ts run-once",
      "refund:ops:manual": "node --import tsx scripts/refund-operations.ts manual",
      "refund:ops:reconcile": "node --import tsx scripts/refund-operations.ts reconcile",
      "refund:ops:credential": "node --import tsx scripts/refund-operations.ts credential",
    });
  });

  it("permits only the one-shot rehearsal graph and no application caller", () => {
    const files = productionSourceFiles();
    const exactReachability = new Map<string, readonly string[]>([
      [PROCESS, [PROCESS, SCRIPT]],
      [RUNNER, [RUNNER, PROCESS, SCRIPT]],
      [CHILD, [CHILD, RUNNER, PROCESS, SCRIPT]],
      [CONTRACT, [CONTRACT, RUNNER, PROCESS, SCRIPT]],
      [ENVIRONMENT, [ENVIRONMENT, RUNNER, PROCESS, SCRIPT]],
      [EXIT_POLICY, [EXIT_POLICY, RUNNER, PROCESS, SCRIPT]],
      [EXACT, [EXACT, CONTRACT, ENVIRONMENT, RUNNER, PROCESS, SCRIPT]],
    ]);
    for (const [target, expected] of exactReachability) {
      expect(reverseReachableFiles(target, files).map(repositoryPath).sort())
        .toEqual(expected.map(repositoryPath).sort());
    }
  });

  it("contains no provider, mutation, scheduler, lock, web, or recurring capability", () => {
    const source = [SCRIPT, PROCESS, RUNNER, CHILD, CONTRACT, ENVIRONMENT, EXIT_POLICY, EXACT]
      .map((path) => readFileSync(path, "utf8")).join("\n");
    const executableSource = [SCRIPT, PROCESS, RUNNER, CHILD, ENVIRONMENT, EXIT_POLICY]
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toMatch(
      /createToss|refund-cancellation-http|refund-lookup-http|globalThis\.fetch|NextResponse|use server/iu,
    );
    expect(executableSource).not.toMatch(
      /setInterval|cron|scheduler|daemon|heartbeat|advisory lock|flock|lockfile/iu,
    );
    expect(source).not.toMatch(
      /refundExecution(?:Command|Evidence|DispatchAttempt|CommandEvent)\.(?:create|update|delete|upsert)/u,
    );
  });

  it.each([
    ["TypeScript route static import", "src/app/api/rehearsal/route.ts", CONTRACT, 'import "../../../lib/payment/refund/refund-deployment-rehearsal-contract";'],
    ["TSX Server Action re-export", "src/app/actions/rehearsal.tsx", ENVIRONMENT, 'export * from "../../lib/payment/refund/refund-deployment-rehearsal-environment";'],
    ["JavaScript require", "src/contest/rehearsal-caller.js", EXIT_POLICY, 'require("../lib/payment/refund/refund-deployment-exit-policy");'],
    ["JSX static import", "src/widgets/rehearsal-caller.jsx", CONTRACT, 'import "../lib/payment/refund/refund-deployment-rehearsal-contract";'],
    ["MJS dynamic import", "src/monitor/rehearsal-caller.mjs", CHILD, 'void import("../lib/payment/refund/refund-deployment-rehearsal-child");'],
    ["CJS require", "scripts/rehearsal-caller.cjs", EXACT, 'require("../src/lib/payment/refund/refund-deployment-rehearsal-exact");'],
    ["production queue", "src/queue/refund-rehearsal.js", CHILD, 'require("../lib/payment/refund/refund-deployment-rehearsal-child");'],
    ["production scheduler", "src/scheduler/refund-rehearsal.mjs", ENVIRONMENT, 'import "../lib/payment/refund/refund-deployment-rehearsal-environment";'],
    ["worker cycle", "src/lib/payment/refund/run-refund-execution-worker-cycle.ts", EXIT_POLICY, 'import "./refund-deployment-exit-policy";'],
  ])("detects a prohibited %s through the shared scanner", async (
    _name, callerPath, targetPath, source,
  ) => {
    const root = await mkdtemp(join(tmpdir(), "mira-rehearsal-reachability-"));
    const target = join(root, repositoryPath(targetPath));
    const caller = join(root, callerPath);
    try {
      await Promise.all([mkdir(dirname(target), { recursive: true }), mkdir(dirname(caller), { recursive: true })]);
      await Promise.all([writeFile(target, "export const process = true;\n"), writeFile(caller, `${source}\n`)]);
      expect(reverseReachableFiles(target, [target, caller])).toContain(caller);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an explicit daemon-like production caller from the exact child graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "mira-rehearsal-daemon-reachability-"));
    const target = join(
      root, "src/lib/payment/refund/refund-deployment-rehearsal-child.ts",
    );
    const caller = join(root, "src/daemon/refund-deployment-rehearsal-daemon.ts");
    const specifier = "../lib/payment/refund/refund-deployment-rehearsal-child";
    try {
      await Promise.all([
        mkdir(dirname(target), { recursive: true }),
        mkdir(dirname(caller), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(target, "export const childSupervisor = true;\n"),
        writeFile(caller, `import ${JSON.stringify(specifier)};\n`),
      ]);

      const productionFiles = walkProductionSource(join(root, "src"));
      expect(productionFiles.sort()).toEqual([caller, target].sort());
      expect(resolveRepositoryImport(caller, specifier)).toBe(target);
      const actualCallers = reverseReachableFiles(target, productionFiles).sort();
      expect(actualCallers).toEqual([caller, target].sort());
      expect(actualCallers).not.toEqual([target]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("freezes activation blocking, simulations, emergency stop, rollback, and P3E gates", () => {
    const document = readFileSync(DOCUMENT, "utf8").replace(/\s+/gu, " ");
    for (const phrase of [
      "implemented provider-free rehearsal; activation blocked",
      "npm run refund:worker:rehearse",
      "wig_platform_test",
      "OVERLAP_SKIP_NOT_PROVEN",
      "EXTERNAL_HARD_DEADLINE_NOT_PROVEN",
      "STOP_AND_RECONCILE_POSSIBLE_CONTACT",
      "never rolls migrations back automatically",
      "P3D success alone does not authorize P3E",
      "Repository code does not disable an external scheduler",
      "actual platform launch environment are not proven and are intentionally not blocker-enum values",
      "check and health. Manual, reconcile, credential, and disabled run-once are skipped",
    ]) expect(document).toContain(phrase);
    for (const blocker of [
      "SCHEDULER_DEPLOYMENT_NOT_PROVEN",
      "OVERLAP_SKIP_NOT_PROVEN",
      "EXTERNAL_HARD_DEADLINE_NOT_PROVEN",
      "MONITORING_INGESTION_NOT_PROVEN",
      "ALERT_DESTINATION_NOT_PROVEN",
      "OPERATIONS_OWNERSHIP_NOT_PROVEN",
      "MANUAL_RESOLUTION_AUTHORITY_NOT_PROVEN",
      "PROVIDER_RECONCILIATION_AUTHORITY_NOT_PROVEN",
      "HISTORICAL_CREDENTIAL_RESOLUTION_UNSUPPORTED",
      "P3E_SANDBOX_CANARY_NOT_AUTHORIZED",
    ]) expect(document).toContain(blocker);
  });

  it("keeps the P3D capability, evidence, authorization, and P3E status consistent", () => {
    const documents = [DOCUMENT, ...RELATED_DOCUMENTS]
      .map((path) => readFileSync(path, "utf8").replace(/\s+/gu, " "));
    for (const document of documents) {
      expect(document).toMatch(/P3D[^.]{0,100}(?:capability is implemented|implemented provider-free)/iu);
      expect(document).toMatch(/actual deployment evidence (?:is|remains) absent/iu);
      expect(document).toMatch(/activation remains (?:`BLOCKED`|blocked)/iu);
      expect(document).toMatch(/(?:P3E[^.]{0,100}unimplemented|No P3E provider canary exists)/iu);
      expect(document).toMatch(/P3E[^.]{0,100}unauthorized/iu);
    }
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
