import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateEximbayRefundSandboxCanaryEvidence,
  EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION,
} from "../eximbay-refund-sandbox-canary-approval-contract";
import { parseEximbayRefundCanaryEnvironment } from "../eximbay-refund-canary-environment";
import { exactEximbayRefundCanarySecretName } from "../eximbay-refund-canary-secret-contract";
import { readExactEximbayRefundCanarySecret } from "../eximbay-refund-canary-secret-reader";
import {
  defaultEximbayRefundCanaryDependencies,
  runEximbayRefundCanaryOnce,
  type EximbayRefundCanaryResult,
} from "../run-eximbay-refund-canary-once";

describe("Eximbay refund sandbox canary authority boundaries", () => {
  it("purely admits only the separate exact Eximbay evidence format", () => {
    const accepted = evaluateEximbayRefundSandboxCanaryEvidence(evidence());
    expect(accepted).toMatchObject({
      ok: true,
      code: "EVIDENCE_ACCEPTED",
      executionAuthorization: "NOT_ISSUED",
    });
    expect(accepted.approvalEvidenceDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(evaluateEximbayRefundSandboxCanaryEvidence({
      ...evidence(), formatVersion: "mira-refund-sandbox-canary-evidence/v1",
    })).toEqual({
      ok: false, code: "EVIDENCE_REJECTED", approvalEvidenceDigest: null,
      executionAuthorization: "NOT_ISSUED",
    });
    expect(evaluateEximbayRefundSandboxCanaryEvidence({
      ...evidence(), provider: "TOSS",
    }).ok).toBe(false);
  });

  it("admits only the exact pinned lane and rejects mixed/direct credential surfaces", () => {
    const valid = canaryEnvironment();
    expect(parseEximbayRefundCanaryEnvironment(valid)).toMatchObject({
      lane: "EXIMBAY_SANDBOX_V1",
      secretVersion: "7",
    });
    for (const mutation of [
      { EXIMBAY_SANDBOX_API_KEY: "secret" },
      { TOSS_SECRET_KEY: "secret" },
      { REFUND_EXECUTION_TOSS_CONTACT_ENABLED: "ENABLED" },
      { REFUND_EXECUTION_CLAIM_ENABLED: "ENABLED" },
      { MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "latest" },
      { CLOUD_RUN_TASK_ATTEMPT: "1" },
    ]) {
      expect(parseEximbayRefundCanaryEnvironment({ ...valid, ...mutation })).toBeNull();
    }
  });

  it("requests exactly one numeric Secret Manager version through an injected client", async () => {
    const accessSecretVersion = vi.fn(() => Promise.resolve([{
      payload: { data: Buffer.from("fixture-key", "utf8") },
    }] as const));
    await expect(readExactEximbayRefundCanarySecret({
      resource: "projects/mira-sbx1/secrets/eximbay-canary-key", version: "7",
    }, { accessSecretVersion })).resolves.toBe("fixture-key");
    expect(accessSecretVersion).toHaveBeenCalledWith({
      name: "projects/mira-sbx1/secrets/eximbay-canary-key/versions/7",
    });
    expect(exactEximbayRefundCanarySecretName({
      resource: "projects/mira-sbx1/secrets/eximbay-canary-key", version: "latest",
    })).toBeNull();
  });

  it("fails before database, secret, or provider capability on malformed authority", async () => {
    const createDatabase = vi.fn();
    const readSecret = vi.fn();
    const fetch = vi.fn();
    await expect(runEximbayRefundCanaryOnce({}, {
      createDatabase,
      disconnectDatabase: vi.fn(),
      readSecret,
      fetch,
      runAdmission: defaultEximbayRefundCanaryDependencies.runAdmission,
    })).resolves.toMatchObject({ code: "CONFIG_MISMATCH" });
    expect(createDatabase).not.toHaveBeenCalled();
    expect(readSecret).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["no provider contact", operation(false, "NO_PROVIDER_CONTACT", 0, 0, 0)],
    ["retrieve contact", operation(false, "RETRIEVE_CONTACTED", 1, 0, 0)],
    ["retrieve possible", possible("RETRIEVE_CONTACT_POSSIBLE", 1, 0, 0)],
    ["lookup possible", possible("RETRIEVE_CONTACT_POSSIBLE", 1, 1, 0)],
    ["cancellation possible", possible("CANCEL_CONTACT_MAY_HAVE_OCCURRED", 1, 1, 1)],
  ] as const)("preserves %s through advisory unlock failure", async (_name, protectedResult) => {
    const result = await runWithSyntheticCleanup(protectedResult, "admission");
    expect(result).toEqual({
      ...protectedResult,
      cleanupFailures: ["ADMISSION_CLEANUP_FAILED"],
    });
  });

  it("preserves provider contact when the acquired admission client close fails", async () => {
    const protectedResult = possible("RETRIEVE_CONTACT_POSSIBLE", 1, 1, 0);
    await expect(runWithSyntheticCleanup(protectedResult, "admission")).resolves.toEqual({
      ...protectedResult,
      cleanupFailures: ["ADMISSION_CLEANUP_FAILED"],
    });
  });

  it.each([
    ["possible provider contact", possible("CANCEL_CONTACT_MAY_HAVE_OCCURRED", 1, 1, 1)],
    ["exact known success", operation(true, "KNOWN_SUCCESS", 1, 0, 1)],
  ] as const)("preserves %s through Prisma disconnect failure", async (_name, protectedResult) => {
    const result = await runWithSyntheticCleanup(protectedResult, "disconnect");
    expect(result).toEqual({
      ...protectedResult,
      cleanupFailures: ["DATABASE_DISCONNECT_FAILED"],
    });
  });

  it("retains nonzero counters and reconciliation re-entry across both cleanup failures", async () => {
    const protectedResult = possible("CANCEL_CONTACT_MAY_HAVE_OCCURRED", 2, 3, 4);
    const result = await runWithSyntheticCleanup(protectedResult, "both");
    expect(result).toEqual({
      ...protectedResult,
      cleanupFailures: ["ADMISSION_CLEANUP_FAILED", "DATABASE_DISCONNECT_FAILED"],
    });
    expect(result.reentry).toBe("SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED");
  });

  it.each([
    [operation(false, "NO_PROVIDER_CONTACT", 0, 0, 0)],
    [operation(true, "KNOWN_SUCCESS", 1, 0, 1)],
  ] as const)("keeps ordinary clean operation behavior unchanged", async (protectedResult) => {
    await expect(runWithSyntheticCleanup(protectedResult, "none")).resolves.toEqual(
      protectedResult,
    );
  });
});

function operation(
  ok: boolean,
  code: EximbayRefundCanaryResult["code"],
  preflightRetrieveCount: number,
  reconciliationLookupCount: number,
  cancellationCount: number,
): EximbayRefundCanaryResult {
  return Object.freeze({
    ok,
    code,
    preflightRetrieveCount,
    reconciliationLookupCount,
    cancellationCount,
  });
}

function possible(
  code: EximbayRefundCanaryResult["code"],
  preflightRetrieveCount: number,
  reconciliationLookupCount: number,
  cancellationCount: number,
): EximbayRefundCanaryResult {
  return Object.freeze({
    ...operation(false, code, preflightRetrieveCount, reconciliationLookupCount, cancellationCount),
    reentry: "SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED",
  });
}

function runWithSyntheticCleanup(
  protectedResult: EximbayRefundCanaryResult,
  cleanup: "admission" | "disconnect" | "both" | "none",
): Promise<EximbayRefundCanaryResult> {
  return runEximbayRefundCanaryOnce(canaryEnvironment(), {
    ...defaultEximbayRefundCanaryDependencies,
    disconnectDatabase: cleanup === "disconnect" || cleanup === "both"
      ? () => Promise.reject(new Error("SYNTHETIC_DISCONNECT_FAILURE"))
      : () => Promise.resolve(),
    runAdmission: () => Promise.resolve(
      cleanup === "admission" || cleanup === "both"
        ? Object.freeze({ outcome: "ADMISSION_CLEANUP_FAILED", result: protectedResult })
        : Object.freeze({ outcome: "ACQUIRED", result: protectedResult }),
    ),
  });
}

function evidence() {
  const digest = "a".repeat(64);
  return {
    formatVersion: EXIMBAY_REFUND_SANDBOX_CANARY_EVIDENCE_VERSION,
    provider: "EXIMBAY",
    mode: "SANDBOX",
    trigger: "MANUAL_ONLY",
    intendedExecutionLimit: 1,
    releaseBindingDigest: digest,
    canaryJobBindingDigest: digest,
    preflightJobBindingDigest: digest,
    imageBindingDigest: digest,
    secretGenerationBindingDigest: digest,
    targetBindingDigest: digest,
  } as const;
}

function canaryEnvironment(): Record<string, string> {
  const secretResource = "projects/mira-sbx1/secrets/eximbay-canary-key";
  const secretVersion = "7";
  const credential = "credential-v1";
  const secretDigest = sha256(JSON.stringify([
    "mira-refund-eximbay-canary-secret-generation/v1",
    secretResource, secretVersion, credential,
  ]));
  return {
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/refund_sandbox",
    MIRA_REFUND_EXIMBAY_CANARY_LANE: "EXIMBAY_SANDBOX_V1",
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST: "a".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST: "b".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST: "c".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST: "d".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST: secretDigest,
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST: "e".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST: "f".repeat(64),
    MIRA_REFUND_EXIMBAY_CANARY_NO_CUSTOMER_PII_ATTESTED: "TRUE",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE: secretResource,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: secretVersion,
    EXIMBAY_SANDBOX_MID: "MIRA-SBX",
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-v1",
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING: credential,
    REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
    REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
    CLOUD_RUN_JOB: "job-1",
    CLOUD_RUN_EXECUTION: "execution-1",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
