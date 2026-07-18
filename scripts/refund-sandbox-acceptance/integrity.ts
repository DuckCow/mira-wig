import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { canonicalJson } from "./canonical-json";
import type { ProviderFixture } from "./fixture-manifest";

const POLICY_PATHS = Object.freeze([
  "docs/payment_policy/refund_execution_v1.md",
  "docs/payment_policy/refund_execution_v2.md",
  "docs/payment_policy/refund_execution_v3.md",
  "docs/payment_policy/refund_execution_toss_v1.md",
  "docs/payment_policy/refund_execution_toss_recovery_v1.md",
]);
export const GIT_IDENTITY_TIMEOUT_MS = 10_000;
const GIT_IDENTITY_MAX_STDOUT_BYTES = 128;
const GIT_IDENTITY = Object.freeze({
  executable: "git",
  arguments: Object.freeze(["rev-parse", "--verify", "HEAD"]),
  timeoutMs: GIT_IDENTITY_TIMEOUT_MS,
  killSignal: "SIGKILL" as const,
  maxStdoutBytes: GIT_IDENTITY_MAX_STDOUT_BYTES,
  shell: false as const,
  stderr: "ignore" as const,
});

type GitIdentitySpec = typeof GIT_IDENTITY & Readonly<{ cwd: string }>;
type GitIdentityResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  timedOut: boolean;
  outputExceeded: boolean;
}>;
type GitIdentityRunner = (spec: GitIdentitySpec) => Promise<GitIdentityResult>;
type IntegrityDependencies = Readonly<{ runGitIdentity?: GitIdentityRunner }>;

export type BaseLedgerIntegrity = Readonly<{
  repositoryCommit: string;
  runnerSourceHash: string;
  policyHashes: Readonly<Record<string, string>>;
  migrationFingerprint: string;
}>;

export async function buildBaseLedgerIntegrity(
  worktree: string,
  migrationFingerprint: string,
  dependencies: IntegrityDependencies = Object.freeze({}),
): Promise<BaseLedgerIntegrity> {
  const repositoryCommit = await runtimeRepositoryCommit(
    worktree,
    dependencies.runGitIdentity ?? runGitIdentity,
  );
  const sourceRoot = join(worktree, "scripts", "refund-sandbox-acceptance");
  const sourceFiles = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name === "README.md"))
    .map((entry) => join(sourceRoot, entry.name))
    .sort();
  const runnerSourceHash = await fileSetHash(worktree, sourceFiles);
  const policyHashes: Record<string, string> = {};
  for (const path of POLICY_PATHS) {
    policyHashes[path] = await fileHash(join(worktree, path));
  }
  return Object.freeze({
    repositoryCommit,
    runnerSourceHash,
    policyHashes: Object.freeze(policyHashes),
    migrationFingerprint,
  });
}

async function runtimeRepositoryCommit(
  worktree: string,
  runner: GitIdentityRunner,
): Promise<string> {
  let result: GitIdentityResult;
  try {
    result = await runner(Object.freeze({ ...GIT_IDENTITY, cwd: worktree }));
  } catch {
    throw gitIdentityFailure();
  }
  const commit = result.stdout.trim();
  if (result.exitCode !== 0 || result.signal !== null || result.timedOut
    || result.outputExceeded || !/^[0-9a-f]{40}$/.test(commit)) {
    throw gitIdentityFailure();
  }
  return commit;
}

function runGitIdentity(spec: GitIdentitySpec): Promise<GitIdentityResult> {
  return new Promise((resolve) => {
    const child = spawn(spec.executable, [...spec.arguments], {
      cwd: spec.cwd,
      shell: spec.shell,
      detached: false,
      stdio: ["ignore", "pipe", spec.stderr],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let timedOut = false;
    let outputExceeded = false;
    let spawnFailed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill(spec.killSignal);
    }, spec.timeoutMs);
    child.stdout.on("data", (value: unknown) => {
      if (!Buffer.isBuffer(value) || outputExceeded) return;
      length += value.length;
      if (length > spec.maxStdoutBytes) {
        outputExceeded = true;
        child.kill(spec.killSignal);
        return;
      }
      chunks.push(value);
    });
    child.once("error", () => { spawnFailed = true; });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve(Object.freeze({
        exitCode: spawnFailed ? null : exitCode,
        signal,
        stdout: Buffer.concat(chunks).toString("utf8"),
        timedOut,
        outputExceeded,
      }));
    });
  });
}

function gitIdentityFailure(): Error {
  return new Error("GIT_IDENTITY_FAILED");
}

export function scenarioInputHash(fixture: ProviderFixture): string {
  return createHash("sha256").update(canonicalJson(fixture)).digest("hex");
}

async function fileSetHash(worktree: string, files: readonly string[]): Promise<string> {
  const records = await Promise.all(files.map(async (path) => Object.freeze({
    path: relative(worktree, path),
    sha256: await fileHash(path),
  })));
  return createHash("sha256").update(canonicalJson(records)).digest("hex");
}

async function fileHash(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
