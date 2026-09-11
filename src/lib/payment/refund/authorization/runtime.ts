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
    sameJson(value.template, executionTemplateForGrant(release, grantId))].every(Boolean);
  if (!valid) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
}

function requireExecutionVpc(value: unknown, executionName: string, release: RefundReentryRelease): void {
  if (!record(value) || !Array.isArray(value.tasks) || value.tasks.length !== 1 || !record(value.tasks[0])) {
    throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  }
  const task = value.tasks[0];
  if (taskParentExecution(task.name) !== executionName || task.index !== 0
    || !sameJson(normalizeTaskVpcAccess(task.vpcAccess), release.executionTemplate.vpcAccess)) {
    throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
  }
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
