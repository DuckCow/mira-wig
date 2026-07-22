import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseRefundDeploymentRehearsalCliArgs,
  refundDeploymentRehearsalComplete,
  sanitizeRefundDeploymentRehearsalHostResult,
  REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS,
} from "../refund-deployment-rehearsal-contract";
import { safeRefundDeploymentRehearsalEnvironment } from "../refund-deployment-rehearsal-environment";
import { runRefundDeploymentRehearsalProcess } from "../refund-deployment-rehearsal-process";
import {
  safeRehearsalEnv,
  successfulRehearsalDependencies,
} from "./refund-deployment-rehearsal-fixture";

describe("refund deployment rehearsal process and environment", () => {
  it("writes one exact blocked successful observation with monotonic duration", async () => {
    const fixture = outputFixture();

    await expect(runRefundDeploymentRehearsalProcess(
      [], safeRehearsalEnv(), fixture.output, successfulRehearsalDependencies(),
      JSON.stringify, sequenceClock(10.4, 14.1),
    )).resolves.toBe(0);

    expect(fixture.stderr).toEqual([]);
    expect(fixture.stdout).toHaveLength(1);
    expect(JSON.parse(fixture.stdout[0])).toEqual({
      ok: true,
      code: "PROVIDER_FREE_DEPLOYMENT_REHEARSAL_COMPLETE",
      activation: "BLOCKED",
      providerExecution: "NOT_PERFORMED",
      checks: {
        readiness: "PASS",
        health: "PASS",
        manualReview: "PASS",
        reconciliation: "PASS",
        credentialLifecycle: "PASS",
        disabledRunOnce: "PASS",
        exitPolicy: "PASS",
        overlapPolicy: "SIMULATED_ONLY",
        hardDeadlinePolicy: "SIMULATED_ONLY",
      },
      blockers: REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS,
      process: {
        formatVersion: "mira-refund-deployment-rehearsal/v1",
        command: "REHEARSE",
        operationDurationMs: 3,
      },
    });
  });

  it.each([["extra"], ["--unknown"], ["one", "two"]])(
    "rejects arguments without running a child: %j",
    async (...args) => {
      const fixture = outputFixture();
      const dependencies = successfulRehearsalDependencies();
      const runChild = vi.spyOn(dependencies, "runChild");

      await expect(runRefundDeploymentRehearsalProcess(
        args, safeRehearsalEnv(), fixture.output, dependencies,
        JSON.stringify, sequenceClock(1, 2),
      )).resolves.toBe(64);

      expect(runChild).not.toHaveBeenCalled();
      expect(fixture.stdout).toEqual([]);
      expect(JSON.parse(fixture.stderr[0])).toMatchObject({
        ok: false, code: "INVALID_HOST_INPUT", process: { command: "INVALID" },
      });
    },
  );

  it("rejects proxy, accessor, sparse, and symbol CLI arrays without evaluating getters", () => {
    let getterCalls = 0;
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get() { getterCalls += 1; return "unexpected"; },
    });
    Object.defineProperty(accessor, "length", { value: 1 });
    const sparse = new Array(1);
    const symbol: unknown[] = [];
    Reflect.defineProperty(symbol, Symbol("hidden"), { enumerable: true, value: "hidden" });

    expect(parseRefundDeploymentRehearsalCliArgs([])).toBe(true);
    expect(parseRefundDeploymentRehearsalCliArgs(new Proxy([], {}))).toBe(false);
    expect(parseRefundDeploymentRehearsalCliArgs(accessor)).toBe(false);
    expect(parseRefundDeploymentRehearsalCliArgs(sparse)).toBe(false);
    expect(parseRefundDeploymentRehearsalCliArgs(symbol)).toBe(false);
    expect(getterCalls).toBe(0);
  });

  it.each([
    ["localhost", "postgresql://u:p@localhost:5432/wig_platform_test"],
    ["IPv4", "postgres://u:p@127.0.0.1:5432/wig_platform_test"],
    ["IPv6", "postgresql://u:p@[::1]:5432/wig_platform_test"],
  ])("accepts the exact disposable %s URL", (_name, DATABASE_URL) => {
    expect(safeRefundDeploymentRehearsalEnvironment({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      NODE_ENV: "test",
    });
  });

  it.each([
    ["missing", {}],
    ["malformed", { DATABASE_URL: "not-a-url" }],
    ["wrong protocol", { DATABASE_URL: "mysql://localhost/wig_platform_test" }],
    ["development database", { DATABASE_URL: "postgresql://localhost/wig_platform" }],
    ["acceptance database", { DATABASE_URL: "postgresql://localhost/wig_platform_acceptance" }],
    ["remote database", { DATABASE_URL: "postgresql://db.example.test/wig_platform_test" }],
    ["worker master", { ...safeRehearsalEnv(), REFUND_EXECUTION_WORKER_ENABLED: "ENABLED" }],
    ["route capability", { ...safeRehearsalEnv(), REFUND_EXECUTION_TOSS_CONTACT_ENABLED: "ENABLED" }],
    ["credential metadata", { ...safeRehearsalEnv(), TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "present" }],
    ["secret key", { ...safeRehearsalEnv(), TOSS_SANDBOX_SECRET_KEY: "present" }],
    ["unknown provider variable", { ...safeRehearsalEnv(), TOSS_FUTURE_CAPABILITY: "present" }],
    ["PayPal public client", { ...safeRehearsalEnv(), NEXT_PUBLIC_PAYPAL_CLIENT_ID: "present" }],
    ["PayPal unknown", { ...safeRehearsalEnv(), PAYPAL_FUTURE_CAPABILITY: "present" }],
    ["acceptance confirmation", {
      ...safeRehearsalEnv(), MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM: "present",
    }],
  ])("rejects unsafe environment before child spawn: %s", async (_name, env) => {
    const fixture = outputFixture();
    const dependencies = successfulRehearsalDependencies();
    const runChild = vi.spyOn(dependencies, "runChild");

    await expect(runRefundDeploymentRehearsalProcess(
      [], env, fixture.output, dependencies, JSON.stringify, sequenceClock(1, 2),
    )).resolves.toBe(78);

    expect(runChild).not.toHaveBeenCalled();
    expect(fixture.stdout).toEqual([]);
    expect(JSON.parse(fixture.stderr[0])).toMatchObject({
      ok: false, code: "UNSAFE_REHEARSAL_ENVIRONMENT",
    });
  });

  it("accepts whitespace-only authoritative sensitive families as absent", () => {
    expect(safeRefundDeploymentRehearsalEnvironment({
      ...safeRehearsalEnv(),
      REFUND_EXECUTION_WORKER_ENABLED: "  ",
      TOSS_SANDBOX_SECRET_KEY: "\t",
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: "\n",
      MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM: " ",
    })).toEqual({
      DATABASE_URL: safeRehearsalEnv().DATABASE_URL,
      NODE_ENV: "test",
    });
  });

  it.each([
    "REFUND_EXECUTION_UNKNOWN_REHEARSAL_KEY",
    "CUSTOMER_REFUND_UNKNOWN_REHEARSAL_KEY",
    "TOSS_UNKNOWN_REHEARSAL_KEY",
    "NEXT_PUBLIC_TOSS_UNKNOWN_REHEARSAL_KEY",
    "PAYPAL_UNKNOWN_REHEARSAL_KEY",
    "NEXT_PUBLIC_PAYPAL_UNKNOWN_REHEARSAL_KEY",
    "PAYMENT_UNKNOWN_REHEARSAL_KEY",
    "MIRA_TOSS_SANDBOX_ACCEPTANCE_UNKNOWN_REHEARSAL_KEY",
  ])("rejects unknown nonblank protected variable %s before every child boundary", async (key) => {
    const fixture = outputFixture();
    const boundaryCounts = { childSpawn: 0, databaseConstruction: 0, secretRead: 0 };
    const dependencies = {
      executable: "/test/node",
      cwd: "/test/repository",
      runChild() {
        boundaryCounts.childSpawn += 1;
        boundaryCounts.databaseConstruction += 1;
        boundaryCounts.secretRead += 1;
        return Promise.reject(new Error("PROTECTED_BOUNDARY_MUST_NOT_RUN"));
      },
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("NETWORK_MUST_NOT_RUN"),
    );
    const value = "test-only-noncredential-sentinel";
    try {
      await expect(runRefundDeploymentRehearsalProcess(
        [], { ...safeRehearsalEnv(), [key]: value }, fixture.output, dependencies,
        JSON.stringify, sequenceClock(1, 2),
      )).resolves.toBe(78);
    } finally {
      fetch.mockRestore();
    }

    expect(boundaryCounts).toEqual({ childSpawn: 0, databaseConstruction: 0, secretRead: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.stdout).toEqual([]);
    expect(JSON.parse(fixture.stderr[0])).toMatchObject({
      ok: false, code: "UNSAFE_REHEARSAL_ENVIRONMENT",
    });
    expect(fixture.stderr[0]).not.toContain(key);
    expect(fixture.stderr[0]).not.toContain(value);
  });

  it("rejects malformed environment descriptors without getters, child spawn, or fetch", async () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "DATABASE_URL", {
      enumerable: true,
      get() { getterCalls += 1; return safeRehearsalEnv().DATABASE_URL; },
    });
    const symbol = { ...safeRehearsalEnv(), [Symbol("secret")]: "hidden" };
    const inherited: Record<string, string | undefined> = {};
    Reflect.setPrototypeOf(inherited, safeRehearsalEnv());
    const exotic: Record<string, string | undefined> = {};
    Reflect.setPrototypeOf(exotic, { constructor: Object });
    Object.defineProperty(exotic, "DATABASE_URL", {
      enumerable: true,
      value: safeRehearsalEnv().DATABASE_URL,
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("FETCH_MUST_NOT_RUN"));
    try {
      for (const env of [accessor, symbol, inherited, exotic, new Proxy(safeRehearsalEnv(), {})]) {
        const fixture = outputFixture();
        const dependencies = successfulRehearsalDependencies();
        const runChild = vi.spyOn(dependencies, "runChild");
        await expect(runRefundDeploymentRehearsalProcess(
          [], env, fixture.output, dependencies, JSON.stringify, sequenceClock(1, 2),
        )).resolves.toBe(78);
        expect(runChild).not.toHaveBeenCalled();
        expect(fixture.stdout).toEqual([]);
        expect(fixture.stderr[0]).not.toMatch(/hidden|FETCH_MUST_NOT_RUN|DATABASE_URL/u);
      }
    } finally {
      fetch.mockRestore();
    }
    expect(getterCalls).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects recursively inexact rehearsal checks and blockers without evaluating getters", () => {
    let getterCalls = 0;
    const cases: unknown[] = [];
    const checkGetter: Record<PropertyKey, unknown> = {
      ...refundDeploymentRehearsalComplete(),
    };
    checkGetter.checks = Object.defineProperty({}, "readiness", {
      enumerable: true,
      get() { getterCalls += 1; return "PASS"; },
    });
    cases.push(checkGetter);
    cases.push({
      ...refundDeploymentRehearsalComplete(),
      checks: { ...refundDeploymentRehearsalComplete().checks, [Symbol("secret")]: "hidden" },
    });
    const symbolBlockers = [...REFUND_DEPLOYMENT_REHEARSAL_BLOCKERS];
    Reflect.defineProperty(symbolBlockers, Symbol("secret"), { enumerable: true, value: "hidden" });
    cases.push({ ...refundDeploymentRehearsalComplete(), blockers: symbolBlockers });
    cases.push({
      ...refundDeploymentRehearsalComplete(),
      checks: { ...refundDeploymentRehearsalComplete().checks, extra: "hidden" },
    });
    cases.push({
      ...refundDeploymentRehearsalComplete(),
      checks: new Proxy({ ...refundDeploymentRehearsalComplete().checks }, {}),
    });
    const inheritedChecks: object = {};
    Reflect.setPrototypeOf(inheritedChecks, refundDeploymentRehearsalComplete().checks);
    cases.push({ ...refundDeploymentRehearsalComplete(), checks: inheritedChecks });

    for (const value of cases) expect(sanitizeRefundDeploymentRehearsalHostResult(value)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("uses the static fallback and bounds writer throw and rejection to one attempt", async () => {
    const fallback = outputFixture();
    await expect(runRefundDeploymentRehearsalProcess(
      [], safeRehearsalEnv(), fallback.output, successfulRehearsalDependencies(),
      () => "not-canonical", sequenceClock(1, 2),
    )).resolves.toBe(1);
    expect(fallback.stdout).toEqual([]);
    expect(fallback.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);

    for (const write of [
      vi.fn(() => { throw new Error("WRITER_SECRET"); }),
      vi.fn(() => Promise.reject(new Error("WRITER_SECRET"))),
    ]) {
      const stderr = vi.fn();
      await expect(runRefundDeploymentRehearsalProcess(
        [], safeRehearsalEnv(), { stdout: { write }, stderr: { write: stderr } },
        successfulRehearsalDependencies(), JSON.stringify, sequenceClock(1, 2),
      )).resolves.toBe(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(stderr).not.toHaveBeenCalled();
    }
  });

  it("keeps the direct-entry script import inert and dotenv-free", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/refund-worker-deployment-rehearsal.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/dotenv|spawn|setTimeout|SIGTERM|SIGINT/u);
    expect(source).toContain("import.meta.url === pathToFileURL(entrypoint).href");
  });
});

function outputFixture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    output: {
      stdout: { write: (line: string) => stdout.push(line) },
      stderr: { write: (line: string) => stderr.push(line) },
    },
  };
}

function sequenceClock(...values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error("CLOCK_EXHAUSTED");
    return value;
  };
}
