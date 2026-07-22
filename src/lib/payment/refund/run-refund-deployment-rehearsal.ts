import { resolve } from "node:path";
import {
  REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
} from "./refund-operations-contract";
import {
  REFUND_WORKER_PROCESS_FORMAT_VERSION,
} from "./worker-host-process";
import {
  REFUND_EXECUTION_WORKER_EXTERNAL_HARD_DEADLINE_MS,
} from "./worker-host-lifecycle";
import {
  refundDeploymentRehearsalComplete,
  refundDeploymentRehearsalFailure,
  type RefundDeploymentRehearsalHostResult,
  type RefundDeploymentRehearsalStage,
} from "./refund-deployment-rehearsal-contract";
import {
  runRefundDeploymentRehearsalChild,
  type RefundDeploymentRehearsalChildResult,
  type RefundDeploymentRehearsalChildSpec,
} from "./refund-deployment-rehearsal-child";
import {
  safeRefundDeploymentRehearsalEnvironment,
  type RefundDeploymentRehearsalEnvironment,
} from "./refund-deployment-rehearsal-environment";
import {
  classifyRefundDeploymentExit,
  refundDeploymentBackoffDecision,
  simulateRefundDeploymentOverlap,
} from "./refund-deployment-exit-policy";
import {
  exactRehearsalArray,
  exactRehearsalRecord,
} from "./refund-deployment-rehearsal-exact";

type RehearsalEnv = Readonly<Record<string, string | undefined>>;

const READ_ONLY_CHILD_DEADLINE_MS = 30_000;

interface RehearsalStageDefinition {
  stage: Extract<RefundDeploymentRehearsalStage,
  "READINESS" | "HEALTH" | "MANUAL_REVIEW" | "RECONCILIATION" | "CREDENTIAL" | "DISABLED_RUN_ONCE">;
  args: readonly string[];
  expectedCode: string;
  processFormat: string;
  processCommand: string;
  deadlineMs: number;
}

export const REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES = Object.freeze([
  Object.freeze({
    stage: "READINESS",
    args: Object.freeze(["--import", "tsx", "scripts/refund-execution-worker.ts", "check"]),
    expectedCode: "CHECK_READY",
    processFormat: REFUND_WORKER_PROCESS_FORMAT_VERSION,
    processCommand: "CHECK",
    deadlineMs: READ_ONLY_CHILD_DEADLINE_MS,
  }),
  Object.freeze({
    stage: "HEALTH",
    args: Object.freeze(["--import", "tsx", "scripts/refund-execution-worker.ts", "health"]),
    expectedCode: "HEALTH_SNAPSHOT",
    processFormat: REFUND_WORKER_PROCESS_FORMAT_VERSION,
    processCommand: "HEALTH",
    deadlineMs: READ_ONLY_CHILD_DEADLINE_MS,
  }),
  Object.freeze({
    stage: "MANUAL_REVIEW",
    args: Object.freeze(["--import", "tsx", "scripts/refund-operations.ts", "manual"]),
    expectedCode: "MANUAL_REVIEW_QUEUE",
    processFormat: REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
    processCommand: "MANUAL",
    deadlineMs: READ_ONLY_CHILD_DEADLINE_MS,
  }),
  Object.freeze({
    stage: "RECONCILIATION",
    args: Object.freeze(["--import", "tsx", "scripts/refund-operations.ts", "reconcile"]),
    expectedCode: "RECONCILIATION_SNAPSHOT",
    processFormat: REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
    processCommand: "RECONCILE",
    deadlineMs: READ_ONLY_CHILD_DEADLINE_MS,
  }),
  Object.freeze({
    stage: "CREDENTIAL",
    args: Object.freeze(["--import", "tsx", "scripts/refund-operations.ts", "credential"]),
    expectedCode: "CREDENTIAL_LIFECYCLE_CHECK",
    processFormat: REFUND_OPERATIONS_PROCESS_FORMAT_VERSION,
    processCommand: "CREDENTIAL",
    deadlineMs: READ_ONLY_CHILD_DEADLINE_MS,
  }),
  Object.freeze({
    stage: "DISABLED_RUN_ONCE",
    args: Object.freeze([
      "--import", "tsx", "scripts/refund-execution-worker.ts",
      "run-once", "--service", "rehearsal", "--revision", "provider-free", "--slot", "one",
    ]),
    expectedCode: "FEATURE_DISABLED",
    processFormat: REFUND_WORKER_PROCESS_FORMAT_VERSION,
    processCommand: "RUN_ONCE",
    deadlineMs: REFUND_EXECUTION_WORKER_EXTERNAL_HARD_DEADLINE_MS,
  }),
] as const satisfies readonly RehearsalStageDefinition[]);

export interface RefundDeploymentRehearsalDependencies {
  executable: string;
  cwd: string;
  runChild: (spec: RefundDeploymentRehearsalChildSpec) =>
    Promise<RefundDeploymentRehearsalChildResult>;
}

export const defaultRefundDeploymentRehearsalDependencies:
RefundDeploymentRehearsalDependencies = Object.freeze({
  executable: process.execPath,
  cwd: resolve(process.cwd()),
  runChild: runRefundDeploymentRehearsalChild,
});

export async function runRefundDeploymentRehearsal(
  env: RehearsalEnv,
  dependencies: RefundDeploymentRehearsalDependencies =
    defaultRefundDeploymentRehearsalDependencies,
): Promise<RefundDeploymentRehearsalHostResult> {
  const childEnv = safeRefundDeploymentRehearsalEnvironment(env);
  if (!childEnv) return Object.freeze({ ok: false, code: "UNSAFE_REHEARSAL_ENVIRONMENT" });
  const matrixFailure = await runChildMatrix(childEnv, dependencies);
  if (matrixFailure) return matrixFailure;
  return validateRehearsalPolicies();
}

async function runChildMatrix(
  childEnv: RefundDeploymentRehearsalEnvironment,
  dependencies: RefundDeploymentRehearsalDependencies,
): Promise<RefundDeploymentRehearsalHostResult | null> {
  for (const definition of REFUND_DEPLOYMENT_REHEARSAL_CHILD_STAGES) {
    const child = await safeRunChild(dependencies, definition, childEnv);
    if (!child.ok) return refundDeploymentRehearsalFailure(definition.stage, child.reason);
    const validation = validateStageResult(definition, child.value);
    if (validation === "UNSAFE_BACKLOG") {
      return refundDeploymentRehearsalFailure(definition.stage, validation);
    }
    if (validation !== "PASS") {
      return refundDeploymentRehearsalFailure(definition.stage, "UNEXPECTED_CODE");
    }
  }
  return null;
}

async function validateRehearsalPolicies(): Promise<RefundDeploymentRehearsalHostResult> {
  if (!exitPolicyPasses()) {
    return refundDeploymentRehearsalFailure("EXIT_POLICY", "SYSTEMIC_FAILURE");
  }
  if (!(await overlapPolicyPasses())) {
    return refundDeploymentRehearsalFailure("OVERLAP_POLICY", "SYSTEMIC_FAILURE");
  }
  if (!hardDeadlinePolicyPasses()) {
    return refundDeploymentRehearsalFailure("HARD_DEADLINE_POLICY", "SYSTEMIC_FAILURE");
  }
  return refundDeploymentRehearsalComplete();
}

async function safeRunChild(
  dependencies: RefundDeploymentRehearsalDependencies,
  definition: RehearsalStageDefinition,
  env: RefundDeploymentRehearsalEnvironment,
): Promise<RefundDeploymentRehearsalChildResult> {
  try {
    return await dependencies.runChild({
      executable: dependencies.executable,
      args: definition.args,
      cwd: dependencies.cwd,
      env,
      deadlineMs: definition.deadlineMs,
      expectedExitCode: 0,
      expectedChannel: "STDOUT",
    });
  } catch {
    return Object.freeze({ ok: false, reason: "SPAWN_FAILED" });
  }
}

function validateStageResult(
  definition: RehearsalStageDefinition,
  value: unknown,
): "PASS" | "UNSAFE_BACKLOG" | "INVALID" {
  const result = exactRehearsalRecord(value, STAGE_RESULT_KEYS[definition.stage]);
  if (!result || !validStageEnvelope(definition, result)) return "INVALID";
  return validateStagePayload(definition.stage, result);
}

const STAGE_RESULT_KEYS: Readonly<Record<
RehearsalStageDefinition["stage"],
readonly string[]
>> = Object.freeze({
  READINESS: Object.freeze(["ok", "code", "readiness", "process"]),
  HEALTH: Object.freeze(["ok", "code", "readiness", "routes", "backlog", "process"]),
  MANUAL_REVIEW: Object.freeze(["ok", "code", "summary", "cases", "truncated", "process"]),
  RECONCILIATION: Object.freeze(["ok", "code", "summary", "cases", "truncated", "process"]),
  CREDENTIAL: Object.freeze([
    "ok", "code", "credentialStatus", "secretValidation", "rotationCapability",
    "historicalGenerationResolution", "revocationReadiness", "process",
  ]),
  DISABLED_RUN_ONCE: Object.freeze(["ok", "code", "process"]),
});

function validStageEnvelope(
  definition: RehearsalStageDefinition,
  result: Record<string, unknown>,
): boolean {
  return result.ok === true && result.code === definition.expectedCode
    && validProcess(result.process, definition.processFormat, definition.processCommand);
}

function validateStagePayload(
  stage: RehearsalStageDefinition["stage"],
  result: Record<string, unknown>,
): "PASS" | "UNSAFE_BACKLOG" | "INVALID" {
  return STAGE_VALIDATORS[stage](result);
}

type StageValidation = "PASS" | "UNSAFE_BACKLOG" | "INVALID";
type StageValidator = (result: Record<string, unknown>) => StageValidation;

const STAGE_VALIDATORS = Object.freeze({
  READINESS: (result) => validReadiness(result) ? "PASS" : "INVALID",
  HEALTH: validateHealth,
  MANUAL_REVIEW: (result) => validManualReview(result) ? "PASS" : "INVALID",
  RECONCILIATION: (result) => validReconciliation(result) ? "PASS" : "INVALID",
  CREDENTIAL: (result) => validCredential(result) ? "PASS" : "INVALID",
  DISABLED_RUN_ONCE: () => "PASS",
} satisfies Record<RehearsalStageDefinition["stage"], StageValidator>);

function validReadiness(result: Record<string, unknown>): boolean {
  const readiness = exactRehearsalRecord(result.readiness, [
    "workerMasterEnabled", "credentialStatus", "databaseReachable", "migrationStatus",
  ]);
  return readiness !== null
    && readiness.workerMasterEnabled === false && readiness.credentialStatus === "ABSENT"
    && readiness.databaseReachable === true && readiness.migrationStatus === "READY";
}

function validateHealth(result: Record<string, unknown>): "PASS" | "UNSAFE_BACKLOG" | "INVALID" {
  const readiness = exactRehearsalRecord(result.readiness, [
    "workerMasterEnabled", "credentialStatus", "databaseReachable", "migrationStatus",
  ]);
  const routes = exactRehearsalRecord(result.routes, [
    "READY", "UNCONTACTED", "CONTACTED_LOOKUP", "CONTACTED_RECONTACT",
  ]);
  const backlog = exactRehearsalRecord(result.backlog, [
    "READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW",
  ]);
  if (!readiness || !routes || !backlog || !validReadinessFields(readiness)
    || !validDisabledRoutes(routes) || !validBacklogKeys(backlog)) return "INVALID";
  return validateZeroBacklog(backlog);
}

function validDisabledRoutes(routes: Record<string, unknown>): boolean {
  return Object.values(routes).every((value) => value === false);
}

function validBacklogKeys(backlog: Record<string, unknown>): boolean {
  return Object.keys(backlog).length === 4;
}

function validateZeroBacklog(
  backlog: Record<string, unknown>,
): "PASS" | "UNSAFE_BACKLOG" | "INVALID" {
  for (const value of Object.values(backlog)) {
    const observation = exactRehearsalRecord(value, ["count", "oldestAgeSeconds"]);
    if (!observation || !validBacklogObservation(observation)) return "INVALID";
    if (observation.count !== 0) return "UNSAFE_BACKLOG";
  }
  return "PASS";
}

function validBacklogObservation(observation: Record<string, unknown>): boolean {
  if (typeof observation.count !== "number" || !Number.isSafeInteger(observation.count)
    || observation.count < 0) return false;
  if (observation.count === 0) return observation.oldestAgeSeconds === null;
  return validPositiveBacklogAge(observation.oldestAgeSeconds);
}

function validPositiveBacklogAge(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value)
    && Number.isInteger(value) && Number.isSafeInteger(value) && value >= 0;
}

function validReadinessFields(readiness: Record<string, unknown>): boolean {
  return readiness.workerMasterEnabled === false && readiness.credentialStatus === "ABSENT"
    && readiness.databaseReachable === true && readiness.migrationStatus === "READY";
}

function validManualReview(result: Record<string, unknown>): boolean {
  const summary = exactRehearsalRecord(result.summary, ["count", "oldestAgeSeconds"]);
  const cases = exactRehearsalArray(result.cases, 0);
  return summary !== null
    && summary.count === 0 && summary.oldestAgeSeconds === null
    && cases !== null && result.truncated === false;
}

function validReconciliation(result: Record<string, unknown>): boolean {
  const summary = exactRehearsalRecord(result.summary, [
      "caseCount", "possibleContactCount", "manualReviewCount",
      "contactedWarningCount", "contactedCriticalCount",
  ]);
  const cases = exactRehearsalArray(result.cases, 0);
  return summary !== null && Object.values(summary).every((value) => value === 0)
    && cases !== null && result.truncated === false;
}

function validCredential(result: Record<string, unknown>): boolean {
  return result.credentialStatus === "ABSENT" && result.secretValidation === "NOT_PERFORMED"
    && result.rotationCapability === "SINGLE_ACTIVE_ONLY"
    && result.historicalGenerationResolution === false
    && result.revocationReadiness === "NOT_PROVABLE";
}

function validProcess(value: unknown, format: string, command: string): boolean {
  const process = exactRehearsalRecord(value, ["formatVersion", "command", "operationDurationMs"]);
  return process !== null
    && process.formatVersion === format && process.command === command
    && typeof process.operationDurationMs === "number"
    && Number.isSafeInteger(process.operationDurationMs) && process.operationDurationMs >= 0;
}

function exitPolicyPasses(): boolean {
  const complete = classifyRefundDeploymentExit({ kind: "RESULT", code: "CYCLE_COMPLETE", exitCode: 0 });
  const disabled = classifyRefundDeploymentExit({ kind: "RESULT", code: "FEATURE_DISABLED", exitCode: 0 });
  const systemic = classifyRefundDeploymentExit({ kind: "RESULT", code: "SYSTEMIC_FAILURE", exitCode: 1 });
  return complete === "NEXT_CADENCE" && disabled === "DISABLED_NO_PROCESSING"
    && systemic === "BACKOFF_SYSTEMIC"
    && refundDeploymentBackoffDecision(complete, 3)?.kind === "RESET"
    && refundDeploymentBackoffDecision(systemic, 4)?.kind === "BACKOFF";
}

async function overlapPolicyPasses(): Promise<boolean> {
  let invocationCount = 0;
  const acquired = await simulateRefundDeploymentOverlap("ACQUIRED", () => {
    invocationCount += 1;
    return Promise.resolve("COMPLETE");
  });
  const busy = await simulateRefundDeploymentOverlap("BUSY", () => {
    invocationCount += 1;
    return Promise.resolve("MUST_NOT_RUN");
  });
  const invalid = await simulateRefundDeploymentOverlap("INVALID", () => {
    invocationCount += 1;
    return Promise.resolve("MUST_NOT_RUN");
  });
  return invocationCount === 1 && acquired.code === "OVERLAP_ACQUIRED"
    && acquired.result === "COMPLETE" && busy.code === "OVERLAP_SKIPPED"
    && invalid.code === "INVALID_ADMISSION_STATE";
}

function hardDeadlinePolicyPasses(): boolean {
  return classifyRefundDeploymentExit({ kind: "EXTERNAL_TIMEOUT" })
    === "STOP_AND_RECONCILE_POSSIBLE_CONTACT";
}
