import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PaymentMode, PaymentProvider } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS } from "../refund-deployment-rehearsal-contract";
import { REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES } from "../run-refund-deployment-rehearsal";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
} from "./refund-dispatch-fixture";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/refund-worker-deployment-rehearsal.ts");
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let alternateCwd = "";

beforeAll(async () => {
  requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  alternateCwd = await mkdtemp(join(tmpdir(), "mira-refund-rehearsal-import-"));
  await Promise.all([
    writeFile(join(alternateCwd, ".env"), [
      "REFUND_EXECUTION_WORKER_ENABLED=ENABLED",
      "TOSS_SANDBOX_SECRET_KEY=must-not-load",
      "DATABASE_URL=postgresql://forbidden.invalid/wig_platform",
    ].join("\n")),
    writeFile(join(alternateCwd, ".env.local"), "REFUND_EXECUTION_TOSS_CONTACT_ENABLED=ENABLED\n"),
    writeFile(join(alternateCwd, ".env.test"), "TOSS_FUTURE_CAPABILITY=must-not-load\n"),
  ]);
});

afterAll(async () => {
  if (alternateCwd) await rm(alternateCwd, { recursive: true, force: true });
});

describe("refund deployment rehearsal real package command", () => {
  it("imports inertly without output, process launch, timers, signals, environment, or dotenv", async () => {
    const result = await runProcess(process.execPath, [
      "--import", TSX_LOADER,
      "--input-type=module",
      "--eval", [
        'const beforeTerm = process.listenerCount("SIGTERM");',
        'const beforeInt = process.listenerCount("SIGINT");',
        `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
        'if (process.listenerCount("SIGTERM") !== beforeTerm) throw new Error("SIGTERM_LEAK");',
        'if (process.listenerCount("SIGINT") !== beforeInt) throw new Error("SIGINT_LEAK");',
      ].join("\n"),
    ], explicitEnvironment({ TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json") }), alternateCwd);

    expect(result).toEqual({ exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false });
  });

  it("runs all six real provider-free child stages and preserves every audited business row", async () => {
    const before = await auditedRefundBusinessRows();
    const result = await runProcess("npm", [
      "--prefix", ROOT, "run", "--silent", "refund:worker:rehearse",
    ], explicitEnvironment({
      DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL),
    }), alternateCwd, 210_000);
    const after = await auditedRefundBusinessRows();

    expect(result).toMatchObject({ exitCode: 0, signal: null, stderr: "", timedOut: false });
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.split("\n")).toHaveLength(2);
    const observed: unknown = JSON.parse(result.stdout);
    expect(observed).toEqual({
      ok: true,
      code: "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE",
      activation: "BLOCKED",
      providerExecution: "NOT_PERFORMED",
      checks: {
        readiness: "PASS",
        health: "PASS",
        manualReview: "PASS",
        reconciliation: "PASS",
        credentialLifecycle: "PASS",
        disabledRunOnce: "PASS",
        exitPolicy: "PASS",
        overlapPolicy: "SIMULATED_ONLY",
        hardDeadlinePolicy: "SIMULATED_ONLY",
      },
      blockers: REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS,
      process: {
        formatVersion: "mira-refund-deployment-rehearsal/v1",
        command: "REHEARSE",
        operationDurationMs: nonnegativeDurationMatcher,
      },
    });
    expect(result.stdout).not.toMatch(
      /caseRef|wig_platform|DATABASE_URL|TOSS|secret|credentialGeneration|merchant|providerOperation|Error:|at\s+\S+/iu,
    );
    expect(after).toEqual(before);
  }, 220_000);

  it("runs exactly check and health then bounds a real READY backlog without residue", async () => {
    const before = await auditedRefundBusinessRows();
    const fixture = await createDispatchFixture({
      provider: PaymentProvider.TOSS,
      mode: PaymentMode.SANDBOX,
    });
    const activityBefore = await otherDatabaseActivity();
    try {
      const result = await runProcess("npm", [
        "--prefix", ROOT, "run", "--silent", "refund:worker:rehearse",
      ], explicitEnvironment({
        DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL),
      }), alternateCwd, 210_000);

      expect(REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES.slice(0, 2).map((stage) => stage.stage))
        .toEqual(["READINESS", "HEALTH"]);
      expect(result).toMatchObject({ exitCode: 1, signal: null, stdout: "", timedOut: false });
      expect(result.stderr.endsWith("\n")).toBe(true);
      expect(result.stderr.split("\n")).toHaveLength(2);
      expect(JSON.parse(result.stderr)).toEqual({
        ok: false,
        code: "REHEARSAL_CHECK_FAILED",
        stage: "HEALTH",
        reason: "UNSAFE_BACKLOG",
        process: {
          formatVersion: "mira-refund-deployment-rehearsal/v1",
          command: "REHEARSE",
          operationDurationMs: nonnegativeDurationMatcher,
        },
      });
      expect(result.stderr).not.toMatch(
        /caseRef|wig_platform|DATABASE_URL|TOSS|secret|credential|providerOperation|Error:|at\s+\S+/iu,
      );
      expect(await otherDatabaseActivity()).toEqual(activityBefore);
      expect(await matchingRehearsalProcessCount()).toBe(0);
    } finally {
      await cleanupDispatchFixtures(fixture);
    }
    expect(await auditedRefundBusinessRows()).toEqual(before);
    expect((await otherDatabaseActivity()).openTransactions).toBe(0);
    expect(await matchingRehearsalProcessCount()).toBe(0);
  }, 220_000);
});

interface ProcessResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  deadlineMs = 10_000,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    const watchdog = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, deadlineMs);
    child.once("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(watchdog);
      resolve({ exitCode: code ?? 1, signal, stdout, stderr, timedOut });
    });
  });
}

function explicitEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const path = process.env.PATH;
  if (!path) throw new Error("PATH is required for the package-command test.");
  return Object.freeze({ PATH: path, NODE_ENV: "test", NO_COLOR: "1", ...overrides });
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for deployment rehearsal integration.");
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]" || parsed.hostname === "::1";
  if ((parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:")
    || !local || decodeURIComponent(parsed.pathname) !== "/wig_platform_test") {
    throw new Error("Deployment rehearsal integration is restricted to local wig_platform_test.");
  }
  return value;
}

async function auditedRefundBusinessRows() {
  return Promise.all([
    db.payment.findMany({ orderBy: { id: "asc" } }),
    db.order.findMany({ orderBy: { id: "asc" } }),
    db.customerRefundIntake.findMany({ orderBy: { id: "asc" } }),
    db.refundAttempt.findMany({ orderBy: { id: "asc" } }),
    db.refundAttemptTransition.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionCommand.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionCommandEvent.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionDispatchAttempt.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionProviderContactEligibilityProof.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionProviderOperationBinding.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionProviderEligibilityProof.findMany({ orderBy: { id: "asc" } }),
    db.refundExecutionEvidence.findMany({ orderBy: { id: "asc" } }),
    db.orderItem.findMany({ orderBy: { id: "asc" } }),
    db.orderShipping.findMany({ orderBy: { orderId: "asc" } }),
    db.manufacturingRequest.findMany({ orderBy: { id: "asc" } }),
    db.paymentOutbox.findMany({ orderBy: { id: "asc" } }),
    db.paymentEvent.findMany({ orderBy: { id: "asc" } }),
    db.webhookIngressRejection.findMany({ orderBy: { id: "asc" } }),
  ]);
}

async function otherDatabaseActivity(): Promise<Readonly<{
  sessions: number;
  openTransactions: number;
}>> {
  const rows = await db.$queryRaw<Array<{ sessions: number; openTransactions: number }>>`
    SELECT
      count(*)::int AS "sessions",
      count(*) FILTER (WHERE xact_start IS NOT NULL)::int AS "openTransactions"
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
  `;
  if (rows.length !== 1) throw new Error("Expected one database activity row.");
  return rows[0];
}

async function matchingRehearsalProcessCount(): Promise<number> {
  const result = await runProcess("pgrep", [
    "-fl", "refund-worker-deployment-rehearsal|refund-execution-worker.ts|refund-operations.ts",
  ], explicitEnvironment(), ROOT);
  if (result.exitCode === 1 && result.stdout === "" && result.stderr === "") return 0;
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error("Unable to inspect rehearsal child processes.");
  }
  return result.stdout.split("\n").filter((line) => line.length > 0).length;
}

const nonnegativeDurationMatcher = Object.freeze({
  asymmetricMatch: (value: unknown) => typeof value === "number"
    && Number.isSafeInteger(value) && value >= 0,
  toString: () => "NonnegativeSafeIntegerDuration",
});
