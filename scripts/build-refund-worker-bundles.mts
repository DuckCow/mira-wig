import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions } from "esbuild";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "../src/lib/payment/refund/worker-migration-inventory.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceDateEpochSeconds = 1_784_764_800;
const entryPoints = Object.freeze({
  "refund-execution-worker": "scripts/refund-execution-worker.ts",
  "refund-sandbox-provider-free-preflight":
    "scripts/refund-sandbox-provider-free-preflight.ts",
  "refund-worker-container-entrypoint": "containers/refund-worker/entrypoint.ts",
  "eximbay-refund-canary": "scripts/eximbay-refund-canary.ts",
  "eximbay-contacted-reconciliation": "scripts/eximbay-contacted-reconciliation.ts",
  "eximbay-refund-reentry": "scripts/eximbay-refund-reentry.ts",
  "eximbay-retrieve-shape-diagnostic": "scripts/eximbay-retrieve-shape-diagnostic.ts",
});
const exactContextAssets = Object.freeze([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "prisma.config.ts",
  "prisma/schema.prisma",
  "prisma/migrations/migration_lock.toml",
  "scripts/build-refund-worker-bundles.mts",
  "containers/refund-worker/Dockerfile",
]);

export async function buildRefundWorkerBundles(
  outputRoot: string = resolve(repositoryRoot, ".refund-worker-build"),
): Promise<void> {
  const outputDirectory = resolve(outputRoot, "src/lib/payment/refund");
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await build(bundleOptions({ outdir: outputDirectory }));
}

export type RefundWorkerBuildContext = Readonly<{
  directory: string;
  parent: string;
  manifestPath: string;
  manifestDigest: string;
  manifestEntries: readonly ContextManifestEntry[];
  repositoryGraphInputCount: number;
  packagedGraphInputCount: number;
  entrypointCount: number;
  migrationInventory: RefundWorkerMigrationInventory;
  cleanup: () => Promise<void>;
}>;

type ContextManifestEntry = Readonly<{
  path: string;
  size: number;
  mode: number;
  sha256: string;
}>;

export async function assembleRefundWorkerBuildContext():
Promise<RefundWorkerBuildContext> {
  const graph = await resolveBundleGraph();
  const assets = new Set([...graph.repositoryInputs, ...exactContextAssets]);
  const migrationInventory = await loadRefundWorkerMigrationInventory();
  for (const migration of migrationInventory.entries) assets.add(migration.path);

  const parent = await mkdtemp(join(tmpdir(), "mira-refund-worker-context-"));
  const contextDirectory = join(parent, "context");
  const manifestPath = join(parent, "context-manifest.json");
  await mkdir(contextDirectory, { recursive: true, mode: 0o755 });

  try {
    const copiedPaths = [...assets].sort((left, right) => left.localeCompare(right));
    for (const relativePath of copiedPaths) {
      await copyExactRepositoryFile(relativePath, contextDirectory);
    }
    await normalizeContextDirectories(contextDirectory);
    const entries = await contextManifestEntries(contextDirectory);
    const canonicalManifest = JSON.stringify(entries);
    const digest = sha256(Buffer.from(canonicalManifest));
    await writeFile(manifestPath, `${canonicalManifest}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await normalizeTimestamp(manifestPath);
    return Object.freeze({
      directory: contextDirectory,
      parent,
      manifestPath,
      manifestDigest: digest,
      manifestEntries: Object.freeze(entries),
      repositoryGraphInputCount: graph.repositoryInputs.length,
      packagedGraphInputCount: graph.packagedInputs.length,
      entrypointCount: Object.keys(entryPoints).length,
      migrationInventory,
      cleanup: async () => rm(parent, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

async function resolveBundleGraph(): Promise<Readonly<{
  repositoryInputs: readonly string[];
  packagedInputs: readonly string[];
}>> {
  const result = await build(bundleOptions({
    outdir: resolve(repositoryRoot, ".refund-worker-graph"),
    write: false,
    metafile: true,
    logLevel: "silent",
  }));
  const inputs = Object.keys(result.metafile?.inputs ?? {})
    .map(normalizedRepositoryPath)
    .sort((left, right) => left.localeCompare(right));
  const repositoryInputs = inputs.filter((path) => !path.startsWith("node_modules/"));
  const packagedInputs = inputs.filter((path) => path.startsWith("node_modules/"));
  if (repositoryInputs.length === 0 || packagedInputs.length === 0) {
    throw new Error("REFUND_WORKER_BUILD_GRAPH_EMPTY");
  }
  for (const entrypoint of Object.values(entryPoints)) {
    if (!repositoryInputs.includes(entrypoint)) {
      throw new Error("REFUND_WORKER_BUILD_GRAPH_MISSING_ENTRYPOINT");
    }
  }
  return Object.freeze({
    repositoryInputs: Object.freeze(repositoryInputs),
    packagedInputs: Object.freeze(packagedInputs),
  });
}

function bundleOptions(overrides: BuildOptions): BuildOptions {
  return {
    absWorkingDir: repositoryRoot,
    entryPoints,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    conditions: ["react-server"],
    banner: {
      js: "import { createRequire as __miraCreateRequire } from 'node:module'; import { dirname as __miraDirname } from 'node:path'; import { fileURLToPath as __miraFileURLToPath } from 'node:url'; const require = __miraCreateRequire(import.meta.url); const __filename = __miraFileURLToPath(import.meta.url); const __dirname = __miraDirname(__filename);",
    },
    outExtension: { ".js": ".mjs" },
    sourcemap: false,
    legalComments: "none",
    charset: "utf8",
    treeShaking: true,
    packages: "bundle",
    external: ["@prisma/client"],
    logLevel: "info",
    ...overrides,
  };
}

async function copyExactRepositoryFile(
  relativePath: string,
  contextDirectory: string,
): Promise<void> {
  const normalized = normalizedRepositoryPath(relativePath);
  const source = resolve(repositoryRoot, normalized);
  const destination = resolve(contextDirectory, normalized);
  requireContainedPath(source, repositoryRoot);
  requireContainedPath(destination, contextDirectory);

  const [sourceStat, sourceRealPath] = await Promise.all([
    lstat(source),
    realpath(source),
  ]);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()
    || sourceRealPath !== source) {
    throw new Error("REFUND_WORKER_CONTEXT_SOURCE_NOT_REGULAR");
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
  await copyFile(source, destination);
  await chmod(destination, 0o644);
  await normalizeTimestamp(destination);
}

async function normalizeContextDirectories(root: string): Promise<void> {
  const directories: string[] = [root];
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    if (!directory) throw new Error("REFUND_WORKER_CONTEXT_DIRECTORY_INVALID");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("REFUND_WORKER_CONTEXT_SYMLINK");
      if (entry.isDirectory()) directories.push(join(directory, entry.name));
      else if (!entry.isFile()) throw new Error("REFUND_WORKER_CONTEXT_ENTRY_TYPE");
    }
  }
  for (const directory of directories.reverse()) {
    await chmod(directory, 0o755);
    await normalizeTimestamp(directory);
  }
}

async function contextManifestEntries(
  root: string,
): Promise<readonly ContextManifestEntry[]> {
  const files: ContextManifestEntry[] = [];
  const pending: string[] = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) throw new Error("REFUND_WORKER_CONTEXT_DIRECTORY_INVALID");
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("REFUND_WORKER_CONTEXT_SYMLINK");
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) throw new Error("REFUND_WORKER_CONTEXT_ENTRY_TYPE");
      const stat = await lstat(absolute);
      const content = await readFile(absolute);
      files.push(Object.freeze({
        path: normalizedRepositoryPath(relative(root, absolute)),
        size: stat.size,
        mode: stat.mode & 0o777,
        sha256: sha256(content),
      }));
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizedRepositoryPath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    throw new Error("REFUND_WORKER_CONTEXT_PATH_INVALID");
  }
  const normalized = value.split(sep).join("/");
  if (normalized === ".." || normalized.startsWith("../")
    || normalized.includes("/../") || normalized.includes("\0")) {
    throw new Error("REFUND_WORKER_CONTEXT_PATH_ESCAPE");
  }
  return normalized;
}

function requireContainedPath(path: string, root: string): void {
  const relation = relative(root, path);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error("REFUND_WORKER_CONTEXT_PATH_ESCAPE");
  }
}

async function normalizeTimestamp(path: string): Promise<void> {
  await utimes(path, sourceDateEpochSeconds, sourceDateEpochSeconds);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

type ContextProof = Readonly<{
  ok: true;
  manifestDigest: string;
  fileCount: number;
  repositoryGraphInputCount: number;
  packagedGraphInputCount: number;
  entrypointCount: number;
  paths: readonly string[];
}>;

async function verifyContextAssembly(): Promise<void> {
  const first = await assembleRefundWorkerBuildContext();
  let proof: ContextProof;
  try {
    const second = await assembleRefundWorkerBuildContext();
    try {
      if (first.manifestDigest !== second.manifestDigest
        || JSON.stringify(first.manifestEntries)
        !== JSON.stringify(second.manifestEntries)) {
        throw new Error("REFUND_WORKER_CONTEXT_NONDETERMINISTIC");
      }
      proof = Object.freeze({
        ok: true,
        manifestDigest: first.manifestDigest,
        fileCount: first.manifestEntries.length,
        repositoryGraphInputCount: first.repositoryGraphInputCount,
        packagedGraphInputCount: first.packagedGraphInputCount,
        entrypointCount: first.entrypointCount,
        paths: first.manifestEntries.map((entry) => entry.path),
      });
    } finally {
      await second.cleanup();
    }
  } finally {
    await first.cleanup();
  }
  process.stdout.write(`${JSON.stringify({ ...proof, temporaryContextsRemoved: true })}\n`);
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length === 2) await buildRefundWorkerBundles();
  else if (process.argv.length === 3 && process.argv[2] === "--verify-context") {
    await verifyContextAssembly();
  } else {
    throw new Error("REFUND_WORKER_BUILD_SCRIPT_ARGUMENT_INVALID");
  }
}
