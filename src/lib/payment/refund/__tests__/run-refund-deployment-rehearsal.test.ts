import { describe, expect, it, vi } from "vitest";
import { refundDeploymentRehearsalComplete } from "../refund-deployment-rehearsal-contract";
import {
  REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES,
  runRefundDeploymentRehearsal,
} from "../run-refund-deployment-rehearsal";
import {
  safeRehearsalEnv,
  successfulRehearsalChildValues,
  successfulRehearsalDependencies,
} from "./refund-deployment-rehearsal-fixture";

const BACKLOG_CATEGORIES = Object.freeze([
  "READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW",
] as const);

interface GetterCounter {
  calls: number;
}

interface MalformedObservationCase {
  name: string;
  create: (getter: GetterCounter) => unknown;
}

const MALFORMED_COUNT_CASES: readonly MalformedObservationCase[] = Object.freeze([
  countValueCase("undefined", undefined),
  countValueCase("null", null),
  countValueCase("negative integer", -1),
  countValueCase("negative fractional number", -0.5),
  countValueCase("positive fractional number", 0.5),
  countValueCase("NaN", Number.NaN),
  countValueCase("positive Infinity", Number.POSITIVE_INFINITY),
  countValueCase("negative Infinity", Number.NEGATIVE_INFINITY),
  countValueCase("unsafe integer", Number.MAX_SAFE_INTEGER + 1),
  countValueCase("string", "malformed-count-string"),
  countValueCase("bigint", BigInt(0)),
  countValueCase("boolean", true),
  countValueCase("array", []),
  countValueCase("plain object", {}),
  countValueCase("symbol", Symbol("malformed-count-symbol")),
  Object.freeze({
    name: "accessor-backed count property",
    create(getter: GetterCounter) {
      return Object.defineProperty({ oldestAgeSeconds: null }, "count", {
        enumerable: true,
        get() { getter.calls += 1; return 0; },
      });
    },
  }),
  Object.freeze({
    name: "Proxy-backed observation",
    create() { return new Proxy({ count: 0, oldestAgeSeconds: null }, {}); },
  }),
  Object.freeze({
    name: "inherited count property",
    create() {
      const observation = { oldestAgeSeconds: null };
      Reflect.setPrototypeOf(observation, { count: 0 });
      return observation;
    },
  }),
]);

const MALFORMED_ZERO_AGE_CASES: readonly MalformedObservationCase[] = Object.freeze([
  ageValueCase("zero", 0),
  ageValueCase("positive integer", 1),
  ageValueCase("negative integer", -1),
  ageValueCase("fractional number", 0.5),
  ageValueCase("NaN", Number.NaN),
  ageValueCase("positive Infinity", Number.POSITIVE_INFINITY),
  ageValueCase("negative Infinity", Number.NEGATIVE_INFINITY),
  ageValueCase("unsafe integer", Number.MAX_SAFE_INTEGER + 1),
  ageValueCase("string", "malformed-age-string"),
  ageValueCase("bigint", BigInt(0)),
  ageValueCase("boolean", true),
  ageValueCase("array", []),
  ageValueCase("plain object", {}),
  ageValueCase("symbol", Symbol("malformed-age-symbol")),
  ageValueCase("undefined", undefined),
  Object.freeze({
    name: "accessor-backed age field",
    create(getter: GetterCounter) {
      return Object.defineProperty({ count: 0 }, "oldestAgeSeconds", {
        enumerable: true,
        get() { getter.calls += 1; return null; },
      });
    },
  }),
  Object.freeze({
    name: "Proxy-backed observation",
    create() { return new Proxy({ count: 0, oldestAgeSeconds: null }, {}); },
  }),
  Object.freeze({
    name: "inherited age field",
    create() {
      const observation = { count: 0 };
      Reflect.setPrototypeOf(observation, { oldestAgeSeconds: null });
      return observation;
    },
  }),
]);

describe("provider-free deployment rehearsal runner", () => {
  it("runs the exact finite sequential child matrix with one stripped environment", async () => {
    const specs: unknown[] = [];
    const dependencies = successfulRehearsalDependencies(successfulRehearsalChildValues(), specs);

    await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies))
      .resolves.toMatchObject({
        ok: true,
        code: "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE",
        activation: "BLOCKED",
        providerExecution: "NOT_PERFORMED",
      });

    expect(specs).toHaveLength(6);
    expect(specs).toEqual(REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES.map((stage) => ({
      executable: "/test/node",
      args: stage.args,
      cwd: "/test/repository",
      env: {
        DATABASE_URL: safeRehearsalEnv().DATABASE_URL,
        NODE_ENV: "test",
      },
      deadlineMs: stage.deadlineMs,
      expectedExitCode: 0,
      expectedChannel: "STDOUT",
    })));
  });

  it("stops before privileged operations when health backlog is nonzero", async () => {
    const values = successfulRehearsalChildValues();
    const health = requireRecord(values[1]);
    const backlog = requireRecord(health.backlog);
    backlog.READY = { count: 1, oldestAgeSeconds: 0 };
    const dependencies = successfulRehearsalDependencies(values);
    const child = vi.spyOn(dependencies, "runChild");

    await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies)).resolves.toEqual({
      ok: false,
      code: "REHEARSAL_CHECK_FAILED",
      stage: "HEALTH",
      reason: "UNSAFE_BACKLOG",
    });
    expect(child).toHaveBeenCalledTimes(2);
  });

  it.each(["READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW"] as const)(
    "accepts a coherent positive %s backlog with a clamped-zero age",
    async (category) => {
      const values = successfulRehearsalChildValues();
      setBacklogObservation(values, category, { count: 1, oldestAgeSeconds: 0 });
      const dependencies = successfulRehearsalDependencies(values);
      const child = vi.spyOn(dependencies, "runChild");

      await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies))
        .resolves.toEqual({
          ok: false,
          code: "REHEARSAL_CHECK_FAILED",
          stage: "HEALTH",
          reason: "UNSAFE_BACKLOG",
        });
      expect(child).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW"] as const)(
    "accepts every bounded positive %s backlog age",
    async (category) => {
      for (const age of [1, Number.MAX_SAFE_INTEGER]) {
        const values = successfulRehearsalChildValues();
        setBacklogObservation(values, category, { count: 1, oldestAgeSeconds: age });
        await expect(runRefundDeploymentRehearsal(
          safeRehearsalEnv(), successfulRehearsalDependencies(values),
        )).resolves.toEqual({
          ok: false,
          code: "REHEARSAL_CHECK_FAILED",
          stage: "HEALTH",
          reason: "UNSAFE_BACKLOG",
        });
      }
    },
  );

  it.each(BACKLOG_CATEGORIES)(
    "accepts the maximum safe positive %s backlog count",
    async (category) => {
      const values = successfulRehearsalChildValues();
      setBacklogObservation(values, category, {
        count: Number.MAX_SAFE_INTEGER,
        oldestAgeSeconds: 0,
      });
      const dependencies = successfulRehearsalDependencies(values);
      const child = vi.spyOn(dependencies, "runChild");

      await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies))
        .resolves.toEqual({
          ok: false,
          code: "REHEARSAL_CHECK_FAILED",
          stage: "HEALTH",
          reason: "UNSAFE_BACKLOG",
        });
      expect(child).toHaveBeenCalledTimes(2);
    },
  );

  it.each(BACKLOG_CATEGORIES)(
    "accepts only null age for a coherent zero-count %s backlog",
    async (category) => {
      const values = successfulRehearsalChildValues();
      setBacklogObservation(values, category, { count: 0, oldestAgeSeconds: null });
      const dependencies = successfulRehearsalDependencies(values);
      const child = vi.spyOn(dependencies, "runChild");

      await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies))
        .resolves.toEqual(refundDeploymentRehearsalComplete());
      expect(child).toHaveBeenCalledTimes(6);
    },
  );

  describe.each(BACKLOG_CATEGORIES)("malformed %s backlog count", (category) => {
    it.each(MALFORMED_COUNT_CASES)("rejects $name", async ({ create }) => {
      const getter = { calls: 0 };
      const values = successfulRehearsalChildValues();
      setBacklogObservation(values, category, create(getter));
      const dependencies = successfulRehearsalDependencies(values);
      const child = vi.spyOn(dependencies, "runChild");

      const result = await runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies);

      expect(result).toEqual({
        ok: false,
        code: "REHEARSAL_CHECK_FAILED",
        stage: "HEALTH",
        reason: "UNEXPECTED_CODE",
      });
      expect(child).toHaveBeenCalledTimes(2);
      expect(getter.calls).toBe(0);
      expect(JSON.stringify(result)).not.toMatch(/malformed|secret|raw/iu);
    });
  });

  describe.each(BACKLOG_CATEGORIES)("zero-count %s backlog age", (category) => {
    it.each(MALFORMED_ZERO_AGE_CASES)("rejects $name", async ({ create }) => {
      const getter = { calls: 0 };
      const values = successfulRehearsalChildValues();
      setBacklogObservation(values, category, create(getter));
      const dependencies = successfulRehearsalDependencies(values);
      const child = vi.spyOn(dependencies, "runChild");

      const result = await runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies);

      expect(result).toEqual({
        ok: false,
        code: "REHEARSAL_CHECK_FAILED",
        stage: "HEALTH",
        reason: "UNEXPECTED_CODE",
      });
      expect(child).toHaveBeenCalledTimes(2);
      expect(getter.calls).toBe(0);
      expect(JSON.stringify(result)).not.toMatch(/malformed|secret|raw/iu);
    });
  });

  it.each(["READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW"] as const)(
    "rejects every malformed positive %s backlog age as invalid child output",
    async (category) => {
      const invalidAges: unknown[] = [
        null, undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "0", BigInt(0), true, [], {},
        new Proxy({}, {}), { [Symbol("age")]: 0 },
      ];
      for (const age of invalidAges) {
        const values = successfulRehearsalChildValues();
        setBacklogObservation(values, category, { count: 1, oldestAgeSeconds: age });
        await expect(runRefundDeploymentRehearsal(
          safeRehearsalEnv(), successfulRehearsalDependencies(values),
        )).resolves.toEqual({
          ok: false,
          code: "REHEARSAL_CHECK_FAILED",
          stage: "HEALTH",
          reason: "UNEXPECTED_CODE",
        });
      }
    },
  );

  it("rejects backlog-age accessors, proxies, and inherited observations without getter evaluation", async () => {
    let getterCalls = 0;
    for (const count of [0, 1]) {
      const accessor = Object.defineProperties({}, {
        count: { enumerable: true, value: count },
        oldestAgeSeconds: {
          enumerable: true,
          get() { getterCalls += 1; return count === 0 ? null : 0; },
        },
      });
      const inherited: object = {};
      Reflect.setPrototypeOf(inherited, {
        count, oldestAgeSeconds: count === 0 ? null : 0,
      });
      for (const observation of [
        accessor,
        new Proxy({ count, oldestAgeSeconds: count === 0 ? null : 0 }, {}),
        inherited,
      ]) {
        const values = successfulRehearsalChildValues();
        setBacklogObservation(values, "READY", observation);
        await expect(runRefundDeploymentRehearsal(
          safeRehearsalEnv(), successfulRehearsalDependencies(values),
        )).resolves.toEqual({
          ok: false,
          code: "REHEARSAL_CHECK_FAILED",
          stage: "HEALTH",
          reason: "UNEXPECTED_CODE",
        });
      }
    }
    expect(getterCalls).toBe(0);
  });

  it.each([
    ["wrong process version", 0, (value: Record<string, unknown>) => {
      requireRecord(value.process).formatVersion = "wrong";
    }],
    ["wrong static code", 2, (value: Record<string, unknown>) => { value.code = "WRONG"; }],
    ["extra result key", 4, (value: Record<string, unknown>) => { value.secret = "hidden"; }],
    ["configured credential", 4, (value: Record<string, unknown>) => {
      value.credentialStatus = "CONFIGURED";
    }],
  ] as const)("fails closed on %s without raw child output", async (_name, index, mutate) => {
    const values = successfulRehearsalChildValues();
    mutate(requireRecord(values[index]));

    const result = await runRefundDeploymentRehearsal(
      safeRehearsalEnv(),
      successfulRehearsalDependencies(values),
    );

    expect(result).toMatchObject({ ok: false, code: "REHEARSAL_CHECK_FAILED" });
    expect(JSON.stringify(result)).not.toMatch(/wrong|hidden|CONFIGURED|process|caseRef/u);
  });

  it("rejects nested child accessors, symbols, inheritance, extras, and proxies without getter evaluation", async () => {
    let getterCalls = 0;
    const mutations: Array<(values: unknown[]) => void> = [
      (values) => {
        const result = requireRecord(values[0]);
        Object.defineProperty(result, "readiness", {
          enumerable: true,
          get() { getterCalls += 1; return {}; },
        });
      },
      (values) => {
        const process = requireRecord(requireRecord(values[0]).process);
        Object.defineProperty(process, "command", {
          enumerable: true,
          get() { getterCalls += 1; return "CHECK"; },
        });
      },
      (values) => {
        const backlog = requireRecord(requireRecord(values[1]).backlog);
        const ready = requireRecord(backlog.READY);
        Object.defineProperty(ready, "count", {
          enumerable: true,
          get() { getterCalls += 1; return 0; },
        });
      },
      (values) => {
        requireRecord(values[0]).process = new Proxy(
          requireRecord(requireRecord(values[0]).process),
          {},
        );
      },
      (values) => {
        const backlog = requireRecord(requireRecord(values[1]).backlog);
        backlog.READY = new Proxy(requireRecord(backlog.READY), {});
      },
      (values) => {
        const readiness = requireRecord(requireRecord(values[0]).readiness);
        Reflect.defineProperty(readiness, Symbol("secret"), { enumerable: true, value: "hidden" });
      },
      (values) => {
        requireRecord(requireRecord(values[0]).readiness).extra = "hidden";
      },
      (values) => {
        const inherited: object = {};
        Reflect.setPrototypeOf(inherited, requireRecord(requireRecord(values[0]).readiness));
        requireRecord(values[0]).readiness = inherited;
      },
      (values) => {
        const cases = requireRecord(values[2]).cases;
        if (!Array.isArray(cases)) throw new Error("Expected manual cases array.");
        Reflect.defineProperty(cases, Symbol("secret"), { enumerable: true, value: "hidden" });
      },
      (values) => {
        const cases = requireRecord(values[3]).cases;
        if (!Array.isArray(cases)) throw new Error("Expected reconciliation cases array.");
        requireRecord(values[3]).cases = new Proxy(cases, {});
      },
    ];

    for (const mutate of mutations) {
      const values = successfulRehearsalChildValues();
      mutate(values);
      const result = await runRefundDeploymentRehearsal(
        safeRehearsalEnv(),
        successfulRehearsalDependencies(values),
      );
      expect(result).toMatchObject({ ok: false, code: "REHEARSAL_CHECK_FAILED" });
      expect(JSON.stringify(result)).not.toMatch(/hidden|secret|caseRef|Error:/iu);
    }
    expect(getterCalls).toBe(0);
  });

  it.each([
    "SPAWN_FAILED",
    "CHILD_TIMEOUT",
    "OUTPUT_OVERFLOW",
    "WRONG_CHANNEL",
    "MALFORMED_OUTPUT",
    "UNEXPECTED_EXIT",
    "SIGNAL_TERMINATION",
    "NO_OUTPUT",
  ] as const)("maps child %s to one bounded stage failure and performs no retry", async (reason) => {
    const runChild = vi.fn(() => Promise.resolve(Object.freeze({ ok: false, reason })));
    const dependencies = { executable: "/test/node", cwd: "/test/repository", runChild };

    await expect(runRefundDeploymentRehearsal(safeRehearsalEnv(), dependencies)).resolves.toEqual({
      ok: false,
      code: "REHEARSAL_CHECK_FAILED",
      stage: "READINESS",
      reason,
    });
    expect(runChild).toHaveBeenCalledTimes(1);
  });
});

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected record fixture.");
  }
  return value;
}

function setBacklogObservation(
  values: unknown[],
  category: "READY" | "UNCONTACTED" | "CONTACTED" | "MANUAL_REVIEW",
  observation: unknown,
): void {
  const health = requireRecord(values[1]);
  requireRecord(health.backlog)[category] = observation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function countValueCase(name: string, count: unknown): MalformedObservationCase {
  return Object.freeze({
    name,
    create: () => ({ count, oldestAgeSeconds: null }),
  });
}

function ageValueCase(name: string, oldestAgeSeconds: unknown): MalformedObservationCase {
  return Object.freeze({
    name,
    create: () => ({ count: 0, oldestAgeSeconds }),
  });
}
