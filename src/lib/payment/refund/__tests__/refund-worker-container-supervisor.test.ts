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
import { EXIMBAY_REFUND_REENTRY_TARGET } from "../eximbay-refund-reentry-authority";
import type { EximbayRefundReentryResult } from "../run-eximbay-refund-reentry-once";

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
      const { code, signal } = await within(closed, 2_000);

      expect(code).toBeNull();
      expect(signal).toBe("SIGKILL");
      expect(Buffer.concat(stdout).toString("utf8")).toBe("");
      expect(Buffer.concat(stderr).toString("utf8")).toBe("");
    } finally {
      if (fixture.exitCode === null && fixture.signalCode === null) {
        fixture.kill("SIGKILL");
      }
    }
  });
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
  return within(new Promise<void>((resolve, reject) => {
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
  }), 2_000);
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
