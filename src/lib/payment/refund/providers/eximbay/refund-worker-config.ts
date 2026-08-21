import { PaymentMode } from "@prisma/client";
import { EXIMBAY_SANDBOX_MID } from "@/lib/payment/providers/credentials";
import {
  createEximbayRefundPreflightConfig,
  type EximbayRefundPreflightConfigInput,
} from "./preflight-contract";

type ConfigEnv = Readonly<Record<string, string | undefined>>;

export const EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING =
  "EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING";
export const EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING =
  "EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING";

export type EximbayRefundWorkerConfigState =
  | Readonly<{ status: "ABSENT" }>
  | Readonly<{ status: "CONFIG_INVALID" }>
  | Readonly<{ status: "CONFIGURED"; config: EximbayRefundPreflightConfigInput }>;

export function parseEximbayRefundWorkerConfig(
  env: ConfigEnv,
): EximbayRefundWorkerConfigState {
  const values = readConfigValues(env);
  if (Object.values(values).every((value) => value.length === 0)) {
    return Object.freeze({ status: "ABSENT" });
  }
  if (Object.values(values).some((value) => value.length === 0)) {
    return Object.freeze({ status: "CONFIG_INVALID" });
  }
  try {
    const config = createEximbayRefundPreflightConfig({
      mode: PaymentMode.SANDBOX,
      ...values,
    });
    return Object.freeze({ status: "CONFIGURED", config });
  } catch {
    return Object.freeze({ status: "CONFIG_INVALID" });
  }
}

function readConfigValues(env: ConfigEnv) {
  return Object.freeze({
    mid: trimmed(env[EXIMBAY_SANDBOX_MID]),
    merchantAccountBindingId: trimmed(
      env[EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING],
    ),
    credentialGenerationBindingId: trimmed(
      env[EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
    ),
  });
}

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
