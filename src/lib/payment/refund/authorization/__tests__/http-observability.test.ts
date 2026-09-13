import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { REFUND_REENTRY_ADMISSION_AUTH_HEADER, RefundAuthorizationError, type AuthorizationEnv } from "../contract";
import {
  createRefundAuthorizationAdmissionHandler,
  type RefundAdmissionDiagnosticEvent,
  type RefundAdmissionDiagnosticLogger,
} from "../http";
import type { RuntimeIdentityPort } from "../runtime";
import { enabled, release, runtimePort } from "./fixture";

const executionName = `${release.jobName}/executions/observability-test`;

function capturedLogger() {
  const events: RefundAdmissionDiagnosticEvent[] = [];
  const diagnostics: RefundAdmissionDiagnosticLogger = { emit: (event) => { events.push(event); } };
  return { events, diagnostics };
}

function runtimeThatRejects(): RuntimeIdentityPort {
  return {
    verifyIdToken: vi.fn(() => Promise.reject(new Error("synthetic token rejection"))),
    getExecution: vi.fn(() => Promise.reject(new Error("must not reach execution lookup"))),
    listExecutionTasks: vi.fn(() => Promise.reject(new Error("must not list tasks"))),
  };
}

function handler(
  diagnostics: RefundAdmissionDiagnosticLogger,
  runtime: RuntimeIdentityPort = runtimeThatRejects(),
  loadRelease = () => Promise.resolve(release),
  env: AuthorizationEnv = enabled,
) {
  return createRefundAuthorizationAdmissionHandler({
    database: db,
    diagnostics,
    env,
    loadRelease,
    runtime,
  });
}

function validBody() {
  return JSON.stringify({ grantId: "synthetic-grant", executionName });
}

describe("refund admission diagnostic boundary", () => {
  it("shares the Authorization header contract between worker and application", () => {
    expect(REFUND_REENTRY_ADMISSION_AUTH_HEADER).toBe("Authorization");
  });

  it("emits one correlated entry and one first-failure record for an invalid bearer without reaching runtime or DB admission", async () => {
    const { events, diagnostics } = capturedLogger();
    const runtime = runtimeThatRejects();
    const response = await handler(diagnostics, runtime)(new Request(release.audience, {
      method: "POST",
      headers: { "x-cloud-trace-context": "0123456789abcdef0123456789abcdef/123;o=1" },
      body: validBody(),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "EXECUTION_UNVERIFIED" });
    expect(events).toEqual([
      { event: "refund_reentry_admission_entered", route: "refund_reentry_admission", method: "POST", traceId: "0123456789abcdef0123456789abcdef" },
      { event: "refund_reentry_admission_rejected", route: "refund_reentry_admission", method: "POST", traceId: "0123456789abcdef0123456789abcdef", stage: "AUTH_HEADER", reason: "INVALID_BEARER" },
    ]);
    expect(runtime.verifyIdToken).not.toHaveBeenCalled();
    expect(runtime.getExecution).not.toHaveBeenCalled();
    expect(runtime.listExecutionTasks).not.toHaveBeenCalled();
  });

  it("keeps runtime verifier rejection public output unchanged and records its single safe stage", async () => {
    const { events, diagnostics } = capturedLogger();
    const runtime = runtimeThatRejects();
    const response = await handler(diagnostics, runtime)(new Request(release.audience, {
      method: "POST",
      headers: { [REFUND_REENTRY_ADMISSION_AUTH_HEADER]: "Bearer synthetic.token" },
      body: validBody(),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "EXECUTION_UNVERIFIED" });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ event: "refund_reentry_admission_rejected", stage: "TOKEN_VERIFICATION", reason: "EXECUTION_UNVERIFIED" });
    expect(runtime.verifyIdToken).toHaveBeenCalledTimes(1);
    expect(runtime.getExecution).not.toHaveBeenCalled();
  });

  it("correlates a safe Task lookup diagnostic without changing the public rejection", async () => {
    const { events, diagnostics } = capturedLogger();
    const base = runtimeThatRejects();
    const valid = runtimePort("synthetic-grant", executionName);
    const runtime: RuntimeIdentityPort = {
      ...base,
      verifyIdToken: () => Promise.resolve({
        sub: release.serviceAccountSubject, email: release.serviceAccountEmail, email_verified: true,
        aud: release.audience, iss: "https://accounts.google.com", exp: Date.now() / 1000 + 300,
      }),
      getExecution: valid.getExecution,
      listExecutionTasks: (_name, lookupDiagnostics) => {
        void lookupDiagnostics?.({
          event: "refund_reentry_task_lookup", operation: "LIST_TASKS", executionName,
          phase: "API_REQUEST", result: "FAILURE", elapsedMs: 7, failureClass: "HTTP_403", httpStatus: 403,
        });
        return Promise.reject(new Error("synthetic-task-lookup-failure"));
      },
    };
    const response = await handler(diagnostics, runtime)(new Request(release.audience, {
      method: "POST",
      headers: {
        [REFUND_REENTRY_ADMISSION_AUTH_HEADER]: "Bearer synthetic.token",
        "x-cloud-trace-context": "0123456789abcdef0123456789abcdef/123;o=1",
      },
      body: validBody(),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "EXECUTION_UNVERIFIED" });
    expect(events).toContainEqual(expect.objectContaining({
      event: "refund_reentry_task_lookup", traceId: "0123456789abcdef0123456789abcdef",
      phase: "API_REQUEST", result: "FAILURE", failureClass: "HTTP_403", httpStatus: 403,
    }));
    expect(events.at(-1)).toMatchObject({ event: "refund_reentry_admission_rejected", stage: "TASK_LOOKUP", reason: "EXECUTION_UNVERIFIED" });
  });

  it("records release-load rejection without exposing release or request values", async () => {
    const { events, diagnostics } = capturedLogger();
    const marker = "synthetic-request-secret";
    const response = await handler(
      diagnostics,
      runtimeThatRejects(),
      () => Promise.reject(new RefundAuthorizationError("RELEASE_MISMATCH")),
      { ...enabled, DATABASE_URL: "synthetic-database-url", NEXTAUTH_SECRET: "synthetic-cookie-secret" },
    )(new Request(release.audience, {
      method: "POST",
      headers: { [REFUND_REENTRY_ADMISSION_AUTH_HEADER]: "Bearer synthetic-bearer-secret", cookie: "session=synthetic-cookie-secret" },
      body: JSON.stringify({ grantId: marker, executionName }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "RELEASE_MISMATCH" });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ stage: "RELEASE_LOAD", reason: "RELEASE_MISMATCH" });
    expect(JSON.stringify(events)).not.toContain(marker);
    expect(JSON.stringify(events)).not.toContain("synthetic-bearer-secret");
    expect(JSON.stringify(events)).not.toContain("synthetic-database-url");
    expect(JSON.stringify(events)).not.toContain("synthetic-cookie-secret");
  });

  it("does not let logging failure change the rejection or call the verifier", async () => {
    const diagnostics: RefundAdmissionDiagnosticLogger = { emit: () => { throw new Error("synthetic logger failure"); } };
    const runtime = runtimeThatRejects();
    const response = await handler(diagnostics, runtime)(new Request(release.audience, { method: "POST", body: validBody() }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "EXECUTION_UNVERIFIED" });
    expect(runtime.verifyIdToken).not.toHaveBeenCalled();
    expect(runtime.getExecution).not.toHaveBeenCalled();
  });

  it("does not leave an asynchronous logging rejection unhandled or change admission output", async () => {
    const diagnostics: RefundAdmissionDiagnosticLogger = { emit: () => Promise.reject(new Error("synthetic async logger failure")) };
    const runtime = runtimeThatRejects();
    const response = await handler(diagnostics, runtime)(new Request(release.audience, { method: "POST", body: validBody() }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "EXECUTION_UNVERIFIED" });
    expect(runtime.verifyIdToken).not.toHaveBeenCalled();
  });
});
