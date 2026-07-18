import {
  parseTossRefundCredentialConfig,
  TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  TOSS_REFUND_SANDBOX_MERCHANT_BINDING,
  TOSS_REFUND_SANDBOX_SECRET_KEY,
  type ConfiguredTossRefundCredential,
} from "../../src/lib/payment/refund/providers/toss/refund-credential-config";

const TEST_SECRET = /^(?:test_sk|test_gsk)_[A-Za-z0-9_-]+$/;
const LIVE_SECRET = /^(?:live_sk|live_gsk)_/;

export function requireSandboxCredential(
  env: Readonly<Record<string, string | undefined>>,
  expected: Readonly<{ merchant: string; generation: string }>,
): ConfiguredTossRefundCredential {
  const state = parseTossRefundCredentialConfig({
    secretKey: env[TOSS_REFUND_SANDBOX_SECRET_KEY],
    merchantAccountBinding: env[TOSS_REFUND_SANDBOX_MERCHANT_BINDING],
    credentialGenerationBinding: env[TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING],
  });
  if (state.status !== "CONFIGURED") throw new Error("SANDBOX_CREDENTIAL_INVALID");
  if (state.configuration.merchantAccountBinding !== expected.merchant
    || state.configuration.credentialGenerationBinding !== expected.generation) {
    throw new Error("SANDBOX_CREDENTIAL_BINDING_MISMATCH");
  }
  const secret = state.configuration.readSecretKey();
  if (LIVE_SECRET.test(secret) || !TEST_SECRET.test(secret)) throw new Error("SANDBOX_CREDENTIAL_SHAPE_INVALID");
  return state.configuration;
}
