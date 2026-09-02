import { EXIMBAY_SANDBOX_API_KEY, EXIMBAY_SANDBOX_MID } from "@/lib/payment/providers/credentials";
import { exactEximbayRefundCanarySecretName } from "./eximbay-refund-canary-secret-contract";

export const EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID =
  "4c5c9b039f18037c6f3356c903df1372";
export const EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID =
  "cmtk62h80000001s626b90f9y";
export const EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_RUN_ID =
  "89682c544f42d4debb260f5e3186087a";
export const EXIMBAY_CONTACTED_RECONCILIATION_PREDECESSOR_CHECKOUT_SESSION_ID =
  "cmtjsiiqw000001s6uimkjhj5";
export const EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_RUN_ID =
  "a764f61f4e4ba799ab16b318a676db65";
export const EXIMBAY_CONTACTED_RECONCILIATION_ORIGINAL_HISTORICAL_CHECKOUT_SESSION_ID =
  "cmthg2mzu000001s6iuvx7u5x";
export const EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV =
  "MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID";
export const EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV =
  "MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID";

const SECRET_RESOURCE_ENV = "MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE";
const SECRET_VERSION_ENV = "MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION";
const RECOVERY_ACTIVATION_ENV = "EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED";
const CLOUD_RUN_LABEL = /^[A-Za-z0-9._-]{1,64}$/u;

export type EximbayContactedReconciliationEnvironment = Readonly<{
  runId: typeof EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID;
  checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
  secretResource: string;
  secretVersion: string;
  mid: string;
}>;

export function parseEximbayContactedReconciliationEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): EximbayContactedReconciliationEnvironment | null {
  const runId = exactValue(env, EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID_ENV);
  const checkoutSessionId = exactValue(
    env,
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID_ENV,
  );
  const secretResource = exactValue(env, SECRET_RESOURCE_ENV);
  const secretVersion = exactValue(env, SECRET_VERSION_ENV);
  const mid = exactValue(env, EXIMBAY_SANDBOX_MID);
  if (runId !== EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID
    || checkoutSessionId !== EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID
    || env[RECOVERY_ACTIVATION_ENV] !== "ENABLED"
    || !exactCloudRunIdentity(env)
    || !providerConfigurationIsValid(env, secretResource, secretVersion, mid)) {
    return null;
  }
  return Object.freeze({
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    secretResource,
    secretVersion,
    mid,
  });
}

function providerConfigurationIsValid(
  env: Readonly<Record<string, string | undefined>>,
  secretResource: string,
  secretVersion: string,
  mid: string,
): boolean {
  const secretName = exactEximbayRefundCanarySecretName({
    resource: secretResource,
    version: secretVersion,
  });
  if (secretName === null || mid.length < 1 || mid.length > 512) return false;
  return providerSecretSurfaceIsClosed(env);
}

function providerSecretSurfaceIsClosed(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const directSandbox = env[EXIMBAY_SANDBOX_API_KEY]?.trim();
  const directLive = env.EXIMBAY_LIVE_API_KEY?.trim();
  const liveMid = env.EXIMBAY_LIVE_MID?.trim();
  return !directSandbox && !directLive && !liveMid;
}

function exactCloudRunIdentity(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.CLOUD_RUN_TASK_COUNT === "1"
    && env.CLOUD_RUN_TASK_INDEX === "0"
    && env.CLOUD_RUN_TASK_ATTEMPT === "0"
    && CLOUD_RUN_LABEL.test(exactValue(env, "CLOUD_RUN_JOB"))
    && CLOUD_RUN_LABEL.test(exactValue(env, "CLOUD_RUN_EXECUTION"));
}

function exactValue(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = env[key];
  return typeof value === "string" ? value : "";
}
