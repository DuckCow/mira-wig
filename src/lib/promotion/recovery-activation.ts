type ActivationEnv = Readonly<Record<string, string | undefined>>;

const ISSUANCE_KEY = "PROMOTION_RECOVERY_ISSUANCE_ENABLED";
const RECONCILIATION_KEY = "PROMOTION_RECOVERY_RECONCILIATION_ENABLED";

export class PromotionRecoveryActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid promotion recovery activation configuration for ${key}.`);
    this.name = "PromotionRecoveryActivationConfigError";
  }
}

export function isPromotionRecoveryIssuanceEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, ISSUANCE_KEY);
}

export function isPromotionRecoveryReconciliationEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, RECONCILIATION_KEY);
}

function parseActivation(env: ActivationEnv, key: string): boolean {
  const value = env[key]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new PromotionRecoveryActivationConfigError(key);
}
