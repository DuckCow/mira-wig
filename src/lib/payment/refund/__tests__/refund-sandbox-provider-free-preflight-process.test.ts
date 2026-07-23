import { describe, expect, it, vi } from "vitest";
import { runRefundSandboxProviderFreePreflightProcess } from
  "../refund-sandbox-provider-free-preflight-process";
import type { RefundSandboxProviderFreePreflightDependencies } from
  "../run-refund-sandbox-provider-free-preflight";

describe("provider-free sandbox preflight process", () => {
  it("writes one exact observed success line to stdout", async () => {
    const fixture = processFixture();

    await expect(runRefundSandboxProviderFreePreflightProcess(
      [], {}, fixture.output, fixture.dependencies, JSON.stringify, clock(10, 12.9),
    )).resolves.toBe(0);
    expect(fixture.stdout).toHaveBeenCalledTimes(1);
    expect(fixture.stderr).not.toHaveBeenCalled();
    const parsed: unknown = JSON.parse(String(fixture.stdout.mock.calls[0]?.[0]).trimEnd());
    expect(parsed).toEqual({
      ...successResult(),
      process: {
        formatVersion: "mira-refund-sandbox-provider-free-preflight/v1",
        command: "PREFLIGHT",
        operationDurationMs: 2,
      },
    });
  });

  it("rejects arguments before every environment, database, and admission boundary", async () => {
    const fixture = processFixture();

    await expect(runRefundSandboxProviderFreePreflightProcess(
      ["unexpected"], {}, fixture.output, fixture.dependencies, JSON.stringify, clock(1, 2),
    )).resolves.toBe(64);
    expect(fixture.stderr).toHaveBeenCalledTimes(1);
    expect(fixture.stdout).not.toHaveBeenCalled();
    expect(fixture.inspectEnvironment).not.toHaveBeenCalled();
    expect(fixture.createDatabase).not.toHaveBeenCalled();
    expect(fixture.probeAdmission).not.toHaveBeenCalled();
  });

  it.each(["throw", "reject"] as const)(
    "does not attempt fallback output after the selected writer %s",
    async (mode) => {
      const fixture = processFixture();
      fixture.stdout.mockImplementation(() => {
        if (mode === "throw") throw new Error("WRITER_SECRET");
        return Promise.reject(new Error("WRITER_SECRET"));
      });

      await expect(runRefundSandboxProviderFreePreflightProcess(
        [], {}, fixture.output, fixture.dependencies, JSON.stringify, clock(1, 2),
      )).resolves.toBe(1);
      expect(fixture.stdout).toHaveBeenCalledTimes(1);
      expect(fixture.stderr).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["invalid start clock", clock(Number.NaN)],
    ["backward clock", clock(2, 1)],
    ["serializer", clock(1, 2)],
  ] as const)("uses only the static systemic line for %s failure", async (name, monotonicNow) => {
    const fixture = processFixture();
    const serialize = name === "serializer" ? () => "MALFORMED_SECRET" : JSON.stringify;

    await expect(runRefundSandboxProviderFreePreflightProcess(
      [], {}, fixture.output, fixture.dependencies, serialize, monotonicNow,
    )).resolves.toBe(1);
    expect(fixture.stderr).toHaveBeenCalledTimes(1);
    expect(fixture.stderr).toHaveBeenCalledWith('{"ok":false,"code":"SYSTEMIC_FAILURE"}\n');
    expect(fixture.stdout).not.toHaveBeenCalled();
  });

  it("imports the direct-entry script inertly without output, timers, listeners, or exit mutation", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    const beforeTerm = process.listenerCount("SIGTERM");
    const beforeInt = process.listenerCount("SIGINT");
    const beforeExitCode = process.exitCode;

    try {
      await import("../../../../../scripts/refund-sandbox-provider-free-preflight");

      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(process.exitCode).toBe(beforeExitCode);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      timeout.mockRestore();
      interval.mockRestore();
    }
  });
});

function processFixture() {
  const stdout = vi.fn((_value: string): unknown => true);
  const stderr = vi.fn((_value: string): unknown => true);
  const inspectEnvironment = vi.fn(() => Object.freeze({
    DATABASE_URL: "fixture",
    activationEnvironment: Object.freeze({}),
  }));
  const createDatabase = vi.fn(() => Object.freeze({ database: true }));
  const probeAdmission = vi.fn(() => Promise.resolve("ONE_WINNER_ONE_BUSY" as const));
  const dependencies: RefundSandboxProviderFreePreflightDependencies<Readonly<{ database: true }>> =
    Object.freeze({
      inspectEnvironment,
      createDatabase,
      disconnectDatabase: () => Promise.resolve(),
      checkDatabaseConnectivity: () => Promise.resolve(),
      readPostgresqlMajor: () => Promise.resolve(18),
      loadRepositoryMigrations: () => Promise.resolve(Object.freeze([])),
      readMigrationLedger: () => Promise.resolve(Object.freeze({ exists: true, records: Object.freeze([]) })),
      compareMigrations: () => Object.freeze({ ok: true, status: "READY" as const }),
      readHealth: () => Promise.resolve(emptyHealth()),
      readManualReview: () => Promise.resolve(manualEmpty()),
      readReconciliation: () => Promise.resolve(reconciliationEmpty()),
      inspectCredential: () => credentialAbsent(),
      probeAdmission,
    });
  return {
    stdout,
    stderr,
    output: Object.freeze({ stdout: { write: stdout }, stderr: { write: stderr } }),
    dependencies,
    inspectEnvironment,
    createDatabase,
    probeAdmission,
  };
}

function successResult() {
  return {
    ok: true,
    code: "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE",
    activation: "BLOCKED",
    providerExecution: "NOT_PERFORMED",
    credentialProvisioned: false,
    executorAuthorityProvisioned: false,
    schedulerProvisioned: false,
    cloudProvisioningVerifiedByRuntime: false,
    checks: {
      database: "READY",
      postgresqlMajor: 18,
      migrations: "READY",
      worker: "DISABLED_READY",
      health: "EMPTY",
      manualReview: "EMPTY",
      reconciliation: "EMPTY",
      credential: "ABSENT_NOT_VALIDATED",
      distributedAdmission: "ONE_WINNER_ONE_BUSY",
    },
  };
}

function emptyHealth() {
  return {
    READY: { count: 0, oldestAgeSeconds: null },
    UNCONTACTED: { count: 0, oldestAgeSeconds: null },
    CONTACTED: { count: 0, oldestAgeSeconds: null },
    MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
  };
}

function manualEmpty() {
  return {
    ok: true, code: "MANUAL_REVIEW_QUEUE", summary: { count: 0, oldestAgeSeconds: null },
    cases: [], truncated: false,
  };
}

function reconciliationEmpty() {
  return {
    ok: true,
    code: "RECONCILIATION_SNAPSHOT",
    summary: {
      caseCount: 0, possibleContactCount: 0, manualReviewCount: 0,
      contactedWarningCount: 0, contactedCriticalCount: 0,
    },
    cases: [],
    truncated: false,
  };
}

function credentialAbsent() {
  return {
    ok: true, code: "CREDENTIAL_LIFECYCLE_CHECK", credentialStatus: "ABSENT",
    secretValidation: "NOT_PERFORMED", rotationCapability: "SINGLE_ACTIVE_ONLY",
    historicalGenerationResolution: false, revocationReadiness: "NOT_PROVABLE",
  };
}

function clock(...values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}
