import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  isRefundReconciliationClassificationSetCompatible,
  parseRefundOperationsCliArgs,
  sanitizeRefundOperationsResult,
} from "../refund-operations-contract";
import { runRefundOperationsProcess } from "../refund-operations-process";
import type { RefundOperationsHostDependencies } from "../run-refund-operations-host";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";

const CASE_A = "cmrefundoperations00000000001";
const CASE_B = "legacy_refund_attempt_0002";
const UUID_CASE = "00000000-0000-4000-8000-000000000003";

describe("refund operations process", () => {
  it.each([
    ["manual", "MANUAL", manualResult()],
    ["reconcile", "RECONCILE", reconciliationResult()],
    ["credential", "CREDENTIAL", credentialResult()],
  ] as const)("writes one exact %s observation to stdout", async (argument, command, result) => {
    const fixture = processFixture({ result });

    await expect(runRefundOperationsProcess(
      [argument], {}, fixture.output, fixture.dependencies, JSON.stringify, sequenceClock(10, 13.9),
    )).resolves.toBe(0);

    expect(fixture.stderr).toEqual([]);
    expect(fixture.stdout).toHaveLength(1);
    expect(JSON.parse(fixture.stdout[0])).toEqual({
      ...result,
      process: {
        formatVersion: "mira-refund-operations-process/v1",
        command,
        operationDurationMs: 3,
      },
    });
  });

  it.each([
    [[], "INVALID_HOST_INPUT", 64],
    [["unknown"], "INVALID_HOST_INPUT", 64],
    [["manual", "extra"], "INVALID_HOST_INPUT", 64],
  ] as const)("rejects exact invalid CLI shape %j", async (args, code, exit) => {
    const fixture = processFixture();

    await expect(runRefundOperationsProcess(
      args, {}, fixture.output, fixture.dependencies, JSON.stringify, sequenceClock(1, 2),
    )).resolves.toBe(exit);

    expect(fixture.stdout).toEqual([]);
    expect(JSON.parse(fixture.stderr[0])).toEqual({
      ok: false,
      code,
      process: {
        formatVersion: "mira-refund-operations-process/v1",
        command: "INVALID",
        operationDurationMs: 1,
      },
    });
    expect(fixture.calls()).toEqual([]);
  });

  it("stops the monotonic duration before writer latency", async () => {
    const fixture = processFixture();
    const release = deferred();
    let clockCalls = 0;
    const output = {
      stdout: { write: async (line: string) => {
        fixture.stdout.push(line);
        await release.promise;
      } },
      stderr: fixture.output.stderr,
    };
    const operation = runRefundOperationsProcess(
      ["credential"], {}, output, fixture.dependencies,
      JSON.stringify, () => ++clockCalls === 1 ? 100 : 107,
    );
    await vi.waitFor(() => expect(fixture.stdout).toHaveLength(1));
    expect(clockCalls).toBe(2);
    const observed = parseJsonObject(fixture.stdout[0]);
    expect(parseJsonObjectProperty(observed, "process").operationDurationMs).toBe(7);
    release.resolve();
    await expect(operation).resolves.toBe(0);
    expect(clockCalls).toBe(2);
  });

  it("uses the one exact static fallback for clock and serialization failures", async () => {
    const badClock = processFixture();
    await expect(runRefundOperationsProcess(
      ["credential"], {}, badClock.output, badClock.dependencies,
      JSON.stringify, sequenceClock(5, 4),
    )).resolves.toBe(1);
    expect(badClock.stdout).toEqual([]);
    expect(badClock.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);

    const badSerializer = processFixture();
    await expect(runRefundOperationsProcess(
      ["credential"], {}, badSerializer.output, badSerializer.dependencies,
      () => '{"secret":"SERIALIZER_SECRET"}', sequenceClock(1, 2),
    )).resolves.toBe(1);
    expect(badSerializer.stdout).toEqual([]);
    expect(badSerializer.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
  });

  it("awaits a rejected writer without fallback, channel switch, or second write", async () => {
    const fixture = processFixture();
    const stdout = vi.fn((_value: string) => Promise.reject(new Error("WRITER_REJECTION_SECRET")));
    const stderr = vi.fn((_value: string) => undefined);

    await expect(runRefundOperationsProcess(
      ["credential"], {}, { stdout: { write: stdout }, stderr: { write: stderr } },
      fixture.dependencies, JSON.stringify, sequenceClock(1, 2),
    )).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    expect(String(stdout.mock.calls[0]?.[0])).not.toMatch(/WRITER_REJECTION_SECRET|Error:|at\s+\S+/u);
  });

  it("rejects proxy, accessor, symbol, inherited, and accessor-array adversaries without evaluating getters", () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "ok", {
      enumerable: true,
      get: () => { getterCalls += 1; return true; },
    });
    const symbolResult = { ...manualResult(), [Symbol("secret")]: "SECRET" };
    const inherited = {};
    Reflect.setPrototypeOf(inherited, manualResult());
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get: () => { getterCalls += 1; return "manual"; },
    });
    Object.defineProperty(accessorArray, "length", { value: 1 });
    const accessorCase = { ...manualResult().cases[0] };
    Object.defineProperty(accessorCase, "caseRef", {
      enumerable: true,
      get: () => { getterCalls += 1; return CASE_A; },
    });
    const proxyCase = new Proxy(manualResult().cases[0], {});
    const symbolCase = { ...manualResult().cases[0], [Symbol("secret")]: "SECRET" };
    const inheritedCase: object = {};
    Reflect.setPrototypeOf(inheritedCase, manualResult().cases[0]);

    expect(sanitizeRefundOperationsResult(new Proxy(manualResult(), {}))).toBeNull();
    expect(sanitizeRefundOperationsResult(accessor)).toBeNull();
    expect(sanitizeRefundOperationsResult(symbolResult)).toBeNull();
    expect(sanitizeRefundOperationsResult(inherited)).toBeNull();
    expect(parseRefundOperationsCliArgs(new Proxy(["manual"], {})).ok).toBe(false);
    expect(parseRefundOperationsCliArgs(accessorArray).ok).toBe(false);
    for (const nestedCase of [accessorCase, proxyCase, symbolCase, inheritedCase]) {
      expect(sanitizeRefundOperationsResult({
        ...manualResult(),
        cases: [nestedCase, manualResult().cases[1]],
      })).toBeNull();
    }
    expect(getterCalls).toBe(0);
  });

  it("accepts exact opaque cuid, legacy/internal, and UUID case references", () => {
    for (const caseRef of [
      CASE_A,
      CASE_B,
      UUID_CASE,
      "x".repeat(129),
      `long_${"y".repeat(1_024)}`,
      "operator_\"quoted\"\\path\nnext\tvalue",
    ]) {
      const result = manualResult();
      expect(sanitizeRefundOperationsResult({
        ...result,
        summary: { count: 1, oldestAgeSeconds: 20 },
        cases: [{ ...result.cases[0], caseRef }],
      })).toEqual({
        ...result,
        summary: { count: 1, oldestAgeSeconds: 20 },
        cases: [{ ...result.cases[0], caseRef }],
      });
    }
  });

  it.each([
    "",
    "   ",
    " leading",
    "trailing ",
    "\nouter-control",
  ])("rejects a case reference outside the persisted creation form %j", (caseRef) => {
    const result = manualResult();
    expect(sanitizeRefundOperationsResult({
      ...result,
      cases: [{ ...result.cases[0], caseRef }, result.cases[1]],
    })).toBeNull();
  });

  it("rejects unsafe values, duplicate classifications, and extra keys", () => {
    const { caseRef: _missing, ...missingCaseRef } = manualResult().cases[0];
    expect(sanitizeRefundOperationsResult({
      ...manualResult(),
      cases: [missingCaseRef, manualResult().cases[1]],
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...manualResult(),
      cases: [{ ...manualResult().cases[0], caseRef: 123 }, manualResult().cases[1]],
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...manualResult(), summary: { count: Number.MAX_SAFE_INTEGER + 1, oldestAgeSeconds: 1 },
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...reconciliationResult(),
      cases: [{
        ...reconciliationResult().cases[0],
        classifications: ["POSSIBLE_CONTACT", "POSSIBLE_CONTACT"],
      }],
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({ ...credentialResult(), extra: true })).toBeNull();
  });

  it("round-trips JSON-escaped privileged case data as exactly one process record", async () => {
    const caseRef = "operator_\"quoted\"\\path\nnext\tvalue";
    const result = singleManualResult(caseRef);
    const fixture = processFixture({ result });

    await expect(runRefundOperationsProcess(
      ["manual"], {}, fixture.output, fixture.dependencies,
      JSON.stringify, sequenceClock(1, 2),
    )).resolves.toBe(0);

    expect(fixture.stdout).toHaveLength(1);
    expect(fixture.stderr).toEqual([]);
    expect(fixture.stdout[0].split("\n")).toHaveLength(2);
    const observed = parseJsonObject(fixture.stdout[0]);
    const cases = observed.cases;
    expect(Array.isArray(cases) ? cases[0] : null).toEqual(result.cases[0]);
    expect(parseJsonObjectProperty(observed, "process")).toEqual({
      formatVersion: "mira-refund-operations-process/v1",
      command: "MANUAL",
      operationDurationMs: 1,
    });
  });

  it("enforces complete reconciliation summary, truncation, occurrence, uniqueness, and order invariants", () => {
    const complete = reconciliationResult();
    expect(sanitizeRefundOperationsResult(complete)).toEqual(complete);

    expect(sanitizeRefundOperationsResult({
      ...complete,
      summary: {
        caseCount: 0,
        possibleContactCount: 0,
        manualReviewCount: 0,
        contactedWarningCount: 0,
        contactedCriticalCount: 0,
      },
      cases: [],
      truncated: true,
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      summary: { ...complete.summary, caseCount: 0 },
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({ ...complete, truncated: true })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      summary: { ...complete.summary, caseCount: 2 },
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      summary: { ...complete.summary, possibleContactCount: 0 },
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      summary: { ...complete.summary, caseCount: 1, manualReviewCount: 2 },
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      cases: [{ ...complete.cases[0], oldestRelevantAgeSeconds: -1 }],
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      cases: [{
        ...complete.cases[0],
        classifications: [
          "CONTACTED_DEADLINE_CRITICAL", "MANUAL_REVIEW", "POSSIBLE_CONTACT",
        ],
      }],
    })).toBeNull();
    expect(sanitizeRefundOperationsResult({
      ...complete,
      cases: [complete.cases[0], complete.cases[0]],
      summary: {
        caseCount: 2,
        possibleContactCount: 2,
        manualReviewCount: 2,
        contactedWarningCount: 0,
        contactedCriticalCount: 2,
      },
    })).toBeNull();

    const orderedCases = [
      reconciliationCase("critical-b", ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_CRITICAL"], 20),
      reconciliationCase("critical-c", ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_CRITICAL"], 10),
      reconciliationCase("warning-a", ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_WARNING"], 30),
      reconciliationCase("manual-a", ["MANUAL_REVIEW"], 40),
      reconciliationCase("possible-a", ["POSSIBLE_CONTACT"], 50),
    ];
    const ordered = reconciliationSnapshot(orderedCases);
    expect(sanitizeRefundOperationsResult(ordered)).toEqual(ordered);
    for (const cases of [
      [orderedCases[1], orderedCases[0], ...orderedCases.slice(2)],
      [orderedCases[2], orderedCases[0], orderedCases[1], ...orderedCases.slice(3)],
      [
        reconciliationCase("critical-c", ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_CRITICAL"], 20),
        reconciliationCase("critical-b", ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_CRITICAL"], 20),
        ...orderedCases.slice(2),
      ],
    ]) {
      expect(sanitizeRefundOperationsResult(reconciliationSnapshot(cases))).toBeNull();
    }
  });

  it("accepts an exact 100-case truncated reconciliation projection", () => {
    const cases = Array.from({ length: 100 }, (_, index) => (
      reconciliationCase(`case-${String(index).padStart(3, "0")}`, ["POSSIBLE_CONTACT"], 100 - index)
    ));
    const result = {
      ...reconciliationSnapshot(cases),
      summary: {
        caseCount: 101,
        possibleContactCount: 101,
        manualReviewCount: 0,
        contactedWarningCount: 0,
        contactedCriticalCount: 0,
      },
      truncated: true,
    };
    expect(sanitizeRefundOperationsResult(result)).toEqual(result);
  });

  it("accepts exactly the seven reader-produced classification combinations", () => {
    const coherent = [
      ["MANUAL_REVIEW"],
      ["POSSIBLE_CONTACT"],
      ["POSSIBLE_CONTACT", "MANUAL_REVIEW"],
      ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_WARNING"],
      ["POSSIBLE_CONTACT", "MANUAL_REVIEW", "CONTACTED_DEADLINE_WARNING"],
      ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_CRITICAL"],
      ["POSSIBLE_CONTACT", "MANUAL_REVIEW", "CONTACTED_DEADLINE_CRITICAL"],
    ] as const;
    for (const classifications of coherent) {
      expect(isRefundReconciliationClassificationSetCompatible(classifications)).toBe(true);
      const result = reconciliationSnapshot([
        reconciliationCase("case-compatible", classifications, 10),
      ]);
      expect(sanitizeRefundOperationsResult(result)).toEqual(result);
    }
  });

  it("rejects impossible per-case classifications even when aggregate counts balance", () => {
    for (const impossible of [
      ["CONTACTED_DEADLINE_WARNING"],
      ["CONTACTED_DEADLINE_CRITICAL"],
      ["MANUAL_REVIEW", "CONTACTED_DEADLINE_CRITICAL"],
      ["POSSIBLE_CONTACT", "CONTACTED_DEADLINE_WARNING", "CONTACTED_DEADLINE_CRITICAL"],
    ] as const) {
      expect(isRefundReconciliationClassificationSetCompatible(impossible)).toBe(false);
      const hiddenByAggregate = reconciliationSnapshot([
        reconciliationCase("case-impossible", impossible, 20),
        reconciliationCase("case-possible", ["POSSIBLE_CONTACT"], 10),
      ]);
      expect(sanitizeRefundOperationsResult(hiddenByAggregate)).toBeNull();
    }
  });

  it("keeps direct script import inert and contains no dotenv import", async () => {
    const script = await readFile("scripts/refund-operations.ts", "utf8");
    expect(script).not.toMatch(/dotenv|env-file/u);
    expect(script).not.toMatch(/setInterval|setTimeout|cron|scheduler|daemon|heartbeat/iu);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await import("../../../../../scripts/refund-operations");

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it("runs the real credential CLI with a stripped environment and one sanitized line", () => {
    const child = runChild([
      "--import", "tsx", "scripts/refund-operations.ts", "credential",
    ]);

    expect(child.exitCode).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim().split("\n")).toHaveLength(1);
    expect(parseJsonObject(child.stdout)).toMatchObject({
      ok: true,
      code: "CREDENTIAL_LIFECYCLE_CHECK",
      credentialStatus: "ABSENT",
      secretValidation: "NOT_PERFORMED",
      rotationCapability: "SINGLE_ACTIVE_ONLY",
      historicalGenerationResolution: false,
      revocationReadiness: "NOT_PROVABLE",
      process: {
        formatVersion: "mira-refund-operations-process/v1",
        command: "CREDENTIAL",
      },
    });
  });
});

function processFixture(options: { result?: unknown } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const calls: string[] = [];
  const result = options.result ?? credentialResult();
  const dependencies: RefundOperationsHostDependencies<object> = {
    inspectCredentialLifecycle: () => { calls.push("credential"); return result; },
    createDatabase: () => { calls.push("createDatabase"); return {}; },
    checkDatabaseConnectivity: () => { calls.push("connectivity"); return Promise.resolve(); },
    loadRepositoryMigrations: () => { calls.push("repositoryMigrations"); return Promise.resolve([]); },
    readMigrationLedger: () => {
      calls.push("ledger");
      return Promise.resolve({ exists: true, records: [] });
    },
    compareMigrations: compareRefundWorkerMigrations,
    readManualReviewQueue: () => { calls.push("manual"); return Promise.resolve(result); },
    readReconciliationSnapshot: () => { calls.push("reconcile"); return Promise.resolve(result); },
    disconnectDatabase: () => { calls.push("disconnect"); return Promise.resolve(); },
  };
  return {
    stdout, stderr, calls: () => calls,
    output: {
      stdout: { write: (line: string) => { stdout.push(line); } },
      stderr: { write: (line: string) => { stderr.push(line); } },
    },
    dependencies,
  };
}

function manualResult() {
  return {
    ok: true as const,
    code: "MANUAL_REVIEW_QUEUE" as const,
    summary: { count: 2, oldestAgeSeconds: 20 },
    cases: [
      {
        caseRef: CASE_A, ageSeconds: 20, contactMarkerPresent: true,
        authorizationEvidenceCount: 1, contactEvidenceCount: 1,
      },
      {
        caseRef: CASE_B, ageSeconds: 10, contactMarkerPresent: false,
        authorizationEvidenceCount: 0, contactEvidenceCount: 0,
      },
    ],
    truncated: false,
  };
}

function singleManualResult(caseRef: string) {
  const result = manualResult();
  return {
    ...result,
    summary: { count: 1, oldestAgeSeconds: 20 },
    cases: [{ ...result.cases[0], caseRef }],
  };
}

function reconciliationResult() {
  return {
    ok: true as const,
    code: "RECONCILIATION_SNAPSHOT" as const,
    summary: {
      caseCount: 1, possibleContactCount: 1, manualReviewCount: 1,
      contactedWarningCount: 0, contactedCriticalCount: 1,
    },
    cases: [{
      caseRef: CASE_A,
      classifications: [
        "POSSIBLE_CONTACT", "MANUAL_REVIEW", "CONTACTED_DEADLINE_CRITICAL",
      ] as const,
      oldestRelevantAgeSeconds: 1_100_000,
    }],
    truncated: false,
  };
}

function reconciliationCase(
  caseRef: string,
  classifications: readonly (
    | "POSSIBLE_CONTACT"
    | "MANUAL_REVIEW"
    | "CONTACTED_DEADLINE_WARNING"
    | "CONTACTED_DEADLINE_CRITICAL"
  )[],
  oldestRelevantAgeSeconds: number,
) {
  return { caseRef, classifications, oldestRelevantAgeSeconds };
}

function reconciliationSnapshot(cases: readonly ReturnType<typeof reconciliationCase>[]) {
  const count = (classification: ReturnType<typeof reconciliationCase>["classifications"][number]) => (
    cases.filter((item) => item.classifications.includes(classification)).length
  );
  return {
    ok: true as const,
    code: "RECONCILIATION_SNAPSHOT" as const,
    summary: {
      caseCount: cases.length,
      possibleContactCount: count("POSSIBLE_CONTACT"),
      manualReviewCount: count("MANUAL_REVIEW"),
      contactedWarningCount: count("CONTACTED_DEADLINE_WARNING"),
      contactedCriticalCount: count("CONTACTED_DEADLINE_CRITICAL"),
    },
    cases,
    truncated: false,
  };
}

function credentialResult() {
  return {
    ok: true as const,
    code: "CREDENTIAL_LIFECYCLE_CHECK" as const,
    credentialStatus: "ABSENT" as const,
    secretValidation: "NOT_PERFORMED" as const,
    rotationCapability: "SINGLE_ACTIVE_ONLY" as const,
    historicalGenerationResolution: false as const,
    revocationReadiness: "NOT_PROVABLE" as const,
  };
}

function sequenceClock(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? Number.NaN;
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function runChild(args: readonly string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { NODE_ENV: "test", PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status ?? 1 };
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error("Expected JSON object.");
  return parsed;
}

function parseJsonObjectProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const property = value[key];
  if (!isRecord(property)) {
    throw new Error(`Expected JSON object property ${key}.`);
  }
  return property;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
