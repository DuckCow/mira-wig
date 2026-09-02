import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import policyV1 from
  "../../../../../infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v1.json";
import policy from
  "../../../../../infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v2.json";
import { deriveSyntheticSalePublicationTarget } from
  "../../../../../scripts/build-synthetic-sale-image.mjs";
import { verifySyntheticSaleRawManifest } from
  "../../../../../scripts/verify-synthetic-sale-image-policy.mjs";

const ROOT = process.cwd();
const POLICY_V1_PATH = "infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v1.json";
const POLICY_PATH = "infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v2.json";
const POLICY_V1_SHA256 = "78b3bcdc0cc63b2af2f6f242cdd0405b68ef3e40c71b31aa7de9d4b6c90e130f";
const POLICY_SHA256 = "727106ce002e3e69599704813040c5ebf865716dd7ece987877f1a323f9fb11a";
const SOURCE_COMMIT = "061b04b4969533a0f28a27dba75102842462d848";
const MANIFEST = "sha256:b83bfc2af27c4440d8b09602d01c7bf668025106129cef23658756ca6a88642e";
const CONFIG = "sha256:26ffb63bde180a20e9028a257897ad3d3fc731d961e13c77f5c066a0ede3d8c7";
const RAW_MANIFEST = Buffer.from(readFileSync(join(
  ROOT,
  "src/lib/payment/refund/__tests__/fixtures/synthetic-sale-manifest-b83bfc2a.base64",
), "utf8").trim(), "base64");

function policyWithArtifact(overrides: Readonly<Record<string, unknown>>): unknown {
  return { ...policy, artifact: { ...policy.artifact, ...overrides } };
}

describe("P3E-B2 synthetic-sale image policy v2", () => {
  it("preserves v1 byte-identically as historical defective authority", () => {
    const bytes = readFileSync(join(ROOT, POLICY_V1_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(POLICY_V1_SHA256);
    expect(policyV1).toMatchObject({
      contractVersion: "mira-refund-p3e-b2-synthetic-sale-image-policy/v1",
      artifact: { manifestDigest: MANIFEST, manifestSize: 2700 },
    });
    expect(policy.parentAuthority).toEqual({
      policyPath: POLICY_V1_PATH,
      contractVersion: "mira-refund-p3e-b2-synthetic-sale-image-policy/v1",
      sha256: POLICY_V1_SHA256,
      status: "HISTORICAL_DEFECTIVE_AUTHORITY",
      mismatchClass: "POLICY_METADATA_DEFECT",
      defectiveField: "artifact.manifestSize",
      defectiveValue: 2700,
      measurementSemantics: "COMPACT_JSON_RESERIALIZATION_BYTE_LENGTH",
      measurementSha256: "bc21b94e3a011e690838e98125664e3d980346dde504136c801be4ac7bc8d4bb",
    });
  });

  it("binds the exact source, context, existing artifact, and raw manifest size", () => {
    const bytes = readFileSync(join(ROOT, POLICY_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(POLICY_SHA256);
    expect(policy).toMatchObject({
      contractVersion: "mira-refund-p3e-b2-synthetic-sale-image-policy/v2",
      status: "CURRENT_SUCCESSOR",
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
        manifestRawByteLength: 3251,
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

  it("derives digest, raw byte length, config, and ordered layers from exact bytes", () => {
    expect(verifySyntheticSaleRawManifest(RAW_MANIFEST, policy)).toEqual({
      digest: MANIFEST,
      rawByteLength: 3251,
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      configDigest: CONFIG,
      orderedLayerDescriptorCount: 15,
    });
  });

  it("rejects the v1 compact-JSON size and unrelated image-summary size", () => {
    expect(() => verifySyntheticSaleRawManifest(
      RAW_MANIFEST,
      policyWithArtifact({ manifestRawByteLength: 2700 }),
    )).toThrow("SYNTHETIC_MANIFEST_RAW_SIZE_MISMATCH");
    expect(() => verifySyntheticSaleRawManifest(
      RAW_MANIFEST,
      policyWithArtifact({ manifestRawByteLength: policy.artifact.imageSize }),
    )).toThrow("SYNTHETIC_MANIFEST_RAW_SIZE_MISMATCH");
  });

  it("rejects manifest digest, config digest, and layer descriptor drift", () => {
    expect(() => verifySyntheticSaleRawManifest(
      RAW_MANIFEST,
      policyWithArtifact({ manifestDigest: `sha256:${"0".repeat(64)}` }),
    )).toThrow("SYNTHETIC_MANIFEST_DIGEST_MISMATCH");
    expect(() => verifySyntheticSaleRawManifest(
      RAW_MANIFEST,
      policyWithArtifact({ configDigest: `sha256:${"1".repeat(64)}` }),
    )).toThrow("SYNTHETIC_MANIFEST_CONFIG_MISMATCH");
    expect(() => verifySyntheticSaleRawManifest(
      RAW_MANIFEST,
      policyWithArtifact({
        layerDigests: [`sha256:${"2".repeat(64)}`, ...policy.artifact.layerDigests.slice(1)],
      }),
    )).toThrow("SYNTHETIC_MANIFEST_LAYER_MISMATCH");
  });

  it("preserves the exact provider-free readback and redaction contract", () => {
    const statusSource = readFileSync(
      join(ROOT, "src/lib/payment/synthetic-sale/status-readback.ts"),
      "utf8",
    );
    expect(policy.statusReadback).toEqual(policyV1.statusReadback);
    expect(statusSource).toContain("Prisma.TransactionIsolationLevel.RepeatableRead");
    expect(statusSource).toContain("providerPaymentKeyPresent");
    expect(statusSource).not.toMatch(/fetch\(|requestPay|\.create\(|\.update\(|\.upsert\(|\.delete\(/u);
  });

  it("selects only v2 as current Terraform authority without changing the image", () => {
    const policyFiles = readdirSync(join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale"))
      .filter((name) => /^image-policy-v\d+\.json$/u.test(name));
    expect(policyFiles).toEqual(["image-policy-v1.json", "image-policy-v2.json"]);
    const locals = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale-service/locals.tf"),
      "utf8",
    );
    const variables = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale-service/variables.tf"),
      "utf8",
    );
    expect(locals).toContain(`current_image_policy_path              = "${POLICY_PATH}"`);
    expect(locals).toContain('current_image_policy_version           = "V2"');
    expect(locals).toContain(`current_image_policy_sha256            = "${POLICY_SHA256}"`);
    expect(locals).toContain(`current_manifest_digest                = "${MANIFEST}"`);
    expect(locals).toContain(`current_config_digest                  = "${CONFIG}"`);
    expect(variables).toContain(policy.publication.digestUri);
    expect(policy.publication.digestUri).toBe(policyV1.publication.digestUri);
  });

  it("derives the unchanged immutable publication target", () => {
    expect(deriveSyntheticSalePublicationTarget(SOURCE_COMMIT)).toEqual({
      imageFamily: "synthetic-sale",
      repository: policy.publication.repository,
      sourceCommit: SOURCE_COMMIT,
      tag: policy.publication.tag,
      tagUri: `${policy.publication.repository}:${policy.publication.tag}`,
    });
  });
});
