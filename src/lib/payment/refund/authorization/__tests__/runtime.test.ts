import { describe, expect, it, vi } from "vitest";
import { VerifiedRefundExecution } from "../runtime";
import { parseRefundReentryRelease, templateForGrant, sameJson } from "../release";
import { readAuthorizationJson } from "../json-body";
import { parseAdmissionReceipt, requestRefundAuthorizationAdmission } from "../worker-client";
import { calculateEximbayCanaryTargetDigest } from "../../eximbay-refund-canary-target-binding";
import { release, runtimePort } from "./fixture";

const grantId = "synthetic-grant";
const executionName = `${release.jobName}/executions/synthetic-run`;

describe("server-owned execution identity and bounded HTTP data", () => {
  it("requires signed Google identity before consulting immutable execution configuration", async () => {
    const port = runtimePort(grantId, executionName);
    expect(await VerifiedRefundExecution.verify("signed-token", executionName, grantId, release, port)).toMatchObject({ principalId: release.serviceAccountSubject, grantId });
    const getExecution = vi.fn(port.getExecution);
    await expect(VerifiedRefundExecution.verify("forged-token", executionName, grantId, release, {
      verifyIdToken: () => Promise.reject(new Error("SDK request with secret bearer")), getExecution,
      listExecutionTasks: vi.fn(),
    })).rejects.toThrow(/^EXECUTION_UNVERIFIED$/u);
    expect(getExecution).not.toHaveBeenCalled();
  });

  it.each([
    { sub: "some-other-service-account" }, { aud: "https://evil.example.test" }, { iss: "evil" },
    { email: "other@example.test" }, { email_verified: false }, { exp: 1 },
  ])("rejects identity drift %j", async (changed) => {
    const port = runtimePort(grantId, executionName);
    const original = await port.verifyIdToken("", "");
    if (typeof original !== "object" || original === null) throw new Error("TEST_IDENTITY_REQUIRED");
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, verifyIdToken: () => Promise.resolve({ ...original, ...changed }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it.each([
    { taskCount: 2 }, { parallelism: 2 }, { uid: "fake" }, { name: `${executionName}-other` },
    { completionTime: "2026-09-09T00:00:00Z" }, { deleteTime: "2026-09-09T00:00:00Z" },
    { template: { maxRetries: 1 } }, { template: templateForGrant(release, "different-grant") },
  ])("rejects execution/template drift %j", async (changed) => {
    const port = runtimePort(grantId, executionName);
    const original = await port.getExecution(executionName);
    if (typeof original !== "object" || original === null) throw new Error("TEST_EXECUTION_REQUIRED");
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, getExecution: () => Promise.resolve({ ...original, ...changed }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("accepts Execution without vpcAccess only when its sole Task proves the reviewed VPC", async () => {
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, port)).resolves.toMatchObject({ grantId });
  });

  it.each([
    { tasks: [{ execution: executionName, index: 0, vpcAccess: { egress: "ALL_TRAFFIC" } }] },
    { tasks: [{ execution: executionName, index: 0 }] },
    { tasks: [] },
  ])("fails closed when Task VPC evidence is insufficient or wrong", async (taskReadback) => {
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, listExecutionTasks: () => Promise.resolve(taskReadback),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("rejects another job before external access and compares every reviewed template field", async () => {
    const port = { verifyIdToken: vi.fn(), getExecution: vi.fn(), listExecutionTasks: vi.fn() };
    await expect(VerifiedRefundExecution.verify("token", "projects/other/locations/a/jobs/b/executions/c", grantId, release, port)).rejects.toThrow();
    expect(port.verifyIdToken).not.toHaveBeenCalled();
    expect(sameJson(templateForGrant(release, grantId), { ...release.executionTemplate, timeout: "3600s" })).toBe(false);
    expect(sameJson({ resource: "secret-1", version: "1" }, { version: "1", resource: "secret-1" })).toBe(true);
    expect(sameJson({ resource: "secret-1", version: "1" }, { resource: "secret-1", version: "latest" })).toBe(false);
    expect(() => parseRefundReentryRelease({}, release.digest)).toThrow("CONFIG_INVALID");
  });

  it("bounds and validates request/response streams and keeps the client OFF by default", async () => {
    await expect(readAuthorizationJson(new Request(release.audience, { method: "POST", body: "x".repeat(4097) }))).rejects.toThrow("INVALID_INPUT");
    await expect(readAuthorizationJson(new Request(release.audience, { method: "POST", body: "{" }))).rejects.toThrow("INVALID_INPUT");
    await expect(readAuthorizationJson(new Request(release.audience, { method: "POST", body: '{"id":"ok"}' }))).resolves.toEqual({ id: "ok" });
    await expect(requestRefundAuthorizationAdmission({})).rejects.toThrow("FEATURE_DISABLED");
    expect(() => parseAdmissionReceipt({ ok: true, grantId: "different" }, grantId)).toThrow("PERSISTENCE_CONFLICT");
  });
});

describe("unchanged canary target-v1 golden bytes", () => {
  it("retains the historical READY and ordinal-zero preimage", () => {
    expect(calculateEximbayCanaryTargetDigest({ commandId: "command-1", refundAttemptId: "refund-1", paymentId: "payment-1",
      providerOperationBindingId: "binding-1", amount: 100, currency: "USD", idempotencyKey: "refund:payment-1:refund-1",
      providerOrderId: "c000000000000000000000000", providerPaymentKey: "transaction-1", financialSucceededAt: new Date("2026-08-01T00:00:00.000Z"),
      providerOperationFamilyKey: "family-1", operationFamilyFingerprint: "f".repeat(64), merchantAccountBindingId: "merchant-v1",
      credentialGenerationBindingId: "credential-v1", syntheticProvenanceDigest: "a".repeat(64),
    })).toBe("26f41f76f0aa01597a4bbd177f7089cd1ac6fc70ace03206d3bd0123afbe2750");
  });
});
