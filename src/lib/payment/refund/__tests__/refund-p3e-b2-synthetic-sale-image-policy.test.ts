import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import policy from
  "../../../../../infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v1.json";
import { deriveSyntheticSalePublicationTarget } from
  "../../../../../scripts/build-synthetic-sale-image.mjs";

const ROOT = process.cwd();
const POLICY_PATH = "infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v1.json";
const POLICY_SHA256 = "78b3bcdc0cc63b2af2f6f242cdd0405b68ef3e40c71b31aa7de9d4b6c90e130f";
const SOURCE_COMMIT = "061b04b4969533a0f28a27dba75102842462d848";
const MANIFEST = "sha256:b83bfc2af27c4440d8b09602d01c7bf668025106129cef23658756ca6a88642e";
const CONFIG = "sha256:26ffb63bde180a20e9028a257897ad3d3fc731d961e13c77f5c066a0ede3d8c7";

describe("P3E-B2 synthetic-sale image policy v1", () => {
  it("binds the exact source commit, tree, context, and immutable artifact", () => {
    const bytes = readFileSync(join(ROOT, POLICY_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(POLICY_SHA256);
    expect(policy).toMatchObject({
      contractVersion: "mira-refund-p3e-b2-synthetic-sale-image-policy/v1",
      status: "CURRENT_SUCCESSOR",
      parentAuthority: "NONE_FIRST_SYNTHETIC_IMAGE_POLICY",
      sourceAuthority: {
        commit: SOURCE_COMMIT,
        tree: "f24a70c9432c2d0c9db37ddbcb676ffcd5a13ea9",
        parent: "938671b254c7ca304404da859922771b3ab29b2e",
      },
      buildContext: {
        manifestSha256: "99aaf88cd93dd42686db216f3990135f0fb331d9586b1a6dcd2ec122a3d7eaf3",
        fileCount: 9,
        canonicalGenerationCount: 1,
      },
      artifact: {
        manifestDigest: MANIFEST,
        configDigest: CONFIG,
        platform: "linux/amd64",
        layerCount: 15,
      },
    });
    expect(execFileSync("git", ["rev-parse", `${SOURCE_COMMIT}^{tree}`], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()).toBe(policy.sourceAuthority.tree);
    expect(policy.artifact.layerDigests).toHaveLength(15);
    expect(policy.artifact.layerSizes).toHaveLength(15);
    expect(policy.artifact.diffIds).toHaveLength(15);
    expect(policy.artifact.layerSizes.reduce((sum, size) => sum + size, 0))
      .toBe(policy.artifact.compressedLayerBytes);
  });

  it("freezes the exact provider-free readback and redaction contract", () => {
    const statusSource = readFileSync(
      join(ROOT, "src/lib/payment/synthetic-sale/status-readback.ts"),
      "utf8",
    );
    expect(policy.statusReadback).toEqual({
      operationIdentitySource: "CAPABILITY_DERIVED_RUN_IDENTITY",
      callerSuppliedCheckoutSessionId: "NOT_ADMITTED_BY_STATUS_ROUTE",
      transactionIsolation: "REPEATABLE_READ",
      providerCalls: 0,
      businessRowMutations: 0,
      arbitraryDatabaseReadAuthority: false,
      refundTargetIdentifiers: [
        "checkoutSessionId", "paymentId", "providerOrderId", "orderId",
      ],
      duplicateGates: [
        "PAYMENT_CARDINALITY", "ORDER_CARDINALITY", "AUDIT_CARDINALITY",
      ],
      coherenceGate: "AMOUNT_CURRENCY_MISMATCH",
      providerPaymentKeyDisclosure: "PRESENCE_BOOLEAN_ONLY",
      secretValueDisclosure: "ABSENT",
    });
    expect(statusSource).toContain("Prisma.TransactionIsolationLevel.RepeatableRead");
    expect(statusSource).toContain("providerPaymentKeyPresent");
    expect(statusSource).not.toMatch(/fetch\(|requestPay|\.create\(|\.update\(|\.upsert\(|\.delete\(/u);
  });

  it("binds the only current synthetic policy and exact Terraform digest", () => {
    const policyFiles = readdirSync(join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale"))
      .filter((name) => /^image-policy-v\d+\.json$/u.test(name));
    expect(policyFiles).toEqual(["image-policy-v1.json"]);
    const locals = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale-service/locals.tf"),
      "utf8",
    );
    const variables = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale-service/variables.tf"),
      "utf8",
    );
    expect(locals).toContain(`current_image_policy_path              = "${POLICY_PATH}"`);
    expect(locals).toContain(`current_image_policy_sha256            = "${POLICY_SHA256}"`);
    expect(locals).toContain(`current_manifest_digest                = "${MANIFEST}"`);
    expect(locals).toContain(`current_config_digest                  = "${CONFIG}"`);
    expect(variables).toContain(policy.publication.digestUri);
  });

  it("derives the one immutable publication target from the source commit", () => {
    expect(deriveSyntheticSalePublicationTarget(SOURCE_COMMIT)).toEqual({
      imageFamily: "synthetic-sale",
      repository: policy.publication.repository,
      sourceCommit: SOURCE_COMMIT,
      tag: policy.publication.tag,
      tagUri: `${policy.publication.repository}:${policy.publication.tag}`,
    });
  });
});
