import { spawn, type ChildProcess } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "refund-execution-worker.ts");
const LIFECYCLE = join(ROOT, "src", "lib", "payment", "refund", "worker-host-lifecycle.ts");
const REAL_SIGNAL_CHILD = join(
  ROOT,
  "src",
  "lib",
  "payment",
  "refund",
  "__tests__",
  "fixtures",
  "refund-worker-real-signal-child.ts",
);
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let alternateCwd = "";

beforeAll(async () => {
  requireDisposableDatabaseUrl(process.env.DATABASE_URL);
  alternateCwd = await mkdtemp(join(tmpdir(), "mira-refund-worker-process-"));
  await Promise.all([
    writeFile(join(alternateCwd, ".env"), [
      "REFUND_EXECUTION_WORKER_ENABLED=invalid-from-dotenv",
      "DATABASE_URL=postgresql://dotenv-must-not-be-read.invalid/forbidden",
    ].join("\n")),
    writeFile(join(alternateCwd, ".env.local"), "REFUND_EXECUTION_WORKER_ENABLED=ENABLED\n"),
  ]);
});

afterAll(async () => {
  if (alternateCwd) await rm(alternateCwd, { recursive: true, force: true });
});

describe("refund execution worker real process path", () => {
  it("imports the script inertly without parsing, output, exit mutation, or dotenv behavior", async () => {
    const source = await readFile(SCRIPT, "utf8");
    expect(source).not.toMatch(/from\s+["']dotenv|dotenv\.config|["']\.env(?:\.local)?["']/u);

    const result = await runProcess(process.execPath, [
      "--import", TSX_LOADER,
      "--input-type=module",
      "--eval", [
        'const beforeTerm = process.listenerCount("SIGTERM");',
        'const beforeInt = process.listenerCount("SIGINT");',
        `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});`,
        'if (process.listenerCount("SIGTERM") !== beforeTerm',
        '  || process.listenerCount("SIGINT") !== beforeInt) throw new Error("LISTENER_LEAK");',
      ].join("\n"),
    ], explicitEnv({ TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json") }), alternateCwd);

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("removes real process listeners and clears the real budget timer so the child exits", async () => {
    const result = await runProcess(process.execPath, [
      "--import", TSX_LOADER,
      "--input-type=module",
      "--eval", [
        `const lifecycleModule = await import(${JSON.stringify(pathToFileURL(LIFECYCLE).href)});`,
        'const beforeTerm = process.listenerCount("SIGTERM");',
        'const beforeInt = process.listenerCount("SIGINT");',
        "const lifecycle = lifecycleModule.createProcessRefundExecutionWorkerHostLifecycle();",
        'if (process.listenerCount("SIGTERM") !== beforeTerm + 1) throw new Error("SIGTERM_MISSING");',
        'if (process.listenerCount("SIGINT") !== beforeInt + 1) throw new Error("SIGINT_MISSING");',
        "lifecycle.dispose();",
        'if (process.listenerCount("SIGTERM") !== beforeTerm) throw new Error("SIGTERM_LEAK");',
        'if (process.listenerCount("SIGINT") !== beforeInt) throw new Error("SIGINT_LEAK");',
      ].join("\n"),
    ], explicitEnv({ TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json") }), alternateCwd);

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("runs the actual package check with only an explicit disposable DATABASE_URL", async () => {
    const result = await runPackage(
      ["refund:worker:check"],
      explicitEnv({ DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL) }),
    );

    expectNormalJsonLine(result, "stdout", 0, "CHECK_READY");
    expect(JSON.parse(result.stdout)).toEqual({
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

  it("runs the actual package once command as a healthy disabled no-op", async () => {
    const labels = ["private-service", "private-revision", "private-slot"];
    const result = await runPackage([
      "refund:worker:once", "--",
      "--service", labels[0], "--revision", labels[1], "--slot", labels[2],
    ], explicitEnv());

    expectNormalJsonLine(result, "stdout", 0, "FEATURE_DISABLED");
    expect(result.stderr).toBe("");
    for (const label of labels) expect(result.stdout).not.toContain(label);
  });

  it("runs malformed-master once through the actual package failure channel", async () => {
    const result = await runPackage([
      "refund:worker:once", "--",
      "--service", "svc", "--revision", "rev", "--slot", "slot",
    ], explicitEnv({ REFUND_EXECUTION_WORKER_ENABLED: "invalid" }));

    expectNormalJsonLine(result, "stderr", 78, "CONFIG_INVALID");
    expect(result.stdout).toBe("");
  });

  it("runs invalid CLI input through the actual package failure channel", async () => {
    const result = await runPackage([
      "refund:worker:once", "--", "--service", "missing-rest",
    ], explicitEnv());

    expectNormalJsonLine(result, "stderr", 64, "INVALID_HOST_INPUT");
    expect(result.stdout).toBe("");
  });

  it("uses the fixed repository migration root when the absolute script runs elsewhere", async () => {
    const result = await runProcess(process.execPath, [
      "--import", TSX_LOADER,
      SCRIPT,
      "check",
    ], explicitEnv({
      DATABASE_URL: requireDisposableDatabaseUrl(process.env.DATABASE_URL),
      TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json"),
    }), alternateCwd);

    expectNormalJsonLine(result, "stdout", 0, "CHECK_READY");
  });

  it.each([
    Object.freeze({ firstSignal: "SIGTERM" as const, secondSignal: "SIGINT" as const }),
    Object.freeze({ firstSignal: "SIGINT" as const, secondSignal: null }),
  ])("drains in-flight work after real $firstSignal without default signal termination", async ({
    firstSignal,
    secondSignal,
  }) => {
    const harness = startSignalChild();
    const inFlight = await waitForChildMessage(harness, "IN_FLIGHT");
    const listenerBaseline = messageRecord(inFlight, "baseline");

    expect(messageNumber(inFlight, "sigterm")).toBe(messageNumber(listenerBaseline, "sigterm") + 1);
    expect(messageNumber(inFlight, "sigint")).toBe(messageNumber(listenerBaseline, "sigint") + 1);
    expect(harness.stdout).toBe("");
    expect(harness.stderr).toBe("");
    expect(harness.child.exitCode).toBeNull();
    expect(harness.child.signalCode).toBeNull();

    expect(harness.child.kill(firstSignal)).toBe(true);
    const firstDrain = await probeUntilStopped(harness);
    expect(firstDrain).toMatchObject({ shouldStop: true, reason: "SIGNAL" });
    expect(harness.child.exitCode).toBeNull();
    expect(harness.child.signalCode).toBeNull();

    if (secondSignal) {
      expect(harness.child.kill(secondSignal)).toBe(true);
      const repeatedDrain = await probeUntilStopped(harness);
      expect(repeatedDrain).toMatchObject({ shouldStop: true, reason: "SIGNAL" });
      expect(harness.child.exitCode).toBeNull();
      expect(harness.child.signalCode).toBeNull();
    }

    expect(harness.stdout).toBe("");
    expect(harness.stderr).toBe("");
    await sendChildMessage(harness.child, { type: "RELEASE" });

    const cleanup = await waitForChildMessage(harness, "CLEANUP");
    const result = await harness.completion;
    expect(result).toEqual({ exitCode: 75, signal: null, timedOut: false });
    expect(harness.stdout).toBe("");
    expect(harness.stderr.endsWith("\n")).toBe(true);
    expect(harness.stderr.split("\n")).toHaveLength(2);
    expect(JSON.parse(harness.stderr)).toEqual({
      ok: true,
      code: "LIFECYCLE_DRAINED",
      reason: "SIGNAL",
      cycle: oneCompletedCandidateCounters(),
    });

    const cleanupBaseline = messageRecord(cleanup, "baseline");
    const work = messageRecord(cleanup, "work");
    expect(messageNumber(cleanup, "sigterm")).toBe(messageNumber(cleanupBaseline, "sigterm"));
    expect(messageNumber(cleanup, "sigint")).toBe(messageNumber(cleanupBaseline, "sigint"));
    expect(messageNumber(cleanup, "timeouts")).toBe(messageNumber(cleanupBaseline, "timeouts"));
    expect(cleanup.reason).toBe("SIGNAL");
    expect(work).toEqual({
      firstStarted: 1,
      firstCompleted: 1,
      secondStarted: 0,
      lookupPort: 0,
      cancellationPort: 0,
      fetch: 0,
      secretReader: 0,
    });
    expect(harness.stderr).not.toMatch(
      /private-signal|SIGTERM|SIGINT|REAL_|Error:|at\s+\S+|DATABASE_URL|TOSS|credential|provider|secret/iu,
    );
  });
});

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SignalChildHarness {
  readonly child: ChildProcess;
  readonly messages: Array<Record<string, unknown>>;
  readonly completion: Promise<Readonly<{
    exitCode: number;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
  }>>;
  readonly stdout: string;
  readonly stderr: string;
}

function startSignalChild(): SignalChildHarness {
  const child = spawn(process.execPath, ["--import", TSX_LOADER, REAL_SIGNAL_CHILD], {
    cwd: alternateCwd,
    env: explicitEnv({ TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json") }),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  if (!child.stdout || !child.stderr) throw new Error("Signal child output pipes are required.");
  let stdout = "";
  let stderr = "";
  const messages: Array<Record<string, unknown>> = [];
  let timedOut = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("message", (value: unknown) => {
    if (isRecord(value)) messages.push(value);
  });
  const completion = new Promise<Readonly<{
    exitCode: number;
    signal: NodeJS.Signals | null;
    timedOut: boolean;
  }>>((resolve, reject) => {
    const watchdog = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(watchdog);
      resolve(Object.freeze({ exitCode: code ?? 1, signal, timedOut }));
    });
  });
  return {
    child,
    messages,
    completion,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

async function waitForChildMessage(
  harness: SignalChildHarness,
  type: string,
  id?: number,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const index = harness.messages.findIndex((message) => (
      message.type === type && (id === undefined || message.id === id)
    ));
    if (index >= 0) return harness.messages.splice(index, 1)[0];
    if (harness.child.exitCode !== null || harness.child.signalCode !== null) {
      throw new Error(`Signal child exited before ${type}.`);
    }
    await delay(10);
  }
  throw new Error(`Timed out waiting for signal child message ${type}.`);
}

let probeSequence = 0;

async function probeUntilStopped(harness: SignalChildHarness): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    probeSequence += 1;
    const id = probeSequence;
    await sendChildMessage(harness.child, { type: "PROBE", id });
    const response = await waitForChildMessage(harness, "DRAIN_STATE", id);
    if (response.shouldStop === true) return response;
    await delay(10);
  }
  throw new Error("Signal child did not observe the delivered signal.");
}

function sendChildMessage(
  child: ChildProcess,
  message: Readonly<Record<string, unknown>>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!child.connected) {
      reject(new Error("Signal child IPC is not connected."));
      return;
    }
    child.send(message, (error) => error ? reject(error) : resolve());
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function messageRecord(message: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = message[key];
  if (!isRecord(value)) throw new Error(`Child message ${key} must be an object.`);
  return value;
}

function messageNumber(message: Record<string, unknown>, key: string): number {
  const value = message[key];
  if (typeof value !== "number") throw new Error(`Child message ${key} must be a number.`);
  return value;
}

function oneCompletedCandidateCounters(): Readonly<Record<string, number>> {
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
    readySelected: 1,
    uncontactedSelected: 0,
    contactedSelected: 0,
  });
}

function runPackage(args: readonly string[], env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return runProcess("npm", ["--prefix", ROOT, "run", "--silent", ...args], env, alternateCwd);
}

function runProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 10_000);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(watchdog);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function explicitEnv(
  overrides: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const path = process.env.PATH;
  if (!path) throw new Error("PATH is required for package subprocess tests.");
  return Object.freeze({
    ...overrides,
    PATH: path,
    NODE_ENV: "test",
    NO_COLOR: "1",
  });
}

function expectNormalJsonLine(
  result: ProcessResult,
  channel: "stdout" | "stderr",
  exitCode: number,
  code: string,
): void {
  const selected = result[channel];
  expect(result.exitCode).toBe(exitCode);
  expect(selected.endsWith("\n")).toBe(true);
  expect(selected.split("\n")).toHaveLength(2);
  expect(JSON.parse(selected)).toMatchObject({ code });
  expect(selected).not.toMatch(/dotenv|DeprecationWarning|Error:|at\s+\S+/u);
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required for worker process integration.");
  const parsed = new URL(value);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!local || database !== "wig_platform_test") {
    throw new Error("Worker process integration is restricted to local wig_platform_test.");
  }
  return value;
}
