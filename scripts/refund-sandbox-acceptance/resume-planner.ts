import type { H1LedgerPhase } from "./run-ledger";

export type ResumeAction =
  | "RESUME_SETUP"
  | "GET_ONLY"
  | "REPORT_ONLY"
  | "HUMAN_POST_DECISION_REQUIRED"
  | "STOP_REVIEW_REQUIRED";

export function planResume(
  phase: H1LedgerPhase,
  lookupStillEligible = false,
): ResumeAction {
  const staticActions: Partial<Record<H1LedgerPhase, ResumeAction>> = {
    PLANNED: "RESUME_SETUP",
    BOOTSTRAPPED: "RESUME_SETUP",
    POST_RESPONSE_RECORDED: "GET_ONLY",
    LOCAL_COMMIT_COMPLETE: "REPORT_ONLY",
    SEALED: "REPORT_ONLY",
    DB_CLEANED: "REPORT_ONLY",
    HUMAN_POST_DECISION_REQUIRED: "HUMAN_POST_DECISION_REQUIRED",
    REVIEW_REQUIRED: "STOP_REVIEW_REQUIRED",
  };
  if (phase === "POST_INTENT_RECORDED") return lookupStillEligible
    ? "HUMAN_POST_DECISION_REQUIRED" : "GET_ONLY";
  return staticActions[phase] ?? "STOP_REVIEW_REQUIRED";
}
