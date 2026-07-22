import type { PrismaClient } from "@prisma/client";
import {
  isRefundExecutionWorkerEnabled,
  RefundExecutionActivationConfigError,
} from "./execution-activation";
import {
  reserveRefundExecutionWorkerCapacity,
  workerCandidateClassOrder,
  type RefundExecutionWorkerCandidateClass,
  type RefundExecutionWorkerCandidateQueues,
} from "./worker-allocation";
import {
  EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS,
  neverStoppingRefundExecutionWorkerCycleControl,
  normalizeRefundExecutionWorkerCycleInput,
  workerCycleStopped,
  workerCycleSuccess,
  workerFailure,
  type RefundExecutionWorkerCycleControl,
  type RefundExecutionWorkerCycleCounters,
  type RefundExecutionWorkerCycleFailure,
  type RefundExecutionWorkerCycleResult,
  type RunRefundExecutionWorkerCycleInput,
} from "./worker-contract";
import { preflightRefundExecutionWorkerRoutes } from "./worker-preflight";
import {
  createRefundExecutionWorkerRouter,
  type RefundExecutionWorkerDependencies,
} from "./worker-router";
import {
  isSelectorRaceLoss,
  stopsRefundExecutionWorkerCycle,
  type RefundExecutionWorkerOutcomeKind,
} from "./worker-result-classification";
import { selectRefundExecutionWorkerCandidates } from "./worker-selector";

type ActivationEnv = Readonly<Record<string, string | undefined>>;
type MutableCounters = { -readonly [Key in keyof RefundExecutionWorkerCycleCounters]: number };
type PreparedCycle = Readonly<{
  ok: true;
  queues: RefundExecutionWorkerCandidateQueues;
  readiness: Readonly<Record<RefundExecutionWorkerCandidateClass, boolean>>;
}> | RefundExecutionWorkerCycleFailure;
type CandidateProcessingResult = Readonly<{ ok: true; stopped: boolean }>
  | RefundExecutionWorkerCycleFailure;
type ControlledPreparation = PreparedCycle | Readonly<{ ok: true; stopped: true }>;
type CandidateStepResult = Readonly<{
  ok: true;
  stopped: boolean;
  serviceOutcome: boolean;
}> | RefundExecutionWorkerCycleFailure;

export async function runRefundExecutionWorkerCycle(
  client: PrismaClient,
  input: RunRefundExecutionWorkerCycleInput,
  dependencies: RefundExecutionWorkerDependencies,
  env: ActivationEnv = process.env,
  control: RefundExecutionWorkerCycleControl = neverStoppingRefundExecutionWorkerCycleControl(),
): Promise<RefundExecutionWorkerCycleResult> {
  const normalized = normalizeRefundExecutionWorkerCycleInput(input);
  if (!normalized.ok) return normalized;
  const prepared = await prepareControlledCycle(client, env, control);
  if (!prepared.ok) return prepared;
  if ("stopped" in prepared) {
    return workerCycleStopped(EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS);
  }
  const allocation = reserveRefundExecutionWorkerCapacity(prepared.queues);
  const counters = emptyCounters();
  const route = createRefundExecutionWorkerRouter(observeProviderInvocations(dependencies, counters));
  const processed = await processCandidateQueues(
    client, prepared, allocation, route, normalized.input.workerOwner, env, counters, control,
  );
  if (!processed.ok) return processed;
  return processed.stopped ? workerCycleStopped(counters) : workerCycleSuccess(counters);
}

async function prepareControlledCycle(
  client: PrismaClient,
  env: ActivationEnv,
  control: RefundExecutionWorkerCycleControl,
): Promise<ControlledPreparation> {
  const gate = workerGateResult(env);
  if (gate !== true) return gate;
  const initialStop = observeCooperativeStop(control);
  if (!initialStop.ok) return initialStop;
  return initialStop.shouldStop
    ? Object.freeze({ ok: true, stopped: true })
    : prepareWorkerCycle(client, env);
}

async function prepareWorkerCycle(
  client: PrismaClient,
  env: ActivationEnv,
): Promise<PreparedCycle> {
  try {
    const queues = await selectRefundExecutionWorkerCandidates(client);
    const preflight = preflightRefundExecutionWorkerRoutes(queues, env);
    return preflight.ok
      ? Object.freeze({ ok: true, queues, readiness: preflight.readiness })
      : preflight;
  } catch {
    return workerFailure("SYSTEMIC_FAILURE");
  }
}

async function processCandidateQueues(
  client: PrismaClient,
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  workerOwner: string,
  env: ActivationEnv,
  counters: MutableCounters,
  control: RefundExecutionWorkerCycleControl,
): Promise<CandidateProcessingResult> {
  const classOrder = workerCandidateClassOrder();
  for (const [classIndex, candidateClass] of classOrder.entries()) {
    const stop = observeCooperativeStop(control, counters);
    if (!stop.ok) return stop;
    if (stop.shouldStop && hasRemainingAdmission(prepared, allocation, classIndex, 0, 0)) {
      return stoppedCandidateProcessing();
    }
    const result = await processCandidateClass(
      client, prepared, allocation, route, candidateClass, classIndex,
      workerOwner, env, counters, control,
    );
    if (!result.ok || result.stopped) return result;
  }
  return completedCandidateProcessing();
}

async function processCandidateClass(
  client: PrismaClient,
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  candidateClass: RefundExecutionWorkerCandidateClass,
  classIndex: number,
  workerOwner: string,
  env: ActivationEnv,
  counters: MutableCounters,
  control: RefundExecutionWorkerCycleControl,
): Promise<CandidateProcessingResult> {
  let serviceOutcomes = 0;
  const queue = prepared.queues[candidateClass];
  for (const [candidateIndex, candidate] of queue.entries()) {
    if (serviceOutcomes >= allocation[candidateClass]) break;
    const step = await processCandidate(
      client, prepared, allocation, route, candidateClass, classIndex, candidateIndex,
      candidate, workerOwner, env, counters, control, serviceOutcomes,
    );
    if (!step.ok) return step;
    if (step.serviceOutcome) serviceOutcomes += 1;
    if (step.stopped) return stoppedCandidateProcessing();
  }
  return completedCandidateProcessing();
}

async function processCandidate(
  client: PrismaClient,
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  candidateClass: RefundExecutionWorkerCandidateClass,
  classIndex: number,
  candidateIndex: number,
  candidate: RefundExecutionWorkerCandidateQueues[RefundExecutionWorkerCandidateClass][number],
  workerOwner: string,
  env: ActivationEnv,
  counters: MutableCounters,
  control: RefundExecutionWorkerCycleControl,
  serviceOutcomes: number,
): Promise<CandidateStepResult> {
  const stopBeforeRoute = observeCooperativeStop(control, counters);
  if (!stopBeforeRoute.ok) return stopBeforeRoute;
  if (stopBeforeRoute.shouldStop) return stoppedCandidateStep(false);
  markSelected(counters, candidateClass);
  if (!prepared.readiness[candidateClass]) {
    counters.skippedCount += 1;
    return completedCandidateStep(true);
  }
  const result = await routeOneCandidate(client, candidate, route, workerOwner, env, counters);
  if (!result.ok) return result;
  const serviceOutcome = !result.selectorRaceLoss;
  const stopAfterRoute = observeCooperativeStop(control, counters);
  if (!stopAfterRoute.ok) return stopAfterRoute;
  const completedServiceOutcomes = serviceOutcomes + (serviceOutcome ? 1 : 0);
  const stopped = stopsLaterAdmission(
    stopAfterRoute.shouldStop,
    prepared,
    allocation,
    classIndex,
    candidateIndex + 1,
    completedServiceOutcomes,
  );
  return stopped ? stoppedCandidateStep(serviceOutcome) : completedCandidateStep(serviceOutcome);
}

async function routeOneCandidate(
  client: PrismaClient,
  candidate: RefundExecutionWorkerCandidateQueues[RefundExecutionWorkerCandidateClass][number],
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  workerOwner: string,
  env: ActivationEnv,
  counters: MutableCounters,
): Promise<Readonly<{ ok: true; selectorRaceLoss: boolean }> | RefundExecutionWorkerCycleFailure> {
  counters.attemptedCount += 1;
  try {
    const outcome = await route(client, candidate, workerOwner, env);
    if (stopsRefundExecutionWorkerCycle(outcome)) {
      counters.failedCount += 1;
      return workerFailure(outcome.kind === "CONFIG_INVALID"
        ? "CONFIG_INVALID"
        : "SYSTEMIC_FAILURE", counters);
    }
    incrementOutcome(counters, completedOutcomeKind(outcome.kind));
    return Object.freeze({ ok: true, selectorRaceLoss: isSelectorRaceLoss(outcome) });
  } catch {
    counters.failedCount += 1;
    return workerFailure("SYSTEMIC_FAILURE", counters);
  }
}

function completedOutcomeKind(
  kind: RefundExecutionWorkerOutcomeKind,
): Exclude<RefundExecutionWorkerOutcomeKind, "CONFIG_INVALID" | "FAILED"> {
  if (kind === "CONFIG_INVALID" || kind === "FAILED") {
    throw new Error("Stopped refund worker outcome cannot be counted as completed.");
  }
  return kind;
}

function workerGateResult(
  env: ActivationEnv,
): true | Extract<RefundExecutionWorkerCycleResult, { ok: false }> {
  try {
    return isRefundExecutionWorkerEnabled(env)
      ? true
      : workerFailure("FEATURE_DISABLED");
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) {
      return workerFailure("CONFIG_INVALID");
    }
    return workerFailure("SYSTEMIC_FAILURE");
  }
}

function emptyCounters(): MutableCounters {
  return { ...EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS };
}

function observeCooperativeStop(
  control: RefundExecutionWorkerCycleControl,
  counters: RefundExecutionWorkerCycleCounters = EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS,
): Readonly<{ ok: true; shouldStop: boolean }> | RefundExecutionWorkerCycleFailure {
  try {
    const shouldStop = control.shouldStop();
    return typeof shouldStop === "boolean"
      ? Object.freeze({ ok: true, shouldStop })
      : workerFailure("SYSTEMIC_FAILURE", counters);
  } catch {
    return workerFailure("SYSTEMIC_FAILURE", counters);
  }
}

function observeProviderInvocations(
  dependencies: RefundExecutionWorkerDependencies,
  counters: MutableCounters,
): RefundExecutionWorkerDependencies {
  return Object.freeze({
    lookup: (...args: Parameters<RefundExecutionWorkerDependencies["lookup"]>) => {
      counters.providerLookupCount += 1;
      return dependencies.lookup(...args);
    },
    cancellation: (...args: Parameters<RefundExecutionWorkerDependencies["cancellation"]>) => {
      counters.providerCancellationCount += 1;
      return dependencies.cancellation(...args);
    },
  });
}

function hasRemainingAdmission(
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  classIndex: number,
  nextCandidateIndex: number,
  serviceOutcomes: number,
): boolean {
  const classOrder = workerCandidateClassOrder();
  const currentClass = classOrder[classIndex];
  if (currentClass && serviceOutcomes < allocation[currentClass]
    && nextCandidateIndex < prepared.queues[currentClass].length) return true;
  return classOrder.slice(classIndex + 1).some((candidateClass) => (
    allocation[candidateClass] > 0 && prepared.queues[candidateClass].length > 0
  ));
}

function stopsLaterAdmission(
  shouldStop: boolean,
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  classIndex: number,
  nextCandidateIndex: number,
  serviceOutcomes: number,
): boolean {
  return shouldStop && hasRemainingAdmission(
    prepared, allocation, classIndex, nextCandidateIndex, serviceOutcomes,
  );
}

function stoppedCandidateProcessing(): CandidateProcessingResult {
  return Object.freeze({ ok: true, stopped: true });
}

function completedCandidateProcessing(): CandidateProcessingResult {
  return Object.freeze({ ok: true, stopped: false });
}

function stoppedCandidateStep(serviceOutcome: boolean): CandidateStepResult {
  return Object.freeze({ ok: true, stopped: true, serviceOutcome });
}

function completedCandidateStep(serviceOutcome: boolean): CandidateStepResult {
  return Object.freeze({ ok: true, stopped: false, serviceOutcome });
}

function markSelected(
  counters: MutableCounters,
  candidateClass: RefundExecutionWorkerCandidateClass,
): void {
  counters.selectedCount += 1;
  if (candidateClass === "CONTACTED") counters.contactedSelected += 1;
  if (candidateClass === "UNCONTACTED") counters.uncontactedSelected += 1;
  if (candidateClass === "READY") counters.readySelected += 1;
}

function incrementOutcome(
  counters: MutableCounters,
  kind: Exclude<RefundExecutionWorkerOutcomeKind, "CONFIG_INVALID" | "FAILED">,
): void {
  const counterByOutcome = {
    SUCCEEDED: "succeededCount",
    REPLAYED: "replayedCount",
    TEMPORARY: "temporaryCount",
    MANUAL: "manualCount",
    CONFLICT: "conflictCount",
    INCONSISTENT: "inconsistentCount",
    SKIPPED: "skippedCount",
  } as const satisfies Readonly<Record<
    Exclude<RefundExecutionWorkerOutcomeKind, "CONFIG_INVALID" | "FAILED">,
    keyof MutableCounters
  >>;
  counters[counterByOutcome[kind]] += 1;
}

export type {
  RefundExecutionWorkerCycleCounters,
  RefundExecutionWorkerCycleResult,
  RunRefundExecutionWorkerCycleInput,
} from "./worker-contract";
export type { RefundExecutionWorkerDependencies } from "./worker-router";
