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
  normalizeRefundExecutionWorkerCycleInput,
  workerCycleSuccess,
  workerFailure,
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

export async function runRefundExecutionWorkerCycle(
  client: PrismaClient,
  input: RunRefundExecutionWorkerCycleInput,
  dependencies: RefundExecutionWorkerDependencies,
  env: ActivationEnv = process.env,
): Promise<RefundExecutionWorkerCycleResult> {
  const normalized = normalizeRefundExecutionWorkerCycleInput(input);
  if (!normalized.ok) return normalized;
  const gate = workerGateResult(env);
  if (gate !== true) return gate;
  const prepared = await prepareWorkerCycle(client, env);
  if (!prepared.ok) return prepared;
  const allocation = reserveRefundExecutionWorkerCapacity(prepared.queues);
  const route = createRefundExecutionWorkerRouter(dependencies);
  const counters = emptyCounters();
  const processed = await processCandidateQueues(
    client, prepared, allocation, route, normalized.input.workerOwner, env, counters,
  );
  return processed.ok ? workerCycleSuccess(counters) : processed;
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
): Promise<Readonly<{ ok: true }> | RefundExecutionWorkerCycleFailure> {
  for (const candidateClass of workerCandidateClassOrder()) {
    const result = await processCandidateClass(
      client, prepared, allocation, route, candidateClass, workerOwner, env, counters,
    );
    if (!result.ok) return result;
  }
  return Object.freeze({ ok: true });
}

async function processCandidateClass(
  client: PrismaClient,
  prepared: Extract<PreparedCycle, { ok: true }>,
  allocation: Readonly<Record<RefundExecutionWorkerCandidateClass, number>>,
  route: ReturnType<typeof createRefundExecutionWorkerRouter>,
  candidateClass: RefundExecutionWorkerCandidateClass,
  workerOwner: string,
  env: ActivationEnv,
  counters: MutableCounters,
): Promise<Readonly<{ ok: true }> | RefundExecutionWorkerCycleFailure> {
  let serviceOutcomes = 0;
  for (const candidate of prepared.queues[candidateClass]) {
    if (serviceOutcomes >= allocation[candidateClass]) break;
    markSelected(counters, candidateClass);
    if (!prepared.readiness[candidateClass]) {
      counters.skippedCount += 1;
      serviceOutcomes += 1;
      continue;
    }
    const result = await routeOneCandidate(client, candidate, route, workerOwner, env, counters);
    if (!result.ok) return result;
    if (!result.selectorRaceLoss) serviceOutcomes += 1;
  }
  return Object.freeze({ ok: true });
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
      return workerFailure(outcome.kind === "CONFIG_INVALID"
        ? "CONFIG_INVALID"
        : "SYSTEMIC_FAILURE");
    }
    incrementOutcome(counters, completedOutcomeKind(outcome.kind));
    return Object.freeze({ ok: true, selectorRaceLoss: isSelectorRaceLoss(outcome) });
  } catch {
    return workerFailure("SYSTEMIC_FAILURE");
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
  return {
    selectedCount: 0,
    attemptedCount: 0,
    succeededCount: 0,
    replayedCount: 0,
    temporaryCount: 0,
    manualCount: 0,
    conflictCount: 0,
    inconsistentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    readySelected: 0,
    uncontactedSelected: 0,
    contactedSelected: 0,
  };
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
