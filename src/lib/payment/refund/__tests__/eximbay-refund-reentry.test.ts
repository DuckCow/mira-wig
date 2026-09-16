import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { EXIMBAY_REFUND_REENTRY_TARGET } from "../eximbay-refund-reentry-authority";
import {
  runEximbayRefundReentryOnce,
  type EximbayRefundReentryResult,
} from "../run-eximbay-refund-reentry-once";

describe("exact Eximbay refund re-entry authority", () => {
  it("freezes the retained target, consumed seal, predecessor fence, and provider binding", () => {
    expect(EXIMBAY_REFUND_REENTRY_TARGET).toMatchObject({
      paymentId: "cmtsdmk16000201s6alc0evek",
      orderId: "cmtsdmo8r000401s671x1chsp",
      refundAttemptId: "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8",
      commandId: "cmtsdrrxk00010ss6we7g8qe7",
      providerOperationBindingId: "cmtsdrs0900030ss6qwxcgar6",
      approvalId: "eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc",
      targetBindingDigest: "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c",
      consumedExecutionId: "cloud-run-0899eaa6e48ed3578f7c1ae2427ce00c",
      predecessorLeaseGeneration: 2,
      predecessorLeaseDurationMs: 300_000,
      amount: 100,
      currency: "USD",
    });
  });

  it("stops before database, secret, or provider capability for a malformed runtime", async () => {
    const createDatabase = vi.fn();
    const readSecret = vi.fn();
    const fetch = vi.fn();
    const result = await runEximbayRefundReentryOnce({}, {
      createDatabase,
      disconnectDatabase: vi.fn(),
      admit: vi.fn(),
      readSecret,
      fetch,
      runAdmission: vi.fn(),
    });
    expect(result).toMatchObject({
      ok: false,
      code: "CONFIG_MISMATCH",
      preflightRetrieveCount: 0,
      reconciliationLookupCount: 0,
      cancellationCount: 0,
    });
    expect(createDatabase).not.toHaveBeenCalled();
    expect(readSecret).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops before credentials when authenticated admission rejects the grant", async () => {
    const admit = vi.fn(() => Promise.reject(new Error("AUTHORIZATION_REJECTED")));
    const readSecret = vi.fn();
    const fetch = vi.fn();
    const result = await runEximbayRefundReentryOnce(reentryEnvironment(), {
      createDatabase: () => db,
      disconnectDatabase: () => Promise.resolve(),
      admit,
      readSecret,
      fetch,
      runAdmission: async (_env, operation) => ({ outcome: "ACQUIRED", result: await operation() }),
    });
    expect(result.code).toBe("INTERNAL_FAILURE");
    expect(admit).toHaveBeenCalledTimes(1);
    expect(readSecret).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const source = readFileSync(join(
      process.cwd(), "src/lib/payment/refund/run-eximbay-refund-reentry-once.ts",
    ), "utf8");
    expect(source).not.toContain("consumeEximbayRefundCanaryApproval");
    expect(source).not.toMatch(/consumedAt\s*:\s*null|APPROVAL_ALREADY_CONSUMED/u);
  });

  it("preserves trustworthy effect counters through both cleanup failures", async () => {
    const protectedResult = operationResult({
      ok: false,
      code: "CANCEL_CONTACT_MAY_HAVE_OCCURRED",
      terminalClass: "PROVIDER_EFFECT_POSSIBLE",
      preflightRetrieveCount: 1,
      cancellationCount: 1,
    });
    const result = await runEximbayRefundReentryOnce(reentryEnvironment(), {
      createDatabase: () => db,
      disconnectDatabase: () => Promise.reject(new Error("SYNTHETIC_DISCONNECT_FAILURE")),
      admit: vi.fn(),
      readSecret: vi.fn(),
      fetch: vi.fn(),
      runAdmission: () => Promise.resolve({
        outcome: "ADMISSION_CLEANUP_FAILED",
        result: protectedResult,
      }),
    });
    expect(result).toEqual({
      ...protectedResult,
      cleanupFailures: ["ADMISSION_CLEANUP_FAILED", "DATABASE_DISCONNECT_FAILED"],
    });
  });

  it("continues the admitted lease once without target-specific reclaim, retry or R2", () => {
    const source = readFileSync(join(
      process.cwd(), "src/lib/payment/refund/run-eximbay-refund-reentry-once.ts",
    ), "utf8");
    expect(source).toContain("continueLeasedEximbayRefundExecution(database, admitted.lease");
    expect(source).not.toContain("EXIMBAY_REFUND_REENTRY_TARGET");
    expect(source).not.toContain("reclaimUncontacted");
    expect(source).not.toMatch(/\bwhile\s*\(|\bfor\s*\(|dependencies\.sleep/u);
    expect(source).not.toContain('candidateClass: "CONTACTED"');
    expect(source).not.toContain("R2_AUTHORIZED");

    const processSource = readFileSync(join(
      process.cwd(), "scripts/eximbay-refund-reentry.ts",
    ), "utf8");
    expect(processSource).toContain("process.stdout.write(line)");
    expect(processSource).not.toMatch(/result\.ok.*process\.stdout.*process\.stderr/u);
  });
});

function operationResult(input: Readonly<{
  ok: false;
  code: "CANCEL_CONTACT_MAY_HAVE_OCCURRED";
  terminalClass: "PROVIDER_EFFECT_POSSIBLE";
  preflightRetrieveCount: 1;
  cancellationCount: 1;
}>): EximbayRefundReentryResult {
  return Object.freeze({
    schema: "mira-refund-eximbay-reentry-result/v1",
    ...input,
    reconciliationLookupCount: 0,
    reentry: "FORBIDDEN",
    cleanupFailures: Object.freeze([]),
  });
}

function reentryEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    MIRA_REFUND_AUTHORIZATION_ENABLED: "ENABLED",
    DATABASE_URL: "postgresql://fixture:fixture@localhost:5432/refund_sandbox",
    MIRA_REFUND_EXIMBAY_CANARY_LANE: "EXIMBAY_SANDBOX_V1",
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.releaseBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.canaryJobBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.preflightJobBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.imageBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.secretGenerationBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.targetBindingDigest,
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST:
      EXIMBAY_REFUND_REENTRY_TARGET.syntheticProvenanceDigest,
    MIRA_REFUND_EXIMBAY_CANARY_NO_CUSTOMER_PII_ATTESTED: "TRUE",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE:
      "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key",
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
    EXIMBAY_SANDBOX_MID: "1849705C64",
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING:
      EXIMBAY_REFUND_REENTRY_TARGET.merchantAccountBindingId,
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING:
      EXIMBAY_REFUND_REENTRY_TARGET.credentialGenerationBindingId,
    REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
    REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
    CLOUD_RUN_JOB: "mira-eximbay-refund-canary",
    CLOUD_RUN_EXECUTION: "reentry-test-execution",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  });
}
