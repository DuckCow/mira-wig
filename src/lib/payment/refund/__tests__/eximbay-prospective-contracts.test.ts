import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { historicalCustodyFixture, artifactBytes, sha256 } from "./canary-custody-contract-fixture";
import { deriveEximbayCanaryJobV2, EXIMBAY_CANARY_JOB_V2 } from "../eximbay-refund-canary-job-v2";
import { parseEximbayRefundCanaryFreshSaleCustodyV3Bytes } from "../eximbay-refund-canary-fresh-sale-custody-v3";
import { approvalAuthorityDigestV2, EXIMBAY_CANARY_CUSTODY_V3 } from "../eximbay-refund-canary-approval-v2";
import { verifyEximbayCanonicalDeployment } from "../eximbay-refund-canonical-deployment";
import { loadEximbayCanaryCommittedContractDigests } from "../eximbay-refund-canary-committed-contracts";
import { loadRefundWorkerMigrationInventory } from "../worker-migration-inventory";
import { requireCanonicalMigrationInventory } from "../canonical-migration-inventory";
import manifest from "./fixtures/historical-pl-contracts/manifest.json";
import { prospectiveAttestation } from "./prospective-canary-attestation";

function custody() {
  return { ...historicalCustodyFixture(), ...deriveEximbayCanaryJobV2(),
    contractVersion: EXIMBAY_CANARY_CUSTODY_V3, jobContractVersion: EXIMBAY_CANARY_JOB_V2,
    syntheticProvenanceDigest: "e".repeat(64), noCustomerPiiAttested: true,
    attendedAttestation: prospectiveAttestation };
}

describe("explicit historical and prospective canary contracts", () => {
  it("verifies every historical PL byte without granting execution authority", async () => {
    expect(manifest.executionAuthority).toBe(false);
    for (const entry of manifest.entries) {
      const bytes = await readFile(resolve(entry.fixturePath));
      expect(sha256(bytes)).toBe(entry.sha256);
    }
    await expect(loadEximbayCanaryCommittedContractDigests(process.cwd())).resolves.toBeDefined();
    await expect(verifyEximbayCanonicalDeployment(process.cwd())).resolves.toBeUndefined();
  });
  it("binds the prospective exact inventory, rejecting historical and same-count drift", async () => {
    const inventory = await loadRefundWorkerMigrationInventory();
    expect(() => requireCanonicalMigrationInventory(inventory)).not.toThrow();
    expect(() => requireCanonicalMigrationInventory({ ...inventory, entries: inventory.entries.slice(1) })).toThrow();
    expect(() => requireCanonicalMigrationInventory({ ...inventory, migrationDigest: "0".repeat(64) })).toThrow();
  });
  it("has a target-independent job and accepts exact custody/v3 bytes", () => {
    const value = custody();
    const bytes = artifactBytes(value);
    expect(parseEximbayRefundCanaryFreshSaleCustodyV3Bytes(bytes, sha256(bytes))).toEqual(value);
    const changedTarget = artifactBytes({ ...value, paymentId: "other-payment" });
    expect(sha256(changedTarget)).not.toBe(sha256(bytes));
    expect(deriveEximbayCanaryJobV2()).toEqual(deriveEximbayCanaryJobV2());
    expect(Object.keys(deriveEximbayCanaryJobV2())).not.toContain("targetBindingDigest");
  });
  it.each(["jobContractVersion", "canaryJobBindingDigest", "syntheticProvenanceDigest", "noCustomerPiiAttested", "attendedAttestation"])(
    "rejects custody missing or invalid %s", (key) => {
      const bytes = artifactBytes({ ...custody(), [key]: null });
      expect(parseEximbayRefundCanaryFreshSaleCustodyV3Bytes(bytes, sha256(bytes))).toBeNull();
    });
  it("rejects duplicate keys, old versions, and changed bytes under the original custody hash", () => {
    const bytes = artifactBytes(custody());
    expect(parseEximbayRefundCanaryFreshSaleCustodyV3Bytes(Buffer.concat([bytes, Buffer.from(" ")]), sha256(bytes))).toBeNull();
    const duplicate = Buffer.from(bytes.toString().replace('"paymentId":', '"paymentId":"other","paymentId":'));
    expect(parseEximbayRefundCanaryFreshSaleCustodyV3Bytes(duplicate, sha256(duplicate))).toBeNull();
    const old = artifactBytes(historicalCustodyFixture());
    expect(parseEximbayRefundCanaryFreshSaleCustodyV3Bytes(old, sha256(old))).toBeNull();
  });
  it("approval authority binds every financial and issuance input separately from custody bytes", () => {
    const facts = { ...deriveEximbayCanaryJobV2(), id: "approval", commandId: "command",
      targetBindingDigest: "a".repeat(64), custodyArtifactSha256: "b".repeat(64),
      syntheticProvenanceDigest: "c".repeat(64), noCustomerPiiAttested: true as const,
      issuedByPrincipalId: "postgres-session/v1:issuer", approvedAt: new Date("2026-09-16T00:00:00Z"),
      expiresAt: new Date("2026-09-16T00:15:00Z") };
    const digest = approvalAuthorityDigestV2(facts);
    expect(digest).not.toBe(facts.custodyArtifactSha256);
    for (const key of ["id", "commandId", "targetBindingDigest", "custodyArtifactSha256", "syntheticProvenanceDigest",
      "merchantAccountBindingId", "credentialGenerationBindingId", "canaryJobBindingDigest", "releaseBindingDigest",
      "preflightJobBindingDigest", "imageBindingDigest", "secretGenerationBindingDigest"]) {
      expect(approvalAuthorityDigestV2({ ...facts, [key]: "f".repeat(64) })).not.toBe(digest);
    }
    expect(() => approvalAuthorityDigestV2({ ...facts, issuedByPrincipalId: "claimed-operator" })).toThrow();
    expect(() => approvalAuthorityDigestV2({ ...facts, expiresAt: facts.approvedAt })).toThrow();
  });
});
