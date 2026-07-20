import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts", "refund-execution-worker.ts");
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
      "--eval", `import(${JSON.stringify(pathToFileURL(SCRIPT).href)})`,
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
});

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
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
