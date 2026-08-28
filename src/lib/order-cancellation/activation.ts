type ActivationEnv = Readonly<Record<string, string | undefined>>;

export const CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED =
  "CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED";
export const MTO_PRODUCTION_START_ENABLED = "MTO_PRODUCTION_START_ENABLED";

export class OrderCancellationActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid order cancellation activation configuration for ${key}.`);
    this.name = "OrderCancellationActivationConfigError";
  }
}

export function isCustomerMtoOrderCancellationEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED);
}

export function isMtoProductionStartEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, MTO_PRODUCTION_START_ENABLED);
}

function parseActivation(env: ActivationEnv, key: string): boolean {
  const value = env[key]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new OrderCancellationActivationConfigError(key);
}
