import { describe, expect, it, vi } from "vitest";
import { VerifiedRefundExecution } from "../runtime";
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

function withoutEgress(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "egress"));
}

function taskReadback(execution: string, vpcAccess: unknown, taskExecution: unknown = execution): Record<string, unknown> {
  return { name: `${execution}/tasks/0`, execution: taskExecution, index: 0, vpcAccess };
}

function taskWithoutIndex(execution: string, vpcAccess: unknown): Record<string, unknown> {
  return { name: `${execution}/tasks/mira-eximbay-refund-canary-9cj5h-task0`, vpcAccess };
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

  it("normalizes only an omitted Task PRIVATE_RANGES_ONLY egress before strict VPC comparison", async () => {
    const port = runtimePort(grantId, executionName);
    const expectedVpc = release.executionTemplate.vpcAccess;
    if (!record(expectedVpc)) throw new Error("TEST_VPC_REQUIRED");
    const actualVpc = withoutEgress(expectedVpc);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port,
      listExecutionTasks: () => Promise.resolve({ tasks: [taskReadback(executionName, actualVpc, "synthetic-run")] }),
    })).resolves.toMatchObject({ grantId });
  });

  it("accepts an explicit matching Task egress", async () => {
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, runtimePort(grantId, executionName))).resolves.toMatchObject({ grantId });
  });

  it("canonicalizes only an absent Task index to ordinal zero", async () => {
    const port = runtimePort(grantId, executionName);
    const expectedVpc = release.executionTemplate.vpcAccess;
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, listExecutionTasks: () => Promise.resolve({ tasks: [taskWithoutIndex(executionName, expectedVpc)] }),
    })).resolves.toMatchObject({ grantId });
  });

  it.each([
    [1], [-1], [0.5], [null], ["0"], [true], [{}], [[]],
  ])("rejects an explicit non-canonical Task index %j", async (index) => {
    const port = runtimePort(grantId, executionName);
    const expectedVpc = release.executionTemplate.vpcAccess;
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, listExecutionTasks: () => Promise.resolve({ tasks: [{ ...taskReadback(executionName, expectedVpc), index }] }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("fails closed for explicit ALL_TRAFFIC with otherwise exact Task VPC", async () => {
    const expectedVpc = release.executionTemplate.vpcAccess;
    if (!record(expectedVpc)) throw new Error("TEST_VPC_REQUIRED");
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port,
      listExecutionTasks: () => Promise.resolve({ tasks: [taskReadback(executionName, { ...expectedVpc, egress: "ALL_TRAFFIC" })] }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it.each([
    { tasks: [taskReadback(executionName, { egress: "ALL_TRAFFIC" })] },
    { tasks: [taskReadback(executionName, undefined)] },
    { tasks: [] },
    { tasks: [taskReadback(executionName, undefined), taskReadback(executionName, undefined)] },
  ])("fails closed when Task VPC evidence is insufficient or wrong", async (taskReadback) => {
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port, listExecutionTasks: () => Promise.resolve(taskReadback),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it("fails closed when omitted Task egress conflicts with an ALL_TRAFFIC release", async () => {
    const expectedVpc = release.executionTemplate.vpcAccess;
    if (!record(expectedVpc)) throw new Error("TEST_VPC_REQUIRED");
    const allTrafficRelease = { ...release, executionTemplate: { ...release.executionTemplate, vpcAccess: { ...expectedVpc, egress: "ALL_TRAFFIC" } } };
    const actualVpc = withoutEgress(expectedVpc);
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, allTrafficRelease, {
      ...port,
      listExecutionTasks: () => Promise.resolve({ tasks: [taskReadback(executionName, actualVpc)] }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it.each([
    ["network", { network: "projects/synthetic-refund-test/global/networks/other" }],
    ["subnetwork", { subnetwork: "projects/synthetic-refund-test/regions/asia-northeast3/subnetworks/other" }],
    ["tags", { tags: ["other"] }],
  ])("fails closed when Task VPC %s differs", async (_field, changed) => {
    const expectedVpc = release.executionTemplate.vpcAccess;
    if (!record(expectedVpc)) throw new Error("TEST_VPC_REQUIRED");
    const interfaces = expectedVpc.networkInterfaces;
    if (!Array.isArray(interfaces) || interfaces.length !== 1 || !record(interfaces[0])) throw new Error("TEST_VPC_INTERFACE_REQUIRED");
    const port = runtimePort(grantId, executionName);
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port,
      listExecutionTasks: () => Promise.resolve({ tasks: [taskReadback(executionName,
        { ...expectedVpc, networkInterfaces: [{ ...interfaces[0], ...changed }] })] }),
    })).rejects.toThrow("EXECUTION_UNVERIFIED");
  });

  it.each([
    ["another project", "projects/other/locations/asia-northeast3/jobs/reentry-test/executions/synthetic-run/tasks/0"],
    ["another location", "projects/synthetic-refund-test/locations/other/jobs/reentry-test/executions/synthetic-run/tasks/0"],
    ["another Execution", `${release.jobName}/executions/other/tasks/0`],
    ["another Job", "projects/synthetic-refund-test/locations/asia-northeast3/jobs/other/executions/synthetic-run/tasks/0"],
    ["malformed name", "synthetic-run"],
    ["missing task segment", executionName],
    ["extra path segment", `${executionName}/tasks/0/extra`],
  ])("fails closed when Task name has %s", async (_case, name) => {
    const port = runtimePort(grantId, executionName);
    const expectedVpc = release.executionTemplate.vpcAccess;
    await expect(VerifiedRefundExecution.verify("token", executionName, grantId, release, {
      ...port,
      listExecutionTasks: () => Promise.resolve({ tasks: [{ ...taskReadback(executionName, expectedVpc), name }] }),
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
