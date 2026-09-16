import { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaPg } from "../../database/prisma-pg";
import {
  inspectRefundExecutionActivationInventory,
  isRefundExecutionEximbayRoutingEnabled,
  isRefundExecutionWorkerEnabled,
  RefundExecutionActivationConfigError,
  type RefundExecutionActivationInventory,
} from "./execution-activation";
import {
  parseEximbayRefundWorkerConfig,
} from "./providers/eximbay/refund-worker-config";
import { createAuthenticatedEximbayRefundRestFetch } from "./providers/eximbay/authenticated-transport";
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
  healthSnapshot,
  hostCycleFailure,
  hostFailure,
  lifecycleDrained,
  overlapSkipped,
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
import { readRefundExecutionWorkerHealthBacklog } from "./worker-health";
import { refundExecutionWorkerRouteReadiness } from "./worker-route-readiness";
import {
  runWithRefundProviderContactAdmission,
  type RefundProviderContactAdmissionResult,
} from "./refund-provider-contact-admission";

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
  readHealthBacklog?: (database: Database) => Promise<unknown>;
  createWorkerDependencies: (env: HostEnv) => RefundExecutionWorkerDependencies;
  runProviderContactAdmission: <Result>(
    env: HostEnv,
    operation: () => Promise<Result>,
  ) => Promise<RefundProviderContactAdmissionResult<Result>>;
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
    readHealthBacklog: readRefundExecutionWorkerHealthBacklog,
    runProviderContactAdmission: runWithRefundProviderContactAdmission,
    createWorkerDependencies: createDefaultWorkerDependencies,
    runWorkerCycle: (database, workerOwner, dependencies, env, control) => (
      runRefundExecutionWorkerCycle(database, { workerOwner }, dependencies, env, control)
    ),
  });

export async function runRefundExecutionWorkerHost<Database>(
  command: RefundExecutionWorkerHostCommand,
  env: HostEnv,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  if (command.kind !== "RUN_ONCE") return runReadOnlyHost(command, env, dependencies);
  const earlyGate = earlyMasterGate(env, dependencies.inspectMasterGate);
  if (earlyGate !== true) return earlyGate;
  return runEnabledOnceHost(command, env, dependencies);
}

async function runReadOnlyHost<Database>(
  command: Extract<RefundExecutionWorkerHostCommand, { kind: "CHECK" | "HEALTH" }>,
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
  eximbayRoutingEnabled: boolean;
  eximbayConfigStatus: "ABSENT" | "CONFIGURED";
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
    const inspectedCredentialStatus = dependencies.inspectCredential(env);
    const eximbayRoutingEnabled = isRefundExecutionEximbayRoutingEnabled(env);
    const inspectedEximbayConfig = eximbayRoutingEnabled
      ? parseEximbayRefundWorkerConfig(env)
      : Object.freeze({ status: "ABSENT" } as const);
    const credentialStatus = admittedStatus(inspectedCredentialStatus);
    const eximbayConfigStatus = admittedStatus(inspectedEximbayConfig.status);
    if (!credentialStatus || !eximbayConfigStatus) return configurationFailure();
    if (hostConfigurationInvalid(
      command, credentialStatus, eximbayRoutingEnabled, eximbayConfigStatus,
    )) {
      return configurationFailure();
    }
    return Object.freeze({
      ok: true,
      activation,
      credentialStatus,
      eximbayRoutingEnabled,
      eximbayConfigStatus,
    });
  } catch {
    return configurationFailure();
  }
}

function hostConfigurationInvalid(
  command: RefundExecutionWorkerHostCommand,
  credentialStatus: AdmittedConfigStatus,
  eximbayRoutingEnabled: boolean,
  eximbayConfigStatus: AdmittedConfigStatus,
): boolean {
  if (eximbayRoutingEnabled && eximbayConfigStatus !== "CONFIGURED") return true;
  return command.kind === "RUN_ONCE"
    && credentialStatus !== "CONFIGURED"
    && eximbayConfigStatus !== "CONFIGURED";
}

type AdmittedConfigStatus = "ABSENT" | "CONFIGURED";

function admittedStatus(
  status: TossRefundCredentialConfigState["status"],
): AdmittedConfigStatus | null {
  return status === "CONFIG_INVALID" ? null : status;
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
  if (command.kind === "HEALTH") {
    return runHealthSnapshot(configuration, env, database, dependencies);
  }
  return runAdmittedCycle(command.workerOwner, env, database, dependencies, lifecycle);
}

async function runAdmittedCycle<Database>(
  workerOwner: string,
  env: HostEnv,
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
  lifecycle: RefundExecutionWorkerHostLifecycle,
): Promise<RefundExecutionWorkerHostResult> {
  let admission: RefundProviderContactAdmissionResult<RefundExecutionWorkerHostResult>;
  try {
    admission = await dependencies.runProviderContactAdmission(
      env,
      () => runOneCycle(workerOwner, env, database, dependencies, lifecycle),
    );
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
  if (admission.outcome === "BUSY") return overlapSkipped();
  if (admission.outcome === "ADMISSION_UNAVAILABLE") {
    return hostFailure("DATABASE_UNAVAILABLE");
  }
  if (admission.outcome === "ADMISSION_CLEANUP_FAILED") {
    return admissionCleanupFailure(admission.result);
  }
  return admission.result;
}

function admissionCleanupFailure(
  primary: RefundExecutionWorkerHostResult,
): RefundExecutionWorkerHostResult {
  if (!primary.ok) return primary;
  if ("cycle" in primary) return hostCycleFailure("SYSTEMIC_FAILURE", primary.cycle);
  return hostFailure("SYSTEMIC_FAILURE");
}

async function runHealthSnapshot<Database>(
  configuration: Extract<HostConfiguration, { ok: true }>,
  env: HostEnv,
  database: Database,
  dependencies: RefundExecutionWorkerHostDependencies<Database>,
): Promise<RefundExecutionWorkerHostResult> {
  if (!dependencies.readHealthBacklog) return hostFailure("SYSTEMIC_FAILURE");
  try {
    const routes = refundExecutionWorkerRouteReadiness(env, configuration.credentialStatus);
    const backlog = await dependencies.readHealthBacklog(database);
    return healthSnapshot(
      configuration.activation.workerEnabled,
      configuration.credentialStatus,
      routes,
      backlog,
    );
  } catch {
    return hostFailure("SYSTEMIC_FAILURE");
  }
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
    workerDependencies = dependencies.createWorkerDependencies(env);
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
  if (result.code === "CONFIG_INVALID") return hostCycleFailure("CONFIG_INVALID", result.cycle);
  return hostCycleFailure("SYSTEMIC_FAILURE", result.cycle);
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

function createDefaultWorkerDependencies(env: HostEnv): RefundExecutionWorkerDependencies {
  const dependencies: RefundExecutionWorkerDependencies = {
    lookup: createTossRefundLookupPort({ fetchFn: globalThis.fetch }),
    cancellation: createTossRefundCancellationPort({ fetchFn: globalThis.fetch }),
  };
  if (!isRefundExecutionEximbayRoutingEnabled(env)) return Object.freeze(dependencies);
  const eximbay = parseEximbayRefundWorkerConfig(env);
  if (eximbay.status !== "CONFIGURED") throw new Error("EXIMBAY_REFUND_WORKER_CONFIG_REQUIRED");
  const authenticatedTransport = createAuthenticatedEximbayRefundRestFetch(
    eximbay.credentials,
    globalThis.fetch,
  );
  return Object.freeze({
    ...dependencies,
    eximbay: Object.freeze({
      config: eximbay.config,
      retrieve: authenticatedTransport,
      cancellation: authenticatedTransport,
      lookup: authenticatedTransport,
    }),
  });
}

function createOwnedDatabase(env: HostEnv): PrismaClient {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  return new PrismaClient({ adapter: createPrismaPg({ connectionString }) });
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
