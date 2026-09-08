import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v2.json";

import imagePolicy from "../../../../../infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json";
import {
  EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS,
  EXIMBAY_CANARY_EXACT_IMAGE,
  EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS,
} from "../eximbay-refund-canary-producer-contract";

const ROOT = process.cwd();
const CANARY = join(ROOT, "infra/refund-sandbox/p3e-b2/eximbay-canary");
const read = (path: string) => readFileSync(join(CANARY, path), "utf8");
const terraform = () => ["checks.tf", "locals.tf", "main.tf", "outputs.tf", "providers.tf", "variables.tf", "versions.tf"]
  .map(read).join("\n");
const addresses = [
  "google_cloud_run_v2_job.canary",
  "google_project_iam_member.cloud_sql_client",
  "google_secret_manager_secret_iam_member.database_url",
  "google_secret_manager_secret_iam_member.eximbay_api_key",
  "google_service_account.canary",
].sort();

describe("P3E-B2 dormant Eximbay canary release authority", () => {
  it("binds the single-shot image and runtime to the exact immutable successor", () => {
    expect(imagePolicy.contractVersion).toBe("mira-refund-eximbay-canary-image-policy/v9");
    expect(imagePolicy.baselineCommit).toBe("6f7398e5bae6909e5d2bb52c9ef0717277d97df4");
    expect(imagePolicy.sourceTree).toBe("51dabe922b2033fbdb0c9f54277646eca49f5648");
    expect(contract.image.sourceCommit).toBe(imagePolicy.baselineCommit);
    expect(contract.image.sourceTree).toBe(imagePolicy.sourceTree);
    expect(contract.image.digestUri).toBe(EXIMBAY_CANARY_EXACT_IMAGE);
    expect(contract.image.digestUri.endsWith(`@${imagePolicy.artifact.manifestDigest}`)).toBe(true);
    expect(contract.image.contextSha256).toBe(imagePolicy.buildContext.manifestSha256);
    expect(contract.image.contextFiles).toBe(imagePolicy.buildContext.fileCount);
    expect(contract.image.entrypoints).toBe(imagePolicy.buildContext.entrypointCount);
    const policyHash = createHash("sha256").update(read("image-policy-v9.json")).digest("hex");
    expect(contract.image.imagePolicySha256).toBe(policyHash);
    expect(EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS.imagePolicySha256).toBe(policyHash);
    expect(imagePolicy.artifact.orderedLayers.map((layer) => layer.diffId))
      .toEqual(imagePolicy.artifact.diffIds);
    expect(imagePolicy.artifact.orderedLayers).toHaveLength(imagePolicy.artifact.layerCount);
  });

  it("preserves source effect ceilings, freshness, and explicit retirement", () => {
    const caps = { preRefundRetrieve: 1, refundRequest: 1, postRefundRetrieve: 0,
      recoveryRetrieve: 0, secondRefundRequest: 0, automaticRetry: 0 };
    expect(imagePolicy.canaryExecution).toMatchObject({ ...caps,
      command: "eximbay-canary-once", mode: "SANDBOX",
      targetFreshnessMaxAgeMs: EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS,
      uncertainOutcome: "STOP_SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED",
    });
    expect(contract.providerContact.effectCaps).toEqual(caps);
    expect(contract.job).toMatchObject({ taskCount: 1, parallelism: 1, maxRetries: 0,
      automaticTrigger: false, executionPassLimit: 1 });
    expect(contract.lifecycle).toEqual({ default: "ABSENT",
      materialization: "EXPLICIT_HUMAN_AUTHORITY", retirement: "EXPLICIT_HUMAN_AUTHORITY",
      preventDestroy: false, deletionProtection: false });
    for (const source of imagePolicy.canaryExecution.sourceFiles) {
      expect(createHash("sha256").update(readFileSync(join(ROOT, source.path))).digest("hex"))
        .toBe(source.sha256);
    }
  });

  it("preserves the canary policy and advances only the contacted-reconciliation authority", () => {
    expect(createHash("sha256").update(read("image-policy-v1.json")).digest("hex"))
      .toBe("5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876");
    expect(createHash("sha256").update(read("image-policy-v8.json")).digest("hex"))
      .toBe("edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a");
    expect(createHash("sha256").update(read("image-policy-v9.json")).digest("hex"))
      .toBe("ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf");
    expect(readFileSync(join(ROOT,
      "infra/refund-sandbox/p3e-b2/contacted-reconciliation/locals.tf"), "utf8"))
      .toContain("eximbay-canary/image-policy-v18.json");
    expect(createHash("sha256").update(read("image-policy-v10.json")).digest("hex"))
      .toBe("5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851");
    expect(createHash("sha256").update(read("image-policy-v11.json")).digest("hex"))
      .toBe("80c15e7f247991e466ae3b04f736be8b8e96ccc9aec9a161a9df57d8733a0d54");
    expect(createHash("sha256").update(read("image-policy-v12.json")).digest("hex"))
      .toBe("cc313693936f0928558778b856196ffc2cb1ed9c6323c8ffb15e501542cdf200");
    expect(createHash("sha256").update(read("image-policy-v13.json")).digest("hex"))
      .toBe("8665dec8197d4c8c5a948cd95479974b1de818e4007c6412dad6f3f2f6b61962");
    expect(createHash("sha256").update(read("image-policy-v14.json")).digest("hex"))
      .toBe("7c2561ec1c53b1cd1f69ba7ffec271e1a5b16ce4427abd45ea5c4055a4d653a8");
    expect(createHash("sha256").update(read("image-policy-v15.json")).digest("hex"))
      .toBe("7db5aacbe73682fd83bc8608bc729b25969b0b49fae3d772abe784cb2fcc9009");
    expect(createHash("sha256").update(read("image-policy-v16.json")).digest("hex"))
      .toBe("0068409ece6ed1323078dad75096cb2a98210a5b0920dc0c7dcce67e0f9e5b24");
    expect(createHash("sha256").update(read("image-policy-v17.json")).digest("hex"))
      .toBe("48452e46f0d56bb0f305bca36d2537fc19db0e22538f5099aa507fe2a8b7cc86");
    expect(createHash("sha256").update(read("image-policy-v18.json")).digest("hex"))
      .toBe("8744198014a3327b569420afad356d090186a118a7057758ea4ad8783a7d7822");
    expect(imagePolicy.commandAllowlist).toEqual(["worker-check", "worker-health",
      "worker-once", "sandbox-preflight", "image-self-check", "eximbay-canary-once",
      "eximbay-contacted-reconciliation-once"]);
  });

  it("freezes the exact five-resource graph and backend boundary", () => {
    const source = terraform();
    expect(source.match(/resource\s+"[^"]+"\s+"[^"]+"/gu)).toHaveLength(5);
    expect(contract.resourceGraph.addresses).toEqual(addresses);
    expect(createHash("sha256").update(addresses.join("\n")).digest("hex"))
      .toBe(contract.resourceGraph.sortedAddressSha256);
    expect(read("versions.tf")).toContain('backend "gcs" {}');
    expect(contract.backend).toEqual({
      type: "gcs",
      bucket: "mira-refund-sandbox-0001-tfstate-925882331349",
      prefix: "p3e-b2/eximbay-canary",
    });
  });

  it("requires explicit dormant-release authority and exact immutable handoffs", () => {
    const source = terraform();
    expect(source).not.toContain("UNCONDITIONALLY_BLOCKED_IN_R2B1");
    expect(read("main.tf").match(/condition\s+=\s+local\.runtime_apply_authorized/gu))
      .toHaveLength(5);
    expect(read("main.tf").match(/EXIMBAY_CANARY_RELEASE_AUTHORITY_MISSING/gu))
      .toHaveLength(5);
    expect(read("variables.tf")).toContain("provider_contact_authorized == false");
    expect(read("variables.tf")).toContain(contract.image.digestUri);
    expect(read("variables.tf")).toContain("mira-p3e-sbx-canary-database-url");
    expect(read("variables.tf")).toContain("mira-p3e-sbx-eximbay-api-key");
    expect(read("variables.tf")).not.toContain('"latest"');
  });

  it("keeps IAM, secrets, network, and attended Job configuration narrow", () => {
    const source = terraform();
    expect(source).toContain('role    = "roles/cloudsql.client"');
    expect(source).not.toContain("roles/cloudsql.instanceUser");
    expect(read("locals.tf")).toContain(
      "resource.name == '${local.cloud_sql_instance_resource}' && resource.service == 'sqladmin.googleapis.com'",
    );
    expect(contract.iam.cloudSqlCondition).toContain(
      "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18",
    );
    expect(source.match(/roles\/secretmanager\.secretAccessor/gu)).toHaveLength(2);
    expect(read("main.tf")).toContain('egress = "PRIVATE_RANGES_ONLY"');
    expect(read("main.tf")).toContain('tags       = ["refund-provider-free"]');
    expect(read("main.tf")).toContain('timeout               = "150s"');
    expect(read("main.tf")).toContain('args  = ["eximbay-canary-once"]');
    expect(source).not.toMatch(/google_(?:cloud_run_v2_job_iam|cloud_scheduler|pubsub|cloud_tasks)/u);
  });

  it("grants only the two missing atomic-success privileges", () => {
    const sql = read("database-role-grants.sql");
    expect(sql).toContain('GRANT SELECT ON TABLE "CheckoutSession"\n  TO mira_refund_canary;');
    expect(sql).toContain('GRANT INSERT ON TABLE "PaymentOutbox"\n  TO mira_refund_canary;');
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE "RefundExecutionEximbayPreflightObservation"\n  TO mira_refund_canary;',
    );
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|UPDATE|DELETE)\s+ON\s+TABLE\s+"PaymentOutbox"/iu);
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+"CheckoutSession"/iu);
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|UPDATE|DELETE)\s+ON\s+TABLE\s+"RefundExecutionEximbayPreflightObservation"/iu);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "Payment"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionProviderOperationBinding"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionEvidence"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionCommandEvent"\s+TO mira_refund_canary;/u);
  });
});
