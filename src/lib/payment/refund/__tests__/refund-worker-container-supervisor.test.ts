import { emptyRetrieveShapeDiagnostic } from "../providers/eximbay/retrieve-shape-diagnostic";
import { diagnosticEnvironment } from "./retrieve-diagnostic-fixture";
import { diagnosticResult } from "../retrieve-diagnostic-result";
import { isEximbayPreflightDiagnostic, type EximbayPreflightDiagnostic } from "../providers/eximbay/preflight-diagnostic";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main as reconciliationProcessMain } from
  "../../../../../scripts/eximbay-contacted-reconciliation";
import {
  PROXY_READINESS_POLL_INTERVAL_MS,
  PROXY_READINESS_TIMEOUT_MS,
  defaultRefundWorkerContainerSupervisorDependencies,
  runRefundWorkerContainerSupervisor,
  type RefundWorkerContainerSupervisorDependencies,
} from "../refund-worker-container-supervisor";
import type {
  EximbayContactedProviderObservation,
  EximbayContactedReconciliationResult,
} from
  "../run-eximbay-contacted-reconciliation-once";
import {
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
} from "../eximbay-contacted-reconciliation-environment";
import { parseEximbayRefundCanaryEnvironment } from "../eximbay-refund-canary-environment";
import type { EximbayRefundReentryResult } from "../run-eximbay-refund-reentry-once";
import { CONTACTED_EVIDENCE_COMMAND_ID } from "../providers/eximbay/contacted-evidence-state";
import type {
  ContactedRefundShapeDiagnostic,
  ContactedRefundValueClass,
} from "../providers/eximbay/contacted-evidence-parser";
import { parseContactedRefundEvidence } from "../providers/eximbay/contacted-evidence-parser";
import type { ContactedEvidenceResult } from "../run-eximbay-contacted-refund-evidence-once";

const INSTANCE = "sample-project:asia-northeast3:refund-db";
const DATABASE_URL =
  `postgresql://refund_role:synthetic_password@localhost:5432/refund_sandbox?host=/cloudsql/${INSTANCE}`;
const ENABLED_ENV = Object.freeze({
  REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
  TOSS_SANDBOX_SECRET_KEY: "TEST_SECRET_DO_NOT_EXPOSE",
  TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant",
  TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation",
  REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE,
  DATABASE_URL,
  CLOUD_RUN_JOB: "refund-worker",
  CLOUD_RUN_EXECUTION: "execution-1",
  CLOUD_RUN_TASK_COUNT: "1",
  CLOUD_RUN_TASK_INDEX: "0",
  CLOUD_RUN_TASK_ATTEMPT: "0",
});
const CONTACTED_RECONCILIATION_ENV = Object.freeze({
  REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE,
  DATABASE_URL,
  MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID:
    EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
  MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID:
    EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED: "ENABLED",
  EXIMBAY_SANDBOX_MID: "MIRA-SBX",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE:
    "projects/mira-sbx1/secrets/eximbay-canary-key",
  MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
  CLOUD_RUN_JOB: "contacted-reconciliation",
  CLOUD_RUN_EXECUTION: "execution-1",
  CLOUD_RUN_TASK_COUNT: "1",
  CLOUD_RUN_TASK_INDEX: "0",
  CLOUD_RUN_TASK_ATTEMPT: "0",
});
const REFUND_REENTRY_ENV = Object.freeze({
  REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE,
  DATABASE_URL,
  MIRA_REFUND_AUTHORIZATION_ENABLED: "ENABLED",
  MIRA_REFUND_AUTHORIZATION_ID: "synthetic-grant",
  MIRA_REFUND_REENTRY_ADMISSION_URL: "https://sample.invalid/api/payments/refunds/reentry/admission",
  MIRA_REFUND_REENTRY_JOB_NAME: "projects/sample-project/locations/asia-northeast3/jobs/refund-worker",
  REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
  REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
  CLOUD_RUN_JOB: "mira-eximbay-refund-canary",
  CLOUD_RUN_EXECUTION: "refund-reentry-execution",
  CLOUD_RUN_TASK_COUNT: "1",
  CLOUD_RUN_TASK_INDEX: "0",
  CLOUD_RUN_TASK_ATTEMPT: "0",
});

describe("refund worker container supervisor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("freezes the production Direct VPC readiness allowance", () => {
    expect(PROXY_READINESS_TIMEOUT_MS).toBe(120_000);
    expect(PROXY_READINESS_POLL_INTERVAL_MS).toBe(250);
    expect(defaultRefundWorkerContainerSupervisorDependencies).toMatchObject({
      proxyReadinessTimeoutMs: 120_000,
      proxyReadinessPollIntervalMs: 250,
    });
  });

  it.each<readonly string[]>([
    [],
    ["worker-once", "extra"],
    ["unknown"],
    ["worker-once", "worker-once"],
  ])("rejects a non-exact command vector %j without spawning", async (args) => {
    const harness = supervisorHarness();

    const exit = await runRefundWorkerContainerSupervisor(
      args,
      {},
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(64);
    expect(harness.spawnCalls).toEqual([]);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"INVALID_HOST_INPUT"}\n']);
  });

  it("preserves the existing disabled worker result and never starts the proxy", async () => {
    const worker = completedChild(0, '{"ok":true,"code":"FEATURE_DISABLED"}\n', "");
    const harness = supervisorHarness([worker]);

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      {},
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.spawnCalls[0]?.executable).toBe(process.execPath);
    expect(harness.spawnCalls[0]?.args).toContain("run-once");
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(harness.stdout).toEqual(['{"ok":true,"code":"FEATURE_DISABLED"}\n']);
    expect(harness.stderr).toEqual([]);
  });

  it("preserves malformed activation classification without proxy admission", async () => {
    const worker = completedChild(78, "", '{"ok":false,"code":"CONFIG_INVALID"}\n');
    const harness = supervisorHarness([worker]);

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      { REFUND_EXECUTION_WORKER_ENABLED: "yes" },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.spawnCalls[0]?.executable).toBe(process.execPath);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"CONFIG_INVALID"}\n']);
  });

  it("uses the exact private proxy vector before a worker and awaits clean shutdown", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const worker = completedChild(0, '{"ok":true,"code":"CYCLE_COMPLETE"}\n', "");
    const harness = supervisorHarness([proxy, worker], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.spawnCalls).toHaveLength(2);
    expect(harness.spawnCalls[0]).toMatchObject({
      executable: "/test/cloud-sql-proxy",
      args: [
        "--private-ip",
        "--unix-socket=/cloudsql",
        "--health-check",
        "--http-address=127.0.0.1",
        "--http-port=9801",
        "--exit-zero-on-sigterm",
        INSTANCE,
      ],
    });
    expect(harness.spawnCalls[1]?.executable).toBe(process.execPath);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
    expect(harness.stdout).toEqual(['{"ok":true,"code":"CYCLE_COMPLETE"}\n']);
    expect(harness.stderr).toEqual([]);
  });

  it("runs the fixed CONTACTED reconciliation bundle once behind the private proxy", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const { child: runner, stdout: terminal } = await completedContactedChild(
      contactedReconciliationResult(1),
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.spawnCalls).toHaveLength(2);
    expect(harness.spawnCalls[1]).toMatchObject({
      executable: process.execPath,
      args: ["/test/eximbay-contacted-reconciliation.mjs"],
    });
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
  });

  it("runs only the contacted-refund evidence bundle with the fixed command identity", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const terminal = contactedEvidenceTerminal(contactedEvidenceResult());
    const child = completedChild(0, terminal, "");
    const harness = supervisorHarness([proxy, child], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      {
        REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE,
        DATABASE_URL,
      },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.spawnCalls).toHaveLength(2);
    expect(harness.spawnCalls[1]).toMatchObject({
      executable: process.execPath,
      args: ["/test/eximbay-contacted-refund-evidence.mjs", CONTACTED_EVIDENCE_COMMAND_ID],
    });
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
  });

  it.each([
    ["NO_MATCHING_REFUND_TRANSACTION", contactedEvidenceResult({
      parserResult: "NO_MATCHING_REFUND_TRANSACTION",
      providerStatusClass: "NONE",
      refundIdMatch: false,
      refundAmountMatch: false,
      refundTransactionIdPresent: false,
    })],
    ["UNESTABLISHED", contactedEvidenceResult({
      parserResult: "UNESTABLISHED",
      firstFailure: "UNSUPPORTED_STATUS",
      providerStatusClass: "OTHER",
    })],
    ["CONFIG_INVALID", contactedEvidenceResult({
      databaseDisconnected: false,
      inquiryCount: 0,
      httpStatus: null,
      jsonValid: null,
      shapeDiagnostic: null,
      parserResult: "UNESTABLISHED",
      firstFailure: "CONFIG_INVALID",
      providerStatusClass: null,
      providerResponseSuccess: null,
      refundIdMatch: null,
      originalTransactionBindingMatch: null,
      currencyMatch: null,
      refundAmountMatch: null,
      refundTransactionIdPresent: null,
      refundDatePresent: null,
    })],
    ["IDENTITY_MISMATCH", contactedEvidenceResult({
      parserResult: "IDENTITY_MISMATCH",
      firstFailure: "REFUND_ID",
      refundIdMatch: false,
    })],
    ["MONEY_MISMATCH", contactedEvidenceResult({
      parserResult: "MONEY_MISMATCH",
      firstFailure: "ORIGINAL_MONEY",
      currencyMatch: false,
    })],
    ["TRANSPORT_FAILURE", contactedEvidenceResult({
      httpStatus: null,
      jsonValid: null,
      shapeDiagnostic: null,
      parserResult: "UNESTABLISHED",
      firstFailure: "TRANSPORT_FAILURE",
      providerStatusClass: null,
      providerResponseSuccess: null,
      refundIdMatch: null,
      originalTransactionBindingMatch: null,
      currencyMatch: null,
      refundAmountMatch: null,
      refundTransactionIdPresent: null,
      refundDatePresent: null,
    })],
  ] as const)("preserves trusted exit-1 contacted evidence: %s", async (_name, result) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const terminal = contactedEvidenceTerminal(result);
    const harness = supervisorHarness([
      proxy,
      completedChild(1, terminal, "bounded child diagnostic\n"),
    ], { readiness: true });

    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output,
      harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
  });

  it("preserves exact sanitized shape diagnostics for trusted exit-1 evidence", async () => {
    const shape = contactedShapeDiagnostic();
    if (shape.payment.valueClass !== "VALID") throw new Error("expected payment diagnostic");
    const diagnostic: ContactedRefundShapeDiagnostic = Object.freeze({ ...shape,
      payment: Object.freeze({ ...shape.payment,
        unknownKeyClass: "ONE", exactKeysValid: false }) });
    const result = contactedEvidenceResult({ parserResult: "UNKNOWN_SHAPE",
      firstFailure: "PAYMENT_UNKNOWN_KEY", shapeDiagnostic: diagnostic });
    const terminal = contactedEvidenceTerminal(result);
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy, completedChild(1, terminal, "")], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output, harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
  });

  it("accepts parser diagnostics for ordering-sensitive provider keys without echoing them", async () => {
    const providerKeys = ["a", "Z", "혼합-Unicode-秘密"];
    const payment = { status: "REFUND", order_id: "order", currency: "USD", amount: "1.00",
      transaction_id: "transaction", transaction_date: "20260916000000",
      refund_id: "refund", refund_transaction_id: "provider-refund", refund_amount: "1.00" };
    const input: Record<string, unknown> = { rescode: "0000", resmsg: "Success", mid: "mid", payment };
    for (const key of providerKeys) input[key] = "ignored";
    const evidence = parseContactedRefundEvidence(input, {
      targetDispatchAttemptId: "dispatch", mid: "mid", providerOrderId: "order",
      originalTransactionId: "transaction", currency: "USD", originalAmount: 100,
      preContactRefundableBalance: 100, expectedRefundAmount: 100, expectedRefundType: "F",
      providerOperationKey: "refund", language: "EN",
    });
    const result = contactedEvidenceResult(evidence);
    const terminal = contactedEvidenceTerminal(result);
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy, completedChild(1, terminal, "")], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output, harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([terminal]);
    for (const key of providerKeys) expect(terminal).not.toContain(JSON.stringify(key));
  });

  it("rejects value-bearing contacted shape diagnostics without echoing them", async () => {
    const shape = contactedShapeDiagnostic();
    const result = contactedEvidenceResult({ parserResult: "UNKNOWN_SHAPE",
      firstFailure: "PAYMENT_FIELD_INVALID",
      shapeDiagnostic: { ...shape, rawProviderValue: "secret-like-private-value" } });
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([
      proxy, completedChild(1, contactedEvidenceTerminal(result), ""),
    ], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output, harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(JSON.stringify(harness.stderr)).not.toContain("secret-like-private-value");
  });

  it.each([
    ["malformed", "not-json\n"],
    ["empty", ""],
    ["wrong schema", contactedEvidenceTerminal(contactedEvidenceResult({
      schema: "wrong-contacted-evidence-schema",
    }))],
  ])("rejects exit-1 contacted evidence with %s stdout", async (_name, terminal) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([
      proxy,
      completedChild(1, terminal, ""),
    ], { readiness: true });

    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output,
      harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
  });

  it("rejects exit 2 even when stdout is superficially valid contacted evidence", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const terminal = contactedEvidenceTerminal(contactedEvidenceResult({
      parserResult: "UNESTABLISHED",
      firstFailure: "TRANSPORT_FAILURE",
    }));
    const harness = supervisorHarness([
      proxy,
      completedChild(2, terminal, ""),
    ], { readiness: true });

    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output,
      harness.dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
  });

  it("preserves CONFIG_INVALID evidence from a real exit-1 child process", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const terminal = contactedEvidenceTerminal(contactedEvidenceResult({
      databaseDisconnected: false,
      inquiryCount: 0,
      httpStatus: null,
      jsonValid: null,
      shapeDiagnostic: null,
      parserResult: "UNESTABLISHED",
      firstFailure: "CONFIG_INVALID",
      providerStatusClass: null,
      providerResponseSuccess: null,
      refundIdMatch: null,
      originalTransactionBindingMatch: null,
      currencyMatch: null,
      refundAmountMatch: null,
      refundTransactionIdPresent: null,
      refundDatePresent: null,
    }));
    let spawnCount = 0;
    const harness = supervisorHarness([], { readiness: true });
    const dependencies: RefundWorkerContainerSupervisorDependencies = Object.freeze({
      ...harness.dependencies,
      spawn: () => {
        spawnCount += 1;
        if (spawnCount === 1) {
          proxy.start();
          return proxy;
        }
        const processChild = spawn(process.execPath, [
          "--eval",
          `process.stdout.write(${JSON.stringify(terminal)}); process.exitCode = 1;`,
        ], { stdio: ["ignore", "pipe", "pipe"] });
        if (!processChild.stdout || !processChild.stderr) throw new Error("MISSING_CHILD_STREAM");
        const stdout = processChild.stdout;
        const stderr = processChild.stderr;
        return Object.freeze({
          stdout,
          stderr,
          once: (event: "close", listener: (
            code: number | null,
            signal: NodeJS.Signals | null,
          ) => void) => processChild.once(event, listener),
          kill: (signal: NodeJS.Signals) => processChild.kill(signal),
          get exitCode() { return processChild.exitCode; },
          get signalCode() { return processChild.signalCode; },
        });
      },
    });

    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-refund-evidence-once"],
      { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL },
      harness.output,
      dependencies,
    )).toBe(1);
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
  });

  it("rejects the B + minimal D fixture under the stale canary contract", () => {
    expect(parseEximbayRefundCanaryEnvironment(REFUND_REENTRY_ENV)).toBeNull();
  });

  it.each([
    { REFUND_EXECUTION_WORKER_ENABLED: undefined },
    { REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "DISABLED" },
    { REFUND_EXECUTION_LEASE_ENABLED: undefined },
    { REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: undefined },
    { REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: undefined },
    { REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: undefined },
    { CLOUD_RUN_TASK_COUNT: "2" },
    { CLOUD_RUN_TASK_INDEX: "1" },
    { CLOUD_RUN_TASK_ATTEMPT: "1" },
    { EXIMBAY_SANDBOX_API_KEY: "forbidden-inline-key" },
    { EXIMBAY_BASE_URL: "https://sample.invalid" },
    { REFUND_EXECUTION_CLAIM_ENABLED: "ENABLED" },
    { DATABASE_URL: "malformed" },
    { REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "wrong-instance" },
    { PGHOST: "override" },
    { CSQL_PROXY_ADDRESS: "override" },
  ])("fails closed before any spawn for required re-entry config %j", async (delta) => {
    const harness = supervisorHarness([], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"],
      { ...REFUND_REENTRY_ENV, ...delta },
      harness.output,
      harness.dependencies,
    )).toBe(1);
    expect(harness.spawnCalls).toEqual([]);
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({
      hostResult: { code: "CONFIG_INVALID", childProcessState: "NOT_STARTED", proxyLifecycle: "NOT_STARTED" },
    });
  });

  it("reports a trustworthy re-entry child success separately from clean host cleanup", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const child = completedChild(0, reentryTerminal(reentrySuccess()), "");
    const harness = supervisorHarness([proxy, child], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"],
      REFUND_REENTRY_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.spawnCalls[1]).toMatchObject({
      executable: process.execPath,
      args: ["/test/eximbay-refund-reentry.mjs"],
    });
    const terminal = parseOnlyOutput(harness.stdout);
    expect(terminal).toMatchObject({
      schema: "mira-refund-eximbay-reentry-supervisor/v2",
      ok: true,
      childOperationResult: {
        evidence: "TRUSTWORTHY",
        result: reentrySuccess(),
        providerEffects: {
          preflightRetrieveCount: 1,
          reconciliationLookupCount: 0,
          cancellationCount: 1,
        },
      },
      hostResult: {
        ok: true,
        code: "COMPLETE",
        childValidation: "TRUSTED",
        childFraming: {
          stderrBytes: 0,
          stdoutLfCount: 1,
          stdoutCrCount: 0,
          terminalCandidateCount: 1,
          terminalUtf8: "VALID",
        },
      },
    });
    expect(harness.stderr).toEqual([]);
  });

  it("preserves a trustworthy failed child and its effects when proxy cleanup fails", async () => {
    const proxy = runningChild({ closeOnTerm: null });
    const operation = reentryFailure();
    const diagnostic = "BOUNDED_NON_AUTHORITATIVE_DIAGNOSTIC\n";
    const child = completedChild(1, reentryTerminal(operation), diagnostic);
    const harness = supervisorHarness([proxy, child], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"],
      REFUND_REENTRY_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    const terminal = parseOnlyOutput(harness.stdout);
    expect(terminal).toMatchObject({
      ok: false,
      childOperationResult: {
        evidence: "TRUSTWORTHY",
        result: operation,
        providerEffects: {
          preflightRetrieveCount: 1,
          reconciliationLookupCount: 0,
          cancellationCount: 1,
        },
      },
      hostResult: {
        ok: false,
        code: "PROXY_LIFECYCLE_FAILED",
        proxyLifecycle: "READY_CLEANUP_UNCONFIRMED",
        childStreamState: "BOTH",
        childFraming: {
          stderrBytes: Buffer.byteLength(diagnostic),
          stdoutLfCount: 1,
          stdoutCrCount: 0,
          terminalCandidateCount: 1,
          terminalUtf8: "VALID",
        },
      },
    });
    expect(harness.stderr).toEqual([]);
  });

  it.each([
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: false, httpStatus: null },
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: true, httpStatus: null },
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: 503 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "IDENTITY_MISMATCH", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "REJECTION", code: null, responseReceived: true, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "REJECTION", code: "LEASE_FENCE_MISMATCH", responseReceived: true, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "REJECTION", code: "PREFLIGHT_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "EXCEPTION", code: null, responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "REJECTION", code: "REFUND_NOT_LAWFUL", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT", responseReceived: null, httpStatus: null },
    { stage: "LEASE_CONTINUATION", kind: "EXCEPTION", code: null, responseReceived: null, httpStatus: null },
  ] satisfies EximbayPreflightDiagnostic[])("preserves producer diagnostic %j without changing failed-child effects or retry behavior", async (diagnostic) => {
    expect(isEximbayPreflightDiagnostic(diagnostic)).toBe(true);
    const operation: EximbayRefundReentryResult = {
      ...reentryFailure(), code: "RETRIEVE_CONTACTED", cancellationCount: 0,
      diagnostic,
      ...(diagnostic.stage === "DISPATCH_AUTHORIZATION" && diagnostic.responseReceived === null
        ? { code: "NO_PROVIDER_CONTACT", terminalClass: "SAFE_STOP", preflightRetrieveCount: 0 } as const : {}),
    };
    const harness = supervisorHarness([
      runningChild({ closeOnTerm: 0 }), completedChild(1, reentryTerminal(operation), ""),
    ], { readiness: true });
    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"], REFUND_REENTRY_ENV, harness.output, harness.dependencies,
    );
    expect(exit).toBe(1);
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({ childOperationResult: {
      evidence: "TRUSTWORTHY", result: operation,
      providerEffects: { preflightRetrieveCount: operation.preflightRetrieveCount, cancellationCount: 0 },
    } });
  });

  it.each([
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: false, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "EXCEPTION", code: null, responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT", responseReceived: null, httpStatus: null },
    { stage: "LEASE_CONTINUATION", kind: "EXCEPTION", code: null, responseReceived: null, httpStatus: null },
  ] satisfies EximbayPreflightDiagnostic[])("cross-validates producer effect tuples for %j", async (diagnostic) => {
    for (const [retrieve, cancel] of [[0, 0], [1, 0], [1, 1]] as const) {
      const operation: EximbayRefundReentryResult = {
        ...reentryFailure(), diagnostic, preflightRetrieveCount: retrieve, cancellationCount: cancel,
        code: cancel ? "CANCEL_CONTACT_MAY_HAVE_OCCURRED" : retrieve ? "RETRIEVE_CONTACTED" : "NO_PROVIDER_CONTACT",
        terminalClass: retrieve ? "PROVIDER_EFFECT_POSSIBLE" : "SAFE_STOP",
      };
      const supported = diagnostic.stage === "LEASE_CONTINUATION"
        || (cancel === 0 && retrieve === (diagnostic.responseReceived === null ? 0 : 1));
      const harness = supervisorHarness([
        runningChild({ closeOnTerm: 0 }), completedChild(1, reentryTerminal(operation), ""),
      ], { readiness: true });
      await runRefundWorkerContainerSupervisor(
        ["eximbay-refund-reentry-once"], REFUND_REENTRY_ENV, harness.output, harness.dependencies,
      );
      expect(parseOnlyOutput(harness.stdout)).toMatchObject({ childOperationResult: supported
        ? { evidence: "TRUSTWORTHY", result: operation }
        : { evidence: "UNKNOWN", result: null, providerEffects: { preflightRetrieveCount: null, cancellationCount: null, reconciliationLookupCount: null } } });
      expect(harness.spawnCalls).toHaveLength(2);
    }
  });

  it("rejects success carrying a failure diagnostic", async () => {
    const operation = { ...reentrySuccess(), diagnostic: {
      stage: "LEASE_CONTINUATION", kind: "EXCEPTION", code: null, responseReceived: null, httpStatus: null,
    } };
    const harness = supervisorHarness([
      runningChild({ closeOnTerm: 0 }), completedChild(0, `${JSON.stringify(operation)}\n`, ""),
    ], { readiness: true });
    await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"], REFUND_REENTRY_ENV, harness.output, harness.dependencies,
    );
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({ childOperationResult: {
      evidence: "UNKNOWN", result: null, providerEffects: { preflightRetrieveCount: null, cancellationCount: null, reconciliationLookupCount: null },
    } });
  });

  it.each([true, false])("pins JSON.parse last-wins duplicate diagnostic members (valid last: %s)", async (validLast) => {
    const valid = JSON.stringify({ stage: "RETRIEVE", kind: "REJECTION", code: "INVALID_JSON", responseReceived: true, httpStatus: 200 });
    const invalid = '{"stage":"sensitive-duplicate-sentinel"}';
    const operation = { ...reentryFailure(), code: "RETRIEVE_CONTACTED", cancellationCount: 0 };
    const raw = JSON.stringify(operation).slice(0, -1)
      + `,"diagnostic":${validLast ? invalid : valid},"diagnostic":${validLast ? valid : invalid}}\n`;
    const harness = supervisorHarness([
      runningChild({ closeOnTerm: 0 }), completedChild(1, raw, ""),
    ], { readiness: true });
    await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"], REFUND_REENTRY_ENV, harness.output, harness.dependencies,
    );
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({ childOperationResult: {
      evidence: validLast ? "TRUSTWORTHY" : "UNKNOWN",
    } });
    expect(harness.stdout.join("")).not.toContain("sensitive-duplicate-sentinel");
  });

  it.each([
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: 200 },
    { stage: "OBSERVATION_TRANSACTION", kind: "REJECTION", code: "NON_2XX", responseReceived: false, httpStatus: null },
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: null },
    { stage: "RETRIEVE", kind: "REJECTION", code: "TRANSPORT_FAILURE", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "INVALID_JSON", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: false, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "EXCEPTION", code: "TRANSPORT_FAILURE", responseReceived: null, httpStatus: null },
    { stage: "RETRIEVE", kind: "REJECTION", code: "INVALID_JSON", responseReceived: true, httpStatus: 503 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "IDENTITY_MISMATCH", responseReceived: false, httpStatus: null },
    { stage: "RETRIEVE", kind: "REJECTION", code: "LEASE_EXPIRED", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "REJECTION", code: null, responseReceived: true, httpStatus: 200 },
    { stage: "OBSERVATION_TRANSACTION", kind: "EXCEPTION", code: null, responseReceived: false, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "REJECTION", code: "REFUND_NOT_LAWFUL", responseReceived: true, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "REJECTION", code: "PERSISTENCE_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "OBSERVATION_TRANSACTION", kind: "EXCEPTION", code: "LEASE_EXPIRED", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: 503 },
    { stage: "DISPATCH_AUTHORIZATION", kind: "REJECTION", code: "PREFLIGHT_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "REJECTION", code: "PERSISTENCE_CONFLICT", responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "REJECTION", code: "LEASE_EXPIRED", responseReceived: null, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: null, responseReceived: true, httpStatus: null },
    { stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT", responseReceived: false, httpStatus: null },
    { stage: "LEASE_CONTINUATION", kind: "REJECTION", code: "LEASE_EXPIRED", responseReceived: null, httpStatus: null },
    { stage: "LEASE_CONTINUATION", kind: "EXCEPTION", code: null, responseReceived: true, httpStatus: 200 },
    { stage: "UNKNOWN", kind: "EXCEPTION", code: null, responseReceived: null, httpStatus: null },
    { stage: "RETRIEVE", kind: "UNKNOWN", code: "NON_2XX", responseReceived: true, httpStatus: 503 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "sensitive-raw-error", responseReceived: true, httpStatus: 200 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: false, httpStatus: 503 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: 999 },
    { stage: "RETRIEVE", kind: "REJECTION", code: "NON_2XX", responseReceived: true, httpStatus: 503, body: "sensitive-payload" },
  ])("rejects untrusted diagnostic shape or values without copying them", async (diagnostic) => {
    expect(isEximbayPreflightDiagnostic(diagnostic)).toBe(false);
    const operation = { ...reentryFailure(), diagnostic };
    const harness = supervisorHarness([
      runningChild({ closeOnTerm: 0 }), completedChild(1, `${JSON.stringify(operation)}\n`, ""),
    ], { readiness: true });
    await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"], REFUND_REENTRY_ENV, harness.output, harness.dependencies,
    );
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({ childOperationResult: {
      evidence: "UNKNOWN", result: null,
    } });
    expect(harness.stdout.join("")).not.toContain("sensitive-");
  });

  it("reports malformed re-entry child evidence with UNKNOWN provider effects", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const child = completedChild(1, '{"ok":false}\n', "diagnostic only\n");
    const harness = supervisorHarness([proxy, child], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"],
      REFUND_REENTRY_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({
      childOperationResult: {
        evidence: "UNKNOWN",
        result: null,
        providerEffects: {
          preflightRetrieveCount: null,
          reconciliationLookupCount: null,
          cancellationCount: null,
        },
      },
      hostResult: {
        ok: false,
        code: "CHILD_EVIDENCE_INVALID",
        childValidation: "REENTRY_KEY_SET_MISMATCH",
      },
    });
    expect(harness.stderr).toEqual([]);
  });

  it.each([
    {
      label: "fatal UTF-8 failure",
      stdout: Buffer.concat([
        Buffer.from('{"ok":false,"x":"'),
        Buffer.from([0xc3]),
        Buffer.from('"}\n'),
      ]),
      exitCode: 1,
      validation: "INVALID_UTF8",
      framing: { terminalCandidateCount: 1, terminalUtf8: "INVALID" },
    },
    {
      label: "multiple stdout terminals",
      stdout: `${reentryTerminal(reentryFailure())}${reentryTerminal(reentryFailure())}`,
      exitCode: 1,
      validation: "LINE_CONTRACT_VIOLATION",
      framing: { terminalCandidateCount: 2, terminalUtf8: "VALID" },
    },
    {
      label: "CR framing",
      stdout: reentryTerminal(reentryFailure()).replace("\n", "\r\n"),
      exitCode: 1,
      validation: "LINE_CONTRACT_VIOLATION",
      framing: { stdoutCrCount: 1, terminalCandidateCount: 1, terminalUtf8: "VALID" },
    },
    {
      label: "stdout overflow",
      stdout: `${"x".repeat(64 * 1024)}\n`,
      exitCode: 1,
      validation: "OUTPUT_OVERFLOW",
      framing: { terminalCandidateCount: 1, terminalUtf8: "NOT_ATTEMPTED" },
    },
    {
      label: "exit and result mismatch",
      stdout: reentryTerminal(reentryFailure()),
      exitCode: 0,
      validation: "REENTRY_EXIT_CODE_MISMATCH",
      framing: { terminalCandidateCount: 1, terminalUtf8: "VALID" },
    },
  ])("rejects $label without deriving provider effects", async ({
    stdout,
    exitCode,
    validation,
    framing,
  }) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const child = completedChild(exitCode, stdout, "bounded diagnostic\n");
    const harness = supervisorHarness([proxy, child], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-refund-reentry-once"],
      REFUND_REENTRY_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(parseOnlyOutput(harness.stdout)).toMatchObject({
      childOperationResult: {
        evidence: "UNKNOWN",
        result: null,
        providerEffects: {
          preflightRetrieveCount: null,
          reconciliationLookupCount: null,
          cancellationCount: null,
        },
      },
      hostResult: {
        code: "CHILD_EVIDENCE_INVALID",
        childValidation: validation,
        childFraming: framing,
      },
    });
    expect(harness.stderr).toEqual([]);
  });

  it.each([0, 1] as const)(
    "relays a validated CONTACTED provider count %i after normal proxy cleanup",
    async (providerRetrieveCount) => {
      const proxy = runningChild({ closeOnTerm: 0 });
      const { child: runner, stdout: terminal } = await completedContactedChild(
        contactedReconciliationResult(providerRetrieveCount),
      );
      const harness = supervisorHarness([proxy, runner], { readiness: true });

      const exit = await runRefundWorkerContainerSupervisor(
        ["eximbay-contacted-reconciliation-once"],
        CONTACTED_RECONCILIATION_ENV,
        harness.output,
        harness.dependencies,
      );

      expect(exit).toBe(0);
      expect(harness.stdout).toEqual([terminal]);
      expect(harness.stderr).toEqual([]);
    },
  );

  it("relays one exact validated contacted provider observation", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const result = contactedTransactionObservationResult();
    const { child: runner, stdout: terminal } = await completedContactedChild(result);
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.stdout).toEqual([terminal]);
    expect(JSON.parse(terminal)).toEqual(result);
    expect(harness.stderr).toEqual([]);
  });

  it("admits the exact bounded incomplete-detail observation shape", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const observation = contactedIncompleteProviderObservation();
    const { child: runner, stdout: terminal } = await completedContactedChild(
      contactedTransactionObservationResult(observation),
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.stdout).toEqual([terminal]);
    expect(harness.stderr).toEqual([]);
  });

  it("retains validated contacted provider observation when proxy cleanup is unconfirmed", async () => {
    const proxy = runningChild({ closeOnTerm: null });
    const observation = contactedProviderObservation();
    const { child: runner } = await completedContactedChild(
      contactedTransactionObservationResult(observation),
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toHaveLength(1);
    const [diagnostic, terminal, trailing] = harness.stderr[0]?.split("\n") ?? [];
    expect(trailing).toBe("");
    expect(JSON.parse(diagnostic ?? "null")).toMatchObject({
      childValidation: "TRUSTED",
      proxyLifecycle: "READY_CLEANUP_UNCONFIRMED",
    });
    expect(JSON.parse(terminal ?? "null")).toEqual({
      ok: false,
      code: "SYSTEMIC_FAILURE",
      providerRetrieveCount: 1,
      providerObservation: observation,
    });
  });

  it.each([
    ["unknown observation key", () => ({
      ...contactedProviderObservation(),
      rawPayload: "RAW_PROVIDER_PAYLOAD_MUST_NOT_ESCAPE",
    })],
    ["overlong transaction identifier", () => {
      const observation = contactedProviderObservation();
      return {
        ...observation,
        providerResult: {
          ...observation.providerResult,
          provider: {
            ...observation.providerResult.provider,
            transactionId: "x".repeat(513),
          },
        },
      };
    }],
    ["unknown provider status", () => {
      const observation = contactedProviderObservation();
      return {
        ...observation,
        providerResult: {
          ...observation.providerResult,
          provider: { ...observation.providerResult.provider, status: "CAPTURED" },
        },
      };
    }],
    ["invalid provider money", () => {
      const observation = contactedProviderObservation();
      return {
        ...observation,
        providerResult: {
          ...observation.providerResult,
          provider: { ...observation.providerResult.provider, amount: "1e2" },
        },
      };
    }],
    ["incoherent order binding", () => {
      const observation = contactedProviderObservation();
      return {
        ...observation,
        providerResult: {
          ...observation.providerResult,
          provider: { ...observation.providerResult.provider, orderId: "different-order" },
        },
      };
    }],
  ] as const)("rejects %s in contacted provider evidence", async (_name, providerObservation) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(0, contactedReconciliationTerminalValue({
      disposition: "TRANSACTION_OBSERVED",
      providerRetrieveCount: 1,
      providerObservation: providerObservation(),
    }), "");
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childValidation: "INVALID_PROVIDER_OBSERVATION",
    });
    expect(JSON.stringify(harness.stderr)).not.toContain("MUST_NOT_ESCAPE");
  });

  it.each([0, 1] as const)(
    "retains validated CONTACTED provider count %i when proxy cleanup is unconfirmed",
    async (providerRetrieveCount) => {
      const proxy = runningChild({ closeOnTerm: null });
      const { child: runner } = await completedContactedChild(
        contactedReconciliationResult(providerRetrieveCount),
      );
      const harness = supervisorHarness([proxy, runner], { readiness: true });

      const exit = await runRefundWorkerContainerSupervisor(
        ["eximbay-contacted-reconciliation-once"],
        CONTACTED_RECONCILIATION_ENV,
        harness.output,
        harness.dependencies,
      );

      expect(exit).toBe(1);
      expect(proxy.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
      expect(harness.stdout).toEqual([]);
      expectContactedSupervisorFailure(harness.stderr, {
        childValidation: "TRUSTED",
        proxyLifecycle: "READY_CLEANUP_UNCONFIRMED",
      }, providerRetrieveCount);
    },
  );

  it("retains validated CONTACTED provider evidence after a ready proxy exits during work", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = runningChild({ closeOnTerm: null });
    const harness = supervisorHarness([proxy, runner], { readiness: true });
    const result = runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );
    await harness.spawned(2);

    proxy.close(1, null);
    runner.stdout.write(contactedReconciliationTerminal(1));
    runner.close(0, null);

    expect(await result).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childValidation: "TRUSTED",
      proxyLifecycle: "READY_PREMATURE_EXIT",
    }, 1);
  });

  it("keeps provider evidence unknown when the CONTACTED child cannot be spawned", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childSpawnState: "FAILED",
      childProcessState: "NOT_STARTED",
      childExitCode: null,
      childSignal: null,
      childStreamState: "NOT_CAPTURED",
      childOutputOverflow: false,
      childValidation: "NOT_ATTEMPTED",
    });
  });

  it.each([
    ["schema key-set rejection", contactedReconciliationTerminalValue({
      providerRetrieveCount: 1,
      durableRelease: undefined,
    }), "SUCCESS_KEY_SET_MISMATCH", false],
    ["malformed JSON", '{"providerRetrieveCount":1\n', "INVALID_JSON", false],
    [
      "multiple lines",
      `${contactedReconciliationTerminal(1)}${contactedReconciliationTerminal(1)}`,
      "LINE_CONTRACT_VIOLATION",
      false,
    ],
    ["oversized output", `${"x".repeat(64 * 1024)}\n`, "OUTPUT_OVERFLOW", true],
  ] as const)(
    "classifies untrusted CONTACTED provider evidence from %s",
    async (_name, terminal, childValidation, childOutputOverflow) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(0, terminal, "");
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childOutputOverflow,
      childValidation,
    });
    },
  );

  it("does not trust CONTACTED evidence when stdout and stderr are both nonempty", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(
      0,
      contactedReconciliationTerminal(1),
      "UNTRUSTED_DIAGNOSTIC\n",
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childStreamState: "BOTH",
      childValidation: "STREAM_CONTRACT_VIOLATION",
    });
    expect(JSON.stringify(harness.stderr)).not.toContain("UNTRUSTED_DIAGNOSTIC");
  });

  it("retains a validated failed-child provider count through proxy cleanup failure", async () => {
    const proxy = runningChild({ closeOnTerm: null });
    const { child: runner } = await completedContactedChild(
      contactedReconciliationFailureResult(1),
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childExitCode: 1,
      childStreamState: "STDERR_ONLY",
      childValidation: "TRUSTED",
      proxyLifecycle: "READY_CLEANUP_UNCONFIRMED",
    }, 1);
  });

  it("relays a validated database-cleanup failure without erasing provider observation", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const observation = contactedProviderObservation();
    const result: EximbayContactedReconciliationResult = Object.freeze({
      ...contactedReconciliationFailureResult(1),
      cleanupFailure: "DATABASE_DISCONNECT_FAILED",
      providerObservation: observation,
    });
    const { child: runner, stderr: terminal } = await completedContactedChild(result);
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([terminal]);
    expect(JSON.parse(terminal)).toEqual(result);
  });

  it.each([-1, 2, 1.5, "1", null])(
    "rejects invalid CONTACTED providerRetrieveCount %j without trusting it",
    async (providerRetrieveCount) => {
      const proxy = runningChild({ closeOnTerm: 0 });
      const runner = completedChild(0, contactedReconciliationTerminalValue({
        providerRetrieveCount,
      }), "");
      const harness = supervisorHarness([proxy, runner], { readiness: true });

      const exit = await runRefundWorkerContainerSupervisor(
        ["eximbay-contacted-reconciliation-once"],
        CONTACTED_RECONCILIATION_ENV,
        harness.output,
        harness.dependencies,
      );

      expect(exit).toBe(1);
      expect(harness.stdout).toEqual([]);
      expectContactedSupervisorFailure(harness.stderr, {
        childValidation: "INVALID_PROVIDER_RETRIEVE_COUNT",
      });
    },
  );

  it("does not trust a CONTACTED count when the child is signaled before a terminal", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = runningChild({ closeOnTerm: null });
    const harness = supervisorHarness([proxy, runner], { readiness: true });
    const result = runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );
    await harness.spawned(2);

    runner.close(null, "SIGTERM");

    expect(await result).toBe(1);
    expect(harness.stdout).toEqual([]);
    expectContactedSupervisorFailure(harness.stderr, {
      childProcessState: "SIGNAL_TERMINATION",
      childExitCode: null,
      childSignal: "SIGTERM",
      childStreamState: "EMPTY",
      childValidation: "SIGNAL_TERMINATION",
    });
  });

  it("classifies a spawned CONTACTED child that exits without terminal bytes", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(0, "", "");
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childStreamState: "EMPTY",
      childValidation: "MISSING_TERMINAL",
    });
  });

  it("classifies a CONTACTED child whose close state has neither exit code nor signal", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = runningChild({ closeOnTerm: null });
    const harness = supervisorHarness([proxy, runner], { readiness: true });
    const result = runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );
    await harness.spawned(2);

    runner.close(null, null);

    expect(await result).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childProcessState: "CLOSE_STATE_UNAVAILABLE",
      childExitCode: null,
      childStreamState: "EMPTY",
      childValidation: "CLOSE_STATE_UNAVAILABLE",
    });
  });

  it("distinguishes a CONTACTED terminal on the forbidden stream", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(0, "", contactedReconciliationTerminal(1));
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childStreamState: "STDERR_ONLY",
      childValidation: "STREAM_CONTRACT_VIOLATION",
    });
  });

  it("classifies fixed-identity rejection without logging the rejected object", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(0, contactedReconciliationTerminalValue({
      providerRetrieveCount: 1,
      runId: "REJECTED_RUN_ID_SENTINEL",
    }), "");
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childValidation: "FIXED_IDENTITY_MISMATCH",
    });
    expect(JSON.stringify(harness.stderr)).not.toContain("REJECTED_RUN_ID_SENTINEL");
  });

  it("classifies a CONTACTED success terminal whose exit code disagrees", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(1, "", contactedReconciliationTerminal(1));
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childExitCode: 1,
      childStreamState: "STDERR_ONLY",
      childValidation: "SUCCESS_EXIT_CODE_MISMATCH",
    });
  });

  it("never logs raw child streams, provider payloads, or secret-like material", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const runner = completedChild(
      0,
      '{"providerPayload":"RAW_PROVIDER_PAYLOAD_SENTINEL"}\n',
      "RAW_CHILD_STDERR_API_KEY_SECRET_SENTINEL\n",
    );
    const harness = supervisorHarness([proxy, runner], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      CONTACTED_RECONCILIATION_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expectContactedSupervisorFailure(harness.stderr, {
      childStreamState: "BOTH",
      childValidation: "STREAM_CONTRACT_VIOLATION",
    });
    expect(JSON.stringify(harness.stderr)).not.toMatch(
      /RAW_PROVIDER_PAYLOAD_SENTINEL|RAW_CHILD_STDERR_API_KEY_SECRET_SENTINEL/u,
    );
  });

  it("rejects a wrong CONTACTED target before proxy or runner spawn", async () => {
    const harness = supervisorHarness();

    const exit = await runRefundWorkerContainerSupervisor(
      ["eximbay-contacted-reconciliation-once"],
      { ...CONTACTED_RECONCILIATION_ENV,
        MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID: "b".repeat(32) },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.spawnCalls).toEqual([]);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"CONFIG_INVALID"}\n']);
  });

  it("rejects a canonical socket/instance mismatch before any child starts", async () => {
    const harness = supervisorHarness();

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      { ...ENABLED_ENV, REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME:
        "other-project:asia-northeast3:refund-db" },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.spawnCalls).toEqual([]);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(JSON.stringify(harness)).not.toContain("synthetic_password");
    expect(harness.stderr).toEqual(['{"ok":false,"code":"CONFIG_INVALID"}\n']);
  });

  it.each([
    ["missing task count", { CLOUD_RUN_TASK_COUNT: undefined }],
    ["multiple tasks", { CLOUD_RUN_TASK_COUNT: "2" }],
    ["nonzero task index", { CLOUD_RUN_TASK_INDEX: "1" }],
    ["automatic retry", { CLOUD_RUN_TASK_ATTEMPT: "1" }],
    ["noncanonical integer", { CLOUD_RUN_TASK_COUNT: "01" }],
    ["missing job", { CLOUD_RUN_JOB: undefined }],
    ["missing execution", { CLOUD_RUN_EXECUTION: undefined }],
  ])("fails closed for %s before proxy spawn", async (_name, mutation) => {
    const harness = supervisorHarness();

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      { ...ENABLED_ENV, ...mutation },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(64);
    expect(harness.spawnCalls).toEqual([]);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"INVALID_HOST_INPUT"}\n']);
  });

  it("preserves malformed credential classification without readiness admission", async () => {
    const worker = completedChild(78, "", '{"ok":false,"code":"CONFIG_INVALID"}\n');
    const harness = supervisorHarness([worker]);

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      { ...ENABLED_ENV, TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: undefined },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.spawnCalls[0]?.executable).toBe(process.execPath);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"CONFIG_INVALID"}\n']);
  });

  it.each([
    ["proxy override", { CSQL_PROXY_CREDENTIALS_FILE: "TEST_PROXY_SECRET" }],
    ["PG host override", { PGHOST: "TEST_REMOTE_DATABASE_SECRET" }],
    ["malformed DATABASE_URL", { DATABASE_URL: "not-a-database-url" }],
  ])("rejects %s before spawn or readiness", async (_name, mutation) => {
    const harness = supervisorHarness();

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      { ...ENABLED_ENV, ...mutation },
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.spawnCalls).toEqual([]);
    expect(harness.readinessCalls).toBe(0);
    expect(harness.sleepCalls).toEqual([]);
    expect(JSON.stringify(harness.stderr)).not.toMatch(
      /TEST_PROXY_SECRET|TEST_REMOTE_DATABASE_SECRET|cloudsql/iu,
    );
  });

  it("admits a worker after bounded fake readiness retries", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const worker = completedChild(0, '{"ok":true,"code":"CYCLE_COMPLETE"}\n', "");
    const harness = supervisorHarness(
      [proxy, worker],
      { readiness: [false, false, true], readinessTimeoutMs: 750, readinessPollIntervalMs: 250 },
    );

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(0);
    expect(harness.readinessCalls).toBe(3);
    expect(harness.sleepCalls.slice(0, 2)).toEqual([250, 250]);
    expect(harness.spawnCalls[1]?.atMs).toBe(500);
    expect(harness.spawnCalls).toHaveLength(2);
  });

  it("stops at the exact injected readiness timeout and never starts the worker", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness(
      [proxy],
      { readiness: false, readinessTimeoutMs: 750, readinessPollIntervalMs: 250 },
    );

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.readinessCalls).toBe(3);
    expect(harness.sleepCalls.slice(0, 3)).toEqual([250, 250, 250]);
    expect(harness.sleepCalls[3]).toBe(2_000);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"DATABASE_UNAVAILABLE"}\n']);
  });

  it("does not admit a worker after proxy early exit", async () => {
    const proxy = completedChild(1, "", "TEST_PROXY_DIAGNOSTIC_SECRET\n");
    const harness = supervisorHarness([proxy], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(harness.spawnCalls).toHaveLength(1);
    expect(harness.sleepCalls).toEqual([]);
    expect(JSON.stringify(harness.stderr)).not.toContain("TEST_PROXY_DIAGNOSTIC_SECRET");
    expect(harness.stderr).toEqual(['{"ok":false,"code":"DATABASE_UNAVAILABLE"}\n']);
  });

  it("preserves a worker failure after proxy cleanup", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const worker = completedChild(78, "", '{"ok":false,"code":"CONFIG_INVALID"}\n');
    const harness = supervisorHarness([proxy, worker], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(78);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"CONFIG_INVALID"}\n']);
  });

  it("cannot report worker success when proxy cleanup is unconfirmed", async () => {
    const proxy = runningChild({ closeOnTerm: null });
    const worker = completedChild(0, '{"ok":true,"code":"CYCLE_COMPLETE"}\n', "");
    const harness = supervisorHarness([proxy, worker], { readiness: true });

    const exit = await runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );

    expect(exit).toBe(1);
    expect(proxy.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
  });

  it("cannot report worker success after the ready proxy exits during work", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const worker = runningChild({ closeOnTerm: null });
    const harness = supervisorHarness([proxy, worker], { readiness: true });
    const result = runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );
    await harness.spawned(2);

    proxy.stderr.write("TEST_PROXY_RUNTIME_DIAGNOSTIC_SECRET\n");
    proxy.close(1, null);
    worker.stdout.write('{"ok":true,"code":"CYCLE_COMPLETE"}\n');
    worker.close(0, null);

    expect(await result).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual(['{"ok":false,"code":"SYSTEMIC_FAILURE"}\n']);
    expect(JSON.stringify(harness.stderr)).not.toContain(
      "TEST_PROXY_RUNTIME_DIAGNOSTIC_SECRET",
    );
  });

  it("forwards one SIGTERM to an in-flight worker and keeps the proxy until completion", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const worker = runningChild({ closeOnTerm: null });
    const harness = supervisorHarness([proxy, worker], { readiness: true });

    const result = runRefundWorkerContainerSupervisor(
      ["worker-once"],
      ENABLED_ENV,
      harness.output,
      harness.dependencies,
    );
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await harness.spawned(2);

    process.emit("SIGTERM", "SIGTERM");
    process.emit("SIGINT", "SIGINT");
    expect(worker.killCalls).toEqual(["SIGTERM"]);
    expect(proxy.killCalls).toEqual([]);
    expect(settled).toBe(false);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr).toEqual([]);
    worker.stderr.write('{"ok":true,"code":"LIFECYCLE_DRAINED"}\n');
    worker.close(75, null);

    expect(await result).toBe(75);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
    expect(proxy.exitCode).toBe(0);
    expect(worker.exitCode).toBe(75);
    expect(harness.stderr).toEqual([
      '{"ok":true,"code":"LIFECYCLE_DRAINED"}\n',
    ]);
  });

  it("emits no fallback when the supervisor process is forcibly terminated before a result", async () => {
    const fixture = spawnForcedTerminationFixture();
    try {
      await within((async () => {
        if (!fixture.stdout || !fixture.stderr) throw new Error("MISSING_FIXTURE_STREAM");
        const fixtureStdout = fixture.stdout;
        const fixtureStderr = fixture.stderr;
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        fixtureStdout.on("data", (chunk: Buffer) => stdout.push(chunk));
        fixtureStderr.on("data", (chunk: Buffer) => stderr.push(chunk));

        await waitForChildMessage(fixture, "WORKER_STARTED");
        const forwarded = waitForChildMessage(fixture, "WORKER_SIGTERM");
        fixture.kill("SIGTERM");
        await forwarded;
        expect(Buffer.concat(stdout).toString("utf8")).toBe("");
        expect(Buffer.concat(stderr).toString("utf8")).toBe("");

        const closed = waitForChildClose(fixture);
        fixture.kill("SIGKILL");
        const { code, signal } = await closed;

        expect(code).toBeNull();
        expect(signal).toBe("SIGKILL");
        expect(Buffer.concat(stdout).toString("utf8")).toBe("");
        expect(Buffer.concat(stderr).toString("utf8")).toBe("");
      })(), 30_000);
    } finally {
      if (fixture.exitCode === null && fixture.signalCode === null) {
        fixture.kill("SIGKILL");
      }
    }
  }, 60_000);
});

type SpawnCall = Readonly<{
  executable: string;
  args: readonly string[];
  atMs: number;
}>;

function supervisorHarness(
  children: FakeChild[] = [],
  options: Readonly<{
    readiness?: boolean | readonly boolean[];
    readinessTimeoutMs?: number;
    readinessPollIntervalMs?: number;
  }> = {},
) {
  const spawnCalls: SpawnCall[] = [];
  const spawnWaiters: Array<Readonly<{ count: number; resolve: () => void }>> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sleepCalls: number[] = [];
  let readinessCalls = 0;
  let now = 0;
  const dependencies: RefundWorkerContainerSupervisorDependencies = Object.freeze({
    ...defaultRefundWorkerContainerSupervisorDependencies,
    proxyExecutable: "/test/cloud-sql-proxy",
    workerBundle: "/test/refund-execution-worker.mjs",
    preflightBundle: "/test/refund-sandbox-provider-free-preflight.mjs",
    eximbayContactedReconciliationBundle: "/test/eximbay-contacted-reconciliation.mjs",
    eximbayContactedRefundEvidenceBundle: "/test/eximbay-contacted-refund-evidence.mjs",
    eximbayRefundReentryBundle: "/test/eximbay-refund-reentry.mjs",
    spawn: (executable, args) => {
      spawnCalls.push(Object.freeze({
        executable,
        args: Object.freeze([...args]),
        atMs: now,
      }));
      for (const waiter of spawnWaiters) {
        if (spawnCalls.length >= waiter.count) waiter.resolve();
      }
      const child = children.shift();
      if (!child) throw new Error("UNEXPECTED_SPAWN");
      child.start();
      return child;
    },
    fetch: () => {
      const configured = options.readiness ?? false;
      const ok = typeof configured === "boolean"
        ? configured
        : configured[readinessCalls] ?? configured.at(-1) ?? false;
      readinessCalls += 1;
      return Promise.resolve(Object.freeze({ ok }));
    },
    sleep: async (milliseconds) => {
      await Promise.resolve();
      sleepCalls.push(milliseconds);
      now += milliseconds;
    },
    now: () => now,
    proxyReadinessTimeoutMs: options.readinessTimeoutMs ?? 750,
    proxyReadinessPollIntervalMs: options.readinessPollIntervalMs ?? 250,
    inspectSelf: () => Promise.reject(new Error("NOT_USED")),
  });
  return {
    dependencies,
    spawnCalls,
    spawned: (count: number) => (
      spawnCalls.length >= count
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          spawnWaiters.push(Object.freeze({ count, resolve }));
        })
    ),
    get readinessCalls() {
      return readinessCalls;
    },
    sleepCalls,
    stdout,
    stderr,
    output: Object.freeze({
      stdout: Object.freeze({ write: (value: string) => stdout.push(value) }),
      stderr: Object.freeze({ write: (value: string) => stderr.push(value) }),
    }),
  };
}

function spawnForcedTerminationFixture() {
  const supervisorUrl = pathToFileURL(join(
    process.cwd(),
    "src/lib/payment/refund/refund-worker-container-supervisor.ts",
  )).href;
  const source = `
    import { EventEmitter } from "node:events";
    import { PassThrough } from "node:stream";
    import {
      defaultRefundWorkerContainerSupervisorDependencies,
      runRefundWorkerContainerSupervisor,
    } from ${JSON.stringify(supervisorUrl)};

    class FakeChild extends EventEmitter {
      stdout = new PassThrough();
      stderr = new PassThrough();
      exitCode = null;
      signalCode = null;
      worker = false;
      kill(signal) {
        if (this.worker && signal === "SIGTERM") process.send?.("WORKER_SIGTERM");
        return true;
      }
    }

    let spawnCount = 0;
    const dependencies = Object.freeze({
      ...defaultRefundWorkerContainerSupervisorDependencies,
      proxyExecutable: "/test/cloud-sql-proxy",
      workerBundle: "/test/refund-execution-worker.mjs",
      spawn: () => {
        spawnCount += 1;
        const child = new FakeChild();
        child.worker = spawnCount === 2;
        if (child.worker) {
          child.stdout.write('{"ok":true');
          queueMicrotask(() => process.send?.("WORKER_STARTED"));
        }
        return child;
      },
      fetch: async () => Object.freeze({ ok: true }),
      sleep: async () => undefined,
      now: () => 0,
      proxyReadinessTimeoutMs: 25,
      proxyReadinessPollIntervalMs: 5,
      inspectSelf: async () => { throw new Error("NOT_USED"); },
    });
    const output = Object.freeze({
      stdout: Object.freeze({ write: (value) => process.stdout.write(value) }),
      stderr: Object.freeze({ write: (value) => process.stderr.write(value) }),
    });
    void runRefundWorkerContainerSupervisor(
      ["worker-check"],
      {
        REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: ${JSON.stringify(INSTANCE)},
        DATABASE_URL: ${JSON.stringify(DATABASE_URL)},
      },
      output,
      dependencies,
    );
  `;
  return spawn(process.execPath, [
    "--import", "tsx",
    "--input-type=module",
    "--eval", source,
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

function waitForChildMessage(
  child: ReturnType<typeof spawn>,
  expected: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onMessage = (value: unknown) => {
      if (value !== expected) return;
      dispose();
      resolve();
    };
    const onClose = () => {
      dispose();
      reject(new Error(`FIXTURE_CLOSED_BEFORE_${expected}`));
    };
    const dispose = () => {
      child.removeListener("message", onMessage);
      child.removeListener("close", onClose);
    };
    child.on("message", onMessage);
    child.once("close", onClose);
  });
}

function waitForChildClose(
  child: ReturnType<typeof spawn>,
): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
  return new Promise((resolve) => {
    child.once("close", (code, signal) => {
      resolve(Object.freeze({ code, signal }));
    });
  });
}

function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TEST_FIXTURE_TIMEOUT")), milliseconds);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("TEST_FIXTURE_REJECTION"));
      },
    );
  });
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killCalls: NodeJS.Signals[] = [];
  readonly #begin: (child: FakeChild) => void;
  readonly #closeOnTerm: number | null;

  constructor(begin: (child: FakeChild) => void, closeOnTerm: number | null = 0) {
    super();
    this.#begin = begin;
    this.#closeOnTerm = closeOnTerm;
  }

  start() {
    queueMicrotask(() => this.#begin(this));
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killCalls.push(signal);
    if (this.#closeOnTerm !== null && this.exitCode === null && this.signalCode === null) {
      queueMicrotask(() => this.close(this.#closeOnTerm, null));
    }
    return true;
  }

  close(code: number | null, signal: NodeJS.Signals | null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("close", code, signal);
  }
}

function completedChild(
  exitCode: number,
  stdout: string | Buffer,
  stderr: string | Buffer,
): FakeChild {
  return new FakeChild((child) => {
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.close(exitCode, null);
  });
}

function runningChild(options: Readonly<{ closeOnTerm: number | null }>): FakeChild {
  return new FakeChild(() => undefined, options.closeOnTerm);
}

function reentrySuccess(): EximbayRefundReentryResult {
  return Object.freeze({
    schema: "mira-refund-eximbay-reentry-result/v1",
    ok: true,
    code: "KNOWN_SUCCESS",
    terminalClass: "REFUND_SUCCEEDED",
    preflightRetrieveCount: 1,
    reconciliationLookupCount: 0,
    cancellationCount: 1,
    reentry: "FORBIDDEN",
    cleanupFailures: Object.freeze([]),
  });
}

function reentryFailure(): EximbayRefundReentryResult {
  return Object.freeze({
    schema: "mira-refund-eximbay-reentry-result/v1",
    ok: false,
    code: "CANCEL_CONTACT_MAY_HAVE_OCCURRED",
    terminalClass: "PROVIDER_EFFECT_POSSIBLE",
    preflightRetrieveCount: 1,
    reconciliationLookupCount: 0,
    cancellationCount: 1,
    reentry: "FORBIDDEN",
    cleanupFailures: Object.freeze([]),
  });
}

function reentryTerminal(result: EximbayRefundReentryResult): string {
  return `${JSON.stringify(result)}\n`;
}

function parseOnlyOutput(output: readonly string[]): unknown {
  expect(output).toHaveLength(1);
  return JSON.parse(output[0] ?? "null");
}

function contactedEvidenceResult(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const result: ContactedEvidenceResult = Object.freeze({
    schema: "mira-eximbay-contacted-refund-evidence/v1",
    diagnosticCode: "CONTACTED_REFUND_EVIDENCE",
    terminalClass: "READ_ONLY_CONTACTED_REFUND_EVIDENCE",
    databaseDisconnected: true,
    inquiryCount: 1,
    httpStatus: 200,
    jsonValid: true,
    parserResult: "MATCHED_REFUND_TRANSACTION",
    firstFailure: null,
    providerStatusClass: "REFUND",
    providerResponseSuccess: true,
    refundIdMatch: true,
    originalTransactionBindingMatch: true,
    currencyMatch: true,
    refundAmountMatch: true,
    refundTransactionIdPresent: true,
    refundDatePresent: false,
    shapeDiagnostic: contactedShapeDiagnostic(),
  });
  return Object.freeze({ ...result, ...overrides });
}

function contactedShapeDiagnostic(): ContactedRefundShapeDiagnostic {
  const rootFields: ContactedRefundShapeDiagnostic["root"] = {
    valueClass: "VALID",
    knownKeyPresence: { rescode: true, resmsg: true, mid: true, payment: true,
      card_info: false, other_param: false },
    missingRequiredKeys: [],
    unknownKeyClass: "NONE",
    exactKeysValid: true,
    fields: { rescode: "VALID", resmsg: "VALID", mid: "VALID", payment: "VALID",
      card_info: "ABSENT", other_param: "ABSENT" },
  };
  const paymentFields: Readonly<Record<string, ContactedRefundValueClass>> = {
    status: "VALID", order_id: "VALID", currency: "VALID", amount: "VALID",
    transaction_id: "VALID", transaction_date: "VALID", auth_code: "ABSENT",
    balance: "ABSENT", payment_method: "ABSENT", paypal_payer_id: "ABSENT",
    refund_id: "VALID", refund_transaction_id: "VALID", refund_amount: "VALID",
  };
  const absentObject = (fieldNames: readonly string[]): ContactedRefundShapeDiagnostic["cardInfo"] => {
    const fields: Record<string, ContactedRefundValueClass> = {};
    for (const key of fieldNames) fields[key] = "ABSENT";
    const knownKeyPresence: Record<string, boolean> = {};
    for (const key of fieldNames) knownKeyPresence[key] = false;
    return Object.freeze({ present: false, objectValid: false,
      knownKeyPresence: Object.freeze(knownKeyPresence), unknownKeyClass: "NONE",
      fields: Object.freeze(fields) });
  };
  return Object.freeze({
    root: Object.freeze(rootFields),
    payment: Object.freeze({ valueClass: "VALID", knownKeyPresence: Object.freeze({
      status: true, order_id: true, currency: true, amount: true, transaction_id: true,
      transaction_date: true, auth_code: false, balance: false, payment_method: false,
      paypal_payer_id: false, refund_id: true, refund_transaction_id: true, refund_amount: true,
    }), missingRequiredKeys: Object.freeze([]), unknownKeyClass: "NONE",
      exactKeysValid: true, fields: Object.freeze(paymentFields) }),
    cardInfo: absentObject(["card_number1", "card_number4", "cardno1", "cardno4"]),
    otherParam: absentObject(["param1", "param2"]),
  });
}

function contactedEvidenceTerminal(result: unknown): string {
  return `${JSON.stringify(result)}\n`;
}

function contactedReconciliationTerminal(providerRetrieveCount: 0 | 1): string {
  return `${JSON.stringify(contactedReconciliationResult(providerRetrieveCount))}\n`;
}

function contactedReconciliationResult(
  providerRetrieveCount: 0 | 1,
): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: true,
    code: "CONTACTED_RECONCILIATION_COMPLETE",
    terminalClass: "RECONCILIATION_COMPLETED",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    disposition: "OUTCOME_UNKNOWN",
    providerRetrieveCount,
    durableRelease: "NOT_REPORTED",
  });
}

function contactedReconciliationTerminalValue(
  overrides: Readonly<Record<string, unknown>>,
): string {
  return `${JSON.stringify({
    ok: true,
    code: "CONTACTED_RECONCILIATION_COMPLETE",
    terminalClass: "RECONCILIATION_COMPLETED",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    disposition: "OUTCOME_UNKNOWN",
    providerRetrieveCount: overrides.providerRetrieveCount,
    durableRelease: "NOT_REPORTED",
    ...overrides,
  })}\n`;
}

function contactedReconciliationFailureResult(
  providerRetrieveCount: 0 | 1,
): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: false,
    code: "INTERNAL_FAILURE",
    terminalClass: "HOST_FAILURE",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    providerRetrieveCount,
    durableRelease: "NOT_REPORTED",
  });
}

function contactedTransactionObservationResult(
  providerObservation: EximbayContactedProviderObservation = contactedProviderObservation(),
): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: true,
    code: "CONTACTED_RECONCILIATION_COMPLETE",
    terminalClass: "RECONCILIATION_COMPLETED",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    disposition: "TRANSACTION_OBSERVED",
    providerRetrieveCount: 1,
    durableRelease: "NOT_REPORTED",
    providerObservation,
  });
}

function contactedProviderObservation(): EximbayContactedProviderObservation {
  return Object.freeze({
    schema: "eximbay.contacted-reconciliation.provider-observation",
    version: 1,
    application: Object.freeze({
      operationRunId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
      checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
      paymentId: "payment-1",
      providerOrderId: "provider-order-1",
      expectedAmountMinor: 100,
      expectedCurrency: "USD",
    }),
    providerResult: Object.freeze({
      admission: "TRANSACTION_DETAIL_ADMITTED",
      resultCode: "0000",
      mode: "SANDBOX",
      binding: Object.freeze({
        merchant: "MATCH",
        providerOrder: "MATCH",
        money: "MATCH",
      }),
      provider: Object.freeze({
        transactionId: "transaction-1",
        orderId: "provider-order-1",
        status: "SALE",
        amount: "1.00",
        currency: "USD",
        transactionDate: "20260901010203",
      }),
    }),
  });
}

function contactedIncompleteProviderObservation(): EximbayContactedProviderObservation {
  const observation = contactedProviderObservation();
  return Object.freeze({
    ...observation,
    providerResult: Object.freeze({
      admission: "INCOMPLETE_TRANSACTION_DETAIL",
      resultCode: "0000",
      mode: "SANDBOX",
      binding: Object.freeze({
        merchant: "NOT_ESTABLISHED",
        providerOrder: "NOT_ESTABLISHED",
        money: "NOT_ESTABLISHED",
      }),
      provider: null,
    }),
  });
}

async function completedContactedChild(
  result: EximbayContactedReconciliationResult,
): Promise<Readonly<{ child: FakeChild; stdout: string; stderr: string }>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await reconciliationProcessMain(
    [],
    CONTACTED_RECONCILIATION_ENV,
    Object.freeze({
      stdout: Object.freeze({ write: (value: string) => stdout.push(value) }),
      stderr: Object.freeze({ write: (value: string) => stderr.push(value) }),
    }),
    () => Promise.resolve(result),
  );
  const stdoutValue = stdout.join("");
  const stderrValue = stderr.join("");
  return Object.freeze({
    child: completedChild(exitCode, stdoutValue, stderrValue),
    stdout: stdoutValue,
    stderr: stderrValue,
  });
}

function expectContactedSupervisorFailure(
  stderr: readonly string[],
  overrides: Readonly<Record<string, unknown>>,
  providerRetrieveCount: 0 | 1 | null = null,
): void {
  expect(stderr).toHaveLength(1);
  const [diagnosticLine, terminalLine, trailing] = stderr[0]?.split("\n") ?? [];
  expect(trailing).toBe("");
  expect(JSON.parse(diagnosticLine ?? "null")).toEqual({
    event: "CONTACTED_RECONCILIATION_SUPERVISOR_FAILURE",
    childSpawnState: "SUCCEEDED",
    childProcessState: "NORMAL_EXIT",
    childExitCode: 0,
    childSignal: null,
    childStreamState: "STDOUT_ONLY",
    childOutputOverflow: false,
    childValidation: "TRUSTED",
    proxyLifecycle: "READY_CLEANUP_CONFIRMED",
    ...overrides,
  });
  expect(terminalLine).toBe(providerRetrieveCount === null
    ? '{"ok":false,"code":"SYSTEMIC_FAILURE"}'
    : `{"ok":false,"code":"SYSTEMIC_FAILURE","providerRetrieveCount":${providerRetrieveCount}}`);
}


describe("read-only diagnostic supervisor", () => {
  const env = { ...diagnosticEnvironment(), REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE, DATABASE_URL };
  const command = ["eximbay-retrieve-shape-diagnostic-once"];
  it("fails closed before proxy startup for a missing selector", async () => {
    const harness = supervisorHarness();
    await runRefundWorkerContainerSupervisor(command,
      { ...env, MIRA_EXIMBAY_RETRIEVE_DIAGNOSTIC_PAYMENT_ID: undefined }, harness.output, harness.dependencies);
    expect(harness.spawnCalls).toHaveLength(0);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ terminalClass: "READ_ONLY_DIAGNOSTIC", proxyLifecycle: "NOT_STARTED" });
  });
  it("reports diagnostic success only after a valid child terminal and proxy cleanup", async () => {
    const shape = emptyRetrieveShapeDiagnostic();
    shape.jsonParseSuccess = true;
    shape.root = { type: "object", fields: [], extraKeyCount: 0 };
    shape.payment = { type: "object", fields: [], extraKeyCount: 0 };
    const result = { ...diagnosticResult("DIAGNOSTIC_COMPLETE"), inquiryCount: 1, parserResult: "ADMITTED", shape };
    const proxy = runningChild({ closeOnTerm: 0 });
    const child = completedChild(0, `${JSON.stringify(result)}\n`, "");
    const harness = supervisorHarness([proxy, child], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(0);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ ok: true, terminalClass: "READ_ONLY_DIAGNOSTIC", childResult: result });
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
  });
  it("preserves the dedicated child failure after proxy cleanup", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const result = diagnosticResult("PAYMENT_NOT_FOUND");
    const child = completedChild(1, `${JSON.stringify(result)}\n`, "");
    const harness = supervisorHarness([proxy, child], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(1);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
    expect(harness.spawnCalls).toHaveLength(2);
    expect(harness.spawnCalls[1].args[0]).toContain("eximbay-retrieve-shape-diagnostic.mjs");
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ terminalClass: "READ_ONLY_DIAGNOSTIC",
      childResult: result, childValidation: "TRUSTED", proxyLifecycle: "READY_CLEANUP_CONFIRMED" });
  });
  it.each([
    "{}\n", "not-json\n", `${JSON.stringify({ ...diagnosticResult("PAYMENT_NOT_FOUND"), raw: "private" })}\n`,
    `${JSON.stringify({ ...diagnosticResult("PAYMENT_NOT_FOUND"), cancellationCount: 1 })}\n`,
    `${JSON.stringify({ ...diagnosticResult("PAYMENT_NOT_FOUND"), terminalClass: "REFUND_SUCCEEDED" })}\n`,
    `${"x".repeat(65_537)}\n`,
  ])("rejects malformed child output without echoing it", async (line) => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy, completedChild(1, line, "")], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ childResult: null, childValidation: "INVALID_DIAGNOSTIC_OUTPUT" });
    expect(JSON.stringify(harness.stdout)).not.toMatch(/private|REFUND_SUCCEEDED/);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
  });
  it.each(["valid", "extra", "card-private", "parameter-length", "inconsistent", "missing"])("validates refined diagnostic detail through supervisor: %s", async (fault) => {
    const shape = { ...emptyRetrieveShapeDiagnostic(), jsonParseSuccess: true,
      firstFailure: "OPTIONAL_ROOT_ENVELOPE_INVALID",
      optionalRootDetail: {
        cardInfo: { pairKind: "FORMAL", firstFourAsciiDigits: true, lastFourAsciiDigits: true, parserValid: true },
        otherParam: { param1Class: "OVER_255_UTF8_BYTES", param2Class: "ABSENT",
          param1TextLengthOver255: false, param2TextLengthOver255: null, parserValid: false },
      },
    };
    const detail = shape.optionalRootDetail;
    const variants: Record<string, unknown> = {
      valid: detail,
      extra: { ...detail, raw: "private-value" },
      "card-private": { ...detail, cardInfo: { ...detail.cardInfo, digits: "private-card" } },
      "parameter-length": { ...detail, otherParam: { ...detail.otherParam, length: 258 } },
      inconsistent: { ...detail, otherParam: { ...detail.otherParam, parserValid: true } },
      missing: null,
    };
    const result = { ...diagnosticResult("DIAGNOSTIC_COMPLETE"), inquiryCount: 1,
      parserResult: "UNKNOWN_SHAPE", shape: { ...shape, optionalRootDetail: variants[fault] } };
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy, completedChild(0, `${JSON.stringify(result)}\n`, "")], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(fault === "valid" ? 0 : 1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      childValidation: fault === "valid" ? "TRUSTED" : "INVALID_DIAGNOSTIC_OUTPUT",
      childResult: fault === "valid" ? result : null,
    });
    expect(JSON.stringify(harness.stdout)).not.toMatch(/private-value|private-card|258/);
  });
  it("rejects stderr alongside a valid diagnostic terminal", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const child = completedChild(1, `${JSON.stringify(diagnosticResult("PAYMENT_NOT_FOUND"))}\n`, "secret-private");
    const harness = supervisorHarness([proxy, child], { readiness: true });
    await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ childResult: null });
    expect(JSON.stringify(harness.stdout)).not.toContain("secret-private");
  });
  it("cleans up on readiness failure and does not spawn a diagnostic", async () => {
    const proxy = runningChild({ closeOnTerm: 0 });
    const harness = supervisorHarness([proxy]);
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(1);
    expect(proxy.killCalls).toEqual(["SIGTERM"]);
    expect(harness.spawnCalls).toHaveLength(1);
  });
  it("reports unconfirmed proxy cleanup without losing the child observation", async () => {
    const proxy = runningChild({ closeOnTerm: null });
    const child = completedChild(1, `${JSON.stringify(diagnosticResult("PAYMENT_NOT_FOUND"))}\n`, "");
    const harness = supervisorHarness([proxy, child], { readiness: true });
    expect(await runRefundWorkerContainerSupervisor(command, env, harness.output, harness.dependencies)).toBe(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({ proxyLifecycle: "READY_CLEANUP_UNCONFIRMED", childValidation: "TRUSTED" });
    expect(proxy.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
