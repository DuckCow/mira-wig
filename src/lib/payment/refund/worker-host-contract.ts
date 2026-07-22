import { types as nodeTypes } from "node:util";
import {
  normalizeRefundExecutionWorkerCycleInput,
  type RefundExecutionWorkerCycleCounters,
} from "./worker-contract";
import type { RefundExecutionWorkerDrainReason } from "./worker-host-lifecycle";
import type { RefundExecutionWorkerHealthBacklog } from "./worker-health";
import type { RefundExecutionWorkerRouteReadiness } from "./worker-route-readiness";

const HOST_LABEL = /^[A-Za-z0-9._-]{1,64}$/;
const RUN_ONCE_ARGUMENT_COUNT = 7;

export type RefundExecutionWorkerHostCommand =
  | Readonly<{ kind: "CHECK" }>
  | Readonly<{ kind: "HEALTH" }>
  | Readonly<{ kind: "RUN_ONCE"; workerOwner: string }>;

export type RefundExecutionWorkerCredentialStatus = "ABSENT" | "CONFIGURED";

export type RefundExecutionWorkerHostFailureCode =
  | "INVALID_HOST_INPUT"
  | "INVALID_WORKER_OWNER"
  | "CONFIG_INVALID"
  | "MIGRATIONS_NOT_READY"
  | "DATABASE_UNAVAILABLE"
  | "SYSTEMIC_FAILURE";

export type RefundExecutionWorkerHostFailure = Readonly<{
  ok: false;
  code: RefundExecutionWorkerHostFailureCode;
}>;

export type RefundExecutionWorkerHostCycleFailure = Readonly<{
  ok: false;
  code: "CONFIG_INVALID" | "SYSTEMIC_FAILURE";
  cycle: RefundExecutionWorkerCycleCounters;
}>;

export type RefundExecutionWorkerHostResult =
  | Readonly<{
    ok: true;
    code: "CHECK_READY";
    readiness: Readonly<{
      workerMasterEnabled: boolean;
      credentialStatus: RefundExecutionWorkerCredentialStatus;
      databaseReachable: true;
      migrationStatus: "READY";
    }>;
  }>
  | Readonly<{ ok: true; code: "FEATURE_DISABLED" }>
  | Readonly<{
    ok: true;
    code: "HEALTH_SNAPSHOT";
    readiness: Readonly<{
      workerMasterEnabled: boolean;
      credentialStatus: RefundExecutionWorkerCredentialStatus;
      databaseReachable: true;
      migrationStatus: "READY";
    }>;
    routes: RefundExecutionWorkerRouteReadiness;
    backlog: RefundExecutionWorkerHealthBacklog;
  }>
  | Readonly<{
    ok: true;
    code: "CYCLE_COMPLETE";
    cycle: RefundExecutionWorkerCycleCounters;
  }>
  | Readonly<{
    ok: true;
    code: "LIFECYCLE_DRAINED";
    reason: RefundExecutionWorkerDrainReason;
    cycle: RefundExecutionWorkerCycleCounters;
  }>
  | RefundExecutionWorkerHostFailure
  | RefundExecutionWorkerHostCycleFailure;

const HOST_EXIT_CODE: Readonly<Record<RefundExecutionWorkerHostResult["code"], number>> =
  Object.freeze({
    CHECK_READY: 0,
    HEALTH_SNAPSHOT: 0,
    FEATURE_DISABLED: 0,
    CYCLE_COMPLETE: 0,
    LIFECYCLE_DRAINED: 75,
    INVALID_HOST_INPUT: 64,
    INVALID_WORKER_OWNER: 64,
    CONFIG_INVALID: 78,
    MIGRATIONS_NOT_READY: 78,
    DATABASE_UNAVAILABLE: 1,
    SYSTEMIC_FAILURE: 1,
  });

export type ParseRefundExecutionWorkerCliResult =
  | Readonly<{ ok: true; command: RefundExecutionWorkerHostCommand }>
  | Readonly<{
    ok: false;
    result: RefundExecutionWorkerHostFailure;
  }>;

export function parseRefundExecutionWorkerCliArgs(
  value: unknown,
): ParseRefundExecutionWorkerCliResult {
  const args = exactStringArray(value);
  if (!args) return parseFailure("INVALID_HOST_INPUT");
  if (args.length === 1 && args[0] === "check") {
    return Object.freeze({ ok: true, command: Object.freeze({ kind: "CHECK" }) });
  }
  if (args.length === 1 && args[0] === "health") {
    return Object.freeze({ ok: true, command: Object.freeze({ kind: "HEALTH" }) });
  }
  if (!isExactRunOnceArgs(args)) return parseFailure("INVALID_HOST_INPUT");
  return runOnceCommand(args[2], args[4], args[6]);
}

export function workerHostExitCode(result: RefundExecutionWorkerHostResult): number {
  return HOST_EXIT_CODE[result.code];
}

export function hostFailure(
  code: RefundExecutionWorkerHostFailureCode,
): RefundExecutionWorkerHostFailure {
  return Object.freeze({ ok: false, code });
}

export function hostCycleFailure(
  code: RefundExecutionWorkerHostCycleFailure["code"],
  cycle: unknown,
): RefundExecutionWorkerHostCycleFailure | RefundExecutionWorkerHostFailure {
  const counters = exactCycleCounters(cycle);
  return counters
    ? Object.freeze({ ok: false, code, cycle: counters })
    : hostFailure("SYSTEMIC_FAILURE");
}

export function featureDisabled(): Extract<
  RefundExecutionWorkerHostResult,
  { code: "FEATURE_DISABLED" }
> {
  return Object.freeze({ ok: true, code: "FEATURE_DISABLED" });
}

export function checkReady(
  workerMasterEnabled: boolean,
  credentialStatus: RefundExecutionWorkerCredentialStatus,
): Extract<RefundExecutionWorkerHostResult, { code: "CHECK_READY" }> {
  return Object.freeze({
    ok: true,
    code: "CHECK_READY",
    readiness: Object.freeze({
      workerMasterEnabled,
      credentialStatus,
      databaseReachable: true,
      migrationStatus: "READY",
    }),
  });
}

export function healthSnapshot(
  workerMasterEnabled: boolean,
  credentialStatus: RefundExecutionWorkerCredentialStatus,
  routes: unknown,
  backlog: unknown,
): Extract<RefundExecutionWorkerHostResult, { code: "HEALTH_SNAPSHOT" }>
  | RefundExecutionWorkerHostFailure {
  const exactRoutes = exactRouteReadiness(routes);
  const exactBacklog = exactHealthBacklog(backlog);
  if (!exactRoutes || !exactBacklog) return hostFailure("SYSTEMIC_FAILURE");
  return Object.freeze({
    ok: true,
    code: "HEALTH_SNAPSHOT",
    readiness: Object.freeze({
      workerMasterEnabled,
      credentialStatus,
      databaseReachable: true,
      migrationStatus: "READY",
    }),
    routes: exactRoutes,
    backlog: exactBacklog,
  });
}

export function cycleComplete(
  cycle: unknown,
): Extract<RefundExecutionWorkerHostResult, { code: "CYCLE_COMPLETE" }>
  | Extract<RefundExecutionWorkerHostResult, { ok: false }> {
  const counters = exactCycleCounters(cycle);
  return counters
    ? Object.freeze({ ok: true, code: "CYCLE_COMPLETE", cycle: counters })
    : hostFailure("SYSTEMIC_FAILURE");
}

export function lifecycleDrained(
  reason: RefundExecutionWorkerDrainReason,
  cycle: unknown,
): Extract<RefundExecutionWorkerHostResult, { code: "LIFECYCLE_DRAINED" }>
  | Extract<RefundExecutionWorkerHostResult, { ok: false }> {
  const counters = exactCycleCounters(cycle);
  if (!counters || reason !== "SIGNAL" && reason !== "BUDGET") {
    return hostFailure("SYSTEMIC_FAILURE");
  }
  return Object.freeze({ ok: true, code: "LIFECYCLE_DRAINED", reason, cycle: counters });
}

function isExactRunOnceArgs(args: readonly string[]): boolean {
  return args.length === RUN_ONCE_ARGUMENT_COUNT
    && args[0] === "run-once"
    && args[1] === "--service"
    && args[3] === "--revision"
    && args[5] === "--slot";
}

function runOnceCommand(
  service: string,
  revision: string,
  slot: string,
): ParseRefundExecutionWorkerCliResult {
  if (![service, revision, slot].every(validHostLabel)) {
    return parseFailure("INVALID_HOST_INPUT");
  }
  const workerOwner = `refund-sbx:${service}:${revision}:${slot}`;
  const normalized = normalizeRefundExecutionWorkerCycleInput({ workerOwner });
  if (!normalized.ok) return parseFailure("INVALID_WORKER_OWNER");
  return Object.freeze({
    ok: true,
    command: Object.freeze({ kind: "RUN_ONCE", workerOwner: normalized.input.workerOwner }),
  });
}

function validHostLabel(label: string): boolean {
  return !label.startsWith("--") && HOST_LABEL.test(label);
}

function exactStringArray(value: unknown): readonly string[] | null {
  if (nodeTypes.isProxy(value) || !Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (!keys.every((key) => key === "length" || isArrayIndex(key, value.length))) return null;
  const args: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const argument = stringDataDescriptor(descriptor);
    if (argument === null) return null;
    args.push(argument);
  }
  return Object.freeze(args);
}

const CYCLE_COUNTER_KEYS = Object.freeze([
  "selectedCount",
  "attemptedCount",
  "succeededCount",
  "replayedCount",
  "temporaryCount",
  "manualCount",
  "conflictCount",
  "inconsistentCount",
  "skippedCount",
  "failedCount",
  "providerLookupCount",
  "providerCancellationCount",
  "readySelected",
  "uncontactedSelected",
  "contactedSelected",
] as const satisfies readonly (keyof RefundExecutionWorkerCycleCounters)[]);

function exactCycleCounters(value: unknown): RefundExecutionWorkerCycleCounters | null {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (!hasExactDataKeys(value, descriptors, CYCLE_COUNTER_KEYS)) return null;
  const counters: Record<string, number> = {};
  for (const key of CYCLE_COUNTER_KEYS) {
    const counter = nonnegativeSafeIntegerDataProperty(descriptors[key]);
    if (counter === null) return null;
    counters[key] = counter;
  }
  return Object.freeze({
    selectedCount: counters.selectedCount,
    attemptedCount: counters.attemptedCount,
    succeededCount: counters.succeededCount,
    replayedCount: counters.replayedCount,
    temporaryCount: counters.temporaryCount,
    manualCount: counters.manualCount,
    conflictCount: counters.conflictCount,
    inconsistentCount: counters.inconsistentCount,
    skippedCount: counters.skippedCount,
    failedCount: counters.failedCount,
    providerLookupCount: counters.providerLookupCount,
    providerCancellationCount: counters.providerCancellationCount,
    readySelected: counters.readySelected,
    uncontactedSelected: counters.uncontactedSelected,
    contactedSelected: counters.contactedSelected,
  });
}

const ROUTE_KEYS = Object.freeze([
  "READY", "UNCONTACTED", "CONTACTED_LOOKUP", "CONTACTED_RECONTACT",
] as const satisfies readonly (keyof RefundExecutionWorkerRouteReadiness)[]);

function exactRouteReadiness(value: unknown): RefundExecutionWorkerRouteReadiness | null {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (!hasExactDataKeys(value, descriptors, ROUTE_KEYS)) return null;
  const routes: Record<string, boolean> = {};
  for (const key of ROUTE_KEYS) {
    const route = booleanDataProperty(descriptors[key]);
    if (route === null) return null;
    routes[key] = route;
  }
  return Object.freeze({
    READY: routes.READY,
    UNCONTACTED: routes.UNCONTACTED,
    CONTACTED_LOOKUP: routes.CONTACTED_LOOKUP,
    CONTACTED_RECONTACT: routes.CONTACTED_RECONTACT,
  });
}

const BACKLOG_KEYS = Object.freeze([
  "READY", "UNCONTACTED", "CONTACTED", "MANUAL_REVIEW",
] as const satisfies readonly (keyof RefundExecutionWorkerHealthBacklog)[]);
const BACKLOG_OBSERVATION_KEYS = Object.freeze(["count", "oldestAgeSeconds"] as const);

function exactHealthBacklog(value: unknown): RefundExecutionWorkerHealthBacklog | null {
  const descriptors = exactDataObjectDescriptors(value, BACKLOG_KEYS);
  if (!descriptors) return null;
  const observations = BACKLOG_KEYS.map((key) => (
    exactBacklogObservation(dataProperty(descriptors[key]))
  ));
  if (observations.some((observation) => observation === null)) return null;
  const [ready, uncontacted, contacted, manual] = observations;
  if (!ready || !uncontacted || !contacted || !manual) return null;
  return Object.freeze({
    READY: ready,
    UNCONTACTED: uncontacted,
    CONTACTED: contacted,
    MANUAL_REVIEW: manual,
  });
}

function exactBacklogObservation(
  value: unknown,
): RefundExecutionWorkerHealthBacklog["READY"] | null {
  const descriptors = exactDataObjectDescriptors(value, BACKLOG_OBSERVATION_KEYS);
  if (!descriptors) return null;
  const count = nonnegativeSafeIntegerDataProperty(descriptors.count);
  const ageValue = dataProperty(descriptors.oldestAgeSeconds);
  const age = ageValue === null ? null : nonnegativeSafeInteger(ageValue);
  if (count === null || age === undefined || (count === 0) !== (age === null)) return null;
  return Object.freeze({ count, oldestAgeSeconds: age });
}

function hasExactDataKeys(
  value: object,
  descriptors: PropertyDescriptorMap,
  expected: readonly string[],
): boolean {
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(descriptors);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function exactDataObjectDescriptors(
  value: unknown,
  expected: readonly string[],
): PropertyDescriptorMap | null {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return hasExactDataKeys(value, descriptors, expected) ? descriptors : null;
}

function dataProperty(descriptor: PropertyDescriptor | undefined): unknown {
  return descriptor?.enumerable === true
    && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function booleanDataProperty(descriptor: PropertyDescriptor | undefined): boolean | null {
  const value = dataProperty(descriptor);
  return typeof value === "boolean" ? value : null;
}

function nonnegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function nonnegativeSafeIntegerDataProperty(
  descriptor: PropertyDescriptor | undefined,
): number | null {
  if (!descriptor || descriptor.enumerable !== true
    || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
  const value: unknown = descriptor.value;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isArrayIndex(key: string | symbol, length: number): boolean {
  return typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length;
}

function stringDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): string | null {
  if (!descriptor || descriptor.enumerable !== true
    || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
  const value: unknown = descriptor.value;
  return typeof value === "string" ? value : null;
}

function parseFailure(
  code: "INVALID_HOST_INPUT" | "INVALID_WORKER_OWNER",
): ParseRefundExecutionWorkerCliResult {
  return Object.freeze({ ok: false, result: hostFailure(code) });
}
