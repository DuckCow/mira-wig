import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_LOCK_FILE = "migration_lock.toml";
const MIGRATION_SQL_FILE = "migration.sql";
const MAX_MIGRATION_NAME_LENGTH = 128;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export const REFUND_WORKER_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../prisma/migrations/", import.meta.url),
);

export type RefundWorkerMigrationInventoryEntry = Readonly<{
  name: string;
  path: string;
  sha256: string;
}>;

export type RefundWorkerMigrationInventory = Readonly<{
  entries: readonly RefundWorkerMigrationInventoryEntry[];
  migrationCount: number;
  migrationDigest: string;
}>;

export type RefundWorkerMigrationSelfCheckProof = Readonly<{
  migrationCount: number;
  migrationDigest: string;
}>;

export function refundWorkerMigrationSelfCheckProof(
  inventory: RefundWorkerMigrationInventory,
): RefundWorkerMigrationSelfCheckProof {
  return Object.freeze({
    migrationCount: inventory.migrationCount,
    migrationDigest: inventory.migrationDigest,
  });
}

export async function loadRefundWorkerMigrationInventory(
  migrationsDirectory: string = REFUND_WORKER_MIGRATIONS_DIRECTORY,
): Promise<RefundWorkerMigrationInventory> {
  await requireRealDirectory(migrationsDirectory);
  const rootEntries = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .sort((left, right) => compareNames(left.name, right.name));
  if (new Set(rootEntries.map((entry) => entry.name)).size !== rootEntries.length) {
    throw new Error("DUPLICATE_MIGRATION_ROOT_ENTRY");
  }
  const entries: RefundWorkerMigrationInventoryEntry[] = [];
  const digest = createHash("sha256");
  let lockFileFound = false;
  for (const rootEntry of rootEntries) {
    if (rootEntry.name === MIGRATION_LOCK_FILE) {
      await requireRealRegularFile(join(migrationsDirectory, rootEntry.name), rootEntry.isFile());
      lockFileFound = true;
      continue;
    }
    const entry = await loadMigrationEntry(migrationsDirectory, rootEntry);
    entries.push(entry.record);
    digest.update(entry.record.name);
    digest.update("\0");
    digest.update(entry.body);
    digest.update("\0");
  }
  if (!lockFileFound) throw new Error("MISSING_MIGRATION_LOCK_FILE");
  return Object.freeze({
    entries: Object.freeze(entries),
    migrationCount: entries.length,
    migrationDigest: digest.digest("hex"),
  });
}

async function loadMigrationEntry(
  migrationsDirectory: string,
  rootEntry: Dirent,
): Promise<Readonly<{ record: RefundWorkerMigrationInventoryEntry; body: Buffer }>> {
  requireCanonicalMigrationEntry(
    rootEntry.name,
    rootEntry.isDirectory(),
    rootEntry.isSymbolicLink(),
  );
  const migrationDirectory = join(migrationsDirectory, rootEntry.name);
  await requireRealDirectory(migrationDirectory);
  const migrationEntries = await readdir(migrationDirectory, { withFileTypes: true });
  if (migrationEntries.length !== 1 || migrationEntries[0]?.name !== MIGRATION_SQL_FILE) {
    throw new Error("INVALID_MIGRATION_DIRECTORY_CONTENTS");
  }
  const migrationFile = join(migrationDirectory, MIGRATION_SQL_FILE);
  await requireRealRegularFile(migrationFile, migrationEntries[0].isFile());
  const body = await readFile(migrationFile);
  return Object.freeze({
    record: Object.freeze({
      name: rootEntry.name,
      path: `prisma/migrations/${rootEntry.name}/${MIGRATION_SQL_FILE}`,
      sha256: createHash("sha256").update(body).digest("hex"),
    }),
    body,
  });
}

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requireCanonicalMigrationEntry(
  name: string,
  directory: boolean,
  symbolicLink: boolean,
): void {
  if (name.startsWith(".") || name.length > MAX_MIGRATION_NAME_LENGTH
    || !MIGRATION_NAME.test(name)) throw new Error("INVALID_MIGRATION_NAME");
  if (symbolicLink || !directory) throw new Error("INVALID_MIGRATION_ROOT_ENTRY");
}

async function requireRealDirectory(path: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("EXPECTED_REAL_DIRECTORY");
}

async function requireRealRegularFile(path: string, directoryEntryIsFile: boolean): Promise<void> {
  const stats = await lstat(path);
  if (!directoryEntryIsFile || stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("EXPECTED_REAL_REGULAR_FILE");
  }
}
