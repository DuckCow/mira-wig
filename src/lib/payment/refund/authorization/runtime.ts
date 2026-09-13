import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { record, uuid, RefundAuthorizationError } from "./contract";
import { sameJson, templateForGrant, type RefundReentryRelease } from "./release";

export type RuntimeIdentityPort = Readonly<{
  verifyIdToken(token: string, audience: string): Promise<unknown>;
  getExecution(name: string): Promise<unknown>;
  listExecutionTasks(executionName: string, diagnostics?: TaskLookupDiagnosticSink): Promise<unknown>;
}>;

export type TaskLookupDiagnosticPhase = "AUTH_CLIENT" | "API_REQUEST";
export type TaskLookupFailureClass =
  | "AUTH_CLIENT_FAILURE"
  | "HTTP_403"
  | "HTTP_404"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "TIMEOUT"
  | "TRANSPORT"
  | "UNKNOWN_SAFE_FAILURE";

export type TaskLookupDiagnosticEvent =
  | Readonly<{
    event: "refund_reentry_task_lookup";
    operation: "LIST_TASKS";
    executionName: string;
    phase: "AUTH_CLIENT";
    result: "FAILURE";
    elapsedMs: number;
    failureClass: "AUTH_CLIENT_FAILURE";
  }>
  | Readonly<{
    event: "refund_reentry_task_lookup";
    operation: "LIST_TASKS";
    executionName: string;
    phase: "API_REQUEST";
    result: "SUCCESS";
    elapsedMs: number;
    resultCount: number | null;
  }>
  | Readonly<{
    event: "refund_reentry_task_lookup";
    operation: "LIST_TASKS";
    executionName: string;
    phase: "API_REQUEST";
    result: "FAILURE";
    elapsedMs: number;
    failureClass: Exclude<TaskLookupFailureClass, "AUTH_CLIENT_FAILURE">;
    httpStatus?: number;
  }>;

export type TaskLookupDiagnosticSink = (event: TaskLookupDiagnosticEvent) => void | Promise<void>;
export type TaskLookupRequest = () => Promise<unknown>;
export type GoogleRuntimeIdentityDependencies = Readonly<{
  acquireListTasksRequest?: (executionName: string) => Promise<TaskLookupRequest>;
}>;

export type RefundExecutionVerificationFailureStage =
  | "TOKEN_VERIFICATION"
  | "EXECUTION_LOOKUP"
  | "EXECUTION_VERIFICATION"
  | "TASK_LOOKUP"
  | "TASK_VERIFICATION";

// This preserves the public failure code while carrying only an allowlisted
// diagnostic stage to the in-process HTTP boundary.
export class RefundExecutionVerificationError extends RefundAuthorizationError {
  constructor(readonly stage: RefundExecutionVerificationFailureStage) {
    super("EXECUTION_UNVERIFIED");
    this.name = "RefundExecutionVerificationError";
  }
}

// The production seam uses signed Google identity and the immutable control-plane
// Execution resource. Body/env strings are only locators. No network occurs on import.
export function createGoogleRuntimeIdentity(dependencies: GoogleRuntimeIdentityDependencies = {}): RuntimeIdentityPort {
  const acquireListTasksRequest = dependencies.acquireListTasksRequest ?? productionListTasksRequest;
  return {
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
    listExecutionTasks(executionName, diagnostics) {
      return observeListTasks(executionName, diagnostics, acquireListTasksRequest);
    },
  };
}

export const googleRuntimeIdentity = createGoogleRuntimeIdentity();

async function productionListTasksRequest(executionName: string): Promise<TaskLookupRequest> {
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  return async () => {
    const response = await client.request<unknown>({
      url: `https://run.googleapis.com/v2/${executionName}/tasks`, method: "GET", timeout: 10_000, retry: false,
    });
    return response.data;
  };
}

async function observeListTasks(
  executionName: string, diagnostics: TaskLookupDiagnosticSink | undefined,
  acquireRequest: (executionName: string) => Promise<TaskLookupRequest>,
): Promise<unknown> {
  const startedAt = Date.now();
  let request: TaskLookupRequest;
  try {
    request = await acquireRequest(executionName);
  } catch (error) {
    safelyEmitTaskLookupDiagnostic(diagnostics, {
      event: "refund_reentry_task_lookup", operation: "LIST_TASKS", executionName,
      phase: "AUTH_CLIENT", result: "FAILURE", elapsedMs: boundedElapsedMs(startedAt), failureClass: "AUTH_CLIENT_FAILURE",
    });
    throw error;
  }
  try {
    const value = await request();
    safelyEmitTaskLookupDiagnostic(diagnostics, {
      event: "refund_reentry_task_lookup", operation: "LIST_TASKS", executionName,
      phase: "API_REQUEST", result: "SUCCESS", elapsedMs: boundedElapsedMs(startedAt), resultCount: taskResultCount(value),
    });
    return value;
  } catch (error) {
    safelyEmitTaskLookupDiagnostic(diagnostics, taskLookupFailureEvent(executionName, startedAt, error));
    throw error;
  }
}

function taskLookupFailureEvent(executionName: string, startedAt: number, error: unknown): TaskLookupDiagnosticEvent {
  const httpStatus = errorHttpStatus(error);
  const failureClass = taskLookupFailureClass(error, httpStatus);
  const common = {
    event: "refund_reentry_task_lookup" as const, operation: "LIST_TASKS" as const, executionName,
    phase: "API_REQUEST" as const, result: "FAILURE" as const, elapsedMs: boundedElapsedMs(startedAt), failureClass,
  };
  return httpStatus === null ? common : { ...common, httpStatus };
}

function taskLookupFailureClass(error: unknown, httpStatus: number | null): Exclude<TaskLookupFailureClass, "AUTH_CLIENT_FAILURE"> {
  return httpFailureClass(httpStatus) ?? timeoutFailureClass(error) ?? transportFailureClass(error) ?? "UNKNOWN_SAFE_FAILURE";
}

function httpFailureClass(httpStatus: number | null): Exclude<TaskLookupFailureClass, "AUTH_CLIENT_FAILURE" | "TIMEOUT" | "TRANSPORT" | "UNKNOWN_SAFE_FAILURE"> | null {
  if (httpStatus === 403) return "HTTP_403";
  if (httpStatus === 404) return "HTTP_404";
  if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) return "HTTP_4XX";
  return httpStatus !== null && httpStatus >= 500 ? "HTTP_5XX" : null;
}

function timeoutFailureClass(error: unknown): "TIMEOUT" | null {
  const values = [errorName(error), errorCode(error)];
  return ["TimeoutError", "ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNABORTED"].some((value) => values.includes(value)) ? "TIMEOUT" : null;
}

function transportFailureClass(error: unknown): "TRANSPORT" | null {
  return ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"].includes(errorCode(error) ?? "") ? "TRANSPORT" : null;
}

function errorHttpStatus(error: unknown): number | null {
  if (!record(error)) return null;
  const response = record(error.response) ? error.response.status : undefined;
  return validHttpStatus(response) ?? validHttpStatus(error.status) ?? validHttpStatus(error.code);
}

function validHttpStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function errorCode(error: unknown): string | null {
  return record(error) && typeof error.code === "string" ? error.code : null;
}

function errorName(error: unknown): string | null {
  if (error instanceof Error) return error.name;
  return record(error) && typeof error.name === "string" ? error.name : null;
}

function taskResultCount(value: unknown): number | null {
  return record(value) && Array.isArray(value.tasks) ? value.tasks.length : null;
}

function boundedElapsedMs(startedAt: number): number {
  const elapsed = Math.trunc(Date.now() - startedAt);
  if (!Number.isFinite(elapsed)) return 60_000;
  return Math.min(Math.max(elapsed, 0), 60_000);
}

function safelyEmitTaskLookupDiagnostic(diagnostics: TaskLookupDiagnosticSink | undefined, event: TaskLookupDiagnosticEvent): void {
  if (!diagnostics) return;
  try {
    const emitted = diagnostics(event);
    if (emitted) void emitted.catch(() => {});
  } catch { /* Diagnostics are never an execution-verification dependency. */ }
}

// Private constructor prevents ordinary callers from supplying an actor/image string
// as a verified context. Tests replace only the two actual external identity seams.
export class VerifiedRefundExecution {
  private constructor(
    readonly principalId: string, readonly executionId: string, readonly executionUid: string,
    readonly releasePolicyDigest: string, readonly grantId: string,
  ) { Object.freeze(this); }

  static async verify(
    token: string, executionName: string, grantId: string, release: RefundReentryRelease,
    port: RuntimeIdentityPort = googleRuntimeIdentity, taskLookupDiagnostics?: TaskLookupDiagnosticSink,
  ): Promise<VerifiedRefundExecution> {
    if (!executionName.startsWith(`${release.jobName}/executions/`)
      || !/\/executions\/[a-z0-9-]+$/u.test(executionName) || executionName.length > 255) {
      throw new RefundExecutionVerificationError("EXECUTION_VERIFICATION");
    }
    const identity = await verificationStage("TOKEN_VERIFICATION", () => port.verifyIdToken(token, release.audience));
    await verificationStage("TOKEN_VERIFICATION", () => requireIdentity(identity, release));
    const execution = await verificationStage("EXECUTION_LOOKUP", () => port.getExecution(executionName));
    const verifiedExecution = await verificationStage("EXECUTION_VERIFICATION", () => verifiedExecutionValue(execution, executionName, grantId, release));
    const tasks = await verificationStage("TASK_LOOKUP", () => port.listExecutionTasks(executionName, taskLookupDiagnostics));
    await verificationStage("TASK_VERIFICATION", () => requireExecutionVpc(tasks, executionName, release));
    return new VerifiedRefundExecution(release.serviceAccountSubject, executionName, verifiedExecution.uid, release.digest, grantId);
  }
}

async function verificationStage<T>(
  stage: RefundExecutionVerificationFailureStage,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    // SDK errors can contain request credentials. Expose only a bounded stage.
    throw new RefundExecutionVerificationError(stage);
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

function verifiedExecutionValue(value: unknown, name: string, grantId: string, release: RefundReentryRelease): Record<string, unknown> & { uid: string } {
  requireExecution(value, name, grantId, release);
  return value;
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
