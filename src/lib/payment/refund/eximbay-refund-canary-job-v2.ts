import { EXIMBAY_CANONICAL_DEPLOYMENT_SHA256 } from "./eximbay-refund-canonical-deployment";
import { createHash } from "node:crypto";
import {
  EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS,
  EXIMBAY_CANARY_EXACT_PROJECT, EXIMBAY_CANARY_EXACT_REGION,
  EXIMBAY_CANARY_EXACT_JOB, EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
  EXIMBAY_CANARY_EXACT_IMAGE, EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
  EXIMBAY_CANARY_EXACT_SECRET_VERSION, EXIMBAY_CANARY_EXACT_MID,
  deriveEximbayCanaryMerchantAccountBindingId,
  deriveEximbayCanaryCredentialGenerationBindingId,
} from "./eximbay-refund-canary-producer-contract";

export const EXIMBAY_CANARY_JOB_V2 = "mira-refund-eximbay-canary-job/v2";
const RELEASE_BINDING_VERSION = "mira-refund-eximbay-canary-release/v2";
const IMAGE_BINDING_VERSION = "mira-refund-eximbay-canary-image/v1";
const PREFLIGHT_JOB_BINDING_VERSION = "mira-refund-eximbay-canary-preflight-job/v1";
const SECRET_GENERATION_BINDING_VERSION = "mira-refund-eximbay-canary-secret-generation/v1";

/** Immutable job facts only. This digest grants no target execution authority. */
export function deriveEximbayCanaryJobV2() {
  const contracts = EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS;
  const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId({
    provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
  });
  const credentialGenerationBindingId = deriveEximbayCanaryCredentialGenerationBindingId({
    provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
    secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION, merchantAccountBindingId,
  });
  const account = { merchantAccountBindingId, credentialGenerationBindingId };
  const releaseBindingDigest = digest([
    RELEASE_BINDING_VERSION,
    EXIMBAY_CANONICAL_DEPLOYMENT_SHA256,
  ]);
  const imageBindingDigest = digest([
    IMAGE_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_IMAGE,
    "bbebe719f5b34a224c0b78159872fe7a6d8a7495f4540087356b2dde84777bbd",
    209,
    5,
    contracts.imagePolicySha256,
  ]);
  const preflightJobBindingDigest = digest([
    PREFLIGHT_JOB_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_PROJECT,
    EXIMBAY_CANARY_EXACT_REGION,
    "mira-p3e-sbx-refund-preflight",
    contracts.preflightContractSha256,
    imageBindingDigest,
  ]);
  const secretGenerationBindingDigest = digest([
    SECRET_GENERATION_BINDING_VERSION,
    EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    account.credentialGenerationBindingId,
  ]);
  const canaryJobBindingDigest = digest([
    EXIMBAY_CANARY_JOB_V2,
    EXIMBAY_CANARY_EXACT_PROJECT,
    EXIMBAY_CANARY_EXACT_REGION,
    EXIMBAY_CANARY_EXACT_JOB,
    EXIMBAY_CANARY_EXACT_SERVICE_ACCOUNT,
    EXIMBAY_CANARY_EXACT_IMAGE,
    ["eximbay-canary-once"],
    1,
    1,
    0,
    150,
    false,
    releaseBindingDigest,
    imageBindingDigest,
    preflightJobBindingDigest,
    secretGenerationBindingDigest,
    account.merchantAccountBindingId,
    account.credentialGenerationBindingId,
    EXIMBAY_CANARY_EXACT_MID,
  ]);
  return Object.freeze({
    ...account,
    releaseBindingDigest,
    canaryJobBindingDigest,
    preflightJobBindingDigest,
    imageBindingDigest,
    secretGenerationBindingDigest,
  });
}

function digest(facts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(facts), "utf8").digest("hex");
}
