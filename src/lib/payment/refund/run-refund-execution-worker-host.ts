import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  inspectRefundExecutionActivationInventory,
  isRefundExecutionWorkerEnabled,
  RefundExecutionActivationConfigError,
  type RefundExecutionActivationInventory,
} from "./execution-activation";
import {
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
  type TossRefundCredentialConfigState,
} from "./providers/toss/refund-credential-config";
import { createTossRefundCancellationPort } from "./providers/toss/refund-cancellation-http";
import { createTossRefundLookupPort } from "./providers/toss/refund-lookup-http";
import {
  checkReady,
  cycleComplete,
  featureDisabled,
  hostFailure,
  type RefundExecutionWorkerHostCommand,
  type RefundExecutionWorkerHostResult,
} from "./worker-host-contract";
import {
  compareRefundWorkerMigrations,
  loadRefundWorkerRepositoryMigrations,
  readRefundWorkerMigrationLedger,
  type RefundWorkerMigrationLedger,
  type RefundWorkerRepositoryMigration,
} from "./worker-migration-readiness";
import {
  runRefundExecutionWorkerCycle,
  type RefundExecutionWorkerDependencies,
  type RefundExecutionWorkerCycleResult,
} from "./run-refund-execution-worker-cycle";

type HostEnv = Readonly<Record<string, string | undefined>>;

export type RefundExecutionWorkerHostDependencies<Database> = Readonly<{
  inspectMasterGate: (env: HostEnv) => boolean;
  inspectActivation: (env: HostEnv) => RefundExecutionActivationInventory;
  inspectCredential: (env: HostEnv) => TossRefundCredentialConfigState["status"];
  createDatabase: (env: HostEnv) => Database | Promise<Database>;
  checkDatabaseConnectivity: (database: Database) => Promise<void>;
  loadRepositoryMigrations: () => Promise<readonly RefundWorkerRepositoryMigration[]>;
  readMigrationLedger: (database: Database) => Promise<RefundWorkerMigrationLedger>;
  compareMigrations: (
    repository: readonly RefundWorkerRepositoryMigration[],
    ledger: RefundWorkerMigrationLedger,
  ) => ReturnType<typeof compareRefundWorkerMigrations>;
  disconnectDatabase: (database: Database) => Promise<void>;
  createWorkerDependencies: () => RefundExecutionWorkerDependencies;
  runWorkerCycle: (
    database: Database,
    workerOwner: string,
    dependencies: RefundExecutionWorkerDependencies,
    env: HostEnv,
  ) => Promise<RefundExecutionWorkerCycleResult>;
}>;

export const defaultRefundExecutionWorkerHostDependencies: RefundExecutionWorkerHostDependencies<PrismaClient> =
  Object.freeze({
    inspectMasterGate: isRefundExecutionWorkerEnabled,
    inspectActivation: inspectRefundExecutionActivationInventory,
    inspectCredential: credentialStatus,
    createDatabase: createOwnedDatabase,
    checkDatabaseConnectivity,
    loadRepositoryMigrations: loadRefundWorkerRepositoryMigrations,
    readMigrationLedger: readRefundWorkerMigrationLedger,
    compareMigrations: compareRefundWorkerMigrations,
    disconnectDatabase: (database) => database.$disconnect(),
    createWorkerDependencies: () => Object.freeze({
      lookup: createTossRefundLookupPort({ fetchFn: globalThis.fetch }),
      cancellation: createTossRefundCancellationPort({ fetchFn: globalThis.fetch }),
    }),
    runWorkerCycle: (database, workerOwner, dependencies, env) => (
      runRefundExecutionWorkerCycle(database, { workerOwner }, dependencies, env)
    ),
  });

export async function runRefundExecutionWorkerHost<Database>(
  command: RefundExecutionWorkerHostCommand,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  if (command.kind === "RUN_ONCE") {
    const earlyGate = earlyMasterGate(env, dependencies.inspectMasterGate);
    if (earlyGate !== true) return earlyGate;
  }
  const configuration = inspectHostConfiguration(command, env, dependencies);
  if (!configuration.ok) return configuration.result;
  return runWithOwnedDatabase(command, configuration, env, dependencies);
}

type HostConfiguration = Readonly<{
  ok: true;
  activation: RefundExecutionActivationInventory;
  credentialStatus: "ABSENT" | "CONFIGURED";
}> | Readonly<{
  ok: false;
  result: Extract<RefundExecutionWorkerHostResult, { ok: false }>;
}>;

function earlyMasterGate(
  env: HostEnv,
  inspect: (env: HostEnv) => boolean,
): true | RefundExecutionWorkerHostResult {
  try {
    return inspect(env) ? true : featureDisabled();
  } catch (error) {
    return error instanceof RefundExecutionActivationConfigError
      ? hostFailure("CONFIG_INVALID")
      : hostFailure("SYSTEMIC_FAILURE");
  }
}

function inspectHostConfiguration<Database>(
  command: RefundExecutionWorkerHostCommand,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): HostConfiguration {
  try {
    const activation = dependencies.inspectActivation(env);
    const credentialStatus = dependencies.inspectCredential(env);
    if (credentialStatus === "CONFIG_INVALID"
      || command.kind === "RUN_ONCE" && credentialStatus !== "CONFIGURED") {
      return configurationFailure();
    }
    return Object.freeze({ ok: true, activation, credentialStatus });
  } catch {
    return configurationFailure();
  }
}

async function runWithOwnedDatabase<Database>(
  command: RefundExecutionWorkerHostCommand,
  configuration: Extract<HostConfiguration, { ok: true }>,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  let database: Database;
  try {
    database = await dependencies.createDatabase(env);
  } catch {
    return hostFailure("DATABASE_UNAVAILABLE");
  }
  let result: RefundExecutionWorkerHostResult;
  let disconnectFailed = false;
  try {
    result = await runReadyHostCommand(command, configuration, env, database, dependencies);
  } catch {
    result = hostFailure("SYSTEMIC_FAILURE");
  } finally {
    try {
      await dependencies.disconnectDatabase(database);
    } catch {
      disconnectFailed = true;
    }
  }
  return disconnectFailed ? hostFailure("SYSTEMIC_FAILURE") : result;
}

async function runReadyHostCommand<Database>(
  command: RefundExecutionWorkerHostCommand,
  configuration: Extract<HostConfiguration, { ok: true }>,
  env: HostEnv,
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  const connectivity = await databaseConnectivity(database, dependencies.checkDatabaseConnectivity);
  if (!connectivity) return hostFailure("DATABASE_UNAVAILABLE");
  const migrations = await migrationReadiness(database, dependencies);
  if (migrations === "DATABASE_UNAVAILABLE") return hostFailure("DATABASE_UNAVAILABLE");
  if (migrations === "SYSTEMIC_FAILURE") return hostFailure("SYSTEMIC_FAILURE");
  if (migrations === "NOT_READY") return hostFailure("MIGRATIONS_NOT_READY");
  if (command.kind === "CHECK") {
    return checkReady(configuration.activation.workerEnabled, configuration.credentialStatus);
  }
  return runOneCycle(command.workerOwner, env, database, dependencies);
}

async function databaseConnectivity<Database>(
  database: Database,
  check: (database: Database) => Promise<void>,
): Promise<boolean> {
  try {
    await check(database);
    return true;
  } catch {
    return false;
  }
}

async function migrationReadiness<Database>(
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<"READY" | "NOT_READY" | "DATABASE_UNAVAILABLE" | "SYSTEMIC_FAILURE"> {
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
    return dependencies.compareMigrations(repository, ledger).ok ? "READY" : "NOT_READY";
  } catch {
    return "SYSTEMIC_FAILURE";
  }
}

async function runOneCycle<Database>(
  workerOwner: string,
  env: HostEnv,
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  let workerDependencies: RefundExecutionWorkerDependencies;
  try {
    workerDependencies = dependencies.createWorkerDependencies();
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
  try {
    const result = await dependencies.runWorkerCycle(
      database,
      workerOwner,
      workerDependencies,
      env,
    );
    return mapWorkerResult(result);
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
}

function mapWorkerResult(result: RefundExecutionWorkerCycleResult): RefundExecutionWorkerHostResult {
  if (result.ok) return cycleComplete(result.cycle);
  if (result.code === "FEATURE_DISABLED") return featureDisabled();
  if (result.code === "INVALID_WORKER_OWNER") return hostFailure("INVALID_WORKER_OWNER");
  if (result.code === "CONFIG_INVALID") return hostFailure("CONFIG_INVALID");
  return hostFailure("SYSTEMIC_FAILURE");
}

function credentialStatus(env: HostEnv): TossRefundCredentialConfigState["status"] {
  return parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  }).status;
}

function createOwnedDatabase(env: HostEnv): PrismaClient {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function checkDatabaseConnectivity(database: PrismaClient): Promise<void> {
  const rows = await database.$queryRaw<{ reachable: number }[]>(Prisma.sql`
    SELECT 1::int AS "reachable"
  `);
  if (rows.length !== 1 || rows[0]?.reachable !== 1) throw new Error("DATABASE_UNAVAILABLE");
}

function configurationFailure(): HostConfiguration {
  return Object.freeze({ ok: false, result: hostFailure("CONFIG_INVALID") });
}
