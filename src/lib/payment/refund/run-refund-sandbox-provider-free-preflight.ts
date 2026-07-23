import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { inspectRefundExecutionActivationInventory } from "./execution-activation";
import { inspectRefundCredentialLifecycle } from "./refund-operations-credential";
import {
  sanitizeRefundOperationsResult,
} from "./refund-operations-contract";
import { readRefundOperationsManualReviewQueue } from "./refund-operations-manual";
import { readRefundOperationsReconciliationSnapshot } from "./refund-operations-reconciliation";
import {
  refundSandboxProviderFreePreflightComplete,
  refundSandboxProviderFreePreflightFailure,
  type RefundSandboxProviderFreePreflightResult,
} from "./refund-sandbox-provider-free-preflight-contract";
import {
  safeRefundSandboxProviderFreePreflightEnvironment,
  type RefundSandboxProviderFreePreflightEnvironment,
} from "./refund-sandbox-provider-free-preflight-environment";
import {
  probeRefundSandboxProviderFreeAdmission,
  type RefundSandboxProviderFreeAdmissionProbeResult,
} from "./refund-sandbox-provider-free-preflight-admission";
import { readRefundExecutionWorkerHealthBacklog } from "./worker-health";
import { exactRefundRuntimeRecord } from "./refund-runtime-exact";
import {
  compareRefundWorkerMigrations,
  loadRefundWorkerRepositoryMigrations,
  readRefundWorkerMigrationLedger,
  type RefundWorkerMigrationLedger,
  type RefundWorkerRepositoryMigration,
} from "./worker-migration-readiness";
import { refundExecutionWorkerRouteReadiness } from "./worker-route-readiness";

type PreflightEnv = Readonly<Record<string, string | undefined>>;

export type RefundSandboxProviderFreePreflightDependencies<Database> = Readonly<{
  inspectEnvironment: (
    env: PreflightEnv,
  ) => RefundSandboxProviderFreePreflightEnvironment | null;
  createDatabase: (connectionString: string) => Database | Promise<Database>;
  disconnectDatabase: (database: Database) => Promise<void>;
  checkDatabaseConnectivity: (database: Database) => Promise<void>;
  readPostgresqlMajor: (database: Database) => Promise<number>;
  loadRepositoryMigrations: () => Promise<readonly RefundWorkerRepositoryMigration[]>;
  readMigrationLedger: (database: Database) => Promise<RefundWorkerMigrationLedger>;
  compareMigrations: (
    repository: readonly RefundWorkerRepositoryMigration[],
    ledger: RefundWorkerMigrationLedger,
  ) => ReturnType<typeof compareRefundWorkerMigrations>;
  readHealth: (database: Database) => Promise<unknown>;
  readManualReview: (database: Database) => Promise<unknown>;
  readReconciliation: (database: Database) => Promise<unknown>;
  inspectCredential: (env: PreflightEnv) => unknown;
  probeAdmission: (env: PreflightEnv) => Promise<RefundSandboxProviderFreeAdmissionProbeResult>;
}>;

export const defaultRefundSandboxProviderFreePreflightDependencies:
RefundSandboxProviderFreePreflightDependencies<PrismaClient> = Object.freeze({
  inspectEnvironment: safeRefundSandboxProviderFreePreflightEnvironment,
  createDatabase: (connectionString) => new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  }),
  disconnectDatabase: (database) => database.$disconnect(),
  checkDatabaseConnectivity,
  readPostgresqlMajor,
  loadRepositoryMigrations: loadRefundWorkerRepositoryMigrations,
  readMigrationLedger: readRefundWorkerMigrationLedger,
  compareMigrations: compareRefundWorkerMigrations,
  readHealth: readRefundExecutionWorkerHealthBacklog,
  readManualReview: readRefundOperationsManualReviewQueue,
  readReconciliation: readRefundOperationsReconciliationSnapshot,
  inspectCredential: inspectRefundCredentialLifecycle,
  probeAdmission: probeRefundSandboxProviderFreeAdmission,
});

export async function runRefundSandboxProviderFreePreflight<Database>(
  env: PreflightEnv,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
): Promise<RefundSandboxProviderFreePreflightResult> {
  let inspected: RefundSandboxProviderFreePreflightEnvironment | null;
  try {
    inspected = dependencies.inspectEnvironment(env);
  } catch {
    inspected = null;
  }
  if (!inspected) return refundSandboxProviderFreePreflightFailure("CONFIG_INVALID");
  let database: Database;
  try {
    database = await dependencies.createDatabase(inspected.DATABASE_URL);
  } catch {
    return refundSandboxProviderFreePreflightFailure("DATABASE_UNAVAILABLE");
  }
  let result: RefundSandboxProviderFreePreflightResult;
  let disconnectFailed = false;
  try {
    result = await runDatabasePreflight(inspected, database, dependencies);
  } catch {
    result = refundSandboxProviderFreePreflightFailure("SYSTEMIC_FAILURE");
  } finally {
    try {
      await dependencies.disconnectDatabase(database);
    } catch {
      disconnectFailed = true;
    }
  }
  return disconnectFailed
    ? refundSandboxProviderFreePreflightFailure("SYSTEMIC_FAILURE")
    : result;
}

async function runDatabasePreflight<Database>(
  inspected: RefundSandboxProviderFreePreflightEnvironment,
  database: Database,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
): Promise<RefundSandboxProviderFreePreflightResult> {
  const foundation = await databaseFoundationReadiness(database, dependencies);
  if (foundation !== "READY") return refundSandboxProviderFreePreflightFailure(foundation);
  return providerFreeStateReadiness(inspected, database, dependencies);
}

async function databaseFoundationReadiness<Database>(
  database: Database,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
): Promise<"READY" | "MIGRATIONS_NOT_READY" | "DATABASE_UNAVAILABLE" | "PREFLIGHT_NOT_READY" | "SYSTEMIC_FAILURE"> {
  try {
    await dependencies.checkDatabaseConnectivity(database);
  } catch {
    return "DATABASE_UNAVAILABLE";
  }
  const major = await safeDatabaseRead(() => dependencies.readPostgresqlMajor(database));
  if (major === null) return "DATABASE_UNAVAILABLE";
  if (major !== 18) return "PREFLIGHT_NOT_READY";
  return migrationReadiness(database, dependencies);
}

async function providerFreeStateReadiness<Database>(
  inspected: RefundSandboxProviderFreePreflightEnvironment,
  database: Database,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
): Promise<RefundSandboxProviderFreePreflightResult> {
  if (!workerDisabledReady(inspected.activationEnvironment)) {
    return refundSandboxProviderFreePreflightFailure("CONFIG_INVALID");
  }
  const health = await safeDatabaseRead(() => dependencies.readHealth(database));
  if (!emptyHealth(health)) return refundSandboxProviderFreePreflightFailure("PREFLIGHT_NOT_READY");
  const manual = await safeDatabaseRead(() => dependencies.readManualReview(database));
  if (!emptyManual(manual)) return refundSandboxProviderFreePreflightFailure("PREFLIGHT_NOT_READY");
  const reconciliation = await safeDatabaseRead(() => dependencies.readReconciliation(database));
  if (!emptyReconciliation(reconciliation)) {
    return refundSandboxProviderFreePreflightFailure("PREFLIGHT_NOT_READY");
  }
  if (!absentCredential(dependencies.inspectCredential(inspected.activationEnvironment))) {
    return refundSandboxProviderFreePreflightFailure("CONFIG_INVALID");
  }
  const admission = await dependencies.probeAdmission({ DATABASE_URL: inspected.DATABASE_URL });
  return admission === "ONE_WINNER_ONE_BUSY"
    ? refundSandboxProviderFreePreflightComplete()
    : refundSandboxProviderFreePreflightFailure("PREFLIGHT_NOT_READY");
}

async function migrationReadiness<Database>(
  database: Database,
  dependencies: RefundSandboxProviderFreePreflightDependencies<Database>,
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
    return dependencies.compareMigrations(repository, ledger).ok ? "READY" : "MIGRATIONS_NOT_READY";
  } catch {
    return "SYSTEMIC_FAILURE";
  }
}

function workerDisabledReady(env: PreflightEnv): boolean {
  try {
    const activation = inspectRefundExecutionActivationInventory(env);
    const routes = refundExecutionWorkerRouteReadiness(env, "ABSENT");
    return activation.workerEnabled === false && Object.values(routes).every((ready) => !ready);
  } catch {
    return false;
  }
}

function emptyHealth(value: unknown): boolean {
  const backlog = exactRefundRuntimeRecord(value, [
    "READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW",
  ]);
  return backlog !== null && Object.values(backlog).every(emptyBacklogObservation);
}

function emptyBacklogObservation(value: unknown): boolean {
  const observation = exactRefundRuntimeRecord(value, ["count", "oldestAgeSeconds"]);
  return observation?.count === 0 && observation.oldestAgeSeconds === null;
}

function emptyManual(value: unknown): boolean {
  const result = sanitizeRefundOperationsResult(value);
  return result?.ok === true && result.code === "MANUAL_REVIEW_QUEUE"
    && result.summary.count === 0
    && result.cases.length === 0
    && result.truncated === false;
}

function emptyReconciliation(value: unknown): boolean {
  const result = sanitizeRefundOperationsResult(value);
  if (result?.ok !== true || result.code !== "RECONCILIATION_SNAPSHOT") return false;
  return Object.values(result.summary).every((count) => count === 0)
    && result.cases.length === 0 && result.truncated === false;
}

function absentCredential(value: unknown): boolean {
  const result = sanitizeRefundOperationsResult(value);
  if (result?.ok !== true || result.code !== "CREDENTIAL_LIFECYCLE_CHECK") return false;
  return result.credentialStatus === "ABSENT"
    && result.secretValidation === "NOT_PERFORMED";
}

async function safeDatabaseRead<Result>(read: () => Promise<Result>): Promise<Result | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function checkDatabaseConnectivity(database: PrismaClient): Promise<void> {
  const rows = await database.$queryRaw<{ reachable: number }[]>(Prisma.sql`
    SELECT 1::int AS "reachable"
  `);
  if (rows.length !== 1 || rows[0]?.reachable !== 1) throw new Error("DATABASE_UNAVAILABLE");
}

async function readPostgresqlMajor(database: PrismaClient): Promise<number> {
  const rows = await database.$queryRaw<{ version: string }[]>(Prisma.sql`
    SELECT current_setting('server_version_num') AS "version"
  `);
  const version = rows.length === 1 ? rows[0]?.version : undefined;
  if (typeof version !== "string" || !/^[0-9]{6}$/u.test(version)) {
    throw new Error("INVALID_POSTGRESQL_VERSION");
  }
  const major = Number(version.slice(0, 2));
  if (!Number.isSafeInteger(major)) throw new Error("INVALID_POSTGRESQL_VERSION");
  return major;
}
