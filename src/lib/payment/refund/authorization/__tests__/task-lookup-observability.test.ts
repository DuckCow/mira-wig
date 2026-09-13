import { describe, expect, it } from "vitest";
import {
  createGoogleRuntimeIdentity, RefundExecutionVerificationError, VerifiedRefundExecution,
  type TaskLookupDiagnosticEvent, type TaskLookupRequest,
} from "../runtime";
import { release, runtimePort } from "./fixture";

const grantId = "synthetic-grant";
const executionName = `${release.jobName}/executions/task-lookup-observability`;

function capturedDiagnostics() {
  const events: TaskLookupDiagnosticEvent[] = [];
  return { events, emit: (event: TaskLookupDiagnosticEvent) => { events.push(event); } };
}

function observedRuntime(acquireListTasksRequest: (name: string) => Promise<TaskLookupRequest>) {
  return createGoogleRuntimeIdentity({ acquireListTasksRequest });
}

function acquireRequest(request: TaskLookupRequest) {
  return () => Promise.resolve(request);
}

function requestThatResolves(value: unknown): TaskLookupRequest {
  return () => Promise.resolve(value);
}

function requestThatRejects(error: Error): TaskLookupRequest {
  return () => Promise.reject(error);
}

function runtimeWithObservedList(observed: ReturnType<typeof observedRuntime>) {
  return { ...runtimePort(grantId, executionName), listExecutionTasks: observed.listExecutionTasks };
}

function responseError(status: number, marker = "synthetic-task-lookup-marker") {
  return Object.assign(new Error(marker), {
    response: { status, data: { token: marker }, headers: { Authorization: `Bearer ${marker}` } },
  });
}

describe("Task lookup safe diagnostics", () => {
  it("records an auth-client failure while preserving TASK_LOOKUP rejection", async () => {
    const marker = "synthetic-auth-client-secret";
    const observed = observedRuntime(() => Promise.reject(new Error(marker)));
    const { events, emit } = capturedDiagnostics();

    await expect(VerifiedRefundExecution.verify(
      "token", executionName, grantId, release, runtimeWithObservedList(observed), emit,
    )).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "TASK_LOOKUP" } satisfies Partial<RefundExecutionVerificationError>);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ phase: "AUTH_CLIENT", result: "FAILURE", failureClass: "AUTH_CLIENT_FAILURE" });
    expect(JSON.stringify(events)).not.toContain(marker);
  });

  it.each([
    [403, "HTTP_403"], [404, "HTTP_404"], [418, "HTTP_4XX"], [503, "HTTP_5XX"],
  ])("classifies HTTP status %i as %s", async (status, failureClass) => {
    const error = responseError(status);
    const observed = observedRuntime(acquireRequest(requestThatRejects(error)));
    const { events, emit } = capturedDiagnostics();

    await expect(observed.listExecutionTasks(executionName, emit)).rejects.toBe(error);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ phase: "API_REQUEST", result: "FAILURE", failureClass, httpStatus: status });
  });

  it("classifies only allowlisted timeout and transport codes", async () => {
    const timeout = Object.assign(new Error("synthetic-timeout-secret"), { code: "ETIMEDOUT" });
    const transport = Object.assign(new Error("synthetic-transport-secret"), { code: "ENOTFOUND" });
    const timeoutRuntime = observedRuntime(acquireRequest(requestThatRejects(timeout)));
    const transportRuntime = observedRuntime(acquireRequest(requestThatRejects(transport)));
    const timeoutDiagnostics = capturedDiagnostics();
    const transportDiagnostics = capturedDiagnostics();

    await expect(timeoutRuntime.listExecutionTasks(executionName, timeoutDiagnostics.emit)).rejects.toBe(timeout);
    await expect(transportRuntime.listExecutionTasks(executionName, transportDiagnostics.emit)).rejects.toBe(transport);
    expect(timeoutDiagnostics.events[0]).toMatchObject({ failureClass: "TIMEOUT" });
    expect(transportDiagnostics.events[0]).toMatchObject({ failureClass: "TRANSPORT" });
  });

  it("classifies malformed or unknown errors without reading their messages", async () => {
    const marker = "synthetic-unknown-error-secret";
    const observed = observedRuntime(acquireRequest(requestThatRejects(new Error(marker))));
    const { events, emit } = capturedDiagnostics();

    await expect(observed.listExecutionTasks(executionName, emit)).rejects.toThrow(marker);
    expect(events[0]).toMatchObject({ failureClass: "UNKNOWN_SAFE_FAILURE" });
    expect(JSON.stringify(events)).not.toContain(marker);
  });

  it("returns a successful ListTasks representation unchanged and records its count", async () => {
    const payload = { tasks: [{ name: `${executionName}/tasks/0` }] };
    const observed = observedRuntime(acquireRequest(requestThatResolves(payload)));
    const { events, emit } = capturedDiagnostics();

    await expect(observed.listExecutionTasks(executionName, emit)).resolves.toBe(payload);
    expect(events).toEqual([expect.objectContaining({
      operation: "LIST_TASKS", phase: "API_REQUEST", result: "SUCCESS", resultCount: 1,
    })]);
  });

  it.each([
    [0, { tasks: [] }], [2, { tasks: [{}, {}] }],
  ])("records successful count %i while existing Task verification rejects it", async (resultCount, payload) => {
    const observed = observedRuntime(acquireRequest(requestThatResolves(payload)));
    const { events, emit } = capturedDiagnostics();

    await expect(VerifiedRefundExecution.verify(
      "token", executionName, grantId, release, runtimeWithObservedList(observed), emit,
    )).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "TASK_VERIFICATION" } satisfies Partial<RefundExecutionVerificationError>);
    expect(events[0]).toMatchObject({ result: "SUCCESS", resultCount });
  });

  it("does not let synchronous or asynchronous diagnostic failures change lookup behavior", async () => {
    const payload = { tasks: [{ name: `${executionName}/tasks/0` }] };
    const successRuntime = observedRuntime(acquireRequest(requestThatResolves(payload)));
    const failure = responseError(403);
    const failureRuntime = observedRuntime(acquireRequest(requestThatRejects(failure)));
    const syncThrow = () => { throw new Error("synthetic-logger-secret"); };
    const asyncReject = () => Promise.reject(new Error("synthetic-async-logger-secret"));

    await expect(successRuntime.listExecutionTasks(executionName, syncThrow)).resolves.toBe(payload);
    await expect(VerifiedRefundExecution.verify(
      "token", executionName, grantId, release, runtimeWithObservedList(failureRuntime), asyncReject,
    )).rejects.toMatchObject({ code: "EXECUTION_UNVERIFIED", stage: "TASK_LOOKUP" } satisfies Partial<RefundExecutionVerificationError>);
  });

  it("does not serialize raw messages, response bodies, headers, or credential markers", async () => {
    const marker = "Bearer synthetic-access-token-secret";
    const error = responseError(403, marker);
    const observed = observedRuntime(acquireRequest(requestThatRejects(error)));
    const { events, emit } = capturedDiagnostics();

    await expect(observed.listExecutionTasks(executionName, emit)).rejects.toBe(error);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("response");
  });
});
