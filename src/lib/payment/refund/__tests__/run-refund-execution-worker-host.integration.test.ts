import { PaymentMode, PaymentProvider } from "@prisma/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_LEASE_ENABLED,
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED,
  REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED,
  REFUND_EXECUTION_TOSS_CONTACT_ENABLED,
  REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED,
  REFUND_EXECUTION_WORKER_ENABLED,
} from "../execution-activation";
import type { TossRefundCancellationPort } from "../providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "../providers/toss/refund-lookup-http";
import {
  defaultRefundExecutionWorkerHostDependencies,
  runRefundExecutionWorkerHost,
} from "../run-refund-execution-worker-host";
import { runWithRefundProviderContactAdmission } from "../refund-provider-contact-admission";
import {
  createRefundExecutionWorkerHostLifecycle,
  REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS,
  type RefundExecutionWorkerDrainReason,
  type RefundExecutionWorkerHostSignal,
  type RefundExecutionWorkerLifecycleRuntime,
} from "../worker-host-lifecycle";
import {
  cleanupDispatchFixtures,
  createDispatchFixture,
  type DispatchFixture,
} from "./refund-dispatch-fixture";

const fixtures: DispatchFixture[] = [];
const CHECK = Object.freeze({ kind: "CHECK" as const });
const RUN_ONCE = Object.freeze({
  kind: "RUN_ONCE" as const,
  workerOwner: "refund-sbx:integration:revision:slot",
});

beforeAll(() => {
  requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

afterEach(async () => {
  await cleanupDispatchFixtures(...fixtures);
  fixtures.length = 0;
  vi.unstubAllGlobals();
});

describe("refund execution one-shot host integration", () => {
  it("returns real-session overlap before every poisoned financial and provider boundary", async () => {
    const entered = deferred();
    const release = deferred();
    const holder = runWithRefundProviderContactAdmission(
      { DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL) },
      async () => {
        entered.resolve();
        await release.promise;
        return "HELD" as const;
      },
    );
    await entered.promise;
    const poison = Object.freeze({
      selector: vi.fn(),
      lease: vi.fn(),
      secretReader: vi.fn(),
      adapter: vi.fn(),
      lookup: vi.fn(),
      cancellation: vi.fn(),
      mutation: vi.fn(),
    });

    const result = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createWorkerDependencies: () => {
        poison.adapter();
        return fakePorts(null, { get: 0, post: 0 }).dependencies;
      },
      runWorkerCycle: () => {
        poison.selector();
        poison.lease();
        poison.secretReader();
        poison.lookup();
        poison.cancellation();
        poison.mutation();
        return Promise.reject(new Error("PROTECTED_BOUNDARY_MUST_NOT_RUN"));
      },
    });

    expect(result).toEqual({ ok: true, code: "OVERLAP_SKIPPED" });
    for (const boundary of Object.values(poison)) expect(boundary).not.toHaveBeenCalled();
    release.resolve();
    await expect(holder).resolves.toEqual({ outcome: "ACQUIRED", result: "HELD" });
  });

  it("checks the real disposable database and migration ledger without business mutation or network", async () => {
    const before = await readRefundMutationSnapshot();
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);

    const result = await runRefundExecutionWorkerHost(
      CHECK,
      { DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL) },
      defaultRefundExecutionWorkerHostDependencies,
    );

    expect(result).toEqual({
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
    });
    expect(await readRefundMutationSnapshot()).toEqual(before);
    expect(fetchPoison).not.toHaveBeenCalled();
  });

  it("owns and disconnects a database client for an enabled empty queue without network", async () => {
    expect(await db.refundExecutionCommand.count()).toBe(0);
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);
    let adapterConstructions = 0;
    let disconnects = 0;
    const result = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createWorkerDependencies: () => {
        adapterConstructions += 1;
        return fakePorts(null, { get: 0, post: 0 }).dependencies;
      },
      disconnectDatabase: async (database) => {
        disconnects += 1;
        await defaultRefundExecutionWorkerHostDependencies.disconnectDatabase(database);
      },
    });

    expect(result).toEqual({ ok: true, code: "CYCLE_COMPLETE", cycle: emptyCounters() });
    expect(adapterConstructions).toBe(1);
    expect(disconnects).toBe(1);
    expect(fetchPoison).not.toHaveBeenCalled();
  });

  it("runs one bounded READY cycle through typed fake ports and returns aggregate counters", async () => {
    const fixture = await createTossFixture();
    const calls = { get: 0, post: 0 };
    const ports = fakePorts(fixture, calls);
    const fetchPoison = vi.fn(() => {
      throw new Error("GLOBAL_NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", fetchPoison);

    const result = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createWorkerDependencies: () => ports.dependencies,
    });

    expect(result).toEqual({
      ok: true,
      code: "CYCLE_COMPLETE",
      cycle: {
        ...emptyCounters(),
        selectedCount: 1,
        attemptedCount: 1,
        succeededCount: 1,
        providerLookupCount: 2,
        providerCancellationCount: 1,
        readySelected: 1,
      },
    });
    expect(calls).toEqual({ get: 2, post: 1 });
    expect(fetchPoison).not.toHaveBeenCalled();
    expect(await db.refundExecutionCommand.findUniqueOrThrow({
      where: { id: fixture.commandId },
      select: { status: true },
    })).toEqual({ status: "DONE" });
  });

  it.each(["SIGNAL", "BUDGET"] as const)(
    "drains for %s during an in-flight candidate and safely processes the untouched candidate later",
    async (reason) => {
      const first = await createTossFixture(new Date("2020-01-01T00:00:00.000Z"));
      const second = await createTossFixture(new Date("2020-01-02T00:00:00.000Z"));
      const calls = { get: 0, post: 0 };
      const started = deferred();
      const release = deferred();
      const lifecycle = integrationLifecycle(reason);
      const ports = inFlightPorts([first, second], calls, started.resolve, release.promise);
      const fetchPoison = vi.fn(() => { throw new Error("GLOBAL_NETWORK_FORBIDDEN"); });
      vi.stubGlobal("fetch", fetchPoison);
      let disconnects = 0;

      const operation = runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
        ...defaultRefundExecutionWorkerHostDependencies,
        createLifecycle: () => lifecycle.lifecycle,
        createWorkerDependencies: () => ports,
        disconnectDatabase: async (database) => {
          disconnects += 1;
          await defaultRefundExecutionWorkerHostDependencies.disconnectDatabase(database);
        },
      });
      await started.promise;
      expect(calls).toEqual({ get: 2, post: 1 });
      lifecycle.requestDrain();
      release.resolve();

      expect(await operation).toEqual({
        ok: true,
        code: "LIFECYCLE_DRAINED",
        reason,
        cycle: {
          ...emptyCounters(),
          selectedCount: 1,
          attemptedCount: 1,
          succeededCount: 1,
          providerLookupCount: 2,
          providerCancellationCount: 1,
          readySelected: 1,
        },
      });
      expect(calls).toEqual({ get: 2, post: 1 });
      expect(disconnects).toBe(1);
      expect(lifecycle.cleanup).toEqual(lifecycleCleanupCounts());
      expect(fetchPoison).not.toHaveBeenCalled();
      await expectCommandStatus(first, "DONE");
      await expectCommandStatus(second, "READY");

      const laterCalls = { get: 0, post: 0 };
      const later = await runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
        ...defaultRefundExecutionWorkerHostDependencies,
        createWorkerDependencies: () => fakePortsForFixtures([first, second], laterCalls),
      });

      expect(later).toEqual({
        ok: true,
        code: "CYCLE_COMPLETE",
        cycle: {
          ...emptyCounters(),
          selectedCount: 1,
          attemptedCount: 1,
          succeededCount: 1,
          providerLookupCount: 2,
          providerCancellationCount: 1,
          readySelected: 1,
        },
      });
      expect(laterCalls).toEqual({ get: 2, post: 1 });
      await expectCommandStatus(second, "DONE");
      expect(fetchPoison).not.toHaveBeenCalled();
    },
  );

  it("keeps an in-flight systemic cycle failure ahead of a pending signal drain", async () => {
    const fixture = await createTossFixture();
    const started = deferred();
    const release = deferred();
    const lifecycle = integrationLifecycle("SIGNAL");
    const lookup: TossRefundLookupPort = async () => {
      started.resolve();
      await release.promise;
      throw new Error("IN_FLIGHT_PROVIDER_FAKE_SECRET");
    };
    const cancellation: TossRefundCancellationPort = () => {
      throw new Error("CANCELLATION_MUST_NOT_RUN");
    };

    const operation = runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createLifecycle: () => lifecycle.lifecycle,
      createWorkerDependencies: () => Object.freeze({ lookup, cancellation }),
    });
    await started.promise;
    lifecycle.requestDrain();
    release.resolve();

    const result = await operation;
    expect(result).toEqual({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      cycle: {
        ...emptyCounters(),
        selectedCount: 1,
        attemptedCount: 1,
        failedCount: 1,
        providerLookupCount: 1,
        readySelected: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain("IN_FLIGHT_PROVIDER_FAKE_SECRET");
    expect(lifecycle.cleanup).toEqual(lifecycleCleanupCounts());
    await expectCommandStatus(fixture, "LEASED");
  });

  it("lets disconnect failure override an in-flight drained cycle and still cleans lifecycle", async () => {
    const first = await createTossFixture(new Date("2020-03-01T00:00:00.000Z"));
    const second = await createTossFixture(new Date("2020-03-02T00:00:00.000Z"));
    const calls = { get: 0, post: 0 };
    const started = deferred();
    const release = deferred();
    const lifecycle = integrationLifecycle("SIGNAL");
    let disconnects = 0;

    const operation = runRefundExecutionWorkerHost(RUN_ONCE, enabledEnv(), {
      ...defaultRefundExecutionWorkerHostDependencies,
      createLifecycle: () => lifecycle.lifecycle,
      createWorkerDependencies: () => inFlightPorts(
        [first, second], calls, started.resolve, release.promise,
      ),
      disconnectDatabase: async (database) => {
        disconnects += 1;
        await defaultRefundExecutionWorkerHostDependencies.disconnectDatabase(database);
        throw new Error("DISCONNECT_SECRET");
      },
    });
    await started.promise;
    lifecycle.requestDrain();
    release.resolve();

    expect(await operation).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(disconnects).toBe(1);
    expect(calls).toEqual({ get: 2, post: 1 });
    expect(lifecycle.cleanup).toEqual(lifecycleCleanupCounts());
    await expectCommandStatus(first, "DONE");
    await expectCommandStatus(second, "READY");
  });
});

async function createTossFixture(availableAt?: Date): Promise<DispatchFixture> {
  const fixture = await createDispatchFixture({
    totalAmount: 85_000,
    targetAmount: 85_000,
    availableAt,
  });
  fixtures.push(fixture);
  await Promise.all([
    db.payment.update({
      where: { id: fixture.paymentId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
    db.refundAttempt.update({
      where: { id: fixture.refundAttemptId },
      data: { provider: PaymentProvider.TOSS, mode: PaymentMode.SANDBOX },
    }),
  ]);
  return fixture;
}

function fakePorts(fixture: DispatchFixture | null, calls: { get: number; post: number }) {
  const lookup: TossRefundLookupPort = () => {
    calls.get += 1;
    if (!fixture) return Promise.resolve({ kind: "unavailable" });
    return Promise.resolve({ kind: "response", body: JSON.stringify(eligibleBody(fixture)) });
  };
  const cancellation: TossRefundCancellationPort = () => {
    calls.post += 1;
    if (!fixture) return Promise.resolve({ kind: "unknown" });
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
  return { dependencies: Object.freeze({ lookup, cancellation }) };
}

function fakePortsForFixtures(
  candidates: readonly DispatchFixture[],
  calls: { get: number; post: number },
) {
  const cancelled = new Set<string>();
  const lookup: TossRefundLookupPort = (paymentKey) => {
    calls.get += 1;
    const fixture = fixtureForPaymentKey(candidates, paymentKey);
    const body = cancelled.has(paymentKey) ? successBody(fixture) : eligibleBody(fixture);
    return Promise.resolve({ kind: "response", body: JSON.stringify(body) });
  };
  const cancellation: TossRefundCancellationPort = (contact) => {
    calls.post += 1;
    const fixture = fixtureForContact(candidates, contact.wire.path);
    cancelled.add(fixture.providerPaymentKey);
    return Promise.resolve({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
  return Object.freeze({ lookup, cancellation });
}

function inFlightPorts(
  candidates: readonly DispatchFixture[],
  calls: { get: number; post: number },
  markStarted: () => void,
  release: Promise<void>,
) {
  const cancelled = new Set<string>();
  const lookup: TossRefundLookupPort = (paymentKey) => {
    calls.get += 1;
    const fixture = fixtureForPaymentKey(candidates, paymentKey);
    const body = cancelled.has(paymentKey) ? successBody(fixture) : eligibleBody(fixture);
    return Promise.resolve({ kind: "response", body: JSON.stringify(body) });
  };
  const cancellation: TossRefundCancellationPort = async (contact) => {
    calls.post += 1;
    const fixture = fixtureForContact(candidates, contact.wire.path);
    markStarted();
    await release;
    cancelled.add(fixture.providerPaymentKey);
    return Object.freeze({ kind: "success", body: JSON.stringify(successBody(fixture)) });
  };
  return Object.freeze({ lookup, cancellation });
}

function fixtureForPaymentKey(
  fixturesToSearch: readonly DispatchFixture[],
  paymentKey: string,
): DispatchFixture {
  const fixture = fixturesToSearch.find((candidate) => candidate.providerPaymentKey === paymentKey);
  if (!fixture) throw new Error("UNKNOWN_FAKE_PAYMENT_KEY");
  return fixture;
}

function fixtureForContact(
  fixturesToSearch: readonly DispatchFixture[],
  path: string,
): DispatchFixture {
  const fixture = fixturesToSearch.find((candidate) => (
    path.includes(encodeURIComponent(candidate.providerPaymentKey))
  ));
  if (!fixture) throw new Error("UNKNOWN_FAKE_CONTACT_PATH");
  return fixture;
}

function enabledEnv(): Readonly<Record<string, string | undefined>> {
  return Object.freeze({
    DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL),
    TOSS_SANDBOX_SECRET_KEY: "synthetic_host_test_secret",
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-host-test",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-host-test",
    [REFUND_EXECUTION_WORKER_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_LEASE_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_TOSS_CONTACT_ENABLED]: "ENABLED",
    [REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED]: "ENABLED",
  });
}

function eligibleBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    method: "카드",
    easyPay: null,
    currency: "KRW",
    status: "DONE",
    totalAmount: fixture.totalAmount,
    balanceAmount: fixture.targetAmount,
    taxFreeAmount: 0,
    taxExemptionAmount: 0,
    cancels: null,
  };
}

function successBody(fixture: DispatchFixture) {
  return {
    paymentKey: fixture.providerPaymentKey,
    currency: "KRW",
    status: "CANCELED",
    totalAmount: fixture.totalAmount,
    balanceAmount: 0,
    cancels: [{
      transactionKey: `host-worker-transaction-${fixture.refundAttemptId}`,
      cancelStatus: "DONE",
      cancelAmount: fixture.targetAmount,
      cancelReason: "Mira merchant refund",
    }],
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

async function readRefundMutationSnapshot() {
  return Promise.all([
    db.refundAttempt.count(),
    db.refundAttemptTransition.count(),
    db.refundExecutionCommand.count(),
    db.refundExecutionCommandEvent.count(),
    db.refundExecutionDispatchAttempt.count(),
    db.refundExecutionProviderContactEligibilityProof.count(),
    db.refundExecutionProviderOperationBinding.count(),
    db.refundExecutionProviderEligibilityProof.count(),
    db.refundExecutionEvidence.count(),
  ]);
}

type LifecycleTimer = Readonly<{ id: "integration-lifecycle-budget" }>;

function integrationLifecycle(reason: RefundExecutionWorkerDrainReason) {
  const listeners = new Map<RefundExecutionWorkerHostSignal, Set<() => void>>();
  const cleanup = emptyLifecycleCleanupCounts();
  let timerListener: (() => void) | null = null;
  const runtime: RefundExecutionWorkerLifecycleRuntime<LifecycleTimer> = Object.freeze({
    addSignalListener: (signal, listener) => {
      if (signal === "SIGTERM") cleanup.sigtermRegistered += 1;
      if (signal === "SIGINT") cleanup.sigintRegistered += 1;
      const registered = listeners.get(signal) ?? new Set<() => void>();
      registered.add(listener);
      listeners.set(signal, registered);
    },
    removeSignalListener: (signal, listener) => {
      if (signal === "SIGTERM") cleanup.sigtermRemoved += 1;
      if (signal === "SIGINT") cleanup.sigintRemoved += 1;
      listeners.get(signal)?.delete(listener);
    },
    setTimer: (listener, delayMs) => {
      expect(delayMs).toBe(REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS);
      cleanup.timerRegistered += 1;
      timerListener = listener;
      return Object.freeze({ id: "integration-lifecycle-budget" as const });
    },
    clearTimer: () => {
      cleanup.timerCleared += 1;
      timerListener = null;
    },
  });
  const lifecycle = createRefundExecutionWorkerHostLifecycle(runtime);
  return {
    lifecycle,
    cleanup,
    requestDrain: () => {
      if (reason === "BUDGET") {
        timerListener?.();
        return;
      }
      for (const listener of listeners.get("SIGTERM") ?? []) listener();
    },
  };
}

function lifecycleCleanupCounts() {
  return {
    timerRegistered: 1,
    timerCleared: 1,
    sigtermRegistered: 1,
    sigtermRemoved: 1,
    sigintRegistered: 1,
    sigintRemoved: 1,
  };
}

function emptyLifecycleCleanupCounts() {
  return {
    timerRegistered: 0,
    timerCleared: 0,
    sigtermRegistered: 0,
    sigtermRemoved: 0,
    sigintRegistered: 0,
    sigintRemoved: 0,
  };
}

function deferred() {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return Object.freeze({
    promise,
    resolve: () => resolvePromise?.(),
  });
}

async function expectCommandStatus(
  fixture: DispatchFixture,
  status: "READY" | "LEASED" | "DONE",
): Promise<void> {
  await expect(db.refundExecutionCommand.findUniqueOrThrow({
    where: { id: fixture.commandId },
    select: { status: true },
  })).resolves.toEqual({ status });
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for worker host integration.");
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!local || database !== "wig_platform_test") {
    throw new Error("Worker host integration is restricted to local wig_platform_test.");
  }
  return value;
}
