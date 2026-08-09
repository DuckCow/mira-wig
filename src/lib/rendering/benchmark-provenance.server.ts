import "server-only";

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  RENDERER_BENCHMARK_GENERATOR_VERSION,
  RENDERER_BENCHMARK_GEOMETRY_RECIPE,
  type RENDERER_BENCHMARK_SEED,
  validateRendererBenchmarkSeed,
} from "./benchmark-input";

const execFileAsync = promisify(execFile);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type BenchmarkSourceTreeState = "CLEAN" | "DIRTY";

export interface BenchmarkSourceProvenance {
  readonly kind: "LOCAL_GIT";
  readonly commit: string;
  readonly branch: string;
  readonly treeState: BenchmarkSourceTreeState;
  readonly observedAt: string;
  readonly nextVersion: string;
  readonly threeVersion: string;
  readonly generatorVersion: typeof RENDERER_BENCHMARK_GENERATOR_VERSION;
  readonly geometryRecipe: typeof RENDERER_BENCHMARK_GEOMETRY_RECIPE;
  readonly seed: typeof RENDERER_BENCHMARK_SEED;
}

export interface BenchmarkRunStartProvenance {
  readonly source: BenchmarkSourceProvenance;
  readonly currentMain: boolean;
}

export type BenchmarkGitCommandRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<string>;

export interface BenchmarkProvenanceOptions {
  readonly cwd?: string;
  readonly runGit?: BenchmarkGitCommandRunner;
  readonly readPackageJson?: (cwd: string) => Promise<unknown>;
  readonly now?: () => Date;
}

async function runGitCommand(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function readRepositoryPackageJson(cwd: string): Promise<unknown> {
  return JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
}

function readDependencyVersion(
  packageValue: unknown,
  dependency: "next" | "three",
): string {
  if (!isRecord(packageValue)) {
    throw new Error(`Unable to attach ${dependency} version to benchmark provenance.`);
  }
  const dependencies = packageValue.dependencies;
  if (!isRecord(dependencies)) {
    throw new Error(`Unable to attach ${dependency} version to benchmark provenance.`);
  }
  const version = dependencies[dependency];
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error(`Unable to attach ${dependency} version to benchmark provenance.`);
  }
  return version;
}

function validateGitSnapshot(
  commit: string,
  branch: string,
  originMain: string,
): void {
  const validCommits = /^[0-9a-f]{40}$/.test(commit) &&
    /^[0-9a-f]{40}$/.test(originMain);
  if (!validCommits || branch.trim().length === 0) {
    throw new Error("Local Git provenance returned an invalid commit or branch.");
  }
}

export async function readBenchmarkSourceProvenance(
  seedValue: unknown,
  options: BenchmarkProvenanceOptions = {},
): Promise<BenchmarkRunStartProvenance> {
  const seed = validateRendererBenchmarkSeed(seedValue);
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? runGitCommand;

  let commit: string;
  let branch: string;
  let status: string;
  let originMain: string;
  try {
    commit = await runGit(["rev-parse", "HEAD"], cwd);
    branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    status = await runGit(["status", "--porcelain=v1", "--untracked-files=all"], cwd);
    originMain = await runGit(["rev-parse", "refs/remotes/origin/main"], cwd);
  } catch (error) {
    throw new Error("Local Git provenance is unavailable.", { cause: error });
  }
  validateGitSnapshot(commit, branch, originMain);

  const packageValue = await (
    options.readPackageJson ?? readRepositoryPackageJson
  )(cwd);
  return Object.freeze({
    source: Object.freeze({
      kind: "LOCAL_GIT",
      commit,
      branch,
      treeState: status.length === 0 ? "CLEAN" : "DIRTY",
      observedAt: (options.now ?? (() => new Date()))().toISOString(),
      nextVersion: readDependencyVersion(packageValue, "next"),
      threeVersion: readDependencyVersion(packageValue, "three"),
      generatorVersion: RENDERER_BENCHMARK_GENERATOR_VERSION,
      geometryRecipe: RENDERER_BENCHMARK_GEOMETRY_RECIPE,
      seed,
    }),
    currentMain: commit === originMain,
  });
}
