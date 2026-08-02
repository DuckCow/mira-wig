import { Prisma, type PrismaClient } from "@prisma/client";
import {
  loadRefundWorkerMigrationInventory,
  REFUND_WORKER_MIGRATIONS_DIRECTORY,
} from "./worker-migration-inventory";

export { REFUND_WORKER_MIGRATIONS_DIRECTORY };

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
  const inventory = await loadRefundWorkerMigrationInventory(migrationsDirectory);
  return Object.freeze(inventory.entries.map((entry) => Object.freeze({
    name: entry.name,
    checksum: entry.sha256,
  })));
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
