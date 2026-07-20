import { describe, expect, it, vi } from "vitest";
import {
  isRefundExecutionWorkerEnabled,
  REFUND_EXECUTION_WORKER_ENABLED,
  RefundExecutionActivationConfigError,
} from "../execution-activation";
import {
  defaultRefundExecutionWorkerHostDependencies,
  runRefundExecutionWorkerHost,
  type RefundExecutionWorkerHostDependencies,
} from "../run-refund-execution-worker-host";
import type { RefundExecutionWorkerCycleResult } from "../worker-contract";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";
import { ConfiguredTossRefundCredential } from "../providers/toss/refund-credential-config";

const CHECK = Object.freeze({ kind: "CHECK" as const });
const RUN_ONCE = Object.freeze({ kind: "RUN_ONCE" as const, workerOwner: "refund-sbx:svc:rev:slot" });
const CONFIGURED_ENV = Object.freeze({ REFUND_EXECUTION_WORKER_ENABLED: "ENABLED" });

describe("runRefundExecutionWorkerHost early master boundary", () => {
  it("returns healthy disabled before every database, credential, adapter, and cycle boundary", async () => {
    const fixture = hostFixture({ masterEnabled: false, poisonAfterMaster: true });

    expect(await runRefundExecutionWorkerHost(RUN_ONCE, {}, fixture.dependencies))
      .toEqual({ ok: true, code: "FEATURE_DISABLED" });
    expect(fixture.calls).toEqual(expectedCalls({ master: 1 }));
  });

  it("returns configuration failure for malformed master before every later boundary", async () => {
    const fixture = hostFixture({ malformedMaster: true, poisonAfterMaster: true });

    expect(await runRefundExecutionWorkerHost(RUN_ONCE, {
      REFUND_EXECUTION_WORKER_ENABLED: "malformed",
    }, fixture.dependencies)).toEqual({ ok: false, code: "CONFIG_INVALID" });
    expect(fixture.calls).toEqual(expectedCalls({ master: 1 }));
  });

  it.each([
    ["absent", undefined, { ok: true, code: "FEATURE_DISABLED" }],
    ["malformed", "invalid", { ok: false, code: "CONFIG_INVALID" }],
  ] as const)("reads only the master environment key for an early %s result", async (
    _name,
    master,
    expected,
  ) => {
    const reads: PropertyKey[] = [];
    const env = new Proxy<Record<string, string | undefined>>({}, {
      get: (_target, key) => {
        reads.push(key);
        if (key === REFUND_EXECUTION_WORKER_ENABLED) return master;
        throw new Error("DOWNSTREAM_ENV_READ");
      },
    });
    const fixture = hostFixture({ poisonAfterMaster: true });

    expect(await runRefundExecutionWorkerHost(RUN_ONCE, env, {
      ...fixture.dependencies,
      inspectMasterGate: isRefundExecutionWorkerEnabled,
    })).toEqual(expected);
    expect(reads).toEqual([REFUND_EXECUTION_WORKER_ENABLED]);
    expect(fixture.calls).toEqual(expectedCalls({}));
  });
});

describe("runRefundExecutionWorkerHost check", () => {
  it.each([
    ["absent", "ABSENT" as const],
    ["configured", "CONFIGURED" as const],
  ])("accepts disabled worker with %s credentials and remains provider-free", async (_name, credential) => {
    const fixture = hostFixture({ workerEnabled: false, credential });

    expect(await runRefundExecutionWorkerHost(CHECK, {}, fixture.dependencies)).toEqual({
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: credential,
        databaseReachable: true,
        migrationStatus: "READY",
      },
    });
    expect(fixture.calls).toEqual(expectedCalls({
      activation: 1,
      credential: 1,
      createDatabase: 1,
      connectivity: 1,
      repository: 1,
      ledger: 1,
      comparison: 1,
      disconnect: 1,
    }));
  });

  it("rejects partial credentials before constructing a database", async () => {
    const fixture = hostFixture({ credential: "CONFIG_INVALID", poisonDatabase: true });

    expect(await runRefundExecutionWorkerHost(CHECK, {}, fixture.dependencies))
      .toEqual({ ok: false, code: "CONFIG_INVALID" });
    expect(fixture.calls).toEqual(expectedCalls({ activation: 1, credential: 1 }));
  });

  it("rejects malformed downstream activation while the master is disabled", async () => {
    const fixture = hostFixture({ malformedActivation: true, poisonDatabase: true });

    expect(await runRefundExecutionWorkerHost(CHECK, {}, fixture.dependencies))
      .toEqual({ ok: false, code: "CONFIG_INVALID" });
    expect(fixture.calls).toEqual(expectedCalls({ activation: 1 }));
  });

  it("classifies client construction and connectivity failures without adapter activity", async () => {
    const construction = hostFixture({ databaseConstructionFailure: true });
    const connectivity = hostFixture({ connectivityFailure: true });

    expect(await runRefundExecutionWorkerHost(CHECK, {}, construction.dependencies))
      .toEqual({ ok: false, code: "DATABASE_UNAVAILABLE" });
    expect(construction.calls.disconnect).toBe(0);
    expect(await runRefundExecutionWorkerHost(CHECK, {}, connectivity.dependencies))
      .toEqual({ ok: false, code: "DATABASE_UNAVAILABLE" });
    expect(connectivity.calls.disconnect).toBe(1);
    expect(connectivity.calls.adapters).toBe(0);
  });

  it.each([
    ["filesystem", "SYSTEMIC_FAILURE"],
    ["ledger", "DATABASE_UNAVAILABLE"],
    ["ledgerPermission", "DATABASE_UNAVAILABLE"],
    ["comparison", "MIGRATIONS_NOT_READY"],
    ["comparatorUnexpected", "SYSTEMIC_FAILURE"],
  ] as const)(
    "classifies %s migration readiness failure as %s and disconnects",
    async (failure, code) => {
      const fixture = hostFixture({ migrationFailure: failure });

      expect(await runRefundExecutionWorkerHost(CHECK, {}, fixture.dependencies))
        .toEqual({ ok: false, code });
      expect(fixture.calls.disconnect).toBe(1);
      expect(fixture.calls.adapters).toBe(0);
      expect(fixture.calls.cycle).toBe(0);
      if (failure === "filesystem") {
        expect(fixture.calls.ledger).toBe(0);
        expect(fixture.calls.comparison).toBe(0);
      }
      if (failure === "ledger" || failure === "ledgerPermission") {
        expect(fixture.calls.comparison).toBe(0);
      }
    },
  );
});

describe("runRefundExecutionWorkerHost run-once", () => {
  it.each(["ABSENT", "CONFIG_INVALID"] as const)(
    "requires configured credentials before database construction for %s",
    async (credential) => {
      const fixture = hostFixture({ credential, poisonDatabase: true });

      expect(await runRefundExecutionWorkerHost(RUN_ONCE, CONFIGURED_ENV, fixture.dependencies))
        .toEqual({ ok: false, code: "CONFIG_INVALID" });
      expect(fixture.calls).toEqual(expectedCalls({ master: 1, activation: 1, credential: 1 }));
    },
  );

  it("inspects configured credentials without invoking the opaque secret reader", async () => {
    const secretReader = vi.spyOn(ConfiguredTossRefundCredential.prototype, "readSecretKey")
      .mockImplementation(() => { throw new Error("SECRET_READER_POISON"); });
    let databaseConstructions = 0;
    try {
      const result = await runRefundExecutionWorkerHost(RUN_ONCE, {
        REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
        TOSS_SANDBOX_SECRET_KEY: "synthetic_host_secret",
        TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-host",
        TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-host",
      }, {
        ...defaultRefundExecutionWorkerHostDependencies,
        createDatabase: () => {
          databaseConstructions += 1;
          throw new Error("DATABASE_FACTORY_POISON");
        },
      });

      expect(result).toEqual({ ok: false, code: "DATABASE_UNAVAILABLE" });
      expect(databaseConstructions).toBe(1);
      expect(secretReader).not.toHaveBeenCalled();
    } finally {
      secretReader.mockRestore();
    }
  });

  it("constructs adapters only after connectivity and migration readiness, then returns counters", async () => {
    const fixture = hostFixture({ cycleResult: cycleSuccess() });

    expect(await runRefundExecutionWorkerHost(RUN_ONCE, CONFIGURED_ENV, fixture.dependencies))
      .toEqual({ ok: true, code: "CYCLE_COMPLETE", cycle: emptyCounters() });
    expect(fixture.order).toEqual([
      "master", "activation", "credential", "createDatabase", "connectivity",
      "repository", "ledger", "comparison", "adapters", "cycle", "disconnect",
    ]);
  });

  it.each([
    [workerFailure("FEATURE_DISABLED"), { ok: true, code: "FEATURE_DISABLED" }],
    [workerFailure("INVALID_WORKER_OWNER"), { ok: false, code: "INVALID_WORKER_OWNER" }],
    [workerFailure("CONFIG_INVALID"), { ok: false, code: "CONFIG_INVALID" }],
    [workerFailure("SYSTEMIC_FAILURE"), { ok: false, code: "SYSTEMIC_FAILURE" }],
  ] as const)("maps the existing worker result without diagnostics", async (cycleResult, expected) => {
    const fixture = hostFixture({ cycleResult });

    expect(await runRefundExecutionWorkerHost(RUN_ONCE, CONFIGURED_ENV, fixture.dependencies))
      .toEqual(expected);
    expect(fixture.calls.disconnect).toBe(1);
  });

  it.each([
    [false, false, { ok: true, code: "CYCLE_COMPLETE", cycle: emptyCounters() }],
    [true, false, { ok: false, code: "SYSTEMIC_FAILURE" }],
    [false, true, { ok: false, code: "SYSTEMIC_FAILURE" }],
    [true, true, { ok: false, code: "SYSTEMIC_FAILURE" }],
  ] as const)(
    "composes operation failure=%s and disconnect failure=%s deterministically",
    async (operationFailure, disconnectFailure, expected) => {
      const fixture = hostFixture({ operationFailure, disconnectFailure });
      await expect(runRefundExecutionWorkerHost(RUN_ONCE, CONFIGURED_ENV, fixture.dependencies))
        .resolves.toEqual(expected);
      expect(fixture.calls.disconnect).toBe(1);
      expect(fixture.order.at(-1)).toBe("disconnect");
    },
  );

  it("returns systemic failure and still disconnects when adapter construction fails", async () => {
    const fixture = hostFixture({ runtimeFailure: "adapters" });
    expect(await runRefundExecutionWorkerHost(RUN_ONCE, CONFIGURED_ENV, fixture.dependencies))
      .toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(fixture.calls.disconnect).toBe(1);
    expect(fixture.calls.cycle).toBe(0);
  });
});

interface FakeDatabase {
  readonly identity: "fake-refund-worker-database";
}

interface CallCounts {
  master: number;
  activation: number;
  credential: number;
  createDatabase: number;
  connectivity: number;
  repository: number;
  ledger: number;
  comparison: number;
  disconnect: number;
  adapters: number;
  cycle: number;
}

type HostFixtureOptions = Readonly<{
  masterEnabled?: boolean;
  workerEnabled?: boolean;
  credential?: "ABSENT" | "CONFIGURED" | "CONFIG_INVALID";
  malformedMaster?: boolean;
  malformedActivation?: boolean;
  poisonAfterMaster?: boolean;
  poisonDatabase?: boolean;
  databaseConstructionFailure?: boolean;
  connectivityFailure?: boolean;
  migrationFailure?: "filesystem" | "ledger" | "ledgerPermission" | "comparison"
    | "comparatorUnexpected";
  runtimeFailure?: "adapters" | "cycle" | "disconnect";
  operationFailure?: boolean;
  disconnectFailure?: boolean;
  cycleResult?: RefundExecutionWorkerCycleResult;
}>;

function hostFixture(options: HostFixtureOptions = Object.freeze({})) {
  const calls = expectedCalls({});
  const order: string[] = [];
  const called = (key: keyof CallCounts) => {
    calls[key] += 1;
    order.push(key);
  };
  const poison = () => {
    throw new Error("POISON_BOUNDARY_REACHED");
  };
  const database = Object.freeze({ identity: "fake-refund-worker-database" as const });
  const dependencies: RefundExecutionWorkerHostDependencies<FakeDatabase> = Object.freeze({
    inspectMasterGate: () => {
      called("master");
      if (options.malformedMaster) throw new RefundExecutionActivationConfigError("MASTER");
      return options.masterEnabled ?? true;
    },
    inspectActivation: () => {
      called("activation");
      if (options.poisonAfterMaster || options.malformedActivation) poison();
      return Object.freeze({ workerEnabled: options.workerEnabled ?? true });
    },
    inspectCredential: () => {
      called("credential");
      if (options.poisonAfterMaster) poison();
      return options.credential ?? "CONFIGURED";
    },
    createDatabase: () => {
      called("createDatabase");
      if (options.poisonAfterMaster || options.poisonDatabase
        || options.databaseConstructionFailure) poison();
      return database;
    },
    checkDatabaseConnectivity: () => {
      called("connectivity");
      return options.connectivityFailure ? Promise.reject(new Error("UNAVAILABLE")) : Promise.resolve();
    },
    loadRepositoryMigrations: () => {
      called("repository");
      if (options.migrationFailure === "filesystem") return Promise.reject(new Error("FILESYSTEM"));
      return Promise.resolve(Object.freeze([{ name: "001", checksum: "a".repeat(64) }]));
    },
    readMigrationLedger: () => {
      called("ledger");
      if (options.migrationFailure === "ledger"
        || options.migrationFailure === "ledgerPermission") {
        return Promise.reject(new Error("LEDGER_UNREADABLE"));
      }
      const checksum = options.migrationFailure === "comparison" ? "b" : "a";
      return Promise.resolve(Object.freeze({
        exists: true,
        records: Object.freeze([{
          migration_name: "001",
          checksum: checksum.repeat(64),
          finished_at: new Date("2026-07-20T00:00:00.000Z"),
          rolled_back_at: null,
          applied_steps_count: 1,
        }]),
      }));
    },
    compareMigrations: (repository, ledger) => {
      called("comparison");
      if (options.migrationFailure === "comparatorUnexpected") poison();
      return compareRefundWorkerMigrations(repository, ledger);
    },
    disconnectDatabase: () => {
      called("disconnect");
      return options.runtimeFailure === "disconnect" || options.disconnectFailure
        ? Promise.reject(new Error("DISCONNECT"))
        : Promise.resolve();
    },
    createWorkerDependencies: () => {
      called("adapters");
      if (options.runtimeFailure === "adapters") poison();
      return Object.freeze({
        lookup: () => Promise.resolve({ kind: "unavailable" as const }),
        cancellation: () => Promise.resolve({ kind: "unknown" as const }),
      });
    },
    runWorkerCycle: () => {
      called("cycle");
      if (options.runtimeFailure === "cycle" || options.operationFailure) {
        return Promise.reject(new Error("CYCLE"));
      }
      return Promise.resolve(options.cycleResult ?? cycleSuccess());
    },
  });
  return { calls, order, dependencies };
}

function expectedCalls(overrides: Partial<CallCounts>): CallCounts {
  return {
    master: 0,
    activation: 0,
    credential: 0,
    createDatabase: 0,
    connectivity: 0,
    repository: 0,
    ledger: 0,
    comparison: 0,
    disconnect: 0,
    adapters: 0,
    cycle: 0,
    ...overrides,
  };
}

function cycleSuccess(): RefundExecutionWorkerCycleResult {
  return Object.freeze({ ok: true, cycle: Object.freeze(emptyCounters()) });
}

function workerFailure(
  code: "FEATURE_DISABLED" | "INVALID_WORKER_OWNER" | "CONFIG_INVALID" | "SYSTEMIC_FAILURE",
): RefundExecutionWorkerCycleResult {
  return Object.freeze({ ok: false, code, message: "sensitive diagnostic must not escape" });
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
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
}
