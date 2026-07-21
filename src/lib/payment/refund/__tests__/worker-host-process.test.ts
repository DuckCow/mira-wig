import { describe, expect, it, vi } from "vitest";
import { isRefundExecutionWorkerEnabled } from "../execution-activation";
import type { RefundExecutionWorkerHostDependencies } from "../run-refund-execution-worker-host";
import { runRefundExecutionWorkerProcess } from "../worker-host-process";
import type { RefundExecutionWorkerCycleResult } from "../worker-contract";
import {
  createRefundExecutionWorkerHostLifecycle,
  REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS,
  type RefundExecutionWorkerHostSignal,
  type RefundExecutionWorkerLifecycleRuntime,
} from "../worker-host-lifecycle";
import { compareRefundWorkerMigrations } from "../worker-migration-readiness";

describe("refund execution worker process wrapper", () => {
  it("writes one safe CHECK_READY JSON line to stdout", async () => {
    const fixture = processFixture();
    const exitCode = await runRefundExecutionWorkerProcess(
      ["check"],
      {},
      fixture.output,
      fixture.dependencies,
    );

    expect(exitCode).toBe(0);
    expect(fixture.stderr).toEqual([]);
    expect(fixture.stdout).toHaveLength(1);
    expect(JSON.parse(fixture.stdout[0])).toEqual({
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
    });
  });

  it("writes invalid input only to stderr without constructing a database", async () => {
    const fixture = processFixture();
    const createLifecycle = vi.fn();
    const exitCode = await runRefundExecutionWorkerProcess(
      ["run-once", "--service", "missing-rest"],
      {},
      fixture.output,
      { ...fixture.dependencies, createLifecycle },
    );

    expect(exitCode).toBe(64);
    expect(fixture.stdout).toEqual([]);
    expect(fixture.stderr).toEqual(['{"ok":false,"code":"INVALID_HOST_INPUT"}\n']);
    expect(fixture.databaseCalls).toBe(0);
    expect(createLifecycle).not.toHaveBeenCalled();
  });

  it("emits no owner, labels, database facts, credential material, or worker diagnostics", async () => {
    const fixture = processFixture({ cycleFailure: true });
    const secret = "synthetic_secret_that_must_not_escape";
    const exitCode = await runRefundExecutionWorkerProcess(
      ["run-once", "--service", "private-service", "--revision", "private-revision", "--slot", "private-slot"],
      {
        REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
        TOSS_SANDBOX_SECRET_KEY: secret,
        TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "private-merchant",
        TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "private-generation",
      },
      fixture.output,
      fixture.dependencies,
    );

    expect(exitCode).toBe(1);
    expect(fixture.stdout).toEqual([]);
    expect(fixture.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
    const output = fixture.stderr.join("");
    for (const prohibited of [
      secret,
      "private-service",
      "private-revision",
      "private-slot",
      "private-merchant",
      "private-generation",
      "raw worker failure diagnostic",
    ]) expect(output).not.toContain(prohibited);
  });

  it("writes one exact lifecycle-drained JSON line to stderr and exits 75", async () => {
    const fixture = processFixture();
    let stopped = false;
    const dependencies: RefundExecutionWorkerHostDependencies<ProcessDatabase> = Object.freeze({
      ...fixture.dependencies,
      createLifecycle: () => Object.freeze({
        shouldStop: () => stopped,
        drainReason: () => stopped ? "BUDGET" as const : null,
        dispose: () => undefined,
      }),
      runWorkerCycle: (): Promise<RefundExecutionWorkerCycleResult> => {
        stopped = true;
        return Promise.resolve(Object.freeze({
          ok: true,
          stopped: true,
          cycle: Object.freeze({ ...emptyCounters(), selectedCount: 1, attemptedCount: 1 }),
        }));
      },
    });

    const exitCode = await runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
      fixture.output,
      dependencies,
    );

    expect(exitCode).toBe(75);
    expect(fixture.stdout).toEqual([]);
    expect(fixture.stderr).toHaveLength(1);
    expect(JSON.parse(fixture.stderr[0])).toEqual({
      ok: true,
      code: "LIFECYCLE_DRAINED",
      reason: "BUDGET",
      cycle: { ...emptyCounters(), selectedCount: 1, attemptedCount: 1 },
    });
  });

  it.each(["SIGTERM", "SIGINT"] as const)(
    "keeps output empty while enabled run-once is active, drains on %s, then cleans lifecycle",
    async (signal) => {
      const fixture = processFixture();
      const lifecycle = processLifecycleFixture();
      const started = deferred();
      const release = deferred();
      const dependencies: RefundExecutionWorkerHostDependencies<ProcessDatabase> = Object.freeze({
        ...fixture.dependencies,
        createLifecycle: () => lifecycle.lifecycle,
        runWorkerCycle: async (_database, _owner, _workerDependencies, _env, control) => {
          started.resolve();
          await release.promise;
          return control.shouldStop()
            ? Object.freeze({ ok: true, stopped: true, cycle: emptyCounters() })
            : Object.freeze({ ok: true, cycle: emptyCounters() });
        },
      });

      const operation = runRefundExecutionWorkerProcess(
        ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
        { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
        fixture.output,
        dependencies,
      );
      await started.promise;

      expect(lifecycle.listenerCount("SIGTERM")).toBe(1);
      expect(lifecycle.listenerCount("SIGINT")).toBe(1);
      expect(lifecycle.timerDelays).toEqual([REFUND_EXECUTION_WORKER_COOPERATIVE_BUDGET_MS]);
      expect(fixture.stdout).toEqual([]);
      expect(fixture.stderr).toEqual([]);
      lifecycle.emit(signal);
      expect(fixture.stdout).toEqual([]);
      expect(fixture.stderr).toEqual([]);
      release.resolve();

      await expect(operation).resolves.toBe(75);
      expect(fixture.stdout).toEqual([]);
      expect(fixture.stderr).toEqual([
        `{"ok":true,"code":"LIFECYCLE_DRAINED","reason":"SIGNAL","cycle":${JSON.stringify(emptyCounters())}}\n`,
      ]);
      expect(lifecycle.listenerCount("SIGTERM")).toBe(0);
      expect(lifecycle.listenerCount("SIGINT")).toBe(0);
      expect(lifecycle.timerClears).toBe(1);
      expect(fixture.stderr[0]).not.toMatch(/Error:|at\s+\S+|synthetic/u);
    },
  );

  it("serializes a pre-cycle budget drain with zero counters and clears the timer", async () => {
    const fixture = processFixture();
    const lifecycle = processLifecycleFixture();
    const dependencies: RefundExecutionWorkerHostDependencies<ProcessDatabase> = Object.freeze({
      ...fixture.dependencies,
      createLifecycle: () => {
        lifecycle.fireTimer();
        return lifecycle.lifecycle;
      },
    });

    const exitCode = await runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
      fixture.output,
      dependencies,
    );

    expect(exitCode).toBe(75);
    expect(fixture.stdout).toEqual([]);
    expect(JSON.parse(fixture.stderr[0])).toEqual({
      ok: true,
      code: "LIFECYCLE_DRAINED",
      reason: "BUDGET",
      cycle: emptyCounters(),
    });
    expect(lifecycle.timerClears).toBe(1);
    expect(lifecycle.listenerCount("SIGTERM")).toBe(0);
    expect(lifecycle.listenerCount("SIGINT")).toBe(0);
  });

  it("serializes an invalid lifecycle reason only as bounded systemic failure", async () => {
    const fixture = processFixture();
    const lifecycle = processLifecycleFixture();
    lifecycle.emit("SIGTERM");
    const invalidLifecycle = new Proxy(lifecycle.lifecycle, {
      get: (target, property) => {
        if (property === "drainReason") return () => "INVALID_REASON_SECRET";
        if (property === "shouldStop") return target.shouldStop;
        if (property === "dispose") return target.dispose;
        return undefined;
      },
    });

    const exitCode = await runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
      fixture.output,
      { ...fixture.dependencies, createLifecycle: () => invalidLifecycle },
    );

    expect(exitCode).toBe(1);
    expect(fixture.stdout).toEqual([]);
    expect(fixture.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
    expect(fixture.stderr[0]).not.toContain("INVALID_REASON_SECRET");
  });

  it.each([
    ["check", ["check"], {}],
    ["disabled", ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"], {}],
    ["malformed master", ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"], {
      REFUND_EXECUTION_WORKER_ENABLED: "malformed",
    }],
  ] as const)("creates no lifecycle for %s process path", async (_name, args, env) => {
    const fixture = processFixture();
    const createLifecycle = vi.fn(() => processLifecycleFixture().lifecycle);

    await runRefundExecutionWorkerProcess(
      args,
      env,
      fixture.output,
      {
        ...fixture.dependencies,
        inspectMasterGate: isRefundExecutionWorkerEnabled,
        createLifecycle,
      },
    );

    expect(createLifecycle).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "attempts stdout once, never falls back, and resolves exit 1 when the writer records=%s then throws",
    async (recordBeforeThrow) => {
      const fixture = processFixture();
      let stdoutCalls = 0;
      let stderrCalls = 0;
      const recorded: string[] = [];
      const output = {
        stdout: { write: (value: string) => {
          stdoutCalls += 1;
          if (recordBeforeThrow) recorded.push(value);
          throw new Error("BROKEN_STDOUT");
        } },
        stderr: { write: () => { stderrCalls += 1; } },
      };

      await expect(runRefundExecutionWorkerProcess(
        ["check"], {}, output, fixture.dependencies,
      )).resolves.toBe(1);
      expect(stdoutCalls).toBe(1);
      expect(stderrCalls).toBe(0);
      expect(recorded).toHaveLength(recordBeforeThrow ? 1 : 0);
    },
  );

  it("attempts stderr once and resolves exit 1 when a failure writer throws", async () => {
    const fixture = processFixture();
    let stdoutCalls = 0;
    let stderrCalls = 0;

    await expect(runRefundExecutionWorkerProcess(
      ["invalid"], {}, {
        stdout: { write: () => { stdoutCalls += 1; } },
        stderr: { write: () => {
          stderrCalls += 1;
          throw new Error("BROKEN_STDERR");
        } },
      }, fixture.dependencies,
    )).resolves.toBe(1);
    expect(stdoutCalls).toBe(0);
    expect(stderrCalls).toBe(1);
  });

  it("uses one static stderr write when serialization fails before writer invocation", async () => {
    const fixture = processFixture();
    const writes: Array<{ channel: "stdout" | "stderr"; value: string }> = [];

    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, {
        stdout: { write: (value) => writes.push({ channel: "stdout", value }) },
        stderr: { write: (value) => writes.push({ channel: "stderr", value }) },
      }, fixture.dependencies,
      () => { throw new Error("SERIALIZATION_FAILURE"); },
    )).resolves.toBe(1);
    expect(writes).toEqual([{
      channel: "stderr",
      value: '{"ok":false,"code":"SYSTEMIC_FAILURE"}\n',
    }]);
  });

  it("does not reject or retry output when an operation failure and stderr failure compose", async () => {
    const fixture = processFixture({ cycleFailure: true });
    let calls = 0;

    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
      {
        stdout: { write: () => { throw new Error("UNEXPECTED_STDOUT"); } },
        stderr: { write: () => {
          calls += 1;
          throw new Error("BROKEN_STDERR");
        } },
      },
      fixture.dependencies,
    )).resolves.toBe(1);
    expect(calls).toBe(1);
  });

  it("awaits a rejected stdout writer Promise without fallback or rejection leakage", async () => {
    const fixture = processFixture();
    const rejectionSecret = "TEST_STDOUT_WRITER_REJECTION_SECRET";
    const stdoutAttempts: string[] = [];
    const stderrAttempts: string[] = [];

    await expect(runRefundExecutionWorkerProcess(
      ["check"],
      {},
      {
        stdout: { write: (value) => {
          stdoutAttempts.push(value);
          return Promise.reject(new Error(rejectionSecret));
        } },
        stderr: { write: (value) => { stderrAttempts.push(value); } },
      },
      fixture.dependencies,
    )).resolves.toBe(1);

    expect(stdoutAttempts).toHaveLength(1);
    expect(stderrAttempts).toHaveLength(0);
    expect(stdoutAttempts[0]).toContain('"code":"CHECK_READY"');
    expect(stdoutAttempts.join("\n")).not.toContain(rejectionSecret);
    expect(stdoutAttempts.join("\n")).not.toMatch(/Error:|at\s+\S+/u);
  });

  it("awaits a rejected stderr writer Promise after operation failure without fallback", async () => {
    const fixture = processFixture({ cycleFailure: true });
    const rejectionSecret = "TEST_STDERR_WRITER_REJECTION_SECRET";
    const stdoutAttempts: string[] = [];
    const stderrAttempts: string[] = [];

    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      { REFUND_EXECUTION_WORKER_ENABLED: "ENABLED", TOSS_SANDBOX_SECRET_KEY: "synthetic" },
      {
        stdout: { write: (value) => { stdoutAttempts.push(value); } },
        stderr: { write: (value) => {
          stderrAttempts.push(value);
          return Promise.reject(new Error(rejectionSecret));
        } },
      },
      fixture.dependencies,
    )).resolves.toBe(1);

    expect(stderrAttempts).toHaveLength(1);
    expect(stdoutAttempts).toHaveLength(0);
    expect(stderrAttempts).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
    const output = stderrAttempts.join("\n");
    expect(output).not.toContain(rejectionSecret);
    expect(output).not.toContain("raw worker failure diagnostic");
    expect(output).not.toMatch(/Error:|at\s+\S+/u);
  });
});

interface ProcessDatabase {
  readonly kind: "process-database";
}

type ProcessLifecycleTimer = Readonly<{ id: "process-lifecycle-budget" }>;

function processLifecycleFixture() {
  const listeners = new Map<RefundExecutionWorkerHostSignal, Set<() => void>>();
  const timerDelays: number[] = [];
  let timerListener: (() => void) | null = null;
  let timerClears = 0;
  const runtime: RefundExecutionWorkerLifecycleRuntime<ProcessLifecycleTimer> = Object.freeze({
    addSignalListener: (signal, listener) => {
      const registered = listeners.get(signal) ?? new Set<() => void>();
      registered.add(listener);
      listeners.set(signal, registered);
    },
    removeSignalListener: (signal, listener) => {
      listeners.get(signal)?.delete(listener);
    },
    setTimer: (listener, delayMs) => {
      timerListener = listener;
      timerDelays.push(delayMs);
      return Object.freeze({ id: "process-lifecycle-budget" as const });
    },
    clearTimer: () => {
      timerClears += 1;
      timerListener = null;
    },
  });
  const lifecycle = createRefundExecutionWorkerHostLifecycle(runtime);
  return {
    lifecycle,
    timerDelays,
    get timerClears() { return timerClears; },
    emit: (signal: RefundExecutionWorkerHostSignal) => {
      for (const listener of listeners.get(signal) ?? []) listener();
    },
    fireTimer: () => timerListener?.(),
    listenerCount: (signal: RefundExecutionWorkerHostSignal) => listeners.get(signal)?.size ?? 0,
  };
}

function deferred() {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return Object.freeze({ promise, resolve: () => resolvePromise?.() });
}

function processFixture(options: Readonly<{ cycleFailure?: boolean }> = Object.freeze({})) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let databaseCalls = 0;
  const database = Object.freeze({ kind: "process-database" as const });
  const runWorkerCycle = (): Promise<RefundExecutionWorkerCycleResult> => options.cycleFailure
    ? Promise.resolve({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      message: "raw worker failure diagnostic",
    })
    : Promise.resolve({ ok: true, cycle: emptyCounters() });
  const dependencies: RefundExecutionWorkerHostDependencies<ProcessDatabase> = Object.freeze({
    inspectMasterGate: () => true,
    inspectActivation: (env: Readonly<Record<string, string | undefined>>) => Object.freeze({
      workerEnabled: env.REFUND_EXECUTION_WORKER_ENABLED === "ENABLED",
    }),
    inspectCredential: (env: Readonly<Record<string, string | undefined>>) => (
      env.TOSS_SANDBOX_SECRET_KEY ? "CONFIGURED" : "ABSENT"
    ),
    createDatabase: () => {
      databaseCalls += 1;
      return database;
    },
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
    compareMigrations: compareRefundWorkerMigrations,
    disconnectDatabase: () => Promise.resolve(),
    createWorkerDependencies: () => Object.freeze({
      lookup: () => Promise.resolve({ kind: "unavailable" as const }),
      cancellation: () => Promise.resolve({ kind: "unknown" as const }),
    }),
    runWorkerCycle,
  });
  return {
    stdout,
    stderr,
    get databaseCalls() { return databaseCalls; },
    dependencies,
    output: {
      stdout: { write: (value: string) => stdout.push(value) },
      stderr: { write: (value: string) => stderr.push(value) },
    },
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
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
}
