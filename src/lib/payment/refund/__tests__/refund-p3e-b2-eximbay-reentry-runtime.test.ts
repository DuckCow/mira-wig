import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import runtimeV4 from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v4.json";
import imagePolicyV20 from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v20.json";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const RUNTIME_ROOT = join(INFRA, "eximbay-refund-reentry");
const RUNTIME_V2 = join(INFRA, "contracts/eximbay-canary-runtime-v2.json");
const RUNTIME_V3 = join(INFRA, "contracts/eximbay-canary-runtime-v3.json");
const RUNTIME_V4 = join(INFRA, "contracts/eximbay-canary-runtime-v4.json");
const IMAGE_POLICY_V19 = join(INFRA, "eximbay-canary/image-policy-v19.json");
const IMAGE_POLICY_V20 = join(INFRA, "eximbay-canary/image-policy-v20.json");

const RUNTIME_V2_SHA256 =
  "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41";
const RUNTIME_V3_SHA256 =
  "642c09ca61d31576728d6cd07d117a973c40e89a630f6596ad840f02f856c6d2";
const RUNTIME_V4_SHA256 =
  "5d77b4f86121beab6d6892331bdaeb9feda6ef79a500d32fdd6f5b3087e6a7b0";
const IMAGE_POLICY_V19_SHA256 =
  "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143";
const IMAGE_POLICY_V20_SHA256 =
  "2bf2887cc6bead7336dea8a36dc25fba695434674a272623f57299be42ad4cd8";

describe("P3E-B2 exact Eximbay refund re-entry successor runtime", () => {
  it("adds v4 and v20 without changing the frozen v2, v3, or v19 authorities", () => {
    expect(sha256(RUNTIME_V2)).toBe(RUNTIME_V2_SHA256);
    expect(sha256(RUNTIME_V3)).toBe(RUNTIME_V3_SHA256);
    expect(sha256(RUNTIME_V4)).toBe(RUNTIME_V4_SHA256);
    expect(sha256(IMAGE_POLICY_V19)).toBe(IMAGE_POLICY_V19_SHA256);
    expect(sha256(IMAGE_POLICY_V20)).toBe(IMAGE_POLICY_V20_SHA256);
    expect(runtimeV4.parentAuthority).toEqual({
      path: "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v3.json",
      sha256: RUNTIME_V3_SHA256,
      status: "FROZEN_HISTORICAL_PREDECESSOR",
    });
    expect(imagePolicyV20).toMatchObject({
      contractVersion: "mira-refund-eximbay-canary-image-policy/v20",
      parentAuthoritySha256: IMAGE_POLICY_V19_SHA256,
      baselineCommit: "3de0b8c7c8ed2e7047a7d866b83abc24eec0da23",
      sourceTree: "213dc029e02aec80868c384fd0d0b7ce3ef6aad5",
    });
  });

  it("reuses the exact backend and five installed resource addresses", () => {
    expect(runtimeV4.backend).toEqual({
      type: "gcs",
      bucket: "mira-refund-sandbox-0001-tfstate-925882331349",
      prefix: "p3e-b2/eximbay-canary",
    });
    expect(runtimeV4.resourceGraph).toMatchObject({
      resourceCount: 5,
      addresses: [
        "google_cloud_run_v2_job.canary",
        "google_project_iam_member.cloud_sql_client",
        "google_secret_manager_secret_iam_member.database_url",
        "google_secret_manager_secret_iam_member.eximbay_api_key",
        "google_service_account.canary",
      ],
    });
    expect(runtimeV4.terraform).toEqual({
      rootPath: "infra/refund-sandbox/p3e-b2/eximbay-refund-reentry",
      predecessorRootPath: "infra/refund-sandbox/p3e-b2/eximbay-canary",
      backendIdentity: "REUSED_EXACT",
      resourceAddressIdentity: "REUSED_EXACT",
      newResourceCount: 0,
      applyAuthority: "ABSENT_IN_THIS_TASK",
    });
    const terraform = readTerraform();
    expect(terraform).toMatch(
      /backend_prefix_contract\s*=\s*"p3e-b2\/eximbay-canary"/u,
    );
    expect(terraform.match(/^resource\s+"/gmu)).toHaveLength(5);
    expect(terraform).not.toMatch(/google_cloud_run_v2_job_execution|local-exec|data\s+"external"/u);
  });

  it("pins the same command and attempt to generation two without approval mutation", () => {
    expect(runtimeV4.exactTarget).toEqual({
      paymentId: "cmtsdmk16000201s6alc0evek",
      orderId: "cmtsdmo8r000401s671x1chsp",
      refundAttemptId: "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8",
      commandId: "cmtsdrrxk00010ss6we7g8qe7",
      providerOperationBindingId: "cmtsdrs0900030ss6qwxcgar6",
      targetBindingDigest:
        "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c",
      predecessorLeaseGeneration: 1,
      futureTakeoverGeneration: 2,
    });
    expect(runtimeV4.historicalApproval).toMatchObject({
      id: "eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc",
      status: "CONSUMED_HISTORICAL_TARGET_SEAL_ONLY",
      reset: 0,
      reconsume: 0,
      mutation: "FORBIDDEN",
    });
    expect(runtimeV4.databaseRole.prohibitedCreates).toEqual([
      "RefundAttempt",
      "RefundExecutionCommand",
      "EximbayRefundSandboxCanaryApproval",
    ]);
    expect(runtimeV4.databaseRole.historicalSealReadAuthorities).toEqual([
      "Payment",
      "Order",
      "RefundAttempt",
      "RefundAttemptTransition",
      "RefundExecutionCommand",
      "RefundExecutionCommandEvent",
      "RefundExecutionDispatchAttempt",
      "RefundExecutionProviderOperationBinding",
      "RefundExecutionProviderEligibilityProof",
      "RefundExecutionProviderContactEligibilityProof",
      "RefundExecutionEvidence",
      "RefundExecutionEximbayPreflightObservation",
      "EximbayRefundSandboxCanaryApproval",
    ]);
    expect(runtimeV4.databaseRole.paymentOutboxSelect).toBe("DENIED_NOT_REQUIRED");
  });

  it("is dormant, single-shot, and has no current provider or apply authority", () => {
    expect(runtimeV4.job).toMatchObject({
      name: "mira-eximbay-refund-canary",
      arguments: ["eximbay-refund-reentry-once"],
      taskCount: 1,
      parallelism: 1,
      maxRetries: 0,
      automaticTrigger: false,
      executionPassLimit: 1,
    });
    expect(runtimeV4.providerContact).toMatchObject({
      default: "DENIED",
      effectCaps: {
        preRefundRetrieve: 1,
        refundRequestR1: 1,
        reconciliationLookup: 0,
        r2: 0,
        secondRefundRequest: 0,
        automaticRetry: 0,
      },
      uncertainOutcome: "STOP_NO_LOOKUP_NO_RETRY_NO_SECOND_REFUND",
    });
    expect(runtimeV4.executionAuthority).toEqual({
      currentTask: "IMPLEMENTATION_PROMOTION_PUBLICATION_ONLY",
      liveExecution: "ABSENT",
      terraformApply: "ABSENT",
      providerContact: "ABSENT",
    });
    expect(runtimeV4.terminalEvidence).toMatchObject({
      childOperationAndHostResult: "SEPARATE",
      trustworthyProviderEffectsSurviveHostFailure: true,
      malformedOrMissingProviderEffects: "UNKNOWN",
    });
  });

  it("pins the published artifact and immutable v20 authority", () => {
    expect(runtimeV4.image).toEqual({
      digestUri:
        "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:e7d3cf8599c49a73e0199f3cea9e7a3b57efd9403fef9191b4b6f3be2f045ff0",
      configDigest:
        "sha256:4f2bc0a7e0489890cd3f2bcac46da111a4772840376d64f5e0b79c0184890043",
      imagePolicyPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v20.json",
      imagePolicyVersion: "V20",
      imagePolicySha256: IMAGE_POLICY_V20_SHA256,
      sourceCommit: "3de0b8c7c8ed2e7047a7d866b83abc24eec0da23",
      sourceTree: "213dc029e02aec80868c384fd0d0b7ce3ef6aad5",
      contextSha256:
        "ff4fb6b93db00325668009503d7815d5d8e5147b4128850eb3e434039a22f8df",
      contextFiles: 212,
      entrypoints: 6,
    });
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readTerraform(): string {
  return readdirSync(RUNTIME_ROOT)
    .filter((name) => name.endsWith(".tf"))
    .sort()
    .map((name) => readFileSync(join(RUNTIME_ROOT, name), "utf8"))
    .join("\n");
}
