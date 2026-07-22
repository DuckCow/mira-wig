export type RefundDeploymentExitAction =
  | "NEXT_CADENCE"
  | "DISABLED_NO_PROCESSING"
  | "DRAINED_DO_NOT_OVERLAP"
  | "SUSPEND_INVOCATION_DEFECT"
  | "SUSPEND_READINESS_DEFECT"
  | "BACKOFF_SYSTEMIC"
  | "STOP_AND_RECONCILE_POSSIBLE_CONTACT"
  | "STOP_AND_INVESTIGATE";

export type RefundDeploymentExitObservation =
  | Readonly<{
    kind: "RESULT";
    code: string;
    exitCode: number;
    reason?: string;
  }>
  | Readonly<{ kind: "EXTERNAL_TIMEOUT" }>
  | Readonly<{ kind: "SIGNAL_OR_INVALID_OUTPUT" }>;

const RESULT_ACTIONS: Readonly<Record<string, Readonly<{ exitCode: number; action: RefundDeploymentExitAction }>>> =
  Object.freeze({
    CYCLE_COMPLETE: Object.freeze({ exitCode: 0, action: "NEXT_CADENCE" }),
    FEATURE_DISABLED: Object.freeze({ exitCode: 0, action: "DISABLED_NO_PROCESSING" }),
    LIFECYCLE_DRAINED: Object.freeze({ exitCode: 75, action: "DRAINED_DO_NOT_OVERLAP" }),
    INVALID_HOST_INPUT: Object.freeze({ exitCode: 64, action: "SUSPEND_INVOCATION_DEFECT" }),
    INVALID_WORKER_OWNER: Object.freeze({ exitCode: 64, action: "SUSPEND_INVOCATION_DEFECT" }),
    CONFIG_INVALID: Object.freeze({ exitCode: 78, action: "SUSPEND_READINESS_DEFECT" }),
    MIGRATIONS_NOT_READY: Object.freeze({ exitCode: 78, action: "SUSPEND_READINESS_DEFECT" }),
    DATABASE_UNAVAILABLE: Object.freeze({ exitCode: 1, action: "BACKOFF_SYSTEMIC" }),
    SYSTEMIC_FAILURE: Object.freeze({ exitCode: 1, action: "BACKOFF_SYSTEMIC" }),
  });

const BACKOFF_MINUTES = Object.freeze([1, 2, 4, 8, 15] as const);

export function classifyRefundDeploymentExit(
  observation: RefundDeploymentExitObservation,
): RefundDeploymentExitAction | null {
  if (observation.kind === "EXTERNAL_TIMEOUT") return "STOP_AND_RECONCILE_POSSIBLE_CONTACT";
  if (observation.kind === "SIGNAL_OR_INVALID_OUTPUT") return "STOP_AND_INVESTIGATE";
  return classifyResultObservation(observation);
}

function classifyResultObservation(
  observation: Extract<RefundDeploymentExitObservation, { kind: "RESULT" }>,
): RefundDeploymentExitAction | null {
  const policy = RESULT_ACTIONS[observation.code];
  if (!policy || policy.exitCode !== observation.exitCode) return null;
  if (observation.code === "LIFECYCLE_DRAINED"
    && observation.reason !== "SIGNAL" && observation.reason !== "BUDGET") return null;
  if (observation.code !== "LIFECYCLE_DRAINED" && observation.reason !== undefined) return null;
  return policy.action;
}

export type RefundDeploymentBackoffDecision =
  | Readonly<{ kind: "RESET"; failureCount: 0 }>
  | Readonly<{ kind: "BACKOFF"; failureCount: number; minutes: number; externalJitterRequired: true }>
  | Readonly<{ kind: "SUSPEND" }>
  | Readonly<{ kind: "RECONCILE" }>
  | Readonly<{ kind: "NO_PROCESSING_SUCCESS" }>
  | Readonly<{ kind: "DRAINED" }>
  | Readonly<{ kind: "INVESTIGATE" }>;

const STATIC_BACKOFF_DECISIONS: Readonly<Partial<Record<
RefundDeploymentExitAction,
RefundDeploymentBackoffDecision
>>> = Object.freeze({
  DISABLED_NO_PROCESSING: Object.freeze({ kind: "NO_PROCESSING_SUCCESS" }),
  DRAINED_DO_NOT_OVERLAP: Object.freeze({ kind: "DRAINED" }),
  SUSPEND_INVOCATION_DEFECT: Object.freeze({ kind: "SUSPEND" }),
  SUSPEND_READINESS_DEFECT: Object.freeze({ kind: "SUSPEND" }),
  STOP_AND_RECONCILE_POSSIBLE_CONTACT: Object.freeze({ kind: "RECONCILE" }),
  STOP_AND_INVESTIGATE: Object.freeze({ kind: "INVESTIGATE" }),
});

export function refundDeploymentBackoffDecision(
  action: RefundDeploymentExitAction,
  consecutiveSystemicFailures: number,
): RefundDeploymentBackoffDecision | null {
  if (!Number.isSafeInteger(consecutiveSystemicFailures) || consecutiveSystemicFailures < 0) return null;
  if (action === "NEXT_CADENCE") return Object.freeze({ kind: "RESET", failureCount: 0 });
  if (action === "BACKOFF_SYSTEMIC") return systemicBackoff(consecutiveSystemicFailures);
  return STATIC_BACKOFF_DECISIONS[action] ?? null;
}

function systemicBackoff(consecutiveSystemicFailures: number): RefundDeploymentBackoffDecision {
  const failureCount = Math.min(consecutiveSystemicFailures + 1, Number.MAX_SAFE_INTEGER);
  const index = Math.min(consecutiveSystemicFailures, BACKOFF_MINUTES.length - 1);
  return Object.freeze({
    kind: "BACKOFF",
    failureCount,
    minutes: BACKOFF_MINUTES[index],
    externalJitterRequired: true,
  });
}

export type RefundDeploymentOverlapState = "ACQUIRED" | "BUSY";
export type RefundDeploymentOverlapResult<T> =
  | Readonly<{ code: "OVERLAP_ACQUIRED"; result: T }>
  | Readonly<{ code: "OVERLAP_SKIPPED" }>
  | Readonly<{ code: "INVALID_ADMISSION_STATE" }>;

export async function simulateRefundDeploymentOverlap<T>(
  state: unknown,
  invoke: () => Promise<T>,
): Promise<RefundDeploymentOverlapResult<T>> {
  if (state === "BUSY") return Object.freeze({ code: "OVERLAP_SKIPPED" });
  if (state === "ACQUIRED") {
    return Object.freeze({ code: "OVERLAP_ACQUIRED", result: await invoke() });
  }
  return Object.freeze({ code: "INVALID_ADMISSION_STATE" });
}
