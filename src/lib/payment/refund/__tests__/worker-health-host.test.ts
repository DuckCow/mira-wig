import { describe, expect, it, vi } from "vitest";
import {
  runRefundExecutionWorkerHost,
  type RefundExecutionWorkerHostDependencies,
} from "../run-refund-execution-worker-host";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";

const HEALTH = Object.freeze({ kind: "HEALTH" as const });
const CONFIGURED_ENV = Object.freeze({
  REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED: "ENABLED",
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED: "ENABLED",
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED: "ENABLED",
  REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED: "ENABLED",
  REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED: "ENABLED",
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
});

describe("refund worker health host boundary", () => {
  it.each([
    ["ABSENT", {}, false],
    ["CONFIGURED", CONFIGURED_ENV, true],
  ] as const)("runs read-only health with disabled master and %s credentials", async (
    credentialStatus,
    env,
    expectedRoutes,
  ) => {
    const fixture = healthHostFixture({ credentialStatus });

    expect(await runRefundExecutionWorkerHost(HEALTH, env, fixture.dependencies)).toEqual({
      ok: true,
      code: "HEALTH_SNAPSHOT",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus,
        databaseReachable: true,
        migrationStatus: "READY",
      },
      routes: {
        READY: expectedRoutes,
        UNCONTACTED: expectedRoutes,
        CONTACTED_LOOKUP: expectedRoutes,
        CONTACTED_RECONTACT: expectedRoutes,
      },
      backlog: emptyBacklog(),
    });
    expect(fixture.calls).toEqual(expectedHealthyCalls());
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["partial credentials", healthHostFixture({ credentialStatus: "CONFIG_INVALID" })],
    ["malformed activation", healthHostFixture({ activationFailure: true })],
  ] as const)("rejects %s before database construction", async (_name, fixture) => {
    expect(await runRefundExecutionWorkerHost(HEALTH, {}, fixture.dependencies))
      .toEqual({ ok: false, code: "CONFIG_INVALID" });
    expect(fixture.calls.database).toBe(0);
    expect(fixture.calls.healthReader).toBe(0);
    expect(fixture.calls.lifecycle).toBe(0);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["database unavailable", healthHostFixture({ connectivityFailure: true }), "DATABASE_UNAVAILABLE"],
    ["migration mismatch", healthHostFixture({ migrationMismatch: true }), "MIGRATIONS_NOT_READY"],
    ["health reader failure", healthHostFixture({ healthFailure: true }), "SYSTEMIC_FAILURE"],
    ["malformed health snapshot", healthHostFixture({ malformedHealth: true }), "SYSTEMIC_FAILURE"],
  ] as const)("bounds %s and disconnects exactly once", async (_name, fixture, code) => {
    expect(await runRefundExecutionWorkerHost(HEALTH, {}, fixture.dependencies))
      .toEqual({ ok: false, code });
    expect(fixture.calls.database).toBe(1);
    expect(fixture.calls.disconnect).toBe(1);
    expect(fixture.calls.lifecycle).toBe(0);
    expect(fixture.calls.adapters).toBe(0);
    expect(fixture.calls.cycle).toBe(0);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
});

interface HealthDatabase {
  readonly kind: "health-host-database";
}

function healthHostFixture(options: Readonly<{
  credentialStatus?: "ABSENT" | "CONFIGURED" | "CONFIG_INVALID";
  activationFailure?: boolean;
  connectivityFailure?: boolean;
  migrationMismatch?: boolean;
  healthFailure?: boolean;
  malformedHealth?: boolean;
}> = {}) {
  const calls = {
    activation: 0,
    credential: 0,
    database: 0,
    connectivity: 0,
    migrationInventory: 0,
    migrationLedger: 0,
    migrationComparison: 0,
    healthReader: 0,
    disconnect: 0,
    lifecycle: 0,
    adapters: 0,
    cycle: 0,
  };
  const fetch = vi.fn(() => { throw new Error("HEALTH_FETCH_FORBIDDEN"); });
  const database = Object.freeze({ kind: "health-host-database" as const });
  const dependencies: RefundExecutionWorkerHostDependencies<HealthDatabase> = Object.freeze({
    inspectMasterGate: () => false,
    inspectActivation: () => {
      calls.activation += 1;
      if (options.activationFailure) throw new Error("MALFORMED_ACTIVATION");
      return Object.freeze({ workerEnabled: false });
    },
    inspectCredential: () => {
      calls.credential += 1;
      return options.credentialStatus ?? "ABSENT";
    },
    createLifecycle: () => {
      calls.lifecycle += 1;
      throw new Error("HEALTH_LIFECYCLE_FORBIDDEN");
    },
    createDatabase: () => {
      calls.database += 1;
      return database;
    },
    checkDatabaseConnectivity: () => {
      calls.connectivity += 1;
      return options.connectivityFailure
        ? Promise.reject(new Error("DATABASE_UNAVAILABLE"))
        : Promise.resolve();
    },
    loadRepositoryMigrations: () => {
      calls.migrationInventory += 1;
      return Promise.resolve(Object.freeze([{ name: "001", checksum: "a".repeat(64) }]));
    },
    readMigrationLedger: () => {
      calls.migrationLedger += 1;
      return Promise.resolve(Object.freeze({
        exists: true,
        records: Object.freeze([{
          migration_name: "001",
          checksum: (options.migrationMismatch ? "b" : "a").repeat(64),
          finished_at: new Date("2026-07-20T00:00:00.000Z"),
          rolled_back_at: null,
          applied_steps_count: 1,
        }]),
      }));
    },
    compareMigrations: (repository, ledger) => {
      calls.migrationComparison += 1;
      return compareRefundWorkerMigrations(repository, ledger);
    },
    readHealthBacklog: () => {
      calls.healthReader += 1;
      if (options.healthFailure) return Promise.reject(new Error("HEALTH_READER_SECRET"));
      if (options.malformedHealth) {
        return Promise.resolve({ ...emptyBacklog(), secret: "MUST_NOT_ESCAPE" });
      }
      return Promise.resolve(emptyBacklog());
    },
    disconnectDatabase: () => {
      calls.disconnect += 1;
      return Promise.resolve();
    },
    createWorkerDependencies: () => {
      calls.adapters += 1;
      return Object.freeze({ lookup: fetch, cancellation: fetch });
    },
    runWorkerCycle: () => {
      calls.cycle += 1;
      return Promise.resolve({ ok: true as const, cycle: emptyCounters() });
    },
  });
  return { calls, dependencies, fetch };
}

function expectedHealthyCalls() {
  return {
    activation: 1,
    credential: 1,
    database: 1,
    connectivity: 1,
    migrationInventory: 1,
    migrationLedger: 1,
    migrationComparison: 1,
    healthReader: 1,
    disconnect: 1,
    lifecycle: 0,
    adapters: 0,
    cycle: 0,
  };
}

function emptyBacklog() {
  return {
    READY: { count: 0, oldestAgeSeconds: null },
    UNCONTACTED: { count: 0, oldestAgeSeconds: null },
    CONTACTED: { count: 0, oldestAgeSeconds: null },
    MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
  };
}

function emptyCounters() {
  return {
    selectedCount: 0,
    attemptedCount: 0,
    succeededCount: 0,
    replayedCount: 0,
    temporaryCount: 0,
    manualCount: 0,
    conflictCount: 0,
    inconsistentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    providerLookupCount: 0,
    providerCancellationCount: 0,
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
}
