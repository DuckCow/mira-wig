import { PaymentMode } from "@prisma/client";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
} from "@/lib/payment/providers/credentials";
import {
  createEximbayRefundPreflightConfig,
  type EximbayRefundPreflightConfigInput,
} from "./preflight-contract";
import {
  createEximbayRefundRestCredentials,
  type EximbayRefundRestCredentials,
} from "./authenticated-transport";

type ConfigEnv = Readonly<Record<string, string | undefined>>;

export const EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING =
  "EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING";
export const EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING =
  "EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING";

export type EximbayRefundWorkerConfigState =
  | Readonly<{ status: "ABSENT" }>
  | Readonly<{ status: "CONFIG_INVALID" }>
  | Readonly<{
      status: "CONFIGURED";
      config: EximbayRefundPreflightConfigInput;
      credentials: EximbayRefundRestCredentials;
    }>;

export function parseEximbayRefundWorkerConfig(
  env: ConfigEnv,
): EximbayRefundWorkerConfigState {
  const values = readConfigValues(env);
  if (Object.values(values.presence).every((present) => !present)) {
    return Object.freeze({ status: "ABSENT" });
  }
  if (Object.values(values.presence).some((present) => !present)) {
    return Object.freeze({ status: "CONFIG_INVALID" });
  }
  try {
    const config = createEximbayRefundPreflightConfig({
      mode: PaymentMode.SANDBOX,
      ...values.nonSecret,
    });
    const credentials = createEximbayRefundRestCredentials(values.apiKey);
    return Object.freeze({ status: "CONFIGURED", config, credentials });
  } catch {
    return Object.freeze({ status: "CONFIG_INVALID" });
  }
}

function readConfigValues(env: ConfigEnv) {
  const apiKey = env[EXIMBAY_SANDBOX_API_KEY] ?? "";
  const mid = trimmed(env[EXIMBAY_SANDBOX_MID]);
  const merchantAccountBindingId = trimmed(
    env[EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING],
  );
  const credentialGenerationBindingId = trimmed(
    env[EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  );
  return Object.freeze({
    apiKey,
    presence: Object.freeze({
      apiKey: apiKey.trim().length > 0,
      mid: mid.length > 0,
      merchantAccountBindingId: merchantAccountBindingId.length > 0,
      credentialGenerationBindingId: credentialGenerationBindingId.length > 0,
    }),
    nonSecret: Object.freeze({ mid, merchantAccountBindingId, credentialGenerationBindingId }),
  });
}

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
