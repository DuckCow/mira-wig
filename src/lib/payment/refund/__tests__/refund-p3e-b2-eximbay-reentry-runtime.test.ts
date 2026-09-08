import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import runtimeV3 from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v3.json";
import imagePolicyV19 from
  "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v19.json";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const RUNTIME_ROOT = join(INFRA, "eximbay-refund-reentry");
const RUNTIME_V2 = join(INFRA, "contracts/eximbay-canary-runtime-v2.json");
const RUNTIME_V3 = join(INFRA, "contracts/eximbay-canary-runtime-v3.json");
const IMAGE_POLICY_V18 = join(INFRA, "eximbay-canary/image-policy-v18.json");
const IMAGE_POLICY_V19 = join(INFRA, "eximbay-canary/image-policy-v19.json");

const RUNTIME_V2_SHA256 =
  "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41";
const RUNTIME_V3_SHA256 =
  "642c09ca61d31576728d6cd07d117a973c40e89a630f6596ad840f02f856c6d2";
const IMAGE_POLICY_V18_SHA256 =
  "8744198014a3327b569420afad356d090186a118a7057758ea4ad8783a7d7822";
const IMAGE_POLICY_V19_SHA256 =
  "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143";

describe("P3E-B2 exact Eximbay refund re-entry successor runtime", () => {
  it("adds v3 and v19 without changing their frozen predecessors", () => {
    expect(sha256(RUNTIME_V2)).toBe(RUNTIME_V2_SHA256);
    expect(sha256(RUNTIME_V3)).toBe(RUNTIME_V3_SHA256);
    expect(sha256(IMAGE_POLICY_V18)).toBe(IMAGE_POLICY_V18_SHA256);
    expect(sha256(IMAGE_POLICY_V19)).toBe(IMAGE_POLICY_V19_SHA256);
    expect(runtimeV3.parentAuthority).toEqual({
      path: "infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json",
      sha256: RUNTIME_V2_SHA256,
      status: "FROZEN_HISTORICAL_PREDECESSOR",
    });
    expect(imagePolicyV19).toMatchObject({
      contractVersion: "mira-refund-eximbay-canary-image-policy/v19",
      parentAuthoritySha256: IMAGE_POLICY_V18_SHA256,
      baselineCommit: "a1564f36e070cdda9236812e704adf7d088517dd",
      sourceTree: "27549e6a8780ade525b727d2dfdae573b3b68c73",
    });
  });

  it("reuses the exact backend and five installed resource addresses", () => {
    expect(runtimeV3.backend).toEqual({
      type: "gcs",
      bucket: "mira-refund-sandbox-0001-tfstate-925882331349",
      prefix: "p3e-b2/eximbay-canary",
    });
    expect(runtimeV3.resourceGraph).toMatchObject({
      resourceCount: 5,
      addresses: [
        "google_cloud_run_v2_job.canary",
        "google_project_iam_member.cloud_sql_client",
        "google_secret_manager_secret_iam_member.database_url",
        "google_secret_manager_secret_iam_member.eximbay_api_key",
        "google_service_account.canary",
      ],
    });
    expect(runtimeV3.terraform).toEqual({
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
    expect(runtimeV3.exactTarget).toEqual({
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
    expect(runtimeV3.historicalApproval).toMatchObject({
      id: "eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc",
      status: "CONSUMED_HISTORICAL_TARGET_SEAL_ONLY",
      reset: 0,
      reconsume: 0,
      mutation: "FORBIDDEN",
    });
    expect(runtimeV3.databaseRole.prohibitedCreates).toEqual([
      "RefundAttempt",
      "RefundExecutionCommand",
      "EximbayRefundSandboxCanaryApproval",
    ]);
  });

  it("is dormant, single-shot, and has no current provider or apply authority", () => {
    expect(runtimeV3.job).toMatchObject({
      name: "mira-eximbay-refund-canary",
      arguments: ["eximbay-refund-reentry-once"],
      taskCount: 1,
      parallelism: 1,
      maxRetries: 0,
      automaticTrigger: false,
      executionPassLimit: 1,
    });
    expect(runtimeV3.providerContact).toMatchObject({
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
    expect(runtimeV3.executionAuthority).toEqual({
      currentTask: "IMPLEMENTATION_PROMOTION_PUBLICATION_ONLY",
      liveExecution: "ABSENT",
      terraformApply: "ABSENT",
      providerContact: "ABSENT",
    });
    expect(runtimeV3.terminalEvidence).toMatchObject({
      childOperationAndHostResult: "SEPARATE",
      trustworthyProviderEffectsSurviveHostFailure: true,
      malformedOrMissingProviderEffects: "UNKNOWN",
    });
  });

  it("pins the published artifact and immutable v19 authority", () => {
    expect(runtimeV3.image).toEqual({
      digestUri:
        "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:fb7e9132b216dc5799a0a6bb95f069359ac1de17e086ea9d59e6e6a44e98ef32",
      configDigest:
        "sha256:96e19d75681672b21107d1417e93a135d539db9c832019ed395b0e51eb7f25ea",
      imagePolicyPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v19.json",
      imagePolicyVersion: "V19",
      imagePolicySha256: IMAGE_POLICY_V19_SHA256,
      sourceCommit: "a1564f36e070cdda9236812e704adf7d088517dd",
      sourceTree: "27549e6a8780ade525b727d2dfdae573b3b68c73",
      contextSha256:
        "63680ca38dbc186150efd2f00ec81f487e682be7f2a5edcb814703ea8e2f9763",
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
