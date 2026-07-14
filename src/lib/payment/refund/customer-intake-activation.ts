type ActivationEnv = Readonly<Record<string, string | undefined>>;

const SUBMIT_KEY = "CUSTOMER_REFUND_INTAKE_SUBMIT_ENABLED";
const APPROVE_KEY = "CUSTOMER_REFUND_INTAKE_APPROVE_ENABLED";

export class CustomerRefundIntakeActivationConfigError extends Error {
  constructor(key: string) {
    super(`Invalid customer refund intake activation configuration for ${key}.`);
    this.name = "CustomerRefundIntakeActivationConfigError";
  }
}

export function isCustomerRefundIntakeSubmitEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, SUBMIT_KEY);
}

export function isCustomerRefundIntakeApproveEnabled(
  env: ActivationEnv = process.env,
): boolean {
  return parseActivation(env, APPROVE_KEY);
}

function parseActivation(env: ActivationEnv, key: string): boolean {
  const value = env[key]?.trim();
  if (!value) return false;
  if (value === "ENABLED") return true;
  throw new CustomerRefundIntakeActivationConfigError(key);
}
