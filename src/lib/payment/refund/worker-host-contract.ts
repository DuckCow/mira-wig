import { types as nodeTypes } from "node:util";
import {
  normalizeRefundExecutionWorkerCycleInput,
  type RefundExecutionWorkerCycleCounters,
} from "./worker-contract";

const HOST_LABEL = /^[A-Za-z0-9._-]{1,64}$/;
const RUN_ONCE_ARGUMENT_COUNT = 7;

export type RefundExecutionWorkerHostCommand =
  | Readonly<{ kind: "CHECK" }>
  | Readonly<{ kind: "RUN_ONCE"; workerOwner: string }>;

export type RefundExecutionWorkerCredentialStatus = "ABSENT" | "CONFIGURED";

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
    code: "CYCLE_COMPLETE";
    cycle: RefundExecutionWorkerCycleCounters;
  }>
  | Readonly<{
    ok: false;
    code: "INVALID_HOST_INPUT" | "INVALID_WORKER_OWNER" | "CONFIG_INVALID"
      | "MIGRATIONS_NOT_READY" | "DATABASE_UNAVAILABLE" | "SYSTEMIC_FAILURE";
  }>;

export type ParseRefundExecutionWorkerCliResult =
  | Readonly<{ ok: true; command: RefundExecutionWorkerHostCommand }>
  | Readonly<{
    ok: false;
    result: Extract<RefundExecutionWorkerHostResult, { ok: false }>;
  }>;

export function parseRefundExecutionWorkerCliArgs(
  value: unknown,
): ParseRefundExecutionWorkerCliResult {
  const args = exactStringArray(value);
  if (!args) return parseFailure("INVALID_HOST_INPUT");
  if (args.length === 1 && args[0] === "check") {
    return Object.freeze({ ok: true, command: Object.freeze({ kind: "CHECK" }) });
  }
  if (!isExactRunOnceArgs(args)) return parseFailure("INVALID_HOST_INPUT");
  return runOnceCommand(args[2], args[4], args[6]);
}

export function workerHostExitCode(result: RefundExecutionWorkerHostResult): number {
  if (result.code === "CHECK_READY" || result.code === "FEATURE_DISABLED"
    || result.code === "CYCLE_COMPLETE") return 0;
  if (result.code === "INVALID_HOST_INPUT" || result.code === "INVALID_WORKER_OWNER") return 64;
  if (result.code === "CONFIG_INVALID" || result.code === "MIGRATIONS_NOT_READY") return 78;
  return 1;
}

export function hostFailure(
  code: Extract<RefundExecutionWorkerHostResult, { ok: false }>['code'],
): Extract<RefundExecutionWorkerHostResult, { ok: false }> {
  return Object.freeze({ ok: false, code });
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

export function cycleComplete(
  cycle: unknown,
): Extract<RefundExecutionWorkerHostResult, { code: "CYCLE_COMPLETE" }>
  | Extract<RefundExecutionWorkerHostResult, { ok: false }> {
  const counters = exactCycleCounters(cycle);
  return counters
    ? Object.freeze({ ok: true, code: "CYCLE_COMPLETE", cycle: counters })
    : hostFailure("SYSTEMIC_FAILURE");
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
  "readySelected",
  "uncontactedSelected",
  "contactedSelected",
] as const satisfies readonly (keyof RefundExecutionWorkerCycleCounters)[]);

function exactCycleCounters(value: unknown): RefundExecutionWorkerCycleCounters | null {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
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
    readySelected: counters.readySelected,
    uncontactedSelected: counters.uncontactedSelected,
    contactedSelected: counters.contactedSelected,
  });
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
