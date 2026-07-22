import { describe, expect, it } from "vitest";
import {
  cycleComplete,
  healthSnapshot,
  lifecycleDrained,
  parseRefundExecutionWorkerCliArgs,
  workerHostExitCode,
  type RefundExecutionWorkerHostResult,
} from "../worker-host-contract";

describe("refund execution worker host CLI contract", () => {
  it("accepts only the exact check command", () => {
    expect(parseRefundExecutionWorkerCliArgs(["check"]))
      .toEqual({ ok: true, command: { kind: "CHECK" } });
    expect(parseRefundExecutionWorkerCliArgs([])).toMatchObject({
      ok: false,
      result: { code: "INVALID_HOST_INPUT" },
    });
    expect(parseRefundExecutionWorkerCliArgs(["check", "extra"]))
      .toMatchObject({ ok: false, result: { code: "INVALID_HOST_INPUT" } });
  });

  it("accepts only the exact argument-free health command", () => {
    expect(parseRefundExecutionWorkerCliArgs(["health"]))
      .toEqual({ ok: true, command: { kind: "HEALTH" } });
    expect(parseRefundExecutionWorkerCliArgs(["health", "extra"]))
      .toMatchObject({ ok: false, result: { code: "INVALID_HOST_INPUT" } });
    expect(parseRefundExecutionWorkerCliArgs(["HEALTH"]))
      .toMatchObject({ ok: false, result: { code: "INVALID_HOST_INPUT" } });
  });

  it("constructs the approved internal owner from exact ordered run-once arguments", () => {
    expect(parseRefundExecutionWorkerCliArgs([
      "run-once",
      "--service", "refund-worker",
      "--revision", "rev.2026-07-20",
      "--slot", "slot_1",
    ])).toEqual({
      ok: true,
      command: {
        kind: "RUN_ONCE",
        workerOwner: "refund-sbx:refund-worker:rev.2026-07-20:slot_1",
      },
    });
  });

  it.each([
    ["missing label", ["run-once", "--service", "svc", "--revision", "rev", "--slot"]],
    ["duplicate label", ["run-once", "--service", "svc", "--service", "rev", "--slot", "one"]],
    ["unknown flag", ["run-once", "--service", "svc", "--revision", "rev", "--unknown", "one"]],
    ["reordered flags", ["run-once", "--slot", "one", "--service", "svc", "--revision", "rev"]],
    ["flag as value", ["run-once", "--service", "--revision", "--revision", "rev", "--slot", "one"]],
    ["blank", ["run-once", "--service", "", "--revision", "rev", "--slot", "one"]],
    ["space", ["run-once", "--service", "bad label", "--revision", "rev", "--slot", "one"]],
    ["control", ["run-once", "--service", "bad\nlabel", "--revision", "rev", "--slot", "one"]],
    ["unicode", ["run-once", "--service", "서비스", "--revision", "rev", "--slot", "one"]],
    ["excessive", ["run-once", "--service", "a".repeat(65), "--revision", "rev", "--slot", "one"]],
  ])("rejects %s input", (_name, args) => {
    expect(parseRefundExecutionWorkerCliArgs(args))
      .toMatchObject({ ok: false, result: { code: "INVALID_HOST_INPUT" } });
  });

  it("accepts every label boundary without accepting an arbitrary owner", () => {
    const result = parseRefundExecutionWorkerCliArgs([
      "run-once",
      "--service", "a",
      "--revision", "b".repeat(64),
      "--slot", "c".repeat(64),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok || result.command.kind !== "RUN_ONCE") throw new Error("Expected run-once.");
    expect(result.command.workerOwner.startsWith("refund-sbx:")).toBe(true);
    expect(Object.isFrozen(result.command)).toBe(true);
  });

  it("rejects non-arrays, extended arrays, symbols, and accessors without evaluating them", () => {
    let getterCalls = 0;
    const accessor = ["check"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "check";
      },
    });
    const symbolArray = ["check"];
    Object.defineProperty(symbolArray, Symbol("hidden"), { value: "secret" });
    const extended = ["check"];
    Object.defineProperty(extended, "extra", { value: "value", enumerable: true });

    const substitutedPrototype = ["check"];
    Object.setPrototypeOf(substitutedPrototype, null);

    for (const value of [
      null, {}, Object.create(null), accessor, symbolArray, extended, substitutedPrototype,
    ]) {
      expect(parseRefundExecutionWorkerCliArgs(value)).toMatchObject({ ok: false });
    }
    expect(getterCalls).toBe(0);
  });

  it("rejects a proxied argument array before invoking any user-defined trap", () => {
    let trapCalls = 0;
    const proxied = new Proxy(["check"], {
      get: () => {
        trapCalls += 1;
        throw new Error("PROXY_GET_TRAP");
      },
      getOwnPropertyDescriptor: () => {
        trapCalls += 1;
        throw new Error("PROXY_DESCRIPTOR_TRAP");
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        throw new Error("PROXY_PROTOTYPE_TRAP");
      },
      ownKeys: () => {
        trapCalls += 1;
        throw new Error("PROXY_KEYS_TRAP");
      },
    });

    expect(parseRefundExecutionWorkerCliArgs(proxied)).toMatchObject({
      ok: false,
      result: { code: "INVALID_HOST_INPUT" },
    });
    expect(trapCalls).toBe(0);
    const realArgvSlice = process.argv.slice(0, 0);
    realArgvSlice.push("check");
    expect(parseRefundExecutionWorkerCliArgs(realArgvSlice)).toMatchObject({ ok: true });
  });

  it.each([
    [success("CHECK_READY"), 0],
    [{
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
      backlog: {
        READY: { count: 0, oldestAgeSeconds: null },
        UNCONTACTED: { count: 0, oldestAgeSeconds: null },
        CONTACTED: { count: 0, oldestAgeSeconds: null },
        MANUAL_REVIEW: { count: 0, oldestAgeSeconds: null },
      },
    }, 0],
    [success("FEATURE_DISABLED"), 0],
    [success("CYCLE_COMPLETE"), 0],
    [{ ok: true, code: "LIFECYCLE_DRAINED", reason: "SIGNAL", cycle: emptyCounters() }, 75],
    [failure("INVALID_HOST_INPUT"), 64],
    [failure("INVALID_WORKER_OWNER"), 64],
    [failure("CONFIG_INVALID"), 78],
    [failure("MIGRATIONS_NOT_READY"), 78],
    [failure("DATABASE_UNAVAILABLE"), 1],
    [failure("SYSTEMIC_FAILURE"), 1],
  ] as const)("maps $0.code to exit $1", (result, exitCode) => {
    expect(workerHostExitCode(result)).toBe(exitCode);
  });
});

describe("refund execution worker cycle output contract", () => {
  it("rejects extra counter properties without invoking accessors", () => {
    let extraGetterCalls = 0;
    const counters: Record<PropertyKey, unknown> = {
      ...emptyCounters(),
      secretDiagnostic: "own-secret",
    };
    Object.setPrototypeOf(counters, { inheritedSecret: "inherited" });
    Object.defineProperty(counters, "extraAccessor", {
      enumerable: true,
      get: () => {
        extraGetterCalls += 1;
        return "accessor-secret";
      },
    });
    Object.defineProperty(counters, Symbol("secret"), { value: "symbol-secret", enumerable: true });

    const result = cycleComplete(counters);

    expect(result).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(extraGetterCalls).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 2 ** 53])(
    "returns a bounded systemic failure for malformed counter %s",
    (counter) => {
      expect(cycleComplete({ ...emptyCounters(), selectedCount: counter }))
        .toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    },
  );

  it("rejects missing and accessor counters without invoking the accessor", () => {
    const missing: Record<string, unknown> = { ...emptyCounters() };
    delete missing.selectedCount;
    let getterCalls = 0;
    const accessor = { ...emptyCounters() };
    Object.defineProperty(accessor, "selectedCount", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 0;
      },
    });

    expect(cycleComplete(missing)).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(cycleComplete(accessor)).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(getterCalls).toBe(0);
  });

  it("rejects proxied counters before invoking proxy traps", () => {
    let trapCalls = 0;
    const counters = new Proxy(emptyCounters(), {
      ownKeys: (target) => {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor: (target, key) => {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

    expect(cycleComplete(counters)).toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    expect(trapCalls).toBe(0);
  });

  it.each(["SIGNAL", "BUDGET"] as const)(
    "sanitizes an exact %s lifecycle drain with the shared v1 counter contract",
    (reason) => {
      const counters = {
        ...emptyCounters(),
        selectedCount: 2,
        attemptedCount: 1,
      };
      const result = lifecycleDrained(reason, counters);

      expect(result).toEqual({
        ok: true,
        code: "LIFECYCLE_DRAINED",
        reason,
        cycle: { ...emptyCounters(), selectedCount: 2, attemptedCount: 1 },
      });
      expect(Reflect.ownKeys(result)).toEqual(["ok", "code", "reason", "cycle"]);
      if (!result.ok) throw new Error("Expected sanitized lifecycle result.");
      expect(Reflect.ownKeys(result.cycle)).toEqual(Object.keys(emptyCounters()));
      expect(JSON.stringify(result)).not.toMatch(/accessor-secret|symbol-secret/u);
    },
  );

  it("bounds malformed lifecycle counters as systemic failure", () => {
    expect(lifecycleDrained("SIGNAL", { ...emptyCounters(), selectedCount: -1 }))
      .toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
  });
});

describe("refund execution worker health output contract", () => {
  it("freezes the exact aggregate route and backlog shape", () => {
    const result = healthSnapshot(false, "ABSENT", disabledRoutes(), emptyBacklog());
    expect(result).toEqual({
      ok: true,
      code: "HEALTH_SNAPSHOT",
      readiness: {
        workerMasterEnabled: false,
        credentialStatus: "ABSENT",
        databaseReachable: true,
        migrationStatus: "READY",
      },
      routes: disabledRoutes(),
      backlog: emptyBacklog(),
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.code !== "HEALTH_SNAPSHOT") throw new Error("Expected health snapshot.");
    expect(Object.isFrozen(result.routes)).toBe(true);
    expect(Object.isFrozen(result.backlog.READY)).toBe(true);
  });

  it.each([
    ["negative count", { ...emptyBacklog(), READY: { count: -1, oldestAgeSeconds: 0 } }],
    ["fractional age", { ...emptyBacklog(), READY: { count: 1, oldestAgeSeconds: 0.5 } }],
    ["null nonempty age", { ...emptyBacklog(), READY: { count: 1, oldestAgeSeconds: null } }],
    ["non-null empty age", { ...emptyBacklog(), READY: { count: 0, oldestAgeSeconds: 0 } }],
    ["extra backlog field", { ...emptyBacklog(), secret: "HEALTH_SECRET" }],
  ])("rejects malformed health backlog: %s", (_name, backlog) => {
    expect(healthSnapshot(false, "ABSENT", disabledRoutes(), backlog))
      .toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
  });

  it("rejects health accessors, symbols, and proxies without invoking traps", () => {
    let calls = 0;
    const accessor = { ...emptyBacklog() };
    Object.defineProperty(accessor, "READY", {
      enumerable: true,
      get: () => {
        calls += 1;
        return { count: 0, oldestAgeSeconds: null };
      },
    });
    const symbol = { ...emptyBacklog(), [Symbol("health")]: true };
    const proxy = new Proxy(emptyBacklog(), {
      ownKeys: () => {
        calls += 1;
        return [];
      },
    });
    for (const backlog of [accessor, symbol, proxy]) {
      expect(healthSnapshot(false, "ABSENT", disabledRoutes(), backlog))
        .toEqual({ ok: false, code: "SYSTEMIC_FAILURE" });
    }
    expect(calls).toBe(0);
  });
});

function success(
  code: "CHECK_READY" | "FEATURE_DISABLED" | "CYCLE_COMPLETE",
): RefundExecutionWorkerHostResult {
  if (code === "FEATURE_DISABLED") return { ok: true, code };
  if (code === "CYCLE_COMPLETE") return { ok: true, code, cycle: emptyCounters() };
  return {
    ok: true,
    code,
    readiness: {
      workerMasterEnabled: false,
      credentialStatus: "ABSENT",
      databaseReachable: true,
      migrationStatus: "READY",
    },
  };
}

function failure(
  code: Extract<RefundExecutionWorkerHostResult, { ok: false }>["code"],
): RefundExecutionWorkerHostResult {
  return { ok: false, code };
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

function disabledRoutes() {
  return {
    READY: false,
    UNCONTACTED: false,
    CONTACTED_LOOKUP: false,
    CONTACTED_RECONTACT: false,
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
