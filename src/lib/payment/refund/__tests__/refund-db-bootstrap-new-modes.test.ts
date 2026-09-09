import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  REFUND_AUTHORIZATION_CUTOVER_MODE,
  BUSINESS_STATE_READBACK_ROLE_GRANT_MODE,
  BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE,
  CANARY_REFUND_ROLE_RESTORE_MODE,
  CONTACTED_RECONCILIATION_ROLE_GRANT_MODE,
  ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
  MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
  PRODUCER_RESULT_BYTE_LIMIT,
  captureProducerChildResult,
  finalizeProducerResult,
  parseProducerResult,
  runDatabaseBootstrapEntrypoint,
  SYNTHETIC_SALE_ROLE_GRANT_MODE,
  SYNTHETIC_SALE_MARKET_PRECONDITION_MODE,
  type RuntimeConfiguration,
  type MaterializedTargetProducerResult,
  type ProducerChildObservation,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";
import { EximbayP3eDatabaseBootstrapError } from "../../../../../scripts/eximbay-p3e-database-bootstrap";

const COMMIT = "a".repeat(40);
const DIGEST = "b".repeat(64);
const MIGRATION_DIGEST = "c".repeat(64);
const TARGET_BINDING_DIGEST = "1".repeat(64);
const SYNTHETIC_PROVENANCE_DIGEST = "2".repeat(64);
const CUID = `c${"a".repeat(24)}`;
const inventory = Object.freeze({
  entries: Object.freeze([]),
  migrationCount: 41,
  migrationDigest: MIGRATION_DIGEST,
});

it("admits cutover only with an explicit application role and preserves old mode parsing", async () => {
  const execute = vi.fn(() => Promise.resolve({ code: "TEST" }));
  const dependencies = { readSourceCommit: () => Promise.resolve(COMMIT), loadMigrationInventory: () => Promise.resolve(inventory), execute };
  await expect(runDatabaseBootstrapEntrypoint([REFUND_AUTHORIZATION_CUTOVER_MODE], baseEnv(), output(), dependencies)).resolves.toBe(64);
  await expect(runDatabaseBootstrapEntrypoint([REFUND_AUTHORIZATION_CUTOVER_MODE], { ...baseEnv(), MIRA_DB_BOOTSTRAP_APPLICATION_ROLE: "mira_refund_canary" }, output(), dependencies)).resolves.toBe(64);
  await expect(runDatabaseBootstrapEntrypoint([REFUND_AUTHORIZATION_CUTOVER_MODE], { ...baseEnv(), MIRA_DB_BOOTSTRAP_APPLICATION_ROLE: "test_existing_app" }, output(), dependencies)).resolves.toBe(0);
  expect(execute).toHaveBeenCalledOnce();
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ mode: REFUND_AUTHORIZATION_CUTOVER_MODE, cutoverApplicationRole: "test_existing_app" }), inventory);
  await expect(runDatabaseBootstrapEntrypoint(["apply"], { ...baseEnv(), MIRA_DB_BOOTSTRAP_APPLICATION_ROLE: "test_existing_app" }, output(), dependencies)).resolves.toBe(64);
});

describe("exact database-bootstrap SALE lifecycle and producer modes", () => {
  it.each([
    SYNTHETIC_SALE_ROLE_GRANT_MODE,
    CONTACTED_RECONCILIATION_ROLE_GRANT_MODE,
    BUSINESS_STATE_READBACK_ROLE_GRANT_MODE,
    BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE,
    CANARY_REFUND_ROLE_RESTORE_MODE,
    SYNTHETIC_SALE_MARKET_PRECONDITION_MODE,
  ])("admits the exact attended ACL mode %s", async (mode) => {
    const execute = vi.fn(() => Promise.resolve({ code: "TEST" }));
    await expect(runDatabaseBootstrapEntrypoint([mode], baseEnv(), output(), {
      readSourceCommit: () => Promise.resolve(COMMIT),
      loadMigrationInventory: () => Promise.resolve(inventory),
      execute,
    })).resolves.toBe(0);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ mode }), inventory);
  });

  it("emits only the stable Market-precondition conflict code", async () => {
    const stderr: string[] = [];
    const result = await runDatabaseBootstrapEntrypoint(
      [SYNTHETIC_SALE_MARKET_PRECONDITION_MODE],
      baseEnv(),
      Object.freeze({
        stdout: Object.freeze({ write: () => true }),
        stderr: Object.freeze({ write: (value: string) => { stderr.push(value); return true; } }),
      }),
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.reject(new EximbayP3eDatabaseBootstrapError(
          "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT",
        )),
      },
    );

    expect(result).toBe(1);
    expect(stderr).toEqual([
      `${JSON.stringify({ ok: false, code: "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT" })}\n`,
    ]);
  });

  it("preserves the safe authority-postcondition code without exposing details", async () => {
    const sink = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      [BUSINESS_STATE_READBACK_ROLE_GRANT_MODE],
      baseEnv(),
      sink,
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.reject(new EximbayP3eDatabaseBootstrapError(
          "ROLE_AUTHORITY_POSTCONDITION_FAILED",
        )),
      },
    );

    expect(result).toBe(1);
    expect(sink.stderrLines).toEqual([
      '{"ok":false,"code":"ROLE_AUTHORITY_POSTCONDITION_FAILED"}\n',
    ]);
  });

  it("keeps an unknown local failure generic", async () => {
    const sink = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      [BUSINESS_STATE_READBACK_ROLE_REVOKE_MODE],
      baseEnv(),
      sink,
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.reject(new Error("raw sensitive local failure")),
      },
    );

    expect(result).toBe(1);
    expect(sink.stderrLines).toEqual([
      '{"ok":false,"code":"RUNTIME_LOCAL_FAILED"}\n',
    ]);
    expect(sink.stderrLines.join("")).not.toContain("raw sensitive local failure");
  });

  it("adapts only exact target-producer inputs", async () => {
    const configurations: RuntimeConfiguration[] = [];
    const dependencies = {
      readSourceCommit: () => Promise.resolve(COMMIT),
      loadMigrationInventory: () => Promise.resolve(inventory),
      execute: (configuration: RuntimeConfiguration) => {
        configurations.push(configuration);
        return Promise.resolve({ code: "TEST" });
      },
    };
    await expect(runDatabaseBootstrapEntrypoint(
      [MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE],
      {
        ...baseEnv(),
        MIRA_DB_BOOTSTRAP_PAYMENT_ID: "payment_1",
        MIRA_DB_BOOTSTRAP_ATTESTATION_JSON: "{}",
      },
      output(),
      dependencies,
    )).resolves.toBe(0);
    await expect(runDatabaseBootstrapEntrypoint(
      [ISSUE_EXIMBAY_CANARY_APPROVAL_MODE],
      {
        ...baseEnv(),
        MIRA_DB_BOOTSTRAP_PAYMENT_ID: "payment_1",
        MIRA_DB_BOOTSTRAP_ATTESTATION_JSON: "{}",
        MIRA_DB_BOOTSTRAP_RUNTIME_READBACK_JSON: "{}",
        MIRA_DB_BOOTSTRAP_ISSUER_PRINCIPAL_ID: "operator@example.test",
      },
      output(),
      dependencies,
    )).resolves.toBe(0);
    expect(configurations).toHaveLength(2);
    expect(configurations[0]?.producerInput).toEqual({ paymentId: "payment_1", attestationJson: "{}" });
    expect(configurations[1]?.producerInput).toEqual({
      paymentId: "payment_1",
      attestationJson: "{}",
      runtimeReadbackJson: "{}",
      issuerPrincipalId: "operator@example.test",
    });
  });

  it("rejects generic arguments, arbitrary JSON, and provider credentials", async () => {
    const execute = vi.fn();
    const dependencies = {
      readSourceCommit: () => Promise.resolve(COMMIT),
      loadMigrationInventory: () => Promise.resolve(inventory),
      execute,
    };
    await expect(runDatabaseBootstrapEntrypoint([MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE, "--script"], baseEnv(), output(), dependencies)).resolves.toBe(64);
    await expect(runDatabaseBootstrapEntrypoint([MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE], {
      ...baseEnv(),
      MIRA_DB_BOOTSTRAP_PAYMENT_ID: "payment_1",
      MIRA_DB_BOOTSTRAP_ATTESTATION_JSON: "not-json",
    }, output(), dependencies)).resolves.toBe(64);
    await expect(runDatabaseBootstrapEntrypoint([MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE], {
      ...baseEnv(),
      MIRA_DB_BOOTSTRAP_PAYMENT_ID: "payment_1",
      MIRA_DB_BOOTSTRAP_ATTESTATION_JSON: "{}",
      EXIMBAY_SANDBOX_API_KEY: "forbidden",
    }, output(), dependencies)).resolves.toBe(64);
    expect(execute).not.toHaveBeenCalled();
  });

  it("captures and preserves one exact bounded materialized-target result", async () => {
    const expected = materializedTargetResult();
    const result = await captureProducerChildResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      producerObservation(`${JSON.stringify(expected)}\n`, 0),
    );

    expect(result).toEqual(expected);
    expect(result.targetBindingDigest).toBe(TARGET_BINDING_DIGEST);
    expect("runtimeBindings" in result && result.runtimeBindings).toEqual(expected.runtimeBindings);
  });

  it("preserves validated producer evidence through the bootstrap success terminal", async () => {
    const validatedProducerResult = requireMaterializedResult();
    const sink = outputSink();
    const exit = await runDatabaseBootstrapEntrypoint(
      [MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE],
      { ...baseEnv(), ...producerInputEnvironment() },
      sink,
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.resolve({
          code: validatedProducerResult.code,
          mode: MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
          migrationCount: 41,
          completedMigrationCount: 41,
          providerEffects: 0,
          validatedProducerResult,
        }),
      },
    );

    expect(exit).toBe(0);
    expect(sink.stdoutLines).toEqual([
      `${JSON.stringify({
        ok: true,
        code: validatedProducerResult.code,
        mode: MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
        migrationCount: 41,
        completedMigrationCount: 41,
        providerEffects: 0,
        validatedProducerResult,
      })}\n`,
    ]);
  });

  it.each([
    ["wrong Payment", () => ({ ...materializedTargetResult(), paymentId: "payment_2" })],
    ["missing field", () => withoutKey(materializedTargetResult(), "commandId")],
    ["extra field", () => ({ ...materializedTargetResult(), extra: true })],
    ["malformed digest", () => ({ ...materializedTargetResult(), targetBindingDigest: "invalid" })],
    ["nested target mismatch", () => ({
      ...materializedTargetResult(),
      runtimeBindings: { ...materializedTargetResult().runtimeBindings, targetBindingDigest: "3".repeat(64) },
    })],
    ["nested provenance mismatch", () => ({
      ...materializedTargetResult(),
      runtimeBindings: {
        ...materializedTargetResult().runtimeBindings,
        syntheticProvenanceDigest: "3".repeat(64),
      },
    })],
    ["missing runtime bindings", () => withoutKey(materializedTargetResult(), "runtimeBindings")],
  ])("rejects a successful child result with %s", (_label, buildResult) => {
    expect(parseProducerResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      Buffer.from(JSON.stringify(buildResult())),
    )).toBeNull();
  });

  it.each([
    ["truncated JSON", "{\"ok\":true"],
    ["multiple JSON results", `${JSON.stringify(materializedTargetResult())}\n${JSON.stringify(materializedTargetResult())}\n`],
    ["duplicate JSON key", `{"ok":false,${JSON.stringify(materializedTargetResult()).slice(1)}`],
    ["invalid UTF-8", Buffer.from([0xff, 0xfe])],
  ])("rejects %s", (_label, outputValue) => {
    const bytes = typeof outputValue === "string" ? Buffer.from(outputValue) : outputValue;
    expect(parseProducerResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      bytes,
    )).toBeNull();
  });

  it("terminates producer capture when stdout exceeds the exact byte bound", async () => {
    const terminate = vi.fn();
    const observation = producerObservation(Buffer.alloc(PRODUCER_RESULT_BYTE_LIMIT + 1), 0, terminate);
    await expect(captureProducerChildResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      observation,
    )).rejects.toThrow("BOOTSTRAP_PRODUCER_RESULT_INVALID");
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("does not promote child success or failure without complete binding evidence", async () => {
    await expect(captureProducerChildResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      producerObservation('{"ok":true,"code":"EXIMBAY_CANARY_TARGET_MATERIALIZED"}\n', 0),
    )).rejects.toThrow("BOOTSTRAP_PRODUCER_RESULT_INVALID");
    await expect(captureProducerChildResult(
      MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
      producerInput(),
      producerObservation('{"ok":false,"code":"PAYMENT_NOT_ELIGIBLE"}\n', 1),
    )).rejects.toThrow("BOOTSTRAP_PRODUCER_RESULT_INVALID");
  });

  it("strictly preserves the existing approval result and matches its input target", () => {
    const result = issuedApprovalResult();
    expect(parseProducerResult(
      ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
      approvalInput(TARGET_BINDING_DIGEST),
      Buffer.from(JSON.stringify(result)),
    )).toEqual(result);
    expect(parseProducerResult(
      ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
      approvalInput("3".repeat(64)),
      Buffer.from(JSON.stringify(result)),
    )).toBeNull();
  });

  it("reports host cleanup failure without erasing validated producer evidence", async () => {
    const validatedProducerResult = requireMaterializedResult();
    let cleanupFailure: unknown;
    try {
      await finalizeProducerResult({ validatedProducerResult }, () => Promise.reject(new Error("cleanup")));
    } catch (error) {
      cleanupFailure = error;
    }
    if (!(cleanupFailure instanceof Error)) throw new Error("TEST_CLEANUP_FAILURE_MISSING");
    const sink = outputSink();
    const exit = await runDatabaseBootstrapEntrypoint(
      [MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE],
      { ...baseEnv(), ...producerInputEnvironment() },
      sink,
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.reject(cleanupFailure),
      },
    );

    expect(exit).toBe(1);
    expect(sink.stderrLines).toEqual([
      `${JSON.stringify({
        ok: false,
        code: "RUNTIME_LOCAL_FAILED",
        validatedProducerResult,
      })}\n`,
    ]);
  });

  it("keeps child exit status authoritative while preserving an already validated result", async () => {
    let childFailure: unknown;
    try {
      await captureProducerChildResult(
        MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
        producerInput(),
        producerObservation(JSON.stringify(materializedTargetResult()), 1),
      );
    } catch (error) {
      childFailure = error;
    }
    if (!(childFailure instanceof Error)) throw new Error("TEST_CHILD_FAILURE_MISSING");
    const sink = outputSink();
    const exit = await runDatabaseBootstrapEntrypoint(
      [MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE],
      { ...baseEnv(), ...producerInputEnvironment() },
      sink,
      {
        readSourceCommit: () => Promise.resolve(COMMIT),
        loadMigrationInventory: () => Promise.resolve(inventory),
        execute: () => Promise.reject(childFailure),
      },
    );

    expect(exit).toBe(1);
    expect(sink.stderrLines[0]).toContain('"ok":false,"code":"RUNTIME_LOCAL_FAILED"');
    expect(sink.stderrLines[0]).toContain(`"targetBindingDigest":"${TARGET_BINDING_DIGEST}"`);
  });
});

function producerInput() {
  return Object.freeze({ paymentId: "payment_1", attestationJson: "{}" });
}

function approvalInput(targetBindingDigest: string) {
  return Object.freeze({
    ...producerInput(),
    runtimeReadbackJson: JSON.stringify({ authority: { targetBindingDigest } }),
    issuerPrincipalId: "operator@example.test",
  });
}

function producerInputEnvironment() {
  return {
    MIRA_DB_BOOTSTRAP_PAYMENT_ID: "payment_1",
    MIRA_DB_BOOTSTRAP_ATTESTATION_JSON: "{}",
  };
}

function materializedTargetResult() {
  return {
    ok: true,
    code: "EXIMBAY_CANARY_TARGET_MATERIALIZED",
    paymentId: "payment_1",
    checkoutSessionId: CUID,
    orderId: `c${"b".repeat(24)}`,
    refundAttemptId: `eximbay-canary-${"c".repeat(40)}`,
    commandId: `c${"d".repeat(24)}`,
    providerOperationBindingId: `c${"e".repeat(24)}`,
    targetBindingDigest: TARGET_BINDING_DIGEST,
    syntheticProvenanceDigest: SYNTHETIC_PROVENANCE_DIGEST,
    runtimeBindings: {
      targetBindingDigest: TARGET_BINDING_DIGEST,
      syntheticProvenanceDigest: SYNTHETIC_PROVENANCE_DIGEST,
      merchantAccountBindingId: "3".repeat(64),
      credentialGenerationBindingId: "4".repeat(64),
      releaseBindingDigest: "5".repeat(64),
      canaryJobBindingDigest: "6".repeat(64),
      preflightJobBindingDigest: "7".repeat(64),
      imageBindingDigest: "8".repeat(64),
      secretGenerationBindingDigest: "9".repeat(64),
    },
  };
}

function issuedApprovalResult() {
  return {
    ok: true,
    code: "EXIMBAY_CANARY_APPROVAL_ISSUED",
    approvalId: "eximbay-canary-approval-12345678-1234-4123-8123-123456789abc",
    commandId: CUID,
    approvedAt: "2026-09-08T00:00:00.000Z",
    expiresAt: "2026-09-08T00:30:00.000Z",
    approvalEvidenceDigest: "a".repeat(64),
    targetBindingDigest: TARGET_BINDING_DIGEST,
  };
}

function requireMaterializedResult(): MaterializedTargetProducerResult {
  const result = parseProducerResult(
    MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
    producerInput(),
    Buffer.from(JSON.stringify(materializedTargetResult())),
  );
  if (!result || result.code !== "EXIMBAY_CANARY_TARGET_MATERIALIZED") {
    throw new Error("TEST_PRODUCER_RESULT_INVALID");
  }
  return result;
}

function producerObservation(
  value: string | Uint8Array,
  exit: number | null,
  terminate = vi.fn(),
): ProducerChildObservation {
  return Object.freeze({
    stdout: Readable.from([value]),
    waitForExit: () => Promise.resolve(exit),
    terminate,
  });
}

function withoutKey(
  value: Readonly<Record<string, unknown>>,
  removedKey: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== removedKey));
}

function baseEnv() {
  return {
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT: COMMIT,
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI: `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:${DIGEST}`,
    MIRA_DB_BOOTSTRAP_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_DB_BOOTSTRAP_REGION: "asia-northeast3",
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME: "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    MIRA_DB_BOOTSTRAP_DATABASE_NAME: "refund_sandbox",
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME: "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam",
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT: "41",
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256: MIGRATION_DIGEST,
    CLOUD_RUN_JOB: "mira-p3e-sbx-refund-db-bootstrap",
    CLOUD_RUN_EXECUTION: "execution-1",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  };
}

function output() {
  return Object.freeze({
    stdout: Object.freeze({ write: () => true }),
    stderr: Object.freeze({ write: () => true }),
  });
}

function outputSink() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return Object.freeze({
    stdoutLines,
    stderrLines,
    stdout: Object.freeze({
      write: (value: string) => {
        stdoutLines.push(value);
        return true;
      },
    }),
    stderr: Object.freeze({
      write: (value: string) => {
        stderrLines.push(value);
        return true;
      },
    }),
  });
}
