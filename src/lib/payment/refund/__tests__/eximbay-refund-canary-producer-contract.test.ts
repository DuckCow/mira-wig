import { describe, expect, it } from "vitest";
import { parseEximbayCanaryProducerArgs } from
  "../../../../../scripts/eximbay-refund-canary-target-producer";
import { loadEximbayCanaryCommittedContractDigests } from
  "../eximbay-refund-canary-committed-contracts";
import {
  EXIMBAY_CANARY_EXACT_MID,
  EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS,
  EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
  EXIMBAY_CANARY_EXACT_SECRET_VERSION,
  deriveEximbayCanaryCredentialGenerationBindingId,
  deriveEximbayCanaryMerchantAccountBindingId,
  deriveEximbayCanaryRuntimeBindings,
  parseEximbayCanaryAttestation,
  parseEximbayCanaryRuntimeReadback,
} from "../eximbay-refund-canary-producer-contract";

describe("Eximbay canary producer canonical authority", () => {
  it("reads only the exact committed runtime contract bytes", async () => {
    await expect(loadEximbayCanaryCommittedContractDigests(process.cwd())).resolves.toEqual({
      runtimeContractSha256: "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41",
      imagePolicySha256: "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf",
      preflightContractSha256: "c954c44e399f02121a95e99353f7eadf75377a1c425480249caa95695a737611",
      terraformMainSha256: "cf999dee26d30492a4ccc50ef6c7f09319189a71164f12dffedc2726d76424f9",
      terraformLocalsSha256: "f6350470adbf97e92c7d39e79483ed7b623a7b183e9a00802bd71231ab11ad62",
      terraformVariablesSha256: "7877c59acc0aa6841e2bf5f2b610375a530ff01cf1409deb502d7bbf59c1cebf",
    });
  });

  it("admits exactly two attended CLI commands with no amount, MID, or digest flags", () => {
    expect(parseEximbayCanaryProducerArgs([
      "materialize-target", "--payment-id", "payment-1", "--attestation", "attestation.json",
    ])).toEqual({
      command: "materialize-target", paymentId: "payment-1", attestationPath: "attestation.json",
    });
    expect(parseEximbayCanaryProducerArgs([
      "issue-approval", "--payment-id", "payment-1", "--attestation", "attestation.json",
      "--runtime-readback", "readback.json", "--issuer-principal", "operator@example.test",
    ])).toMatchObject({ command: "issue-approval", paymentId: "payment-1" });
    for (const args of [
      [],
      ["run"],
      ...["--freshness-ms", "--ignore-freshness", "--force", "--provider-order-id", "--provider-payment-key"].map(
        (flag) => ["materialize-target", "--payment-id", "payment-1", "--attestation", "a", flag, "1"],
      ),
      ["materialize-target", "--payment-id", "payment-1"],
      ["materialize-target", "--payment-id", "payment-1", "--attestation", "a", "--amount", "1"],
      ["issue-approval", "--payment-id", "payment-1", "--attestation", "a",
        "--runtime-readback", "r", "--issuer-principal", "p", "--mid", "wrong"],
    ]) {
      expect(() => parseEximbayCanaryProducerArgs(args)).toThrow("CLI_ARGUMENTS_INVALID");
    }
  });

  it("keeps the attended producer graph provider- and secret-payload-free", () => {
    const sources = [
      "scripts/eximbay-refund-canary-target-producer.ts",
      "src/lib/payment/refund/eximbay-refund-canary-target-producer.ts",
      "src/lib/payment/refund/issue-eximbay-refund-canary-approval.ts",
      "src/lib/payment/refund/eximbay-refund-canary-committed-contracts.ts",
      "src/lib/payment/refund/eximbay-refund-canary-producer-contract.ts",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");
    expect(sources).not.toMatch(/SecretManagerServiceClient|accessSecretVersion|\bfetch\s*\(/u);
    expect(sources).not.toMatch(/providers\/eximbay\/(?:adapter|client)|run-eximbay-refund-canary-once/u);
    expect(sources.match(/issueEximbayRefundCanaryApproval\(/gu)).toHaveLength(1);
    const cli = readFileSync(join(process.cwd(), "scripts/eximbay-refund-canary-target-producer.ts"), "utf8");
    expect(cli).not.toContain("issueEximbayRefundCanaryApproval");
    expect(cli).toContain("prepare-eximbay-refund-canary-admission-v2");
    expect(cli).toContain('operation === "issue-approval-v2"');
    expect(readFileSync(join(process.cwd(), "src/lib/payment/refund/claim.ts"), "utf8"))
      .not.toMatch(/issueEximbayRefundCanaryApproval|materializeEximbayRefundCanaryTarget/u);
  });

  it("derives stable exact merchant and credential-generation bindings", () => {
    const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId({
      provider: "EXIMBAY",
      mode: "SANDBOX",
      mid: EXIMBAY_CANARY_EXACT_MID,
    });
    const credentialGenerationBindingId = deriveEximbayCanaryCredentialGenerationBindingId({
      provider: "EXIMBAY",
      mode: "SANDBOX",
      mid: EXIMBAY_CANARY_EXACT_MID,
      secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
      secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
      merchantAccountBindingId,
    });

    expect(merchantAccountBindingId).toMatch(/^[0-9a-f]{64}$/u);
    expect(credentialGenerationBindingId).toMatch(/^[0-9a-f]{64}$/u);
    expect(merchantAccountBindingId).not.toBe(credentialGenerationBindingId);
    expect(deriveEximbayCanaryMerchantAccountBindingId({
      provider: "EXIMBAY",
      mode: "SANDBOX",
      mid: EXIMBAY_CANARY_EXACT_MID,
    })).toBe(merchantAccountBindingId);
  });

  it.each([
    ["wrong MID", { provider: "EXIMBAY", mode: "SANDBOX", mid: "1849705C65" }],
    ["LIVE", { provider: "EXIMBAY", mode: "LIVE", mid: EXIMBAY_CANARY_EXACT_MID }],
    ["wrong provider", { provider: "TOSS", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID }],
  ])("rejects %s from merchant authority", (_name, input) => {
    expect(() => deriveEximbayCanaryMerchantAccountBindingId(input)).toThrow(
      "EXIMBAY_CANARY_MERCHANT_AUTHORITY_INVALID",
    );
  });

  it.each([
    ["wrong secret", "projects/mira-refund-sandbox-0001/secrets/other", "1"],
    ["latest", EXIMBAY_CANARY_EXACT_SECRET_RESOURCE, "latest"],
    ["wrong version", EXIMBAY_CANARY_EXACT_SECRET_RESOURCE, "2"],
  ])("rejects credential generation using %s", (_name, secretResource, secretVersion) => {
    const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId({
      provider: "EXIMBAY",
      mode: "SANDBOX",
      mid: EXIMBAY_CANARY_EXACT_MID,
    });
    expect(() => deriveEximbayCanaryCredentialGenerationBindingId({
      provider: "EXIMBAY",
      mode: "SANDBOX",
      mid: EXIMBAY_CANARY_EXACT_MID,
      secretResource,
      secretVersion,
      merchantAccountBindingId,
    })).toThrow("EXIMBAY_CANARY_CREDENTIAL_AUTHORITY_INVALID");
  });

  it("accepts only the exact nonsecret attended attestation", () => {
    const exact = attestation();
    expect(parseEximbayCanaryAttestation(exact)).toEqual(exact);
    expect(parseEximbayCanaryAttestation({ ...exact, mid: "1849705C65" })).toBeNull();
    expect(parseEximbayCanaryAttestation({ ...exact, secretVersion: "latest" })).toBeNull();
    expect(parseEximbayCanaryAttestation({ ...exact, noCustomerPiiAttested: false })).toBeNull();
    expect(parseEximbayCanaryAttestation({ ...exact, precomputedDigest: "a".repeat(64) })).toBeNull();
  });

  it("derives every runtime digest and admits only an exact dormant readback", () => {
    const merchantAccountBindingId = deriveEximbayCanaryMerchantAccountBindingId({
      provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
    });
    const credentialGenerationBindingId = deriveEximbayCanaryCredentialGenerationBindingId({
      provider: "EXIMBAY", mode: "SANDBOX", mid: EXIMBAY_CANARY_EXACT_MID,
      secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
      secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
      merchantAccountBindingId,
    });
    const authority = deriveEximbayCanaryRuntimeBindings(contractDigests(), {
      targetBindingDigest: "a".repeat(64),
      syntheticProvenanceDigest: "b".repeat(64),
      merchantAccountBindingId,
      credentialGenerationBindingId,
    });
    expect(Object.values(authority).every((value) => /^[0-9a-f]{64}$/u.test(value))).toBe(true);

    const exact = runtimeReadback(authority);
    expect(parseEximbayCanaryRuntimeReadback(exact, authority)).toEqual(exact);
    expect(parseEximbayCanaryRuntimeReadback({ ...exact, executionCount: 1 }, authority)).toBeNull();
    expect(parseEximbayCanaryRuntimeReadback({ ...exact, mid: "1849705C65" }, authority)).toBeNull();
    expect(parseEximbayCanaryRuntimeReadback({
      ...exact,
      authority: { ...exact.authority, targetBindingDigest: "c".repeat(64) },
    }, authority)).toBeNull();
    expect(() => deriveEximbayCanaryRuntimeBindings({
      ...contractDigests(), runtimeContractSha256: "0".repeat(64),
    }, authority)).toThrow("EXIMBAY_CANARY_RUNTIME_BINDING_INPUT_INVALID");
  });
});

function attestation() {
  return Object.freeze({
    formatVersion: "mira-refund-eximbay-canary-attestation/v1",
    provider: "EXIMBAY",
    mode: "SANDBOX",
    mid: EXIMBAY_CANARY_EXACT_MID,
    secretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    secretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    officialTestCredentialMaterialized: true,
    syntheticIdentityAttested: true,
    controlledNonCustomerContactAttested: true,
    noCustomerPiiAttested: true,
  });
}

function contractDigests() {
  return EXIMBAY_CANARY_EXACT_CONTRACT_DIGESTS;
}

function runtimeReadback(authority: ReturnType<typeof deriveEximbayCanaryRuntimeBindings>) {
  return Object.freeze({
    formatVersion: "mira-refund-eximbay-canary-runtime-readback/v1",
    projectId: "mira-refund-sandbox-0001",
    region: "asia-northeast3",
    jobName: "mira-eximbay-refund-canary",
    jobUid: "12345678-1234-1234-1234-123456789abc",
    jobGeneration: "1",
    serviceAccountEmail: "mira-eximbay-canary@mira-refund-sandbox-0001.iam.gserviceaccount.com",
    imageDigestUri: "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:f3bbc000423588905c19507fcabb52e475923c1fcf1d0d03ffe5ac6b1d9fa691",
    arguments: Object.freeze(["eximbay-canary-once"]),
    taskCount: 1,
    parallelism: 1,
    maxRetries: 0,
    taskTimeoutSeconds: 150,
    automaticTrigger: false,
    executionCount: 0,
    resourceCount: 5,
    cloudSqlClientCondition: "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'",
    databaseSecretAccessor: true,
    providerSecretAccessor: true,
    invokerBindingCount: 0,
    schedulerTargetCount: 0,
    providerContactAuthorized: false,
    databaseSecretId: "mira-p3e-sbx-canary-database-url",
    databaseSecretVersion: "1",
    providerSecretResource: EXIMBAY_CANARY_EXACT_SECRET_RESOURCE,
    providerSecretVersion: EXIMBAY_CANARY_EXACT_SECRET_VERSION,
    mid: EXIMBAY_CANARY_EXACT_MID,
    authority,
  });
}
import { readFileSync } from "node:fs";
import { join } from "node:path";
