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
  lifecycleDrained,
  type RefundExecutionWorkerHostCommand,
  type RefundExecutionWorkerHostResult,
} from "./worker-host-contract";
import {
  neverStoppingRefundExecutionWorkerLifecycle,
  type RefundExecutionWorkerCycleControl,
  type RefundExecutionWorkerDrainReason,
  type RefundExecutionWorkerHostLifecycle,
} from "./worker-host-lifecycle";
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
import { EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS } from "./worker-contract";

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
  createLifecycle?: () => RefundExecutionWorkerHostLifecycle;
  createWorkerDependencies: () => RefundExecutionWorkerDependencies;
  runWorkerCycle: (
    database: Database,
    workerOwner: string,
    dependencies: RefundExecutionWorkerDependencies,
    env: HostEnv,
    control: RefundExecutionWorkerCycleControl,
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
    runWorkerCycle: (database, workerOwner, dependencies, env, control) => (
      runRefundExecutionWorkerCycle(database, { workerOwner }, dependencies, env, control)
    ),
  });

export async function runRefundExecutionWorkerHost<Database>(
  command: RefundExecutionWorkerHostCommand,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  if (command.kind === "CHECK") return runCheckHost(command, env, dependencies);
  const earlyGate = earlyMasterGate(env, dependencies.inspectMasterGate);
  if (earlyGate !== true) return earlyGate;
  return runEnabledOnceHost(command, env, dependencies);
}

async function runCheckHost<Database>(
  command: Extract<RefundExecutionWorkerHostCommand, { kind: "CHECK" }>,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  const configuration = inspectHostConfiguration(command, env, dependencies);
  if (!configuration.ok) return configuration.result;
  return runWithOwnedDatabase(
    command, configuration, env, dependencies, neverStoppingRefundExecutionWorkerLifecycle(),
  );
}

async function runEnabledOnceHost<Database>(
  command: Extract<RefundExecutionWorkerHostCommand, { kind: "RUN_ONCE" }>,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  const lifecycle = createHostLifecycle(dependencies.createLifecycle);
  if (!lifecycle) return hostFailure("SYSTEMIC_FAILURE");
  let result: RefundExecutionWorkerHostResult;
  let cleanupFailed = false;
  try {
    result = await runAfterInitialLifecycleAdmission(
      command, env, dependencies, lifecycle,
    );
  } catch {
    result = hostFailure("SYSTEMIC_FAILURE");
  } finally {
    try {
      lifecycle.dispose();
    } catch {
      cleanupFailed = true;
    }
  }
  return cleanupFailed ? hostFailure("SYSTEMIC_FAILURE") : result;
}

async function runAfterInitialLifecycleAdmission<Database>(
  command: Extract<RefundExecutionWorkerHostCommand, { kind: "RUN_ONCE" }>,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
  lifecycle: RefundExecutionWorkerHostLifecycle,
): Promise<RefundExecutionWorkerHostResult> {
  const initialAdmission = observeLifecycle(lifecycle);
  if (initialAdmission.kind !== "CONTINUE") return admissionResult(initialAdmission);
  const configuration = inspectHostConfiguration(command, env, dependencies);
  if (!configuration.ok) return configuration.result;
  const beforeDatabase = observeLifecycle(lifecycle);
  return beforeDatabase.kind === "CONTINUE"
    ? runWithOwnedDatabase(command, configuration, env, dependencies, lifecycle)
    : admissionResult(beforeDatabase);
}

function createHostLifecycle(
  create: (() => RefundExecutionWorkerHostLifecycle) | undefined,
): RefundExecutionWorkerHostLifecycle | null {
  try {
    return create ? create() : neverStoppingRefundExecutionWorkerLifecycle();
  } catch {
    return null;
  }
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
  lifecycle: RefundExecutionWorkerHostLifecycle,
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
    result = await runReadyHostCommand(
      command, configuration, env, database, dependencies, lifecycle,
    );
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
  lifecycle: RefundExecutionWorkerHostLifecycle,
): Promise<RefundExecutionWorkerHostResult> {
  const beforeConnectivity = observeLifecycle(lifecycle);
  if (beforeConnectivity.kind !== "CONTINUE") return admissionResult(beforeConnectivity);
  const connectivity = await databaseConnectivity(database, dependencies.checkDatabaseConnectivity);
  if (!connectivity) return hostFailure("DATABASE_UNAVAILABLE");
  const afterConnectivity = observeLifecycle(lifecycle);
  if (afterConnectivity.kind !== "CONTINUE") return admissionResult(afterConnectivity);
  const migrations = await migrationReadiness(database, dependencies, lifecycle);
  if (migrations.kind !== "READY") return migrationResult(migrations);
  if (command.kind === "CHECK") {
    return checkReady(configuration.activation.workerEnabled, configuration.credentialStatus);
  }
  return runOneCycle(command.workerOwner, env, database, dependencies, lifecycle);
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
  lifecycle: RefundExecutionWorkerHostLifecycle,
): Promise<MigrationReadinessResult> {
  let repository: readonly RefundWorkerRepositoryMigration[];
  try {
    repository = await dependencies.loadRepositoryMigrations();
  } catch {
    return Object.freeze({ kind: "SYSTEMIC_FAILURE" });
  }
  const afterInventory = observeLifecycle(lifecycle);
  if (afterInventory.kind !== "CONTINUE") return afterInventory;
  let ledger: RefundWorkerMigrationLedger;
  try {
    ledger = await dependencies.readMigrationLedger(database);
  } catch {
    return Object.freeze({ kind: "DATABASE_UNAVAILABLE" });
  }
  const afterLedger = observeLifecycle(lifecycle);
  if (afterLedger.kind !== "CONTINUE") return afterLedger;
  try {
    if (!dependencies.compareMigrations(repository, ledger).ok) {
      return Object.freeze({ kind: "NOT_READY" });
    }
  } catch {
    return Object.freeze({ kind: "SYSTEMIC_FAILURE" });
  }
  const afterComparison = observeLifecycle(lifecycle);
  return afterComparison.kind === "CONTINUE"
    ? Object.freeze({ kind: "READY" })
    : afterComparison;
}

async function runOneCycle<Database>(
  workerOwner: string,
  env: HostEnv,
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
  lifecycle: RefundExecutionWorkerHostLifecycle,
): Promise<RefundExecutionWorkerHostResult> {
  const beforeAdapters = observeLifecycle(lifecycle);
  if (beforeAdapters.kind !== "CONTINUE") return admissionResult(beforeAdapters);
  let workerDependencies: RefundExecutionWorkerDependencies;
  try {
    workerDependencies = dependencies.createWorkerDependencies();
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
  const beforeCycle = observeLifecycle(lifecycle);
  if (beforeCycle.kind !== "CONTINUE") return admissionResult(beforeCycle);
  try {
    const result = await dependencies.runWorkerCycle(
      database,
      workerOwner,
      workerDependencies,
      env,
      lifecycle,
    );
    return mapWorkerResult(result, lifecycle);
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
}

function mapWorkerResult(
  result: RefundExecutionWorkerCycleResult,
  lifecycle: RefundExecutionWorkerHostLifecycle,
): RefundExecutionWorkerHostResult {
  if (result.ok && "stopped" in result) {
    const observation = observeLifecycle(lifecycle);
    return observation.kind === "DRAINED"
      ? lifecycleDrained(observation.reason, result.cycle)
      : hostFailure("SYSTEMIC_FAILURE");
  }
  if (result.ok) return cycleComplete(result.cycle);
  if (result.code === "FEATURE_DISABLED") return featureDisabled();
  if (result.code === "INVALID_WORKER_OWNER") return hostFailure("INVALID_WORKER_OWNER");
  if (result.code === "CONFIG_INVALID") return hostFailure("CONFIG_INVALID");
  return hostFailure("SYSTEMIC_FAILURE");
}

type LifecycleObservation = Readonly<{ kind: "CONTINUE" }>
  | Readonly<{ kind: "DRAINED"; reason: RefundExecutionWorkerDrainReason }>
  | Readonly<{ kind: "SYSTEMIC_FAILURE" }>;

type MigrationReadinessResult = Readonly<{
  kind: "READY" | "NOT_READY" | "DATABASE_UNAVAILABLE";
}> | Exclude<LifecycleObservation, { kind: "CONTINUE" }>;

function observeLifecycle(lifecycle: RefundExecutionWorkerHostLifecycle): LifecycleObservation {
  try {
    const shouldStop = lifecycle.shouldStop();
    if (typeof shouldStop !== "boolean") return Object.freeze({ kind: "SYSTEMIC_FAILURE" });
    if (!shouldStop) return Object.freeze({ kind: "CONTINUE" });
    const reason = lifecycle.drainReason();
    return reason === "SIGNAL" || reason === "BUDGET"
      ? Object.freeze({ kind: "DRAINED", reason })
      : Object.freeze({ kind: "SYSTEMIC_FAILURE" });
  } catch {
    return Object.freeze({ kind: "SYSTEMIC_FAILURE" });
  }
}

function admissionResult(
  observation: Exclude<LifecycleObservation, { kind: "CONTINUE" }>,
): RefundExecutionWorkerHostResult {
  return observation.kind === "DRAINED"
    ? lifecycleDrained(observation.reason, EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS)
    : hostFailure("SYSTEMIC_FAILURE");
}

function migrationResult(
  result: Exclude<MigrationReadinessResult, { kind: "READY" }>,
): RefundExecutionWorkerHostResult {
  if (result.kind === "DRAINED" || result.kind === "SYSTEMIC_FAILURE") {
    return admissionResult(result);
  }
  return result.kind === "DATABASE_UNAVAILABLE"
    ? hostFailure("DATABASE_UNAVAILABLE")
    : hostFailure("MIGRATIONS_NOT_READY");
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
