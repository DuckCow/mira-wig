import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, type PrismaClient } from "@prisma/client";

const MIGRATION_LOCK_FILE = "migration_lock.toml";
const MIGRATION_SQL_FILE = "migration.sql";
const MAX_MIGRATION_NAME_LENGTH = 128;
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export const REFUND_WORKER_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../../prisma/migrations/", import.meta.url),
);

export type RefundWorkerRepositoryMigration = Readonly<{
  name: string;
  checksum: string;
}>;

export type RefundWorkerDatabaseMigration = Readonly<{
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
}>;

export type RefundWorkerMigrationLedger =
  | Readonly<{ exists: false; records: readonly [] }>
  | Readonly<{ exists: true; records: readonly RefundWorkerDatabaseMigration[] }>;

export type RefundWorkerMigrationReadinessReason =
  | "MISSING_LEDGER"
  | "DUPLICATE_REPOSITORY_MIGRATION"
  | "DUPLICATE_DATABASE_MIGRATION"
  | "PENDING_MIGRATION"
  | "UNKNOWN_DATABASE_MIGRATION"
  | "CHECKSUM_MISMATCH"
  | "UNFINISHED_MIGRATION"
  | "ROLLED_BACK_MIGRATION"
  | "INCOMPLETE_APPLIED_STEPS";

export type RefundWorkerMigrationReadiness =
  | Readonly<{ ok: true; status: "READY" }>
  | Readonly<{ ok: false; reason: RefundWorkerMigrationReadinessReason }>;

export async function loadRefundWorkerRepositoryMigrations(
  migrationsDirectory: string = REFUND_WORKER_MIGRATIONS_DIRECTORY,
): Promise<readonly RefundWorkerRepositoryMigration[]> {
  await requireRealDirectory(migrationsDirectory);
  const entries = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .sort((left, right) => compareNames(left.name, right.name));
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    throw new Error("DUPLICATE_MIGRATION_ROOT_ENTRY");
  }
  const migrations: RefundWorkerRepositoryMigration[] = [];
  let lockFileFound = false;
  for (const entry of entries) {
    const migration = await loadMigrationRootEntry(migrationsDirectory, entry);
    if (!migration) {
      lockFileFound = true;
      continue;
    }
    migrations.push(migration);
  }
  if (!lockFileFound) throw new Error("MISSING_MIGRATION_LOCK_FILE");
  return Object.freeze(migrations);
}

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function loadMigrationRootEntry(
  migrationsDirectory: string,
  entry: Dirent,
): Promise<RefundWorkerRepositoryMigration | null> {
  if (entry.name === MIGRATION_LOCK_FILE) {
    await requireRealRegularFile(join(migrationsDirectory, entry.name), entry.isFile());
    return null;
  }
  requireCanonicalMigrationEntry(entry.name, entry.isDirectory(), entry.isSymbolicLink());
  const migrationDirectory = join(migrationsDirectory, entry.name);
  await requireRealDirectory(migrationDirectory);
  const migrationEntries = await readdir(migrationDirectory, { withFileTypes: true });
  if (migrationEntries.length !== 1 || migrationEntries[0]?.name !== MIGRATION_SQL_FILE) {
    throw new Error("INVALID_MIGRATION_DIRECTORY_CONTENTS");
  }
  const migrationFile = join(migrationDirectory, MIGRATION_SQL_FILE);
  await requireRealRegularFile(migrationFile, migrationEntries[0].isFile());
  const body = await readFile(migrationFile);
  return Object.freeze({
    name: entry.name,
    checksum: createHash("sha256").update(body).digest("hex"),
  });
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

export async function readRefundWorkerMigrationLedger(
  client: PrismaClient,
): Promise<RefundWorkerMigrationLedger> {
  const relation = await client.$queryRaw<{ ledger: string | null }[]>(Prisma.sql`
    SELECT to_regclass('"_prisma_migrations"')::text AS "ledger"
  `);
  if (relation.length !== 1 || relation[0].ledger === null) {
    return Object.freeze({ exists: false, records: Object.freeze([] as const) });
  }
  const records = await client.$queryRaw<RefundWorkerDatabaseMigration[]>(Prisma.sql`
    SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY migration_name ASC
  `);
  return Object.freeze({ exists: true, records: Object.freeze(records.map(freezeMigration)) });
}

export function compareRefundWorkerMigrations(
  repository: readonly RefundWorkerRepositoryMigration[],
  ledger: RefundWorkerMigrationLedger,
): RefundWorkerMigrationReadiness {
  if (!ledger.exists) return notReady("MISSING_LEDGER");
  if (hasDuplicate(repository, (migration) => migration.name)) {
    return notReady("DUPLICATE_REPOSITORY_MIGRATION");
  }
  if (hasDuplicate(ledger.records, (migration) => migration.migration_name)) {
    return notReady("DUPLICATE_DATABASE_MIGRATION");
  }
  const repositoryByName = new Map(repository.map((migration) => [migration.name, migration]));
  const databaseByName = new Map(ledger.records.map((migration) => [migration.migration_name, migration]));
  const setReadiness = compareMigrationSets(repository, ledger.records, repositoryByName, databaseByName);
  if (!setReadiness.ok) return setReadiness;
  for (const migration of repository) {
    const applied = databaseByName.get(migration.name);
    const state = applied ? compareAppliedMigration(migration, applied) : notReady("PENDING_MIGRATION");
    if (!state.ok) return state;
  }
  return Object.freeze({ ok: true, status: "READY" });
}

function compareMigrationSets(
  repository: readonly RefundWorkerRepositoryMigration[],
  database: readonly RefundWorkerDatabaseMigration[],
  repositoryByName: ReadonlyMap<string, RefundWorkerRepositoryMigration>,
  databaseByName: ReadonlyMap<string, RefundWorkerDatabaseMigration>,
): RefundWorkerMigrationReadiness {
  if (database.some((migration) => !repositoryByName.has(migration.migration_name))) {
    return notReady("UNKNOWN_DATABASE_MIGRATION");
  }
  return repository.some((migration) => !databaseByName.has(migration.name))
    ? notReady("PENDING_MIGRATION")
    : Object.freeze({ ok: true, status: "READY" });
}

function compareAppliedMigration(
  repository: RefundWorkerRepositoryMigration,
  applied: RefundWorkerDatabaseMigration,
): RefundWorkerMigrationReadiness {
  if (applied.checksum !== repository.checksum) return notReady("CHECKSUM_MISMATCH");
  if (applied.finished_at === null) return notReady("UNFINISHED_MIGRATION");
  if (applied.rolled_back_at !== null) return notReady("ROLLED_BACK_MIGRATION");
  if (!Number.isInteger(applied.applied_steps_count) || applied.applied_steps_count < 1) {
    return notReady("INCOMPLETE_APPLIED_STEPS");
  }
  return Object.freeze({ ok: true, status: "READY" });
}

function hasDuplicate<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size !== values.length;
}

function freezeMigration(
  migration: RefundWorkerDatabaseMigration,
): RefundWorkerDatabaseMigration {
  return Object.freeze({ ...migration });
}

function notReady(reason: RefundWorkerMigrationReadinessReason): RefundWorkerMigrationReadiness {
  return Object.freeze({ ok: false, reason });
}
