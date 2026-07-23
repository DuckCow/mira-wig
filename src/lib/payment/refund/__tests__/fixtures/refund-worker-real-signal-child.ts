import type { RefundExecutionWorkerHostDependencies } from "../../run-refund-execution-worker-host";
import {
  workerCycleStopped,
  workerCycleSuccess,
  type RefundExecutionWorkerCycleControl,
  type RefundExecutionWorkerCycleCounters,
} from "../../worker-contract";
import {
  createProcessRefundExecutionWorkerHostLifecycle,
  type RefundExecutionWorkerHostLifecycle,
} from "../../worker-host-lifecycle";
import { runRefundExecutionWorkerProcess } from "../../worker-host-process";
import type { TossRefundCancellationPort } from "../../providers/toss/refund-cancellation-http";
import { ConfiguredTossRefundCredential } from "../../providers/toss/refund-credential-config";
import type { TossRefundLookupPort } from "../../providers/toss/refund-lookup-http";

interface FakeDatabase {
  readonly kind: "real-signal-fake-database";
}

type ParentMessage = Readonly<{ type: "PROBE"; id: number }>
  | Readonly<{ type: "RELEASE" }>;

const work = {
  firstStarted: 0,
  firstCompleted: 0,
  secondStarted: 0,
  lookupPort: 0,
  cancellationPort: 0,
  fetch: 0,
  secretReader: 0,
};
const baseline = {
  sigterm: process.listenerCount("SIGTERM"),
  sigint: process.listenerCount("SIGINT"),
  timeouts: activeTimeoutCount(),
};
let lifecycle: RefundExecutionWorkerHostLifecycle | null = null;

globalThis.fetch = () => {
  work.fetch += 1;
  throw new Error("REAL_FETCH_FORBIDDEN");
};
Object.defineProperty(ConfiguredTossRefundCredential.prototype, "readSecretKey", {
  configurable: true,
  value: () => {
    work.secretReader += 1;
    throw new Error("REAL_SECRET_READER_FORBIDDEN");
  },
});

void main().catch(async () => {
  await sendMessage({ type: "HARNESS_FAILURE" });
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const database = Object.freeze({ kind: "real-signal-fake-database" as const });
  const lookup: TossRefundLookupPort = () => {
    work.lookupPort += 1;
    return Promise.resolve({ kind: "unavailable" });
  };
  const cancellation: TossRefundCancellationPort = () => {
    work.cancellationPort += 1;
    return Promise.resolve({ kind: "unknown" });
  };
  const dependencies: RefundExecutionWorkerHostDependencies<FakeDatabase> = Object.freeze({
    inspectMasterGate: () => true,
    inspectActivation: () => Object.freeze({ workerEnabled: true }),
    inspectCredential: () => "CONFIGURED" as const,
    createLifecycle: () => {
      lifecycle = createProcessRefundExecutionWorkerHostLifecycle();
      return lifecycle;
    },
    createDatabase: () => database,
    checkDatabaseConnectivity: () => Promise.resolve(),
    loadRepositoryMigrations: () => Promise.resolve(Object.freeze([
      { name: "001", checksum: "a".repeat(64) },
    ])),
    readMigrationLedger: () => Promise.resolve(Object.freeze({
      exists: true,
      records: Object.freeze([{
        migration_name: "001",
        checksum: "a".repeat(64),
        finished_at: new Date("2026-07-20T00:00:00.000Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
      }]),
    })),
    compareMigrations: () => Object.freeze({ ok: true as const, status: "READY" as const }),
    disconnectDatabase: () => Promise.resolve(),
    runProviderContactAdmission: async (_env, operation) => Object.freeze({
      outcome: "ACQUIRED" as const,
      result: await operation(),
    }),
    createWorkerDependencies: () => Object.freeze({ lookup, cancellation }),
    runWorkerCycle: async (_database, _owner, _ports, _env, control) => runFakeCycle(control),
  });

  const exitCode = await runRefundExecutionWorkerProcess(
    [
      "run-once",
      "--service", "private-signal-service",
      "--revision", "private-signal-revision",
      "--slot", "private-signal-slot",
    ],
    { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED" },
    { stdout: process.stdout, stderr: process.stderr },
    dependencies,
  );
  const completedLifecycle = lifecycle;
  await sendMessage({
    type: "CLEANUP",
    sigterm: process.listenerCount("SIGTERM"),
    sigint: process.listenerCount("SIGINT"),
    timeouts: activeTimeoutCount(),
    baseline,
    reason: completedLifecycle?.drainReason() ?? null,
    work,
  });
  process.exitCode = exitCode;
}

async function runFakeCycle(
  control: RefundExecutionWorkerCycleControl,
): Promise<ReturnType<typeof workerCycleSuccess> | ReturnType<typeof workerCycleStopped>> {
  work.firstStarted += 1;
  await sendMessage({
    type: "IN_FLIGHT",
    sigterm: process.listenerCount("SIGTERM"),
    sigint: process.listenerCount("SIGINT"),
    baseline,
  });
  await waitForRelease(control);
  work.firstCompleted += 1;
  if (control.shouldStop()) {
    return workerCycleStopped(oneCompletedCandidateCounters());
  }
  work.secondStarted += 1;
  return workerCycleSuccess(twoCompletedCandidateCounters());
}

function waitForRelease(control: RefundExecutionWorkerCycleControl): Promise<void> {
  return new Promise((resolve) => {
    const onMessage = (value: unknown) => {
      const message = parentMessage(value);
      if (!message) return;
      if (message.type === "PROBE") {
        void sendMessage({
          type: "DRAIN_STATE",
          id: message.id,
          shouldStop: control.shouldStop(),
          reason: lifecycle?.drainReason() ?? null,
        });
        return;
      }
      process.off("message", onMessage);
      resolve();
    };
    process.on("message", onMessage);
  });
}

function parentMessage(value: unknown): ParentMessage | null {
  if (!value || typeof value !== "object" || !("type" in value)) return null;
  if (value.type === "RELEASE") return Object.freeze({ type: "RELEASE" });
  if (value.type !== "PROBE" || !("id" in value)
    || typeof value.id !== "number" || !Number.isSafeInteger(value.id)) return null;
  return Object.freeze({ type: "PROBE", id: value.id });
}

function sendMessage(message: Readonly<Record<string, unknown>>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send) {
      reject(new Error("IPC_REQUIRED"));
      return;
    }
    process.send(message, (error) => error ? reject(error) : resolve());
  });
}

function activeTimeoutCount(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
}

function oneCompletedCandidateCounters(): RefundExecutionWorkerCycleCounters {
  return Object.freeze({
    selectedCount: 1,
    attemptedCount: 1,
    succeededCount: 1,
    replayedCount: 0,
    temporaryCount: 0,
    manualCount: 0,
    conflictCount: 0,
    inconsistentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    providerLookupCount: 0,
    providerCancellationCount: 0,
    readySelected: 1,
    uncontactedSelected: 0,
    contactedSelected: 0,
  });
}

function twoCompletedCandidateCounters(): RefundExecutionWorkerCycleCounters {
  return Object.freeze({
    ...oneCompletedCandidateCounters(),
    selectedCount: 2,
    attemptedCount: 2,
    succeededCount: 2,
    readySelected: 2,
  });
}
