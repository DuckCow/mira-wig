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
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadRefundWorkerMigrationInventory } from "../src/lib/payment/refund/worker-migration-inventory.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceDateEpochSeconds = 1_788_130_800;
const exactAssets = Object.freeze([
  "containers/refund-db-bootstrap/Dockerfile",
  "containers/refund-db-bootstrap/README.md",
  "containers/refund-db-bootstrap/application-credentials.ts",
  "containers/refund-db-bootstrap/entrypoint.ts",
  "containers/refund-db-bootstrap/package-lock.json",
  "containers/refund-db-bootstrap/package.json",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/database-role-grants.sql",
  "infra/refund-sandbox/p3e-b2/synthetic-sale/database-role-grants.sql",
  "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql",
  "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json",
  "infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/locals.tf",
  "infra/refund-sandbox/p3e-b2/eximbay-canary/variables.tf",
  "prisma.config.ts",
  "prisma/migrations/migration_lock.toml",
  "prisma/schema.prisma",
  "scripts/eximbay-p3e-database-bootstrap.ts",
  "src/lib/payment/refund/worker-migration-inventory.ts",
]);

export type BootstrapContextManifestEntry = Readonly<{
  path: string;
  size: number;
  mode: number;
  sha256: string;
}>;

export type RefundDbBootstrapBuildContext = Readonly<{
  directory: string;
  manifestPath: string;
  manifestDigest: string;
  manifestEntries: readonly BootstrapContextManifestEntry[];
  migrationCount: number;
  migrationDigest: string;
  cleanup: () => Promise<void>;
}>;

export async function assembleRefundDbBootstrapBuildContext():
Promise<RefundDbBootstrapBuildContext> {
  const inventory = await loadRefundWorkerMigrationInventory();
  const assets = new Set(exactAssets);
  for (const migration of inventory.entries) assets.add(migration.path);
  const parent = await mkdtemp(join(tmpdir(), "mira-refund-db-bootstrap-context-"));
  const directory = join(parent, "context");
  const manifestPath = join(parent, "context-manifest.json");
  await mkdir(directory, { recursive: true, mode: 0o755 });
  try {
    for (const path of [...assets].sort(compareUtf8)) await copyExact(path, directory);
    await writeTargetProducerBundle(directory);
    await normalizeDirectories(directory);
    const manifestEntries = await loadManifestEntries(directory);
    const canonical = JSON.stringify(manifestEntries);
    const manifestDigest = sha256(Buffer.from(canonical));
    await writeFile(manifestPath, `${canonical}\n`, { encoding: "utf8", mode: 0o600 });
    await normalizeTimestamp(manifestPath);
    return Object.freeze({
      directory,
      manifestPath,
      manifestDigest,
      manifestEntries: Object.freeze(manifestEntries),
      migrationCount: inventory.migrationCount,
      migrationDigest: inventory.migrationDigest,
      cleanup: () => rm(parent, { recursive: true, force: true }),
    });
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

async function writeTargetProducerBundle(contextDirectory: string): Promise<void> {
  const result = await build({
    absWorkingDir: repositoryRoot,
    entryPoints: ["scripts/eximbay-refund-canary-target-producer.ts"],
    bundle: true,
    write: false,
    platform: "node",
    target: "node22",
    format: "esm",
    conditions: ["react-server"],
    external: ["@prisma/client", "@prisma/adapter-pg", "pg"],
    tsconfig: "tsconfig.json",
  });
  const output = result.outputFiles[0];
  if (result.outputFiles.length !== 1 || !output) throw new Error("DB_BOOTSTRAP_PRODUCER_BUNDLE_INVALID");
  const destination = join(contextDirectory, "dist/eximbay-refund-canary-target-producer.mjs");
  await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
  await writeFile(destination, output.contents, { mode: 0o644 });
  await normalizeTimestamp(destination);
}

async function copyExact(path: string, contextDirectory: string): Promise<void> {
  const source = resolve(repositoryRoot, path);
  const destination = resolve(contextDirectory, path);
  requireContained(source, repositoryRoot);
  requireContained(destination, contextDirectory);
  const [stats, canonical] = await Promise.all([lstat(source), realpath(source)]);
  if (!stats.isFile() || stats.isSymbolicLink() || canonical !== source) {
    throw new Error("DB_BOOTSTRAP_CONTEXT_SOURCE_INVALID");
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
  await copyFile(source, destination);
  await chmod(destination, 0o644);
  await normalizeTimestamp(destination);
}

async function normalizeDirectories(root: string): Promise<void> {
  const pending = [root];
  const directories: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) throw new Error("DB_BOOTSTRAP_CONTEXT_DIRECTORY_INVALID");
    directories.push(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("DB_BOOTSTRAP_CONTEXT_SYMLINK");
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
      else if (!entry.isFile()) throw new Error("DB_BOOTSTRAP_CONTEXT_ENTRY_INVALID");
    }
  }
  for (const directory of directories.reverse()) {
    await chmod(directory, 0o755);
    await normalizeTimestamp(directory);
  }
}

async function loadManifestEntries(root: string): Promise<BootstrapContextManifestEntry[]> {
  const files: BootstrapContextManifestEntry[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) throw new Error("DB_BOOTSTRAP_CONTEXT_DIRECTORY_INVALID");
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("DB_BOOTSTRAP_CONTEXT_ENTRY_INVALID");
      }
      const [stats, body] = await Promise.all([lstat(absolute), readFile(absolute)]);
      files.push(Object.freeze({
        path: relative(root, absolute).split(sep).join("/"),
        size: stats.size,
        mode: stats.mode & 0o777,
        sha256: sha256(body),
      }));
    }
  }
  return files.sort((left, right) => compareUtf8(left.path, right.path));
}

function requireContained(path: string, root: string): void {
  const prefix = `${root}${sep}`;
  if (!path.startsWith(prefix)) throw new Error("DB_BOOTSTRAP_CONTEXT_PATH_ESCAPE");
}

function normalizeTimestamp(path: string): Promise<void> {
  const date = new Date(sourceDateEpochSeconds * 1_000);
  return utimes(path, date, date);
}

function compareUtf8(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const context = await assembleRefundDbBootstrapBuildContext();
  try {
    process.stdout.write(`${JSON.stringify({
      fileCount: context.manifestEntries.length,
      manifestSha256: context.manifestDigest,
      migrationCount: context.migrationCount,
      migrationSha256: context.migrationDigest,
    })}\n`);
  } finally {
    await context.cleanup();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main();
