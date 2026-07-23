import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionSourceFiles,
  repositoryPath,
  reverseReachableFiles,
  walkProductionSource,
} from "./production-reachability-scanner";

const ROOT = process.cwd();
const REFUND_ROOT = join(ROOT, "src/lib/payment/refund");
const OPERATIONS_FILES = [
  "refund-operations-contract.ts",
  "refund-operations-credential.ts",
  "refund-operations-manual.ts",
  "refund-operations-process.ts",
  "refund-operations-reconciliation.ts",
  "run-refund-operations-host.ts",
].map((file) => join(REFUND_ROOT, file));
const SCRIPT = join(ROOT, "scripts/refund-operations.ts");
const RUNBOOK = join(ROOT, "docs/payment_policy/refund_worker_operations_runbook_v1.md");
const OBSERVABILITY = join(ROOT, "docs/payment_policy/refund_worker_observability_v1.md");
const HOST_DOCUMENT = join(ROOT, "docs/payment_policy/refund_worker_host_v1.md");
const LIFECYCLE_DOCUMENT = join(ROOT, "docs/payment_policy/refund_worker_lifecycle_v1.md");
const CONTRACT = join(REFUND_ROOT, "refund-operations-contract.ts");
const CREDENTIAL = join(REFUND_ROOT, "refund-operations-credential.ts");
const MANUAL = join(REFUND_ROOT, "refund-operations-manual.ts");
const RECONCILIATION = join(REFUND_ROOT, "refund-operations-reconciliation.ts");
const HOST = join(REFUND_ROOT, "run-refund-operations-host.ts");
const PROCESS = join(REFUND_ROOT, "refund-operations-process.ts");
const REHEARSAL_RUNNER = join(REFUND_ROOT, "run-refund-deployment-rehearsal.ts");
const REHEARSAL_PROCESS = join(REFUND_ROOT, "refund-deployment-rehearsal-process.ts");
const REHEARSAL_SCRIPT = join(ROOT, "scripts/refund-worker-deployment-rehearsal.ts");
const REHEARSAL_CHAIN = [REHEARSAL_RUNNER, REHEARSAL_PROCESS, REHEARSAL_SCRIPT];
const PREFLIGHT_RUNNER = join(REFUND_ROOT, "run-refund-sandbox-provider-free-preflight.ts");
const PREFLIGHT_PROCESS = join(REFUND_ROOT, "refund-sandbox-provider-free-preflight-process.ts");
const PREFLIGHT_SCRIPT = join(ROOT, "scripts/refund-sandbox-provider-free-preflight.ts");
const PREFLIGHT_CHAIN = [PREFLIGHT_RUNNER, PREFLIGHT_PROCESS, PREFLIGHT_SCRIPT];
const APPROVED_OPERATIONS_GRAPH = [
  CONTRACT, CREDENTIAL, MANUAL, RECONCILIATION, HOST, PROCESS, SCRIPT,
  ...REHEARSAL_CHAIN, ...PREFLIGHT_CHAIN,
].map(repositoryPath).sort();

describe("refund operations reachability and runbook", () => {
  it("exposes only the three separate direct operations commands", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = packageScripts(packageJson);
    expect(Object.fromEntries(Object.entries(scripts).filter(([name]) => name.startsWith("refund:ops:"))))
      .toEqual({
        "refund:ops:manual": "node --import tsx scripts/refund-operations.ts manual",
        "refund:ops:reconcile": "node --import tsx scripts/refund-operations.ts reconcile",
        "refund:ops:credential": "node --import tsx scripts/refund-operations.ts credential",
      });
  });

  it("keeps operations provider-free, nonrecurring, non-web, and separate from payment reconciliation", () => {
    const source = [...OPERATIONS_FILES, SCRIPT].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(
      /createTossRefund(?:Lookup|Cancellation)|provider-port|refund-cancellation-http|refund-lookup-http|payment\/reconciliation/iu,
    );
    expect(source).not.toMatch(
      /setInterval|setTimeout|cron|scheduler|daemon|heartbeat|NextResponse|route\.ts|server action|use server/iu,
    );
    expect(source).not.toMatch(
      /refundExecution(?:Command|Evidence|DispatchAttempt|CommandEvent)\.(?:create|update|delete|upsert)/u,
    );
    expect(source).not.toContain("readSecretKey");
    expect(readFileSync(join(ROOT, "scripts/payment-reconcile.ts"), "utf8"))
      .toContain("reconcilePaymentCore");
  });

  it("permits only the privileged one-shot operations graph to reach its contract and commands", () => {
    const files = productionSourceFiles();
    expect(reverseReachableFiles(CONTRACT, files).map(repositoryPath).sort())
      .toEqual(APPROVED_OPERATIONS_GRAPH);
    for (const target of [CREDENTIAL, MANUAL, RECONCILIATION]) {
      expect(reverseReachableFiles(target, files).map(repositoryPath).sort()).toEqual(
        [target, HOST, PROCESS, SCRIPT, ...PREFLIGHT_CHAIN].map(repositoryPath).sort(),
      );
    }
    expect(reverseReachableFiles(HOST, files).map(repositoryPath).sort())
      .toEqual([HOST, PROCESS, SCRIPT].map(repositoryPath).sort());
    expect(reverseReachableFiles(PROCESS, files).map(repositoryPath).sort())
      .toEqual([PROCESS, SCRIPT].map(repositoryPath).sort());
    expect(APPROVED_OPERATIONS_GRAPH.some((path) => path.startsWith("src/app/"))).toBe(false);
  });

  it("has no package lifecycle hook or GitHub workflow that reaches privileged operations", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = packageScripts(packageJson);
    const lifecycleScripts = Object.entries(scripts).filter(([name]) => (
      /^(?:pre|post)?(?:start|dev|build|install|prepare)$/u.test(name)
    ));
    const workflows = repositoryText(join(ROOT, ".github"));
    expect(lifecycleScripts.map((entry) => entry[1]).join("\n"))
      .not.toMatch(/refund:ops:|refund-operations/u);
    expect(workflows).not.toMatch(/refund:ops:|refund-operations/u);
  });

  it.each([
    ["TypeScript route static import", "app/api/refunds/route.ts", 'import "../../../operations";'],
    ["TSX Server Action re-export", "app/actions/refunds.tsx", '"use server"; export * from "../../operations";'],
    ["JavaScript require", "contest/caller.js", 'require("../operations");'],
    ["MJS dynamic import", "monitor/caller.mjs", 'void import("../operations");'],
    ["CJS require", "queue/caller.cjs", 'require("../operations");'],
  ])("detects a prohibited %s caller", async (_name, callerPath, source) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-operations-reachability-"));
    const target = join(fixtureRoot, "operations.ts");
    const caller = join(fixtureRoot, callerPath);
    try {
      await mkdir(dirname(caller), { recursive: true });
      await Promise.all([
        writeFile(target, "export const operations = true;\n"),
        writeFile(caller, `${source}\n`),
      ]);
      expect(reverseReachableFiles(target, [target, caller])).toContain(caller);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("discovers a prohibited production JSX static import while excluding exact tests", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-operations-jsx-discovery-"));
    const sourceRoot = join(fixtureRoot, "src");
    const target = join(sourceRoot, "lib/payment/refund/run-refund-operations-host.ts");
    const caller = join(sourceRoot, "contest/refund-operations-caller.jsx");
    const testDirectoryCaller = join(sourceRoot, "__tests__/refund-operations-caller.jsx");
    const testBasenameCaller = join(sourceRoot, "contest/refund-operations-caller.test.jsx");
    try {
      await Promise.all([
        mkdir(dirname(target), { recursive: true }),
        mkdir(dirname(caller), { recursive: true }),
        mkdir(dirname(testDirectoryCaller), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(target, "export async function runRefundOperationsHost() { return undefined; }\n"),
        writeFile(caller, [
          'import { runRefundOperationsHost } from "../lib/payment/refund/run-refund-operations-host";',
          "export function ForbiddenOperationsCaller() {",
          "  void runRefundOperationsHost;",
          "  return null;",
          "}",
          "",
        ].join("\n")),
        writeFile(testDirectoryCaller, 'import "../lib/payment/refund/run-refund-operations-host";\n'),
        writeFile(testBasenameCaller, 'import "../lib/payment/refund/run-refund-operations-host";\n'),
      ]);

      const files = walkProductionSource(sourceRoot);

      expect(files).toContain(target);
      expect(files).toContain(caller);
      expect(files).not.toContain(testDirectoryCaller);
      expect(files).not.toContain(testBasenameCaller);
      expect(reverseReachableFiles(target, files)).toContain(caller);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("detects prohibited extensionless and directory-index reachability", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "mira-operations-index-reachability-"));
    const target = join(fixtureRoot, "operations.ts");
    const bridgeDirectory = join(fixtureRoot, "startup");
    const bridge = join(bridgeDirectory, "index.jsx");
    const caller = join(fixtureRoot, "entrypoint.ts");
    try {
      await mkdir(bridgeDirectory);
      await Promise.all([
        writeFile(target, "export const operations = true;\n"),
        writeFile(bridge, 'export * from "../operations";\n'),
        writeFile(caller, 'import "./startup";\n'),
      ]);
      expect(reverseReachableFiles(target, [target, bridge, caller]).sort())
        .toEqual([target, bridge, caller].sort());
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("freezes roles, SLAs, deadlines, rotation gate, and every unsatisfied activation item", () => {
    const runbook = readFileSync(RUNBOOK, "utf8");
    const normalizedRunbook = runbook.replace(/\s+/gu, " ");
    for (const required of [
      "Status: implemented but dormant.",
      "REFUND_OPERATIONS_OWNER",
      "PAYMENT_ENGINEERING_OWNER",
      "INCIDENT_COMMANDER",
      "CREDENTIAL_OWNER",
      "15 minutes",
      "30 minutes",
      "4 hours",
      "warning at 10 days",
      "critical at 12 days",
      "hard recovery deadline at 13 days",
      "exact durable `RefundAttempt.id`",
      "complete distinct qualifying-case count",
      "untrusted privileged operator data",
      "parse the JSON record and treat the reference only as data",
      "terminal markup, a command, SQL, a filesystem path, or a URL",
      "SINGLE_ACTIVE_ONLY",
      "24-hour safety buffer",
      "separately authorized durable external evidence",
      "old credential generation",
      "exact latest possible-contact case reference",
      "authoritative timestamp for that case's latest possible contact",
      "evidence source establishing the generation/case/time relationship",
      "Failure to establish the generation/case/time evidence binding",
      "forbids revocation",
      "revocation readiness remains `NOT_PROVABLE`",
      "A zero queue, a zero current backlog, or a newly configured credential does not prove",
      "not guarantees or current SLAs",
      "No timer, staffed window, alert destination, owner, acknowledgement",
      "150-second external hard deadline",
      "P3D provider-free rehearsal capability is implemented",
      "successful P3D rehearsal evidence for the exact release candidate",
      "separately authorized P3E SANDBOX canary",
      "Operators must never edit the database directly.",
    ]) expect(normalizedRunbook).toContain(required);
    expect(runbook).not.toMatch(/\[[xX]\]/u);
    const observability = readFileSync(OBSERVABILITY, "utf8");
    const normalizedObservability = observability.replace(/\s+/gu, " ");
    const host = readFileSync(HOST_DOCUMENT, "utf8");
    const lifecycle = readFileSync(LIFECYCLE_DOCUMENT, "utf8");
    expect(observability).not.toContain("warning margin remains a P3C2 operational decision");
    for (const required of [
      "warning at 10 days",
      "critical at 12 days",
      "hard recovery deadline is 13 days",
      "no separate hard-deadline classification",
      "do not prove provider truth",
      "no metrics consumer",
    ]) expect(normalizedObservability).toContain(required);
    expect(host).toContain("exactly the durable refund-attempt identifier");
    expect(host).toContain("complete distinct `caseCount`");
    expect(lifecycle).toContain("add no lifecycle timer");
    expect(lifecycle).toContain("revocation calculation");
  });
});

function packageScripts(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.scripts)) throw new Error("Invalid package scripts.");
  return value.scripts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repositoryText(root: string): string {
  if (!existsSync(root)) return "";
  return readdirSync(root, { withFileTypes: true }).map((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? repositoryText(path) : readFileSync(path, "utf8");
  }).join("\n");
}
