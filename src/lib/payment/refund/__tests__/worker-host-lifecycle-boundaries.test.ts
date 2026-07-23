import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runRefundExecutionWorkerHost,
  type RefundExecutionWorkerHostDependencies,
} from "../run-refund-execution-worker-host";
import {
  createRefundExecutionWorkerHostLifecycle,
  REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS,
  type RefundExecutionWorkerDrainReason,
  type RefundExecutionWorkerHostSignal,
  type RefundExecutionWorkerLifecycleRuntime,
} from "../worker-host-lifecycle";
import { workerHostExitCode } from "../worker-host-contract";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";

const RUN_ONCE = Object.freeze({
  kind: "RUN_ONCE" as const,
  workerOwner: "refund-sbx:lifecycle:revision:slot",
});
const ENABLED_ENV = Object.freeze({ REFUND_EXECUTION_WORKER_ENABLED: "ENABLED" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refund execution worker lifecycle readiness boundaries", () => {
  it.each([
    ["SIGNAL", "beforeDatabase"],
    ["SIGNAL", "duringConnectivity"],
    ["SIGNAL", "afterConnectivity"],
    ["SIGNAL", "afterInventory"],
    ["SIGNAL", "afterComparison"],
    ["SIGNAL", "afterAdapters"],
    ["BUDGET", "beforeDatabase"],
    ["BUDGET", "duringConnectivity"],
    ["BUDGET", "afterConnectivity"],
    ["BUDGET", "afterInventory"],
    ["BUDGET", "afterComparison"],
    ["BUDGET", "afterAdapters"],
  ] as const)("blocks later boundaries for %s drain at %s", async (reason, stage) => {
    const fixture = readinessFixture(reason, stage);

    const result = await runRefundExecutionWorkerHost(
      RUN_ONCE,
      ENABLED_ENV,
      fixture.dependencies,
    );

    expect(result).toEqual({
      ok: true,
      code: "LIFECYCLE_DRAINED",
      reason,
      cycle: emptyCounters(),
    });
    expect(workerHostExitCode(result)).toBe(75);
    expect(fixture.counts).toEqual(expectedCounts(stage));
    expect(fixture.timerDelays).toEqual([REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS]);
    expect(fixture.globalFetch).not.toHaveBeenCalled();
  });

  it("lets an initially active lifecycle inspect activation and credentials exactly once", async () => {
    const fixture = readinessFixture("SIGNAL", "never");

    const result = await runRefundExecutionWorkerHost(
      RUN_ONCE,
      ENABLED_ENV,
      fixture.dependencies,
    );

    expect(result).toEqual({ ok: true, code: "CYCLE_COMPLETE", cycle: emptyCounters() });
    expect(fixture.counts).toEqual(expectedActiveCounts());
    expect(fixture.globalFetch).not.toHaveBeenCalled();
  });

  it("maps lifecycle factory failure to bounded systemic failure before database construction", async () => {
    const fixture = readinessFixture("SIGNAL", "never");

    const result = await runRefundExecutionWorkerHost(RUN_ONCE, ENABLED_ENV, {
      ...fixture.dependencies,
      createLifecycle: () => { throw new Error("LIFECYCLE_FACTORY_SECRET"); },
    });

    expect(result).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(JSON.stringify(result)).not.toContain("LIFECYCLE_FACTORY_SECRET");
    expect(fixture.counts.databaseConstruction).toBe(0);
  });
});

type ReadinessStage = "beforeDatabase" | "duringConnectivity" | "afterConnectivity"
  | "afterInventory" | "afterComparison" | "afterAdapters" | "never";

interface FakeDatabase {
  readonly identity: "lifecycle-boundary-database";
}

interface BoundaryCounts {
  lifecycleCreation: number;
  lifecycleObservation: number;
  lifecycleDisposal: number;
  activationInventory: number;
  credentialParser: number;
  credentialSecretReader: number;
  databaseConstruction: number;
  connectivity: number;
  localMigrationInventory: number;
  ledgerQuery: number;
  migrationComparator: number;
  lookupAdapterFactory: number;
  cancellationAdapterFactory: number;
  workerCycle: number;
  selector: number;
  lookupPort: number;
  cancellationPort: number;
  globalFetch: number;
  disconnect: number;
  timerRegistration: number;
  timerCleanup: number;
  sigtermRegistration: number;
  sigtermRemoval: number;
  sigintRegistration: number;
  sigintRemoval: number;
  output: number;
}

type TimerToken = Readonly<{ id: "boundary-budget" }>;

function readinessFixture(reason: RefundExecutionWorkerDrainReason, stage: ReadinessStage) {
  const counts = zeroBoundaryCounts();
  const timerDelays: number[] = [];
  const listeners = new Map<RefundExecutionWorkerHostSignal, Set<() => void>>();
  let timerListener: (() => void) | null = null;
  const globalFetch = vi.fn(() => {
    counts.globalFetch += 1;
    throw new Error("GLOBAL_FETCH_FORBIDDEN");
  });
  vi.stubGlobal("fetch", globalFetch);

  const requestDrain = () => {
    if (reason === "BUDGET") {
      timerListener?.();
      return;
    }
    for (const listener of listeners.get("SIGTERM") ?? []) listener();
  };
  const runtime: RefundExecutionWorkerLifecycleRuntime<TimerToken> = Object.freeze({
    addSignalListener: (signal, listener) => {
      if (signal === "SIGTERM") counts.sigtermRegistration += 1;
      if (signal === "SIGINT") counts.sigintRegistration += 1;
      const registered = listeners.get(signal) ?? new Set<() => void>();
      registered.add(listener);
      listeners.set(signal, registered);
    },
    removeSignalListener: (signal, listener) => {
      if (signal === "SIGTERM") counts.sigtermRemoval += 1;
      if (signal === "SIGINT") counts.sigintRemoval += 1;
      listeners.get(signal)?.delete(listener);
    },
    setTimer: (listener, delayMs) => {
      counts.timerRegistration += 1;
      timerDelays.push(delayMs);
      timerListener = listener;
      return Object.freeze({ id: "boundary-budget" as const });
    },
    clearTimer: () => {
      counts.timerCleanup += 1;
      timerListener = null;
    },
  });
  const database = Object.freeze({ identity: "lifecycle-boundary-database" as const });
  const dependencies = Object.freeze({
    inspectMasterGate: () => true,
    inspectActivation: () => {
      counts.activationInventory += 1;
      return Object.freeze({ workerEnabled: true });
    },
    inspectCredential: () => {
      counts.credentialParser += 1;
      return "CONFIGURED";
    },
    createLifecycle: () => {
      counts.lifecycleCreation += 1;
      const lifecycle = createRefundExecutionWorkerHostLifecycle(runtime);
      if (stage === "beforeDatabase") requestDrain();
      return Object.freeze({
        shouldStop: () => {
          counts.lifecycleObservation += 1;
          return lifecycle.shouldStop();
        },
        drainReason: () => lifecycle.drainReason(),
        dispose: () => {
          counts.lifecycleDisposal += 1;
          lifecycle.dispose();
        },
      });
    },
    createDatabase: () => {
      counts.databaseConstruction += 1;
      return database;
    },
    checkDatabaseConnectivity: async () => {
      counts.connectivity += 1;
      if (stage === "duringConnectivity") {
        await Promise.resolve();
        requestDrain();
      }
      if (stage === "afterConnectivity") requestDrain();
    },
    loadRepositoryMigrations: () => {
      counts.localMigrationInventory += 1;
      if (stage === "afterInventory") requestDrain();
      return Promise.resolve(Object.freeze([{ name: "001", checksum: "a".repeat(64) }]));
    },
    readMigrationLedger: () => {
      counts.ledgerQuery += 1;
      return Promise.resolve(Object.freeze({
        exists: true,
        records: Object.freeze([{
          migration_name: "001",
          checksum: "a".repeat(64),
          finished_at: new Date("2026-07-20T00:00:00.000Z"),
          rolled_back_at: null,
          applied_steps_count: 1,
        }]),
      }));
    },
    compareMigrations: (repository, ledger) => {
      counts.migrationComparator += 1;
      const result = compareRefundWorkerMigrations(repository, ledger);
      if (stage === "afterComparison") requestDrain();
      return result;
    },
    disconnectDatabase: () => {
      counts.disconnect += 1;
      return Promise.resolve();
    },
    runProviderContactAdmission: async (_env, operation) => Object.freeze({
      outcome: "ACQUIRED" as const,
      result: await operation(),
    }),
    createWorkerDependencies: () => {
      counts.lookupAdapterFactory += 1;
      const lookup = () => {
        counts.lookupPort += 1;
        return Promise.resolve({ kind: "unavailable" as const });
      };
      counts.cancellationAdapterFactory += 1;
      const cancellation = () => {
        counts.cancellationPort += 1;
        return Promise.resolve({ kind: "unknown" as const });
      };
      if (stage === "afterAdapters") requestDrain();
      return Object.freeze({ lookup, cancellation });
    },
    runWorkerCycle: () => {
      counts.workerCycle += 1;
      counts.selector += 1;
      return Promise.resolve({ ok: true, cycle: emptyCounters() });
    },
  } satisfies RefundExecutionWorkerHostDependencies<FakeDatabase>);
  return { counts, dependencies, timerDelays, globalFetch };
}

function expectedCounts(stage: Exclude<ReadinessStage, "never">): BoundaryCounts {
  const expected = zeroBoundaryCounts();
  expected.timerRegistration = 1;
  expected.timerCleanup = 1;
  expected.sigtermRegistration = 1;
  expected.sigtermRemoval = 1;
  expected.sigintRegistration = 1;
  expected.sigintRemoval = 1;
  expected.lifecycleCreation = 1;
  expected.lifecycleDisposal = 1;
  expected.lifecycleObservation = 1;
  if (stage === "beforeDatabase") return expected;
  expected.activationInventory = 1;
  expected.credentialParser = 1;
  expected.lifecycleObservation = 4;
  expected.databaseConstruction = 1;
  expected.disconnect = 1;
  expected.connectivity = 1;
  if (stage === "duringConnectivity" || stage === "afterConnectivity") return expected;
  expected.lifecycleObservation = 5;
  expected.localMigrationInventory = 1;
  if (stage === "afterInventory") return expected;
  expected.lifecycleObservation = 7;
  expected.ledgerQuery = 1;
  expected.migrationComparator = 1;
  if (stage === "afterComparison") return expected;
  expected.lifecycleObservation = 9;
  expected.lookupAdapterFactory = 1;
  expected.cancellationAdapterFactory = 1;
  return expected;
}

function expectedActiveCounts(): BoundaryCounts {
  const expected = zeroBoundaryCounts();
  expected.lifecycleCreation = 1;
  expected.lifecycleObservation = 9;
  expected.lifecycleDisposal = 1;
  expected.activationInventory = 1;
  expected.credentialParser = 1;
  expected.databaseConstruction = 1;
  expected.connectivity = 1;
  expected.localMigrationInventory = 1;
  expected.ledgerQuery = 1;
  expected.migrationComparator = 1;
  expected.lookupAdapterFactory = 1;
  expected.cancellationAdapterFactory = 1;
  expected.workerCycle = 1;
  expected.selector = 1;
  expected.disconnect = 1;
  expected.timerRegistration = 1;
  expected.timerCleanup = 1;
  expected.sigtermRegistration = 1;
  expected.sigtermRemoval = 1;
  expected.sigintRegistration = 1;
  expected.sigintRemoval = 1;
  return expected;
}

function zeroBoundaryCounts(): BoundaryCounts {
  return {
    lifecycleCreation: 0,
    lifecycleObservation: 0,
    lifecycleDisposal: 0,
    activationInventory: 0,
    credentialParser: 0,
    credentialSecretReader: 0,
    databaseConstruction: 0,
    connectivity: 0,
    localMigrationInventory: 0,
    ledgerQuery: 0,
    migrationComparator: 0,
    lookupAdapterFactory: 0,
    cancellationAdapterFactory: 0,
    workerCycle: 0,
    selector: 0,
    lookupPort: 0,
    cancellationPort: 0,
    globalFetch: 0,
    disconnect: 0,
    timerRegistration: 0,
    timerCleanup: 0,
    sigtermRegistration: 0,
    sigtermRemoval: 0,
    sigintRegistration: 0,
    sigintRemoval: 0,
    output: 0,
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
