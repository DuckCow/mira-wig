import { createHash } from "node:crypto";
import { EXIMBAY_SANDBOX_API_KEY, EXIMBAY_SANDBOX_MID } from "@/lib/payment/providers/credentials";
import { REFUND_EXECUTION_ACTIVATION_KEYS } from "./execution-activation";
import {
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING,
} from "./providers/eximbay/refund-worker-config";
import { exactEximbayRefundCanarySecretName } from "./eximbay-refund-canary-secret-contract";

export const EXIMBAY_REFUND_CANARY_LANE = "EXIMBAY_SANDBOX_V1";
export const EXIMBAY_REFUND_CANARY_ENV_PREFIX = "MIRA_REFUND_EXIMBAY_CANARY_";

const DIGEST = /^[0-9a-f]{64}$/u;
const LABEL = /^[A-Za-z0-9._-]{1,64}$/u;
const REQUIRED_ENABLED = Object.freeze([
  "REFUND_EXECUTION_WORKER_ENABLED",
  "REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED",
  "REFUND_EXECUTION_LEASE_ENABLED",
  "REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED",
  "REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED",
  "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED",
] satisfies readonly string[]);
const REQUIRED_ABSENT = Object.freeze(
  REFUND_EXECUTION_ACTIVATION_KEYS.filter((key) => !REQUIRED_ENABLED.includes(key)),
);

export type EximbayRefundCanaryEnvironment = Readonly<{
  lane: typeof EXIMBAY_REFUND_CANARY_LANE;
  releaseBindingDigest: string;
  canaryJobBindingDigest: string;
  preflightJobBindingDigest: string;
  imageBindingDigest: string;
  secretGenerationBindingDigest: string;
  targetBindingDigest: string;
  custodyArtifactSha256: string;
  secretResource: string;
  secretVersion: string;
  mid: string;
  merchantAccountBindingId: string;
  credentialGenerationBindingId: string;
  consumedExecutionId: string;
  consumedExecutionBindingDigest: string;
}>;

export function parseEximbayRefundCanaryEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): EximbayRefundCanaryEnvironment | null {
  if (hasForbiddenSurface(env) || !exactActivation(env)) return null;
  const lane = value(env, "MIRA_REFUND_EXIMBAY_CANARY_LANE");
  const releaseBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST");
  const canaryJobBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST");
  const preflightJobBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST");
  const imageBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST");
  const secretGenerationBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST");
  const targetBindingDigest = value(env, "MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST");
  // The legacy-named Terraform input is byte identity only. It does not prove
  // synthetic custody, absence of customer data, provider truth, or review.
  const custodyArtifactSha256 = value(
    env, "MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST",
  );
  const secretResource = value(env, "MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE");
  const secretVersion = value(env, "MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION");
  const mid = value(env, EXIMBAY_SANDBOX_MID);
  const merchantAccountBindingId = value(env, EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING);
  const credentialGenerationBindingId = value(
    env, EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  );
  const job = value(env, "CLOUD_RUN_JOB");
  const execution = value(env, "CLOUD_RUN_EXECUTION");
  const digests = [releaseBindingDigest, canaryJobBindingDigest, preflightJobBindingDigest,
    imageBindingDigest, secretGenerationBindingDigest, targetBindingDigest,
    custodyArtifactSha256];
  if (!laneIdentityIsValid(lane, digests)) return null;
  if (!nonSecretConfigIsValid(mid, merchantAccountBindingId,
    credentialGenerationBindingId)) return null;
  if (!executionIdentityIsValid(env, job, execution)) return null;
  if (!secretAuthorityIsValid(secretResource, secretVersion,
    credentialGenerationBindingId, secretGenerationBindingDigest)) return null;
  const consumedExecutionId = `cloud-run-${sha256(`${job}\0${execution}`).slice(0, 32)}`;
  const consumedExecutionBindingDigest = sha256(JSON.stringify([
    "mira-refund-eximbay-canary-execution/v1", job, execution, 1, 0, 0,
    canaryJobBindingDigest, releaseBindingDigest, imageBindingDigest,
  ]));
  return Object.freeze({
    lane: EXIMBAY_REFUND_CANARY_LANE,
    releaseBindingDigest, canaryJobBindingDigest, preflightJobBindingDigest,
    imageBindingDigest, secretGenerationBindingDigest, targetBindingDigest,
    custodyArtifactSha256, secretResource, secretVersion, mid,
    merchantAccountBindingId, credentialGenerationBindingId,
    consumedExecutionId, consumedExecutionBindingDigest,
  });
}

function exactActivation(env: Readonly<Record<string, string | undefined>>): boolean {
  return REQUIRED_ENABLED.every((key) => env[key] === "ENABLED")
    && REQUIRED_ABSENT.every((key) => !env[key]?.trim());
}

function laneIdentityIsValid(lane: string, digests: readonly string[]): boolean {
  return lane === EXIMBAY_REFUND_CANARY_LANE && digests.every((digest) => DIGEST.test(digest));
}

function nonSecretConfigIsValid(
  mid: string,
  merchantAccountBindingId: string,
  credentialGenerationBindingId: string,
): boolean {
  return mid.length > 0 && mid.length <= 512
    && [merchantAccountBindingId, credentialGenerationBindingId].every(
      (binding) => LABEL.test(binding),
    );
}

function executionIdentityIsValid(
  env: Readonly<Record<string, string | undefined>>,
  job: string,
  execution: string,
): boolean {
  return exactCloudRunTask(env) && [job, execution].every((label) => LABEL.test(label));
}

function secretAuthorityIsValid(
  resource: string,
  version: string,
  credentialGenerationBindingId: string,
  expectedDigest: string,
): boolean {
  if (exactEximbayRefundCanarySecretName({ resource, version }) === null) return false;
  return expectedDigest === sha256(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1",
    resource, version, credentialGenerationBindingId,
  ]));
}

function hasForbiddenSurface(env: Readonly<Record<string, string | undefined>>): boolean {
  return Object.entries(env).some(([key, raw]) => Boolean(raw?.trim()) && forbiddenKey(key));
}

function forbiddenKey(key: string): boolean {
  return [
    key === EXIMBAY_SANDBOX_API_KEY,
    ["TOSS_", "NEXT_PUBLIC_TOSS_", "REFUND_EXECUTION_TOSS_",
      "CUSTOMER_REFUND_INTAKE_"].some((prefix) => key.startsWith(prefix)),
    ["REFUND_EXECUTION_CLAIM_ENABLED", "REFUND_EXECUTION_EXIMBAY_CLAIM_ENABLED",
      "REFUND_EXECUTION_LEASE_RELEASE_ENABLED"].includes(key),
    /(?:PROVIDER.*BASE_URL|EXIMBAY.*BASE_URL|LIVE)/iu.test(key),
  ].some(Boolean);
}

function exactCloudRunTask(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.CLOUD_RUN_TASK_COUNT === "1" && env.CLOUD_RUN_TASK_INDEX === "0"
    && env.CLOUD_RUN_TASK_ATTEMPT === "0";
}

function value(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const raw = env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
