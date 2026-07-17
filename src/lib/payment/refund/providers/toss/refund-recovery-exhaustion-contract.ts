export type TossRecoveryExhaustionCause = "DEADLINE" | "ORDINAL_LIMIT";

export const TOSS_RECOVERY_EXHAUSTION = Object.freeze({
  DEADLINE: Object.freeze({
    code: "TOSS_RECOVERY_DEADLINE_EXHAUSTED",
    message: "Toss refund recovery deadline was exhausted.",
    reason: "Toss refund recovery deadline requires manual review.",
    resultCode: "RECOVERY_DEADLINE_EXPIRED" as const,
  }),
  ORDINAL_LIMIT: Object.freeze({
    code: "TOSS_RECOVERY_ORDINAL_LIMIT_EXHAUSTED",
    message: "Toss refund recovery contact limit was exhausted.",
    reason: "Toss refund recovery contact limit requires manual review.",
    resultCode: "RECOVERY_ORDINAL_LIMIT_REACHED" as const,
  }),
});

export function buildTossRecoveryExhaustionOperationKey(
  commandId: string,
  recoveryGeneration: number,
): string {
  return `refund-recovery-exhaustion:${commandId}:${recoveryGeneration}`;
}
