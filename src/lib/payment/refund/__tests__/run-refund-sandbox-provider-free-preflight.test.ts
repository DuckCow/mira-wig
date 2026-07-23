import { describe, expect, it, vi } from "vitest";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";
import {
  REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
  REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY,
  safeRefundSandboxProviderFreePreflightEnvironment,
} from "../refund-sandbox-provider-free-preflight-environment";
import {
  runRefundSandboxProviderFreePreflight,
  type RefundSandboxProviderFreePreflightDependencies,
} from "../run-refund-sandbox-provider-free-preflight";

type FakeDatabase = Readonly<{ fake: true }>;
const DATABASE: FakeDatabase = Object.freeze({ fake: true });
const CLOUD_SQL_SOCKET = "/cloudsql/mira-refund-sbx:asia-northeast3:refund-db";
const CLOUD_DATABASE_AUTHORITY =
  "postgresql://preflight_role:fixture_password@localhost:5432/refund_sandbox";

describe("provider-free sandbox preflight runner", () => {
  it("runs every provider-free boundary in order and reports only bounded evidence", async () => {
    const fixture = preflightFixture();

    expect(await runRefundSandboxProviderFreePreflight({}, fixture.dependencies)).toEqual({
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
    });
    expect(fixture.order).toEqual([
      "environment", "createDatabase", "connectivity", "postgresqlMajor",
      "repositoryMigrations", "migrationLedger", "compareMigrations", "health",
      "manual", "reconciliation", "credential", "admission", "disconnect",
    ]);
  });

  it("admits the literal canonical raw query through the real guard", async () => {
    const fixture = preflightFixture();
    const result = await runRefundSandboxProviderFreePreflight({
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL: `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}`,
    }, {
      ...fixture.dependencies,
      inspectEnvironment: safeRefundSandboxProviderFreePreflightEnvironment,
    });

    expect(result.ok).toBe(true);
    expect(fixture.order).toEqual([
      "createDatabase", "connectivity", "postgresqlMajor", "repositoryMigrations",
      "migrationLedger", "compareMigrations", "health", "manual", "reconciliation",
      "credential", "admission", "disconnect",
    ]);
  });

  it.each([
    ["environment", "CONFIG_INVALID"],
    ["createDatabase", "DATABASE_UNAVAILABLE"],
    ["connectivity", "DATABASE_UNAVAILABLE"],
    ["postgresqlMajor", "DATABASE_UNAVAILABLE"],
    ["wrongMajor", "PREFLIGHT_NOT_READY"],
    ["repositoryMigrations", "SYSTEMIC_FAILURE"],
    ["migrationLedger", "DATABASE_UNAVAILABLE"],
    ["migrationMismatch", "MIGRATIONS_NOT_READY"],
    ["health", "PREFLIGHT_NOT_READY"],
    ["manual", "PREFLIGHT_NOT_READY"],
    ["reconciliation", "PREFLIGHT_NOT_READY"],
    ["credential", "CONFIG_INVALID"],
    ["admissionBusy", "PREFLIGHT_NOT_READY"],
    ["disconnect", "SYSTEMIC_FAILURE"],
  ] as const)("bounds %s as %s", async (failure, code) => {
    const fixture = preflightFixture(failure);

    const result = await runRefundSandboxProviderFreePreflight({}, fixture.dependencies);
    expect(result).toEqual({
      ok: false,
      code,
      activation: "BLOCKED",
      providerExecution: "NOT_PERFORMED",
      credentialProvisioned: false,
      executorAuthorityProvisioned: false,
      schedulerProvisioned: false,
      cloudProvisioningVerifiedByRuntime: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|secret|stack|Error/iu);
  });

  it.each([
    ["safe-first duplicate host", `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}&host=203.0.113.10`],
    ["unsafe-first duplicate host", `${CLOUD_DATABASE_AUTHORITY}?host=203.0.113.10&host=${CLOUD_SQL_SOCKET}`],
    ["identical duplicate host", `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}&host=${CLOUD_SQL_SOCKET}`],
    ["encoded duplicate key", `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}&h%6fst=${CLOUD_SQL_SOCKET}`],
    ["empty duplicate host", `${CLOUD_DATABASE_AUTHORITY}?host=&host=${CLOUD_SQL_SOCKET}`],
    ["hostaddr override", `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}&hostaddr=203.0.113.10`],
    ["multiple hosts", `${CLOUD_DATABASE_AUTHORITY}?host=203.0.113.10,203.0.113.11`],
    ["remote authority", `postgresql://preflight_role:fixture_password@db.example:5432/refund_sandbox?host=${CLOUD_SQL_SOCKET}`],
    ["query override", `${CLOUD_DATABASE_AUTHORITY}?host=${CLOUD_SQL_SOCKET}&port=6432`],
    ["fully encoded socket separators", `${CLOUD_DATABASE_AUTHORITY}?host=%2Fcloudsql%2Fmira-refund-sbx%3Aasia-northeast3%3Arefund-db`],
    ["partially encoded socket slash", `${CLOUD_DATABASE_AUTHORITY}?host=/cloudsql%2Fmira-refund-sbx:asia-northeast3:refund-db`],
    ["partially encoded socket colon", `${CLOUD_DATABASE_AUTHORITY}?host=/cloudsql/mira-refund-sbx%3Aasia-northeast3:refund-db`],
  ])("rejects %s before every database or credential boundary", async (_name, databaseUrl) => {
    const fixture = preflightFixture();
    const createDatabase = vi.fn(() => { throw new Error("DATABASE_CONSTRUCTION_POISON"); });
    const inspectCredential = vi.fn(() => { throw new Error("CREDENTIAL_READ_POISON"); });
    const probeAdmission = vi.fn(() => { throw new Error("ADMISSION_CONNECTION_POISON"); });
    const result = await runRefundSandboxProviderFreePreflight({
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL: databaseUrl,
    }, {
      ...fixture.dependencies,
      inspectEnvironment: safeRefundSandboxProviderFreePreflightEnvironment,
      createDatabase,
      inspectCredential,
      probeAdmission,
    });

    expect(result).toEqual({
      ok: false,
      code: "CONFIG_INVALID",
      activation: "BLOCKED",
      providerExecution: "NOT_PERFORMED",
      credentialProvisioned: false,
      executorAuthorityProvisioned: false,
      schedulerProvisioned: false,
      cloudProvisioningVerifiedByRuntime: false,
    });
    expect(createDatabase).not.toHaveBeenCalled();
    expect(inspectCredential).not.toHaveBeenCalled();
    expect(probeAdmission).not.toHaveBeenCalled();
    expect(fixture.order).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(databaseUrl);
    expect(JSON.stringify(result)).not.toMatch(/203\.0\.113\.10|cloudsql|preflight_role/iu);
  });
});

function preflightFixture(failure?: string) {
  const order: string[] = [];
  const called = (name: string) => { order.push(name); };
  const rejectAt = (name: string) => {
    called(name);
    if (failure === name) throw new Error(`${name}_SECRET`);
  };
  const dependencies: RefundSandboxProviderFreePreflightDependencies<FakeDatabase> = Object.freeze({
    inspectEnvironment: () => {
      rejectAt("environment");
      return Object.freeze({ DATABASE_URL: "local-fixture", activationEnvironment: Object.freeze({}) });
    },
    createDatabase: () => {
      rejectAt("createDatabase");
      return DATABASE;
    },
    disconnectDatabase: () => {
      rejectAt("disconnect");
      return Promise.resolve();
    },
    checkDatabaseConnectivity: () => {
      rejectAt("connectivity");
      return Promise.resolve();
    },
    readPostgresqlMajor: () => {
      rejectAt("postgresqlMajor");
      return Promise.resolve(failure === "wrongMajor" ? 17 : 18);
    },
    loadRepositoryMigrations: () => {
      rejectAt("repositoryMigrations");
      return Promise.resolve(Object.freeze([{ name: "001", checksum: "a".repeat(64) }]));
    },
    readMigrationLedger: () => {
      rejectAt("migrationLedger");
      return Promise.resolve(Object.freeze({
        exists: true as const,
        records: Object.freeze([{
          migration_name: "001",
          checksum: (failure === "migrationMismatch" ? "b" : "a").repeat(64),
          finished_at: new Date("2026-07-23T00:00:00.000Z"),
          rolled_back_at: null,
          applied_steps_count: 1,
        }]),
      }));
    },
    compareMigrations: (repository, ledger) => {
      called("compareMigrations");
      return compareRefundWorkerMigrations(repository, ledger);
    },
    readHealth: () => {
      called("health");
      return Promise.resolve(failure === "health" ? nonemptyHealth() : emptyHealth());
    },
    readManualReview: () => {
      called("manual");
      return Promise.resolve(manualResult(failure === "manual" ? 1 : 0));
    },
    readReconciliation: () => {
      called("reconciliation");
      return Promise.resolve(reconciliationResult(failure === "reconciliation" ? 1 : 0));
    },
    inspectCredential: () => {
      called("credential");
      return credentialResult(failure === "credential" ? "CONFIGURED" : "ABSENT");
    },
    probeAdmission: () => {
      called("admission");
      return Promise.resolve(
        failure === "admissionBusy" ? "BUSY" as const : "ONE_WINNER_ONE_BUSY" as const,
      );
    },
  });
  return { dependencies, order };
}

function emptyHealth() {
  return {
    READY: { count: 0, oldestAgeSeconds: null },
    UNCONTACTED: { count: 0, oldestAgeSeconds: null },
    CONTACTED: { count: 0, oldestAgeSeconds: null },
    MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
  };
}

function nonemptyHealth() {
  return { ...emptyHealth(), READY: { count: 1, oldestAgeSeconds: 0 } };
}

function manualResult(count: number) {
  return {
    ok: true as const,
    code: "MANUAL_REVIEW_QUEUE" as const,
    summary: { count, oldestAgeSeconds: count === 0 ? null : 0 },
    cases: count === 0 ? [] : [{
      caseRef: "ref_12345678901234567890",
      ageSeconds: 0,
      contactMarkerPresent: false,
      authorizationEvidenceCount: 0,
      contactEvidenceCount: 0,
    }],
    truncated: false,
  };
}

function reconciliationResult(count: number) {
  return {
    ok: true as const,
    code: "RECONCILIATION_SNAPSHOT" as const,
    summary: {
      caseCount: count,
      possibleContactCount: 0,
      manualReviewCount: count,
      contactedWarningCount: 0,
      contactedCriticalCount: 0,
    },
    cases: count === 0 ? [] : [{
      caseRef: "ref_12345678901234567890",
      classifications: ["MANUAL_REVIEW"],
      oldestRelevantAgeSeconds: 0,
    }],
    truncated: false,
  };
}

function credentialResult(status: "ABSENT" | "CONFIGURED") {
  return {
    ok: true as const,
    code: "CREDENTIAL_LIFECYCLE_CHECK" as const,
    credentialStatus: status,
    secretValidation: "NOT_PERFORMED" as const,
    rotationCapability: "SINGLE_ACTIVE_ONLY" as const,
    historicalGenerationResolution: false as const,
    revocationReadiness: "NOT_PROVABLE" as const,
  };
}
