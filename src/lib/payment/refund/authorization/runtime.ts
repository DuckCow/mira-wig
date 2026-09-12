import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { record, uuid, RefundAuthorizationError } from "./contract";
import { sameJson, templateForGrant, type RefundReentryRelease } from "./release";

export type RuntimeIdentityPort = Readonly<{
  verifyIdToken(token: string, audience: string): Promise<unknown>;
  getExecution(name: string): Promise<unknown>;
  listExecutionTasks(executionName: string): Promise<unknown>;
}>;

// The production seam uses signed Google identity and the immutable control-plane
// Execution resource. Body/env strings are only locators. No network occurs on import.
export const googleRuntimeIdentity: RuntimeIdentityPort = {
  async verifyIdToken(token, audience) {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
    return ticket.getPayload();
  },
  async getExecution(name) {
    const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
    const response = await client.request<unknown>({
      url: `https://run.googleapis.com/v2/${name}`, method: "GET", timeout: 10_000, retry: false,
    });
    return response.data;
  },
  async listExecutionTasks(executionName) {
    const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
    const response = await client.request<unknown>({
      url: `https://run.googleapis.com/v2/${executionName}/tasks`, method: "GET", timeout: 10_000, retry: false,
    });
    return response.data;
  },
};

// Private constructor prevents ordinary callers from supplying an actor/image string
// as a verified context. Tests replace only the two actual external identity seams.
export class VerifiedRefundExecution {
  private constructor(
    readonly principalId: string, readonly executionId: string, readonly executionUid: string,
    readonly releasePolicyDigest: string, readonly grantId: string,
  ) { Object.freeze(this); }

  static async verify(
    token: string, executionName: string, grantId: string, release: RefundReentryRelease,
    port: RuntimeIdentityPort = googleRuntimeIdentity,
  ): Promise<VerifiedRefundExecution> {
    if (!executionName.startsWith(`${release.jobName}/executions/`)
      || !/\/executions\/[a-z0-9-]+$/u.test(executionName) || executionName.length > 255) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
    try {
      const identity = await port.verifyIdToken(token, release.audience);
      requireIdentity(identity, release);
      const execution = await port.getExecution(executionName);
      requireExecution(execution, executionName, grantId, release);
      const tasks = await port.listExecutionTasks(executionName);
      requireExecutionVpc(tasks, executionName, release);
      return new VerifiedRefundExecution(release.serviceAccountSubject, executionName, execution.uid, release.digest, grantId);
    } catch {
      // SDK errors can contain request credentials. Expose only the bounded failure.
      throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
    }
  }
}

function requireIdentity(identity: unknown, release: RefundReentryRelease): void {
  if (!record(identity)) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  const valid = [
    identity.sub === release.serviceAccountSubject, identity.email === release.serviceAccountEmail,
    identity.email_verified === true, identity.aud === release.audience,
    identity.iss === "https://accounts.google.com" || identity.iss === "accounts.google.com",
    typeof identity.exp === "number" && identity.exp > Date.now() / 1000,
  ].every(Boolean);
  if (!valid) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
}

function requireExecution(value: unknown, name: string, grantId: string, release: RefundReentryRelease): asserts value is Record<string, unknown> & { uid: string } {
  if (!record(value) || !uuid(value.uid)) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  const valid = [value.name === name, value.taskCount === 1, value.parallelism === 1,
    value.completionTime === undefined, value.deleteTime === undefined,
    sameExecutionTemplate(value.template, executionTemplateForGrant(release, grantId))].every(Boolean);
  if (!valid) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
}

// Cloud Run permits an Execution's env entries to be returned in a different order
// from the reviewed TaskTemplate. Array position is not an env identity; every other
// TaskTemplate array (for example args) remains compared by sameJson in this boundary.
function sameExecutionTemplate(actual: unknown, expected: unknown): boolean {
  if (!record(actual) || !record(expected) || !Array.isArray(actual.containers) || !Array.isArray(expected.containers)
    || actual.containers.length !== expected.containers.length) return false;
  const { containers: actualContainers, ...actualRest } = actual;
  const { containers: expectedContainers, ...expectedRest } = expected;
  return sameJson(actualRest, expectedRest)
    && actualContainers.every((container, index) => sameExecutionContainer(container, expectedContainers[index]));
}

function sameExecutionContainer(actual: unknown, expected: unknown): boolean {
  if (!record(actual) || !record(expected)) return false;
  const { env: actualEnv, ...actualRest } = actual;
  const { env: expectedEnv, ...expectedRest } = expected;
  return sameJson(actualRest, expectedRest) && sameEnvironment(actualEnv, expectedEnv);
}

type EnvironmentValue = Readonly<{ kind: "literal"; value: string } | { kind: "secret"; secret: string; version: string }>;

function sameEnvironment(actual: unknown, expected: unknown): boolean {
  const actualEntries = environmentEntries(actual);
  const expectedEntries = environmentEntries(expected);
  if (!actualEntries || !expectedEntries || actualEntries.size !== expectedEntries.size) return false;
  return [...actualEntries].every(([name, value]) => sameJson(value, expectedEntries.get(name)));
}

function environmentEntries(value: unknown): Map<string, EnvironmentValue> | null {
  if (!Array.isArray(value)) return null;
  const entries = new Map<string, EnvironmentValue>();
  for (const entry of value) {
    const parsed = parseEnvironmentEntry(entry);
    if (!parsed || entries.has(parsed.name)) return null;
    entries.set(parsed.name, parsed.value);
  }
  return entries;
}

function parseEnvironmentEntry(value: unknown): Readonly<{ name: string; value: EnvironmentValue }> | null {
  const name = environmentName(value);
  if (!name || !record(value)) return null;
  return Object.hasOwn(value, "value") ? literalEnvironmentEntry(value, name) : secretEnvironmentEntry(value, name);
}

function environmentName(value: unknown): string | null {
  if (!record(value) || typeof value.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value.name)) return null;
  return value.name;
}

function literalEnvironmentEntry(value: Record<string, unknown>, name: string): Readonly<{ name: string; value: EnvironmentValue }> | null {
  if (!exactKeys(value, ["name", "value"]) || typeof value.value !== "string") return null;
  return { name, value: { kind: "literal", value: value.value } };
}

function secretEnvironmentEntry(value: Record<string, unknown>, name: string): Readonly<{ name: string; value: EnvironmentValue }> | null {
  const selector = environmentSecretSelector(value);
  if (!selector) return null;
  const { secret, version } = selector;
  if (typeof secret !== "string" || typeof version !== "string" || !validSecretSelector(secret, version)) return null;
  return { name, value: { kind: "secret", secret, version } };
}

function environmentSecretSelector(value: Record<string, unknown>): Record<string, unknown> | null {
  if (!exactKeys(value, ["name", "valueSource"]) || !record(value.valueSource) || !exactKeys(value.valueSource, ["secretKeyRef"])) return null;
  const selector = value.valueSource.secretKeyRef;
  return record(selector) && exactKeys(selector, ["secret", "version"]) ? selector : null;
}

function validSecretSelector(secret: string, version: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(secret) && /^(?:[1-9]\d*|latest)$/u.test(version);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function requireExecutionVpc(value: unknown, executionName: string, release: RefundReentryRelease): void {
  if (!record(value) || !Array.isArray(value.tasks) || value.tasks.length !== 1 || !record(value.tasks[0])) {
    throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  }
  const task = value.tasks[0];
  if (taskParentExecution(task.name) !== executionName || canonicalTaskIndex(task) !== 0
    || !sameJson(normalizeTaskVpcAccess(task.vpcAccess), release.executionTemplate.vpcAccess)) {
    throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  }
}

function canonicalTaskIndex(task: Record<string, unknown>): number {
  if (!Object.hasOwn(task, "index")) return 0;
  if (typeof task.index !== "number" || !Number.isInteger(task.index)) {
    throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  }
  return task.index;
}

function taskParentExecution(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const match = /^(projects\/[^/]+\/locations\/[^/]+\/jobs\/[^/]+\/executions\/[^/]+)\/tasks\/[^/]+$/u.exec(name);
  return match?.[1] ?? null;
}

function normalizeTaskVpcAccess(value: unknown): unknown {
  if (!record(value) || Object.hasOwn(value, "egress")) return value;
  // Cloud Run v2 Task readback omits its PRIVATE_RANGES_ONLY default. Only that
  // one omitted field is normalized; every other reviewed VPC field stays exact.
  return { ...value, egress: "PRIVATE_RANGES_ONLY" };
}

function executionTemplateForGrant(release: RefundReentryRelease, grantId: string): unknown {
  const template = templateForGrant(release, grantId);
  if (!record(template)) throw new RefundAuthorizationError("CONFIG_INVALID");
  const { vpcAccess: _vpcAccess, ...executionTemplate } = template;
  return executionTemplate;
}
