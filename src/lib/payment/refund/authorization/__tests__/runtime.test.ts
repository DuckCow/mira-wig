import { describe, expect, it, vi } from "vitest";
import { createGoogleRuntimeIdentity, RefundExecutionVerificationError, VerifiedRefundExecution } from "../runtime";
import { parseRefundReentryRelease, templateForGrant, sameJson } from "../release";
import { readAuthorizationJson } from "../json-body";
import { parseAdmissionReceipt, requestRefundAuthorizationAdmission } from "../worker-client";
import { calculateEximbayCanaryTargetDigest } from "../../eximbay-refund-canary-target-binding";
import { release, runtimePort, rvhbhLiveShapedRuntimePort } from "./fixture";

const grantId = "synthetic-grant";
const executionName = `${release.jobName}/executions/synthetic-run`;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function executionTemplateFor(releaseValue: typeof release, id = grantId): Record<string, unknown> {
  const template = templateForGrant(releaseValue, id);
  if (!record(template)) throw new Error("TEST_TEMPLATE_REQUIRED");
  const { vpcAccess: _vpcAccess, ...executionTemplate } = template;
  return executionTemplate;
}

function templateWithEnvironment(releaseValue: typeof release, entries: unknown[], id = grantId): Record<string, unknown> {
  const template = executionTemplateFor(releaseValue, id);
  if (!Array.isArray(template.containers) || template.containers.length !== 1 || !record(template.containers[0])) throw new Error("TEST_CONTAINER_REQUIRED");
  return { ...template, containers: [{ ...template.containers[0], env: entries }] };
}

function templateWithContainer(releaseValue: typeof release, changed: Record<string, unknown>): Record<string, unknown> {
  const template = executionTemplateFor(releaseValue);
  if (!Array.isArray(template.containers) || template.containers.length !== 1 || !record(template.containers[0])) throw new Error("TEST_CONTAINER_REQUIRED");
  return { ...template, containers: [{ ...template.containers[0], ...changed }] };
}

async function verifyExecutionTemplate(template: Record<string, unknown>, releaseValue = release) {
  const port = runtimePort(grantId, executionName);
  const original = await port.getExecution(executionName);
  if (!record(original)) throw new Error("TEST_EXECUTION_REQUIRED");
  return VerifiedRefundExecution.verify("token", executionName, grantId, releaseValue, {
    ...port, getExecution: () => Promise.resolve({ ...original, template }),
  });
}

function environmentFor(releaseValue = release, id = grantId): unknown[] {
  const template = executionTemplateFor(releaseValue, id);
  if (!Array.isArray(template.containers) || template.containers.length !== 1 || !record(template.containers[0]) || !Array.isArray(template.containers[0].env)) {
    throw new Error("TEST_ENV_REQUIRED");
  }
  return template.containers[0].env;
}

describe("server-owned execution identity and bounded HTTP data", () => {
  it("requires signed Google identity before consulting immutable execution configuration", async () => {
    const port = runtimePort(grantId, executionName);
    expect(await VerifiedRefundExecution.verify("signed-token", executionName, grantId, release, port)).toMatchObject({ principalId: release.serviceAccountSubject, grantId });
    const getExecution = vi.fn(port.getExecution);
    await expect(VerifiedRefundExecution.verify("forged-token", executionName, grantId, release, {
      verifyIdToken: () => Promise.reject(new Error("SDK request with secret bearer")), getExecution,
    })).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "TOKEN_VERIFICATION" } satisfies Partial<RefundExecutionVerificationError>);
    expect(getExecution).not.toHaveBeenCalled();
  });

  it("distinguishes execution read failure from execution identity/template mismatch without changing its public code", async () => {
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, getExecution: () => Promise.reject(new Error("synthetic execution read failure")),
    })).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "EXECUTION_LOOKUP" } satisfies Partial<RefundExecutionVerificationError>);

    const execution = await port.getExecution(executionName);
    if (!record(execution)) throw new Error("TEST_EXECUTION_REQUIRED");
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, getExecution: () => Promise.resolve({ ...execution, taskCount: 2 }),
    })).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "EXECUTION_VERIFICATION" } satisfies Partial<RefundExecutionVerificationError>);
  });

  it("exposes only OIDC and Execution GET seams and verifies without a Task API owner", async () => {
    const port = runtimePort(grantId, executionName);
    expect(Object.keys(port).sort()).toEqual(["getExecution", "verifyIdToken"]);
    expect(Object.keys(createGoogleRuntimeIdentity()).sort()).toEqual(["getExecution", "verifyIdToken"]);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, port)).resolves.toMatchObject({ grantId });
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

  it.each([
    ["service account", { ...executionTemplateFor(release), serviceAccount: "other@synthetic-refund-test.iam.gserviceaccount.com" }],
    ["max retries", { ...executionTemplateFor(release), maxRetries: 1 }],
    ["timeout", { ...executionTemplateFor(release), timeout: "181s" }],
    ["image", templateWithContainer(release, { image: `example.test/other@sha256:${"c".repeat(64)}` })],
    ["resources", templateWithContainer(release, { resources: { limits: { cpu: "2", memory: "512Mi" } } })],
  ])("rejects material Execution template drift in %s", async (_field, template) => {
    await expect(verifyExecutionTemplate(template)).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("accepts semantically identical unique env entries in a different order", async () => {
    const env = environmentFor();
    await expect(verifyExecutionTemplate(templateWithEnvironment(release, env))).resolves.toMatchObject({ grantId });
    await expect(verifyExecutionTemplate(templateWithEnvironment(release, [...env.slice(1), env[0]]))).resolves.toMatchObject({ grantId });
  });

  it.each([
    ["changed literal", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "MIRA_REFUND_AUTHORIZATION_ENABLED" ? { ...entry, value: "DISABLED" } : entry)],
    ["missing name", (env: unknown[]) => env.filter((entry) => !record(entry) || entry.name !== "REFUND_EXECUTION_LEASE_ENABLED")],
    ["extra name", (env: unknown[]) => [...env, { name: "UNREVIEWED", value: "ENABLED" }]],
    ["duplicate observed name", (env: unknown[]) => [...env, env[0]]],
    ["literal replaced by secret reference", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "MIRA_REFUND_AUTHORIZATION_ENABLED" ? { name: entry.name, valueSource: { secretKeyRef: { secret: "test-db", version: "1" } } } : entry)],
    ["secret reference replaced by literal", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "DATABASE_URL" ? { name: entry.name, value: "postgresql://not-equivalent" } : entry)],
    ["wrong secret identity", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "DATABASE_URL" ? { name: entry.name, valueSource: { secretKeyRef: { secret: "other-db", version: "1" } } } : entry)],
    ["wrong secret version", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "DATABASE_URL" ? { name: entry.name, valueSource: { secretKeyRef: { secret: "test-db", version: "2" } } } : entry)],
    ["malformed entry", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "DATABASE_URL" ? { name: entry.name, valueSource: { secretKeyRef: { secret: "test-db" } } } : entry)],
    ["ambiguous value representation", (env: unknown[]) => env.map((entry) => record(entry) && entry.name === "MIRA_REFUND_AUTHORIZATION_ENABLED" ? { ...entry, valueSource: { secretKeyRef: { secret: "test-db", version: "1" } } } : entry)],
  ])("rejects env %s", async (_case, mutate: (env: unknown[]) => unknown[]) => {
    await expect(verifyExecutionTemplate(templateWithEnvironment(release, mutate(environmentFor())))).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("rejects duplicate expected env names before any name-keyed comparison", async () => {
    const env = environmentFor();
    const template = executionTemplateFor(release);
    if (!Array.isArray(template.containers) || !record(template.containers[0])) throw new Error("TEST_CONTAINER_REQUIRED");
    const duplicateRelease = { ...release, executionTemplate: { ...release.executionTemplate,
      containers: [{ ...template.containers[0], env: [...env, env[0]] }] } };
    await expect(verifyExecutionTemplate(executionTemplateFor(duplicateRelease), duplicateRelease)).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("keeps args position-sensitive while env entries remain name-keyed", async () => {
    const template = executionTemplateFor(release);
    if (!Array.isArray(template.containers) || !record(template.containers[0])) throw new Error("TEST_CONTAINER_REQUIRED");
    const orderedRelease = { ...release, executionTemplate: { ...release.executionTemplate,
      containers: [{ ...template.containers[0], args: ["first", "second"] }] } };
    await expect(verifyExecutionTemplate(executionTemplateFor(orderedRelease), orderedRelease)).resolves.toMatchObject({ grantId });
    const reordered = executionTemplateFor(orderedRelease);
    const containers = reordered.containers;
    if (!Array.isArray(containers) || !record(containers[0])) throw new Error("TEST_CONTAINER_REQUIRED");
    await expect(verifyExecutionTemplate({ ...reordered, containers: [{ ...containers[0], args: ["second", "first"] }] }, orderedRelease)).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("accepts the documented partial-rvhbh live-shaped representation through the real verifier", async () => {
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release,
      rvhbhLiveShapedRuntimePort(grantId, executionName))).resolves.toMatchObject({ grantId, executionId: executionName });
  });

  it("rejects another job before external access and compares every reviewed template field", async () => {
    const port = { verifyIdToken: vi.fn(), getExecution: vi.fn() };
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
