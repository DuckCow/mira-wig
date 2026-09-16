import { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaPg } from "../../database/prisma-pg";
import {
  compareRefundWorkerMigrations,
  loadRefundWorkerRepositoryMigrations,
  readRefundWorkerMigrationLedger,
  type RefundWorkerMigrationLedger,
  type RefundWorkerRepositoryMigration,
} from "./worker-migration-readiness";
import { readRefundOperationsManualReviewQueue } from "./refund-operations-manual";
import { readRefundOperationsReconciliationSnapshot } from "./refund-operations-reconciliation";
import { inspectRefundCredentialLifecycle } from "./refund-operations-credential";
import {
  refundOperationsFailure,
  sanitizeRefundOperationsResult,
  type RefundOperationsCommand,
  type RefundOperationsHostResult,
} from "./refund-operations-contract";

type OperationsEnv = Readonly<Record<string, string | undefined>>;

export type RefundOperationsHostDependencies<Database> = Readonly<{
  inspectCredentialLifecycle: (env: OperationsEnv) => unknown;
  createDatabase: (env: OperationsEnv) => Database | Promise<Database>;
  checkDatabaseConnectivity: (database: Database) => Promise<void>;
  loadRepositoryMigrations: () => Promise<readonly RefundWorkerRepositoryMigration[]>;
  readMigrationLedger: (database: Database) => Promise<RefundWorkerMigrationLedger>;
  compareMigrations: (
    repository: readonly RefundWorkerRepositoryMigration[],
    ledger: RefundWorkerMigrationLedger,
  ) => ReturnType<typeof compareRefundWorkerMigrations>;
  readManualReviewQueue: (database: Database) => Promise<unknown>;
  readReconciliationSnapshot: (database: Database) => Promise<unknown>;
  disconnectDatabase: (database: Database) => Promise<void>;
}>;

export const defaultRefundOperationsHostDependencies: RefundOperationsHostDependencies<PrismaClient> =
  Object.freeze({
    inspectCredentialLifecycle: inspectRefundCredentialLifecycle,
    createDatabase: createOwnedDatabase,
    checkDatabaseConnectivity,
    loadRepositoryMigrations: loadRefundWorkerRepositoryMigrations,
    readMigrationLedger: readRefundWorkerMigrationLedger,
    compareMigrations: compareRefundWorkerMigrations,
    readManualReviewQueue: readRefundOperationsManualReviewQueue,
    readReconciliationSnapshot: readRefundOperationsReconciliationSnapshot,
    disconnectDatabase: (database) => database.$disconnect(),
  });

export async function runRefundOperationsHost<Database>(
  command: RefundOperationsCommand,
  env: OperationsEnv,
  dependencies: RefundOperationsHostDependencies<Database>,
): Promise<RefundOperationsHostResult> {
  if (command.kind === "CREDENTIAL") {
    return safeExactResult(() => dependencies.inspectCredentialLifecycle(env));
  }
  let database: Database;
  try {
    database = await dependencies.createDatabase(env);
  } catch {
    return refundOperationsFailure("DATABASE_UNAVAILABLE");
  }
  let result: RefundOperationsHostResult;
  let disconnectFailed = false;
  try {
    result = await runDatabaseCommand(command, database, dependencies);
  } catch {
    result = refundOperationsFailure("SYSTEMIC_FAILURE");
  } finally {
    try {
      await dependencies.disconnectDatabase(database);
    } catch {
      disconnectFailed = true;
    }
  }
  return disconnectFailed ? refundOperationsFailure("SYSTEMIC_FAILURE") : result;
}

async function runDatabaseCommand<Database>(
  command: Exclude<RefundOperationsCommand, { kind: "CREDENTIAL" }>,
  database: Database,
  dependencies: RefundOperationsHostDependencies<Database>,
): Promise<RefundOperationsHostResult> {
  try {
    await dependencies.checkDatabaseConnectivity(database);
  } catch {
    return refundOperationsFailure("DATABASE_UNAVAILABLE");
  }
  const migrations = await migrationReadiness(database, dependencies);
  if (migrations !== "READY") return refundOperationsFailure(migrations);
  const read = command.kind === "MANUAL"
    ? dependencies.readManualReviewQueue
    : dependencies.readReconciliationSnapshot;
  try {
    const result = await read(database);
    return sanitizeRefundOperationsResult(result)
      ?? refundOperationsFailure("SYSTEMIC_FAILURE");
  } catch {
    return refundOperationsFailure("SYSTEMIC_FAILURE");
  }
}

async function migrationReadiness<Database>(
  database: Database,
  dependencies: RefundOperationsHostDependencies<Database>,
): Promise<"READY" | "MIGRATIONS_NOT_READY" | "DATABASE_UNAVAILABLE" | "SYSTEMIC_FAILURE"> {
  let repository: readonly RefundWorkerRepositoryMigration[];
  try {
    repository = await dependencies.loadRepositoryMigrations();
  } catch {
    return "SYSTEMIC_FAILURE";
  }
  let ledger: RefundWorkerMigrationLedger;
  try {
    ledger = await dependencies.readMigrationLedger(database);
  } catch {
    return "DATABASE_UNAVAILABLE";
  }
  try {
    return dependencies.compareMigrations(repository, ledger).ok
      ? "READY"
      : "MIGRATIONS_NOT_READY";
  } catch {
    return "SYSTEMIC_FAILURE";
  }
}

async function safeExactResult(read: () => unknown): Promise<RefundOperationsHostResult> {
  try {
    const result = await read();
    return sanitizeRefundOperationsResult(result)
      ?? refundOperationsFailure("SYSTEMIC_FAILURE");
  } catch {
    return refundOperationsFailure("SYSTEMIC_FAILURE");
  }
}

function createOwnedDatabase(env: OperationsEnv): PrismaClient {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  return new PrismaClient({ adapter: createPrismaPg({ connectionString }) });
}

async function checkDatabaseConnectivity(database: PrismaClient): Promise<void> {
  const rows = await database.$queryRaw<{ reachable: number }[]>(Prisma.sql`
    SELECT 1::int AS "reachable"
  `);
  if (rows.length !== 1 || rows[0]?.reachable !== 1) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
}
