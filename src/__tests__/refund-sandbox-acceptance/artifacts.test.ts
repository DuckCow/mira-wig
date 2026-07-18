import {
  chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const planTest = vi.hoisted(() => Object.freeze({
  home: `${process.env.TMPDIR ?? "/private/tmp"}/mira-xp2-plan-${process.pid}`,
  runDatabaseCommand: vi.fn(),
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => planTest.home };
});

vi.mock("../../../scripts/refund-sandbox-acceptance/cli-runtime", () => ({
  runDatabaseCommand: planTest.runDatabaseCommand,
}));

import { db } from "../../lib/db";
import {
  H1_ARTIFACT_PARENT, H1ArtifactStore,
} from "../../../scripts/refund-sandbox-acceptance/artifact-store";
import {
  atomicCreateJson, readPrivateText,
} from "../../../scripts/refund-sandbox-acceptance/atomic-files";
import {
  ProviderCallBudget, type BudgetRecord,
} from "../../../scripts/refund-sandbox-acceptance/call-budget";
import { canonicalJson } from "../../../scripts/refund-sandbox-acceptance/canonical-json";
import { runCli } from "../../../scripts/refund-sandbox-acceptance/cli";
import { parseRunId } from "../../../scripts/refund-sandbox-acceptance/contracts";
import {
  assertSanitizedEvidence, RunRedactor,
} from "../../../scripts/refund-sandbox-acceptance/redaction";
import { RunLedgerStore, type H1Ledger } from "../../../scripts/refund-sandbox-acceptance/run-ledger";
import { buildSanitizedReport } from "../../../scripts/refund-sandbox-acceptance/sanitized-report";
import { deriveTossRefundCancellationWireRequest } from "../../lib/payment/refund/providers/toss/refund-wire-request";
import { deriveTossRefundOperationKey } from "../../lib/payment/refund/providers/toss/refund-operation-key";

const RUN_ID = "sbx-20260718T010203Z-0123456789abcdef";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("refund SANDBOX acceptance protected artifacts", () => {
  it("creates only private run directories and files", async () => {
    const store = await createStore();
    await store.assertModes();
    await store.writeRaw("bounded.json", { kind: "fake" });
    await store.assertModes();
  });

  it("plans with the real CLI only inside an isolated temporary HOME", async () => {
    const actualOs = await vi.importActual<typeof import("node:os")>("node:os");
    const operatorParent = join(actualOs.homedir(), ".mira", "refund-sandbox-acceptance");
    const operatorBefore = await safeMetadata(operatorParent);
    const originalFetch = fetch;
    const network = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", network);
    planTest.runDatabaseCommand.mockClear();
    await rm(planTest.home, { recursive: true, force: true });
    await mkdir(planTest.home, { recursive: true, mode: 0o700 });
    try {
      const result = await runCli(["plan"], {});
      expect(result.code).toBe("RUN_PLANNED");
      expect(typeof result.runId).toBe("string");
      if (!result.runId) throw new Error("PLAN_RUN_ID_MISSING");
      expect(parseRunId(result.runId)).toBe(result.runId);
      const runDirectory = join(H1_ARTIFACT_PARENT, result.runId);
      expect(isWithin(runDirectory, planTest.home)).toBe(true);
      expect(isWithin(runDirectory, process.cwd())).toBe(false);
      expect((await stat(runDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(join(runDirectory, "fixtures.json"))).mode & 0o777).toBe(0o600);
      expect((await stat(join(runDirectory, "raw", "hmac.key"))).mode & 0o777).toBe(0o600);
      for (const directory of ["ledger", "raw", "sealed", "sanitized", "locks"]) {
        const metadata = await stat(join(runDirectory, directory));
        expect(metadata.isDirectory()).toBe(true);
        expect(metadata.mode & 0o777).toBe(0o700);
      }
      expect((await readdir(H1_ARTIFACT_PARENT)).sort()).toEqual([result.runId]);
      expect(planTest.runDatabaseCommand).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(await safeMetadata(operatorParent)).toEqual(operatorBefore);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
      await rm(planTest.home, { recursive: true, force: true });
    }
  });

  it("rejects symbolic links anywhere in the protected artifact tree", async () => {
    const store = await createStore();
    await symlink(store.path("fixtures.json"), store.path("raw", "forbidden-link"));
    await expect(store.assertModes()).rejects.toThrow("ARTIFACT_SYMLINK_FORBIDDEN");
  });

  it("writes chained atomic revisions and recovers the last valid revision", async () => {
    const store = await createStore();
    const ledger = new RunLedgerStore(store.path("ledger"));
    const first = await ledger.append(ledgerInput("PLANNED"));
    const second = await ledger.append(ledgerInput("BOOTSTRAPPED"));
    expect(second.previousLedgerHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await ledger.loadLatest())?.revision).toBe(2);
    await writeFile(store.path("ledger", "revision-000003.json"), "{interrupted", { mode: 0o600 });
    await chmod(store.path("ledger", "revision-000003.json"), 0o600);
    expect(await ledger.loadLatest()).toEqual(second);
    await expect(ledger.append(ledgerInput("BOOTSTRAPPED")))
      .rejects.toThrow("IMMUTABLE_FILE_MISMATCH");
    expect(first.revision).toBe(1);
  });

  it("records call intent before invocation and blocks a POST beyond the S6 budget", async () => {
    const observed: string[] = [];
    const budget = new ProviderCallBudget((entry) => {
      observed.push(entry.phase);
      return Promise.resolve();
    });
    await budget.invoke("S1", "GET", () => {
      observed.push("CALLED");
      return Promise.resolve("fake");
    });
    expect(observed).toEqual(["INTENT", "CALLED", "COMPLETED"]);
    let contacted = false;
    await expect(budget.invoke("S6", "POST", () => {
      contacted = true;
      return Promise.resolve();
    })).rejects.toThrow("PROVIDER_BUDGET_EXCEEDED");
    expect(contacted).toBe(false);
  });

  it("counts only completed calls while ambiguous intents consume the hard ceiling", async () => {
    const budget = new ProviderCallBudget();
    await budget.invoke("S1", "POST", () => Promise.resolve("fake"));
    expect(budget.counts("S1")).toEqual({ GET: 0, POST: 1 });
    await expect(budget.invoke("S1", "POST", () => Promise.resolve("forbidden")))
      .rejects.toThrow("PROVIDER_BUDGET_EXCEEDED");
  });

  it("pins POST path, canonical body, operation key, and committed wire fingerprint before contact", async () => {
    const records: BudgetRecord[] = [];
    const budget = new ProviderCallBudget((entry) => {
      records.push(entry);
      return Promise.resolve();
    });
    const wire = deriveTossRefundCancellationWireRequest({
      paymentKey: "protected-payment",
      providerOperationKey: deriveTossRefundOperationKey("protected-logical-operation"),
      cancelAmount: 1_000,
    });
    await budget.wrapCancellation("S1", () => Promise.resolve(Object.freeze({ kind: "unknown" })))(
      Object.freeze({ authorization: "not-recorded", wire }),
    );
    const first = records[0];
    expect(first?.phase).toBe("INTENT");
    expect(first?.request.path).toBe(wire.path);
    expect(first?.request.canonicalBody).toBe(JSON.stringify(wire.body));
    expect(first?.request.operationKey).toBe(wire.idempotencyKey);
    expect(first?.request.wireFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(records)).not.toContain("not-recorded");
  });

  it("uses per-run HMAC values rather than unsalted identifier hashes", () => {
    const first = new RunRedactor(Buffer.alloc(32, 1));
    const second = new RunRedactor(Buffer.alloc(32, 2));
    expect(first.hmac("protected-id")).toBe(first.hmac("protected-id"));
    expect(first.hmac("protected-id")).not.toBe(second.hmac("protected-id"));
  });

  it("builds, validates, canonically seals, and immutably preserves sanitized evidence", async () => {
    const store = await createStore();
    await store.writeRaw("synthetic-response.json", { kind: "fake-only" });
    const paymentPreimage = "synthetic-payment-preimage";
    const operationPreimage = "synthetic-operation-preimage";
    const report = await buildReport(store, paymentPreimage, [operationPreimage, operationPreimage]);
    expect(() => assertSanitizedEvidence(report)).not.toThrow();
    expect(report.booleans).toEqual(expect.objectContaining({
      sameOperationKey: true,
      sameBody: true,
      sameTransactionKey: null,
    }));
    const serialized = canonicalJson(report);
    const sealedPath = store.path("sealed", "S3.json");
    await atomicCreateJson(sealedPath, report);
    const sealed = await readPrivateText(sealedPath);
    expect(sealed).toBe(`${serialized}\n`);
    expect((await stat(sealedPath)).mode & 0o777).toBe(0o600);
    expect(sealed.includes(paymentPreimage)).toBe(false);
    expect(sealed.includes(operationPreimage)).toBe(false);
    expect(sealed.includes(String(report.paymentKeyHmac))).toBe(true);
    expect(sealed.includes(String(report.operationKeyHmac))).toBe(true);
    await expect(atomicCreateJson(sealedPath, { ...report, completionMarker: "CHANGED" }))
      .rejects.toThrow("IMMUTABLE_FILE_MISMATCH");

    const differing = await buildReport(store, paymentPreimage, [
      "synthetic-operation-first", "synthetic-operation-second",
    ]);
    expect(differing.booleans).toEqual(expect.objectContaining({
      sameOperationKey: false,
      sameBody: true,
      sameTransactionKey: null,
    }));
  });
});

async function createStore(): Promise<H1ArtifactStore> {
  const root = await mkdtemp(join(tmpdir(), "mira-h1-artifacts-"));
  roots.push(root);
  const store = new H1ArtifactStore(root, RUN_ID);
  await store.initialize();
  return store;
}

function ledgerInput(phase: "PLANNED" | "BOOTSTRAPPED") {
  return {
    runId: RUN_ID,
    scenarioId: "S1" as const,
    phase,
    repositoryCommit: "62ad6d709c0db767732e8cf2abd4ddbeeba08031",
    runnerSourceHash: "a".repeat(64),
    policyHashes: Object.freeze({ policy: "b".repeat(64) }),
    migrationFingerprint: "c".repeat(64),
    scenarioInputHash: "d".repeat(64),
    payload: Object.freeze({}),
  };
}

async function buildReport(
  store: H1ArtifactStore,
  paymentKey: string,
  operationKeys: readonly [string, string],
) {
  return buildSanitizedReport({
    client: db,
    ledger: reportLedger(operationKeys),
    scenarioId: "S3",
    fixture: Object.freeze({
      scenarioId: "S3", paymentKey, providerOrderId: "synthetic-provider-order",
      amount: 1_000, currency: "KRW", reference: "synthetic-reference",
    }),
    hmacKey: Buffer.alloc(32, 7),
    rawDirectory: store.path("raw"),
    refund: null,
    now: new Date("2026-07-18T03:00:00.000Z"),
  });
}

function reportLedger(operationKeys: readonly [string, string]): H1Ledger {
  const callRecords = operationKeys.map((operationKey, index) => Object.freeze({
    scenarioId: "S3",
    kind: "POST",
    phase: "INTENT",
    sequence: index + 1,
    request: Object.freeze({
      path: "/v1/payments/synthetic/cancel",
      canonicalBody: "{\"cancelAmount\":1000}",
      operationKey,
      wireFingerprint: "e".repeat(64),
    }),
  }));
  return Object.freeze({
    formatVersion: "mira-toss-sbx-ledger/v1",
    revision: 1,
    previousLedgerHash: null,
    runId: RUN_ID,
    scenarioId: "S3",
    phase: "LOCAL_COMMIT_COMPLETE",
    repositoryCommit: "a".repeat(40),
    runnerSourceHash: "b".repeat(64),
    policyHashes: policyHashes(),
    migrationFingerprint: "c".repeat(64),
    scenarioInputHash: "d".repeat(64),
    payload: Object.freeze({
      startedAt: "2026-07-18T02:59:00.000Z",
      resultCode: Object.freeze(["SUCCEEDED"]),
      callRecords: Object.freeze(callRecords),
      budgets: Object.freeze({ GET: 0, POST: 2 }),
    }),
  });
}

function policyHashes(): Readonly<Record<string, string>> {
  return Object.freeze({
    "docs/payment_policy/refund_execution_v1.md": "1".repeat(64),
    "docs/payment_policy/refund_execution_v2.md": "2".repeat(64),
    "docs/payment_policy/refund_execution_v3.md": "3".repeat(64),
    "docs/payment_policy/refund_execution_toss_v1.md": "4".repeat(64),
    "docs/payment_policy/refund_execution_toss_recovery_v1.md": "5".repeat(64),
  });
}

async function safeMetadata(path: string) {
  try {
    const metadata = await stat(path);
    return Object.freeze({
      exists: true,
      mode: metadata.mode & 0o777,
      modifiedMs: metadata.mtimeMs,
    });
  } catch (error) {
    if (isMissing(error)) return Object.freeze({ exists: false });
    throw error;
  }
}

function isWithin(candidate: string, parent: string): boolean {
  const path = relative(parent, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
