import { describe, expect, it, vi } from "vitest";
import {
  CANARY_REFUND_ROLE_RESTORE_MODE,
  ISSUE_EXIMBAY_CANARY_APPROVAL_MODE,
  MATERIALIZE_EXIMBAY_CANARY_TARGET_MODE,
  runDatabaseBootstrapEntrypoint,
  SYNTHETIC_SALE_ROLE_GRANT_MODE,
  type RuntimeConfiguration,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";

const COMMIT = "a".repeat(40);
const DIGEST = "b".repeat(64);
const MIGRATION_DIGEST = "c".repeat(64);
const inventory = Object.freeze({
  entries: Object.freeze([]),
  migrationCount: 41,
  migrationDigest: MIGRATION_DIGEST,
});

describe("exact database-bootstrap SALE lifecycle and producer modes", () => {
  it.each([
    SYNTHETIC_SALE_ROLE_GRANT_MODE,
    CANARY_REFUND_ROLE_RESTORE_MODE,
  ])("admits the exact attended ACL mode %s", async (mode) => {
    const execute = vi.fn(() => Promise.resolve({ code: "TEST" }));
    await expect(runDatabaseBootstrapEntrypoint([mode], baseEnv(), output(), {
      readSourceCommit: () => Promise.resolve(COMMIT),
      loadMigrationInventory: () => Promise.resolve(inventory),
      execute,
    })).resolves.toBe(0);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ mode }), inventory);
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
});

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
