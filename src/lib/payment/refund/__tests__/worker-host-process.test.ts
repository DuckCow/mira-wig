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
  it("classifies FEATURE_DISABLED, OVERLAP_SKIPPED, CYCLE_COMPLETE, and CONFIG_INVALID exactly", async () => {
    const disabled = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      {},
      disabled.output,
      { ...disabled.dependencies, inspectMasterGate: () => false },
      JSON.stringify,
      sequenceClock(0, 1),
    )).resolves.toBe(0);
    expectObservedLine(disabled.stdout[0], "RUN_ONCE", {
      ok: true,
      code: "FEATURE_DISABLED",
    }, 1);

    const overlap = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      {
        REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
        TOSS_SANDBOX_SECRET_KEY: "synthetic",
      },
      overlap.output,
      {
        ...overlap.dependencies,
        runProviderContactAdmission: () => Promise.resolve({ outcome: "BUSY" as const }),
      },
      JSON.stringify,
      sequenceClock(1, 2),
    )).resolves.toBe(0);
    expectObservedLine(overlap.stdout[0], "RUN_ONCE", {
      ok: true,
      code: "OVERLAP_SKIPPED",
    }, 1);

    const complete = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      {
        REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
        TOSS_SANDBOX_SECRET_KEY: "synthetic",
      },
      complete.output,
      complete.dependencies,
      JSON.stringify,
      sequenceClock(2, 4),
    )).resolves.toBe(0);
    expectObservedLine(complete.stdout[0], "RUN_ONCE", {
      ok: true,
      code: "CYCLE_COMPLETE",
      cycle: emptyCounters(),
    }, 2);

    const invalid = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      {},
      invalid.output,
      { ...invalid.dependencies, inspectActivation: () => { throw new Error("CONFIG_SECRET"); } },
      JSON.stringify,
      sequenceClock(5, 8),
    )).resolves.toBe(78);
    expectObservedLine(invalid.stderr[0], "RUN_ONCE", {
      ok: false,
      code: "CONFIG_INVALID",
    }, 3);
    expect(invalid.stderr[0]).not.toContain("CONFIG_SECRET");
  });

  it("stops duration before awaiting writer latency", async () => {
    const fixture = processFixture();
    const release = deferred();
    let clockCalls = 0;
    const output = {
      stdout: { write: async (value: string) => {
        fixture.stdout.push(value);
        await release.promise;
      } },
      stderr: fixture.output.stderr,
    };
    const clock = () => {
      clockCalls += 1;
      return clockCalls === 1 ? 100 : 107;
    };

    const operation = runRefundExecutionWorkerProcess(
      ["check"], {}, output, fixture.dependencies, JSON.stringify, clock,
    );
    await vi.waitFor(() => expect(fixture.stdout).toHaveLength(1));
    expect(clockCalls).toBe(2);
    expectObservedLine(fixture.stdout[0], "CHECK", {
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
    }, 7);
    release.resolve();
    await expect(operation).resolves.toBe(0);
    expect(clockCalls).toBe(2);
  });

  it("preserves exact partial failure counters through host and process serialization", async () => {
    const fixture = processFixture();
    const partial = {
      ...emptyCounters(),
      selectedCount: 2,
      attemptedCount: 2,
      succeededCount: 1,
      failedCount: 1,
      providerLookupCount: 3,
      providerCancellationCount: 1,
      readySelected: 2,
    };
    const dependencies = {
      ...fixture.dependencies,
      runWorkerCycle: () => Promise.resolve({
        ok: false as const,
        code: "SYSTEMIC_FAILURE" as const,
        message: "PARTIAL_FAILURE_SECRET",
        cycle: partial,
      }),
    };

    await expect(runRefundExecutionWorkerProcess(
      ["run-once", "--service", "svc", "--revision", "rev", "--slot", "one"],
      {
        REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
        TOSS_SANDBOX_SECRET_KEY: "synthetic",
      },
      fixture.output,
      dependencies,
      JSON.stringify,
      sequenceClock(10, 12),
    )).resolves.toBe(1);
    expectObservedLine(fixture.stderr[0], "RUN_ONCE", {
      ok: false,
      code: "SYSTEMIC_FAILURE",
      cycle: partial,
    }, 2);
    expect(fixture.stderr[0]).not.toContain("PARTIAL_FAILURE_SECRET");
  });


  it("emits exact HEALTH_SNAPSHOT observation with injected monotonic duration", async () => {
    const fixture = processFixture();
    const clock = sequenceClock(1_000, 1_042);

    await expect(runRefundExecutionWorkerProcess(
      ["health"], {}, fixture.output, fixture.dependencies, JSON.stringify, clock,
    )).resolves.toBe(0);

    expect(fixture.stderr).toEqual([]);
    expectObservedLine(fixture.stdout[0], "HEALTH", {
      ok: true,
      code: "HEALTH_SNAPSHOT",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
      routes: {
        READY: false,
        UNCONTACTED: false,
        CONTACTED_LOOKUP: false,
        CONTACTED_RECONTACT: false,
      },
      backlog: emptyBacklog(),
    }, 42);
  });

  it("preserves MIGRATIONS_NOT_READY exit and observation fields", async () => {
    const fixture = processFixture({ migrationMismatch: true });
    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, fixture.output, fixture.dependencies, JSON.stringify, sequenceClock(4, 9),
    )).resolves.toBe(78);
    expectObservedLine(fixture.stderr[0], "CHECK", {
      ok: false,
      code: "MIGRATIONS_NOT_READY",
    }, 5);
  });

  it.each([
    ["start throws", () => trackedClock(() => { throw new Error("START_CLOCK_SECRET"); })],
    ["end throws", () => trackedClock(
      () => 10,
      () => { throw new Error("END_CLOCK_SECRET"); },
    )],
    ["start is NaN", () => trackedClock(() => Number.NaN)],
    ["end is NaN", () => trackedClock(() => 10, () => Number.NaN)],
    ["end is positive Infinity", () => trackedClock(() => 10, () => Number.POSITIVE_INFINITY)],
    ["start is negative Infinity", () => trackedClock(() => Number.NEGATIVE_INFINITY)],
    ["start is negative", () => trackedClock(() => -1)],
    ["end is negative", () => trackedClock(() => 10, () => -1)],
    ["moves backwards", () => trackedClock(() => 10, () => 9)],
    ["has an unsafe reading", () => trackedClock(
      () => 0,
      () => Number.MAX_SAFE_INTEGER + 1,
    )],
  ] as const)("fails closed to one static systemic line when the monotonic clock %s", async (
    _name,
    createClock,
  ) => {
    const fixture = processFixture();
    const tracked = createClock();
    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, fixture.output, fixture.dependencies, JSON.stringify, tracked.clock,
    )).resolves.toBe(1);
    expectStaticSystemicFailure(fixture.stdout, fixture.stderr);
    expect(tracked.callCount()).toBe(_name.includes("start") ? 1 : 2);
    expect(fixture.stderr[0]).not.toMatch(/CLOCK_SECRET|Error:|at\s+\S+/u);
  });

  it("floors a valid fractional monotonic duration", async () => {
    const fixture = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, fixture.output, fixture.dependencies, JSON.stringify,
      sequenceClock(100.25, 102.99),
    )).resolves.toBe(0);
    expectObservedLine(fixture.stdout[0], "CHECK", {
      ok: true,
      code: "CHECK_READY",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
    }, 2);
  });

  it("rejects a serializer-added process field without emitting it", async () => {
    const fixture = processFixture();
    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, fixture.output, fixture.dependencies,
      (result) => JSON.stringify({
        ...result,
        process: { ...result.process, secretAccessor: "PROCESS_SECRET" },
      }),
      sequenceClock(20, 23),
    )).resolves.toBe(1);
    expectStaticSystemicFailure(fixture.stdout, fixture.stderr);
    expect(fixture.stderr[0]).not.toContain("PROCESS_SECRET");
  });

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
    expectObservedLine(fixture.stdout[0], "CHECK", {
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
    expect(fixture.stderr).toHaveLength(1);
    expectObservedLine(fixture.stderr[0], "INVALID", { ok: false, code: "INVALID_HOST_INPUT" });
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
    expect(fixture.stderr).toHaveLength(1);
    expectObservedLine(fixture.stderr[0], "RUN_ONCE", {
      ok: false,
      code: "SYSTEMIC_FAILURE",
      cycle: emptyCounters(),
    });
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
    expectObservedLine(fixture.stderr[0], "RUN_ONCE", {
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
      expect(fixture.stderr).toHaveLength(1);
      expectObservedLine(fixture.stderr[0], "RUN_ONCE", {
        ok: true,
        code: "LIFECYCLE_DRAINED",
        reason: "SIGNAL",
        cycle: emptyCounters(),
      });
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
    expectObservedLine(fixture.stderr[0], "RUN_ONCE", {
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
    expect(fixture.stderr).toHaveLength(1);
    expectObservedLine(fixture.stderr[0], "RUN_ONCE", { ok: false, code: "SYSTEMIC_FAILURE" });
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
    expect(writes[0].value).not.toMatch(/SERIALIZATION_FAILURE|process|Error:|at\s+\S+/u);
  });

  it("uses one static stderr write when the serializer returns a non-string", async () => {
    const fixture = processFixture();
    const writes: Array<{ channel: "stdout" | "stderr"; value: string }> = [];
    const nonStringSerializer = new Proxy(JSON.stringify, {
      apply: () => 42,
    });

    await expect(runRefundExecutionWorkerProcess(
      ["check"], {}, {
        stdout: { write: (value) => writes.push({ channel: "stdout", value }) },
        stderr: { write: (value) => writes.push({ channel: "stderr", value }) },
      }, fixture.dependencies, nonStringSerializer,
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
    expect(stderrAttempts).toHaveLength(1);
    expectObservedLine(stderrAttempts[0], "RUN_ONCE", {
      ok: false,
      code: "SYSTEMIC_FAILURE",
      cycle: emptyCounters(),
    });
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

function processFixture(options: Readonly<{
  cycleFailure?: boolean;
  migrationMismatch?: boolean;
}> = Object.freeze({})) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let databaseCalls = 0;
  const database = Object.freeze({ kind: "process-database" as const });
  const runWorkerCycle = (): Promise<RefundExecutionWorkerCycleResult> => options.cycleFailure
    ? Promise.resolve({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      message: "raw worker failure diagnostic",
      cycle: emptyCounters(),
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
        checksum: (options.migrationMismatch ? "b" : "a").repeat(64),
        finished_at: new Date("2026-07-20T00:00:00.000Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
      }]),
    })),
    compareMigrations: compareRefundWorkerMigrations,
    disconnectDatabase: () => Promise.resolve(),
    runProviderContactAdmission: async (_env, operation) => Object.freeze({
      outcome: "ACQUIRED" as const,
      result: await operation(),
    }),
    readHealthBacklog: () => Promise.resolve(emptyBacklog()),
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
    providerLookupCount: 0,
    providerCancellationCount: 0,
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
}

function expectObservedLine(
  line: string,
  command: "CHECK" | "HEALTH" | "RUN_ONCE" | "INVALID",
  expectedResult: Readonly<Record<string, unknown>>,
  expectedDuration?: number,
): void {
  expect(line.endsWith("\n")).toBe(true);
  expect(line.split("\n")).toHaveLength(2);
  const parsed: unknown = JSON.parse(line);
  const durationExpectation: unknown = expectedDuration ?? expect.any(Number);
  expect(parsed).toEqual({
    ...expectedResult,
    process: {
      formatVersion: "mira-refund-worker-process-observation/v1",
      command,
      operationDurationMs: durationExpectation,
    },
  });
  if (!parsed || typeof parsed !== "object" || !("process" in parsed)
    || !parsed.process || typeof parsed.process !== "object"
    || !("operationDurationMs" in parsed.process)) {
    throw new Error("Expected exact process observation.");
  }
  const duration = parsed.process.operationDurationMs;
  expect(Number.isSafeInteger(duration)).toBe(true);
  expect(typeof duration === "number" && duration >= 0).toBe(true);
}

function expectStaticSystemicFailure(stdout: readonly string[], stderr: readonly string[]): void {
  expect(stdout).toEqual([]);
  expect(stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
  expect(stderr[0]).not.toMatch(/"process"|"command"|operationDurationMs/u);
}

function trackedClock(...readings: readonly (() => number)[]) {
  let calls = 0;
  return Object.freeze({
    clock: () => {
      const reading = readings[calls];
      calls += 1;
      if (!reading) throw new Error("CLOCK_SEQUENCE_EXHAUSTED");
      return reading();
    },
    callCount: () => calls,
  });
}

function sequenceClock(...values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("CLOCK_SEQUENCE_EXHAUSTED");
    return value;
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
