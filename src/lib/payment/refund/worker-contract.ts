const WORKER_OWNER_MAX_CODE_POINTS = 255;

export type RunRefundExecutionWorkerCycleInput = Readonly<{
  workerOwner: string;
}>;

export type RefundExecutionWorkerCycleControl = Readonly<{
  shouldStop(): boolean;
}>;

export type NormalizedRunRefundExecutionWorkerCycleInput =
  RunRefundExecutionWorkerCycleInput;

export type RefundExecutionWorkerCycleCounters = Readonly<{
  selectedCount: number;
  attemptedCount: number;
  succeededCount: number;
  replayedCount: number;
  temporaryCount: number;
  manualCount: number;
  conflictCount: number;
  inconsistentCount: number;
  skippedCount: number;
  failedCount: number;
  readySelected: number;
  uncontactedSelected: number;
  contactedSelected: number;
}>;

export type RefundExecutionWorkerCycleFailureCode =
  | "FEATURE_DISABLED"
  | "INVALID_WORKER_OWNER"
  | "CONFIG_INVALID"
  | "SYSTEMIC_FAILURE";

export type RefundExecutionWorkerCycleFailure = Readonly<{
  ok: false;
  code: RefundExecutionWorkerCycleFailureCode;
  message: string;
}>;

export type RefundExecutionWorkerCycleSuccess = Readonly<{
  ok: true;
  cycle: RefundExecutionWorkerCycleCounters;
}>;

export type RefundExecutionWorkerCycleStopped = Readonly<{
  ok: true;
  stopped: true;
  cycle: RefundExecutionWorkerCycleCounters;
}>;

export type RefundExecutionWorkerCycleResult =
  | RefundExecutionWorkerCycleSuccess
  | RefundExecutionWorkerCycleStopped
  | RefundExecutionWorkerCycleFailure;

export type NormalizeRefundExecutionWorkerCycleInputResult =
  | Readonly<{
    ok: true;
    input: NormalizedRunRefundExecutionWorkerCycleInput;
  }>
  | RefundExecutionWorkerCycleFailure;

const FAILURE_MESSAGES: Readonly<Record<RefundExecutionWorkerCycleFailureCode, string>> =
  Object.freeze({
    FEATURE_DISABLED: "Refund execution worker is disabled.",
    INVALID_WORKER_OWNER: "Worker owner is invalid.",
    CONFIG_INVALID: "Refund execution worker configuration is invalid.",
    SYSTEMIC_FAILURE: "Refund execution worker cycle failed systemically.",
  });

export const EMPTY_REFUND_EXECUTION_WORKER_CYCLE_COUNTERS: RefundExecutionWorkerCycleCounters =
  Object.freeze({
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
  });

const NEVER_STOPPING_CYCLE_CONTROL: RefundExecutionWorkerCycleControl = Object.freeze({
  shouldStop: () => false,
});

export function neverStoppingRefundExecutionWorkerCycleControl(): RefundExecutionWorkerCycleControl {
  return NEVER_STOPPING_CYCLE_CONTROL;
}

export function normalizeRefundExecutionWorkerCycleInput(
  value: unknown,
): NormalizeRefundExecutionWorkerCycleInputResult {
  if (!hasExactDataFields(value)) return workerFailure("INVALID_WORKER_OWNER");
  const workerOwner = normalizeWorkerOwner(value.workerOwner);
  return workerOwner
    ? Object.freeze({ ok: true, input: Object.freeze({ workerOwner }) })
    : workerFailure("INVALID_WORKER_OWNER");
}

export function workerCycleSuccess(
  counters: RefundExecutionWorkerCycleCounters,
): RefundExecutionWorkerCycleSuccess {
  return Object.freeze({ ok: true, cycle: Object.freeze({ ...counters }) });
}

export function workerCycleStopped(
  counters: RefundExecutionWorkerCycleCounters,
): RefundExecutionWorkerCycleStopped {
  return Object.freeze({ ok: true, stopped: true, cycle: Object.freeze({ ...counters }) });
}

export function workerFailure(
  code: RefundExecutionWorkerCycleFailureCode,
): RefundExecutionWorkerCycleFailure {
  return Object.freeze({ ok: false, code, message: FAILURE_MESSAGES[code] });
}

function hasExactDataFields(
  value: unknown,
): value is Record<"workerOwner", unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "workerOwner") return false;
  const descriptor = Reflect.getOwnPropertyDescriptor(value, "workerOwner");
  return isEnumerableDataDescriptor(descriptor);
}

function isEnumerableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): boolean {
  if (!descriptor) return false;
  return descriptor.enumerable === true
    && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function normalizeWorkerOwner(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return Boolean(normalized)
    && Array.from(normalized).length <= WORKER_OWNER_MAX_CODE_POINTS
    && !/\p{Cc}/u.test(normalized)
    ? normalized
    : null;
}
