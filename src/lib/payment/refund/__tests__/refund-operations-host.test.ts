import { describe, expect, it } from "vitest";
import { runRefundOperationsHost } from "../run-refund-operations-host";
import type { RefundOperationsHostDependencies } from "../run-refund-operations-host";

describe("refund operations host boundaries", () => {
  it.each([
    ["MANUAL", "manual"],
    ["RECONCILE", "reconcile"],
  ] as const)("runs the exact read-only readiness chain for %s", async (kind, reader) => {
    const fixture = dependencies();

    const result = await runRefundOperationsHost({ kind }, { DATABASE_URL: "local-test" }, fixture.value);

    expect(result.code).toBe(kind === "MANUAL" ? "MANUAL_REVIEW_QUEUE" : "RECONCILIATION_SNAPSHOT");
    expect(fixture.calls).toEqual([
      "createDatabase", "connectivity", "repository", "ledger", "compare", reader, "disconnect",
    ]);
  });

  it("maps connectivity, migration, reader, and disconnect boundaries without raw errors", async () => {
    const connectivity = dependencies({ failAt: "connectivity" });
    expect(await runRefundOperationsHost(
      { kind: "MANUAL" }, {}, connectivity.value,
    )).toEqual({ ok: false, code: "DATABASE_UNAVAILABLE" });
    expect(connectivity.calls.at(-1)).toBe("disconnect");

    const migration = dependencies({ migrationReady: false });
    expect(await runRefundOperationsHost(
      { kind: "MANUAL" }, {}, migration.value,
    )).toEqual({ ok: false, code: "MIGRATIONS_NOT_READY" });
    expect(migration.calls.at(-1)).toBe("disconnect");

    const reader = dependencies({ failAt: "manual" });
    expect(await runRefundOperationsHost(
      { kind: "MANUAL" }, {}, reader.value,
    )).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(reader.calls.at(-1)).toBe("disconnect");

    const disconnect = dependencies({ failAt: "disconnect" });
    expect(await runRefundOperationsHost(
      { kind: "MANUAL" }, {}, disconnect.value,
    )).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(disconnect.calls.filter((call) => call === "disconnect")).toHaveLength(1);
  });

  it("rejects malformed reader results before output and never invokes credential/provider/lifecycle work", async () => {
    const fixture = dependencies({ manualResult: new Proxy(manualResult(), {}) });

    expect(await runRefundOperationsHost(
      { kind: "MANUAL" }, {}, fixture.value,
    )).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(fixture.calls).not.toContain("credential");
    expect(fixture.calls).not.toContain("provider");
    expect(fixture.calls).not.toContain("lifecycle");
  });
});

function dependencies(options: {
  failAt?: string;
  migrationReady?: boolean;
  manualResult?: unknown;
} = {}) {
  const calls: string[] = [];
  const called = (name: string) => {
    calls.push(name);
    if (options.failAt === name) throw new Error(`${name.toUpperCase()}_SECRET`);
  };
  const value: RefundOperationsHostDependencies<object> = {
    inspectCredentialLifecycle: () => { called("credential"); return credentialResult(); },
    createDatabase: () => { called("createDatabase"); return {}; },
    checkDatabaseConnectivity: () => { called("connectivity"); return Promise.resolve(); },
    loadRepositoryMigrations: () => { called("repository"); return Promise.resolve([]); },
    readMigrationLedger: () => {
      called("ledger");
      return Promise.resolve({ exists: true, records: [] });
    },
    compareMigrations: () => {
      called("compare");
      return options.migrationReady === false
        ? { ok: false, reason: "PENDING_MIGRATION" }
        : { ok: true, status: "READY" };
    },
    readManualReviewQueue: () => {
      called("manual");
      return Promise.resolve(options.manualResult ?? manualResult());
    },
    readReconciliationSnapshot: () => {
      called("reconcile");
      return Promise.resolve(reconciliationResult());
    },
    disconnectDatabase: () => { called("disconnect"); return Promise.resolve(); },
  };
  return { calls, value };
}

function manualResult() {
  return {
    ok: true as const,
    code: "MANUAL_REVIEW_QUEUE" as const,
    summary: { count: 0, oldestAgeSeconds: null },
    cases: [],
    truncated: false,
  };
}

function reconciliationResult() {
  return {
    ok: true as const,
    code: "RECONCILIATION_SNAPSHOT" as const,
    summary: {
      caseCount: 0,
      possibleContactCount: 0,
      manualReviewCount: 0,
      contactedWarningCount: 0,
      contactedCriticalCount: 0,
    },
    cases: [],
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
