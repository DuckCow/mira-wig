type ActivationEnv = Readonly<Record<string, string | undefined>>;

export const REFUND_EXECUTION_CLAIM_ENABLED = "REFUND_EXECUTION_CLAIM_ENABLED";

export class RefundExecutionActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid refund execution activation configuration for ${key}.`);
    this.name = "RefundExecutionActivationConfigError";
  }
}

export function isRefundExecutionClaimEnabled(
  env: ActivationEnv = process.env,
): boolean {
  const value = env[REFUND_EXECUTION_CLAIM_ENABLED]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new RefundExecutionActivationConfigError(REFUND_EXECUTION_CLAIM_ENABLED);
}
