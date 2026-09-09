import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  productionSourceFiles,
  repositoryPath,
  reverseReachableFiles,
} from "./production-reachability-scanner";

const ROOT = process.cwd();
const REFUND = join(ROOT, "src/lib/payment/refund");
const ADMISSION = join(REFUND, "refund-provider-contact-admission.ts");
const HOST = join(REFUND, "run-refund-execution-worker-host.ts");
const HOST_PROCESS = join(REFUND, "worker-host-process.ts");
const HOST_SCRIPT = join(ROOT, "scripts/refund-execution-worker.ts");
const EXIMBAY_CANARY = join(REFUND, "run-eximbay-refund-canary-once.ts");
const EXIMBAY_CANARY_SCRIPT = join(ROOT, "scripts/eximbay-refund-canary.ts");
const EXIMBAY_REENTRY = join(REFUND, "run-eximbay-refund-reentry-once.ts");
const EXIMBAY_REENTRY_SCRIPT = join(ROOT, "scripts/eximbay-refund-reentry.ts");
const SUPERVISOR = join(REFUND, "refund-worker-container-supervisor.ts");
const PREFLIGHT_ADMISSION = join(REFUND, "refund-sandbox-provider-free-preflight-admission.ts");
const PREFLIGHT_RUNNER = join(REFUND, "run-refund-sandbox-provider-free-preflight.ts");
const PREFLIGHT_PROCESS = join(REFUND, "refund-sandbox-provider-free-preflight-process.ts");
const PREFLIGHT_SCRIPT = join(ROOT, "scripts/refund-sandbox-provider-free-preflight.ts");

describe("P3E-B privileged reachability", () => {
  it("permits only the reviewed worker, canary, re-entry and provider-free preflight chains to reach contact admission", () => {
    const files = productionSourceFiles();
    expect(reverseReachableFiles(ADMISSION, files).map(repositoryPath).sort()).toEqual([
      ADMISSION,
      EXIMBAY_CANARY,
      EXIMBAY_CANARY_SCRIPT,
      EXIMBAY_REENTRY,
      EXIMBAY_REENTRY_SCRIPT,
      SUPERVISOR,
      HOST,
      HOST_PROCESS,
      HOST_SCRIPT,
      PREFLIGHT_ADMISSION,
      PREFLIGHT_RUNNER,
      PREFLIGHT_PROCESS,
      PREFLIGHT_SCRIPT,
    ].map(repositoryPath).sort());
  });

  it("keeps preflight outside provider adapters, cycles, mutation entrypoints, and web callers", () => {
    const files = productionSourceFiles();
    expect(reverseReachableFiles(PREFLIGHT_RUNNER, files).map(repositoryPath).sort()).toEqual([
      PREFLIGHT_RUNNER, PREFLIGHT_PROCESS, PREFLIGHT_SCRIPT,
    ].map(repositoryPath).sort());
    const source = [PREFLIGHT_ADMISSION, PREFLIGHT_RUNNER, PREFLIGHT_PROCESS, PREFLIGHT_SCRIPT]
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toMatch(
      /createTossRefund(?:Lookup|Cancellation)|runRefundExecutionWorkerCycle|worker-selector|worker-router|readSecretKey|NextResponse|use server/iu,
    );
    expect(source).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/u);
  });

  it("exposes only the exact inert package command", () => {
    const packageJson: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = packageScripts(packageJson);
    expect(scripts["refund:sandbox:preflight"])
      .toBe("node --import tsx scripts/refund-sandbox-provider-free-preflight.ts");
    const script = readFileSync(PREFLIGHT_SCRIPT, "utf8");
    expect(script).toContain("pathToFileURL(process.argv[1]).href");
    expect(script).not.toMatch(/setInterval|setTimeout|spawn|exec|fetch\(/u);
  });

  it.each([
    ["route", "app/api/refunds/route.ts", 'import "../../../admission";'],
    ["Server Action", "app/actions/refunds.ts", '"use server"; import "../../admission";'],
    ["scheduler", "scheduler/refund.ts", 'import "../admission";'],
    ["queue", "queue/refund.mjs", 'void import("../admission");'],
    ["daemon", "daemon/refund.cjs", 'require("../admission");'],
    ["monitor", "monitor/refund.jsx", 'export * from "../admission";'],
  ])("detects a prohibited %s admission caller through the shared scanner", async (
    _name,
    callerPath,
    source,
  ) => {
    const fixture = await mkdtemp(join(tmpdir(), "mira-p3e-b-reachability-"));
    const target = join(fixture, "admission.ts");
    const caller = join(fixture, callerPath);
    try {
      await mkdir(dirname(caller), { recursive: true });
      await Promise.all([
        writeFile(target, "export const admission = true;\n"),
        writeFile(caller, `${source}\n`),
      ]);
      expect(reverseReachableFiles(target, [target, caller])).toContain(caller);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

function packageScripts(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.scripts)) throw new Error("INVALID_PACKAGE_JSON");
  return value.scripts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
