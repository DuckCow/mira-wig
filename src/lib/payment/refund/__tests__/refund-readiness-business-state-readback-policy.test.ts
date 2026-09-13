import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import bootstrapV3Contract from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v3.json";
import readinessRuntimeContract from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/refund-readiness-readback-runtime-v1.json";
import {
  applyRefundReadinessReadbackRoleGrants,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT,
  REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT,
  REFUND_READINESS_READBACK_SELECT_COLUMNS,
  requireExactRefundReadinessReadbackColumnPrivileges,
  revokeRefundReadinessReadbackRoleGrants,
  type BusinessStateReadbackColumnPrivilegeRow,
  type BusinessStateReadbackRoleSafetyRow,
  type EximbayP3eBootstrapArtifact,
  type EximbayP3eCanaryRoleGrantDependencies,
  type EximbayP3eDatabaseBootstrapInput,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import {
  REFUND_READINESS_READBACK_ROLE_GRANT_MODE,
  REFUND_READINESS_READBACK_ROLE_REVOKE_MODE,
  runDatabaseBootstrapEntrypoint,
  type RuntimeDependencies,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";

const ROOT = process.cwd();
const INFRA = join(ROOT, "containers/refund-db-bootstrap/refund-readiness-readback");
const HISTORICAL = join(ROOT, "infra/refund-sandbox/p3e-b2/business-state-readback");
const CONTRACTS = join(ROOT, "infra/refund-sandbox/p3e-b2/contracts");
const BOOTSTRAP_TERRAFORM = join(ROOT, "infra/refund-sandbox/p3e-b2/database-bootstrap");
const INPUT = Object.freeze<EximbayP3eDatabaseBootstrapInput>({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "refund_sandbox",
});

describe("refund-readiness readback privilege policy", () => {
  it("defines an exact column-only SELECT manifest and inverse revocation", () => {
    const grant = read("database-role-grants.sql");
    const revoke = read("database-role-revoke.sql");
    const granted = columnPairs(grant, "GRANT");
    const revoked = columnPairs(revoke, "REVOKE");
    expect(granted).toEqual(revoked);
    expect(new Set(granted)).toEqual(REFUND_READINESS_READBACK_SELECT_COLUMNS);
    expect(granted).toHaveLength(REFUND_READINESS_READBACK_SELECT_COLUMNS.size);
    expect(grant).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
    expect(grant).not.toMatch(/GRANT\s+SELECT\s+ON\s+(?:ALL\s+TABLES|TABLE)/u);
    expect(grant).not.toMatch(/GRANT\s+(?:TEMP|CREATE|USAGE\s+ON\s+SEQUENCE)/u);
    expect(grant).toContain("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public");
    expect(revoke).toContain("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public");
    expect(revoke).toContain("REVOKE CONNECT ON DATABASE refund_sandbox");
  });

  it("pins the grant and revoke bytes and rejects missing, broad, or write authority", () => {
    expect(sha256(read("database-role-grants.sql"))).toBe(
      REFUND_READINESS_READBACK_ROLE_GRANT_ARTIFACT.sha256,
    );
    expect(sha256(read("database-role-revoke.sql"))).toBe(
      REFUND_READINESS_READBACK_ROLE_REVOKE_ARTIFACT.sha256,
    );
    const exact = grantedColumns(read("database-role-grants.sql"));
    expect(() => requireExactRefundReadinessReadbackColumnPrivileges(exact)).not.toThrow();
    expect(() => requireExactRefundReadinessReadbackColumnPrivileges(exact.slice(1)))
      .toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireExactRefundReadinessReadbackColumnPrivileges([
      ...exact,
      columnPrivilege("User", "email", true),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireExactRefundReadinessReadbackColumnPrivileges([
      { ...exact[0], update: true }, ...exact.slice(1),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
  });

  it("does not change the frozen historical grant/revoke bytes", () => {
    expect(sha256(readFileSync(join(HISTORICAL, "database-role-grants.sql"), "utf8")))
      .toBe("a67dab48542dad2fd5f98efaff5264f8ee0cd481874612f070c53a80db3d85d1");
    expect(sha256(readFileSync(join(HISTORICAL, "database-role-revoke.sql"), "utf8")))
      .toBe("e88f8f693be752a31bb5b90a0ebebdbff06c760139f19066d39838b847a5a543");
  });

  it("binds the exact successor bootstrap and readiness runtime machine contracts", () => {
    expect(bootstrapV3Contract).toMatchObject({
      contractVersion: "mira-refund-p3e-b2-db-bootstrap-runtime/v3",
      source: {
        commit: "d9b51dce0e0e16eb273aeb19caff802fe99f4b3f",
        tree: "b385135a18b4af09970d9b52cfe7a950e322bb46",
      },
      image: {
        manifestDigest:
          "sha256:aa4cc4e3ef1497769c726ad8187c9806f69bbca6e09f9ae8f010c5c313343892",
        configDigest:
          "sha256:32b248d06e0ed1faf9325a58c006033ba9e2d987a3bc5fee4b66b1b07c2ef10c",
      },
      iam: {
        temporaryAccessRequiredModes: [
          "apply-refund-readiness-readback-role-grants",
          "revoke-refund-readiness-readback-role-grants",
        ],
      },
      boundaries: { terraformExecutionOwner: false },
    });
    expect(bootstrapV3Contract.job.terraformModeSelector.allowedModes).toEqual([
      "check",
      "apply",
      "apply-canary-role-grants",
      "apply-synthetic-sale-role-grants",
      "apply-contacted-reconciliation-role-grants",
      "apply-business-state-readback-role-grants",
      "revoke-business-state-readback-role-grants",
      "apply-refund-readiness-readback-role-grants",
      "revoke-refund-readiness-readback-role-grants",
      "contacted-reconciliation-business-state-readback",
      "materialize-synthetic-sale-market-precondition",
      "restore-canary-refund-role-grants",
      "materialize-eximbay-canary-target",
      "issue-eximbay-canary-approval",
      "materialize-application-credentials",
      "recover-canary-application-credential",
    ]);
    expect(readinessRuntimeContract).toMatchObject({
      materialization: {
        variable: "refund_readiness_runtime_materialized",
        default: false,
        mutuallyExclusiveWith: "runtime_materialized",
        executionOnApply: false,
      },
      runtime: {
        job: "mira-p3e-sbx-refund-readiness-readback",
        command: "refund-readiness-business-state-readback",
        imageDigestUri:
          "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:0bbb1c65c3626b25cf00d685a9844bd28ccddf237f7342dab11d6b37edb9a855",
        imageConfigDigest:
          "sha256:9c74bc89748d6ffcccd24bdbbfc26bfa2b190d266814d179bf218814243c07fd",
        sourceCommit: "4299288d2ca7bdfffde6d6edc455f44c68d00ec0",
        sourceTree: "b864dc0491b7e5395f1d6d47fb40faebbe27e3fb",
        taskCount: 1,
        parallelism: 1,
        maxRetries: 0,
      },
      authority: {
        fixedTargetOwner: "COMPILED_RUNTIME",
        operatorSelectableTarget: false,
        genericQuery: false,
        arbitrarySql: false,
      },
      resourceGraph: {
        jobAddress: 'google_cloud_run_v2_job.refund_readiness["runtime"]',
        materializedResourceCount: 5,
      },
    });
    expect(sha256(readFileSync(join(CONTRACTS, "database-bootstrap-runtime-v1.json"), "utf8")))
      .toBe("a3af68fb395886c83074f49f48e7c476fe957ff5e147ab058f92f374a95e4a45");
    expect(sha256(readFileSync(join(CONTRACTS, "database-bootstrap-runtime-v2.json"), "utf8")))
      .toBe("96970db5cb05de5a979ad8ca240f86d354922759f04a1498edcf2bf247fc455a");
    expect(sha256(readFileSync(join(CONTRACTS, "database-bootstrap-runtime-v3.json"), "utf8")))
      .toBe("8a8bc4e55c5f67e293db35e2b3bf263182a5168c8c32a9299005611863960826");
    expect(sha256(readFileSync(join(CONTRACTS, "refund-readiness-readback-runtime-v1.json"), "utf8")))
      .toBe("c167dd2d296bc07a9cefd9011705465df6b79a60bbc9e99b87da4c989e074739");
  });

  it("owns separate finite Jobs, shared identity addresses, and no execution-on-apply", () => {
    const bootstrapMain = readFileSync(join(BOOTSTRAP_TERRAFORM, "main.tf"), "utf8");
    const bootstrapSource = ["variables.tf", "locals.tf", "checks.tf", "outputs.tf"]
      .map((name) => readFileSync(join(BOOTSTRAP_TERRAFORM, name), "utf8")).join("\n");
    const readbackSource = ["variables.tf", "locals.tf", "checks.tf", "main.tf", "outputs.tf"]
      .map((name) => readFileSync(join(HISTORICAL, name), "utf8")).join("\n");
    expect(sha256(bootstrapMain)).toBe(
      "863f8106fb6cfc816287c46c0e53181f9b122ec1cf7e8f4da893c126b77bf904",
    );
    expect(bootstrapSource).toContain('"apply-refund-readiness-readback-role-grants"');
    expect(bootstrapSource).toContain('"revoke-refund-readiness-readback-role-grants"');
    expect(bootstrapSource).toContain("temporary_cloud_sql_access_authorized");
    expect(readbackSource).toContain('resource "google_cloud_run_v2_job" "readback"');
    expect(readbackSource).toContain('resource "google_cloud_run_v2_job" "refund_readiness"');
    expect(readbackSource).toContain("for_each = local.historical_runtime_instances");
    expect(readbackSource).toContain("for_each = local.readiness_runtime_instances");
    expect(readbackSource).toContain(
      "var.runtime_materialized || var.refund_readiness_runtime_materialized",
    );
    expect(readbackSource).not.toMatch(
      /google_cloud_run_v2_job_execution|null_resource|terraform_data|local-exec|remote-exec|scheduler|workflow|eventarc|automatic_invoker/iu,
    );
    expect(readbackSource).not.toMatch(
      /MIRA_REFUND_READBACK_(?:PAYMENT|ORDER|REFUND_ATTEMPT|COMMAND|TARGET|SQL|TABLE|FILTER|PROVIDER)/u,
    );
  });

  it.each([
    ["grant", applyRefundReadinessReadbackRoleGrants],
    ["revoke", revokeRefundReadinessReadbackRoleGrants],
  ] as const)("rolls back %s when exact postcondition verification fails", async (
    _label,
    execute,
  ) => {
    const events: string[] = [];
    await expect(execute(
      verifierFailureDatabase(events), INPUT, transactionDependencies(events),
    )).rejects.toMatchObject({ code: "ROLE_AUTHORITY_POSTCONDITION_FAILED" });
    expect(events).toEqual(["BEGIN", "SQL_ASSET", "VERIFIER", "ROLLBACK"]);
  });

  it.each([
    REFUND_READINESS_READBACK_ROLE_GRANT_MODE,
    REFUND_READINESS_READBACK_ROLE_REVOKE_MODE,
  ])("admits the exact bootstrap ACL lifecycle mode %s", async (mode) => {
    const seen: Parameters<RuntimeDependencies["execute"]>[0][] = [];
    const result = await runDatabaseBootstrapEntrypoint(
      [mode], bootstrapEnvironment(), outputSink(), runtimeDependencies((configuration) => {
        seen.push(configuration);
        return Promise.resolve(Object.freeze({}));
      }),
    );
    expect(result).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.mode).toBe(mode);
  });
});

function read(name: string): string {
  return readFileSync(join(INFRA, name), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function columnPairs(sql: string, verb: "GRANT" | "REVOKE"): readonly string[] {
  const normalized = sql.replace(/\s+/gu, " ");
  const pattern = new RegExp(`${verb} SELECT \\((.*?)\\) ON TABLE "([^"]+)"`, "gu");
  return [...normalized.matchAll(pattern)].flatMap((match) => {
    const columns = match[1];
    const table = match[2];
    if (!columns || !table) throw new Error("READBACK_PRIVILEGE_FIXTURE_INVALID");
    return [...columns.matchAll(/"([^"]+)"/gu)].map((column) => `${table}.${column[1]}`);
  }).sort();
}

function grantedColumns(sql: string): readonly BusinessStateReadbackColumnPrivilegeRow[] {
  return columnPairs(sql, "GRANT").map((pair) => {
    const separator = pair.indexOf(".");
    return columnPrivilege(pair.slice(0, separator), pair.slice(separator + 1), true);
  });
}

function columnPrivilege(
  tableName: string,
  columnName: string,
  select: boolean,
): BusinessStateReadbackColumnPrivilegeRow {
  return Object.freeze({
    tableName, columnName, select, insert: false, update: false, references: false,
  });
}

function roleSafety(
  membershipRoleNames: readonly string[],
): BusinessStateReadbackRoleSafetyRow {
  return Object.freeze({
    canLogin: true, superuser: false, createDatabase: false, createRole: false,
    inherit: true, replication: false, bypassRls: false, connect: true,
    databaseCreate: false, schemaUsage: true, schemaCreate: false,
    membershipRoleNames,
  });
}

function verifierFailureDatabase(events: string[]): Client {
  const database = new Client();
  const query = vi.fn((statement: string) => {
    const normalized = statement.trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
      events.push(normalized);
      return Promise.resolve({ rows: [] });
    }
    if (statement.includes('current_database() AS "databaseName"')) {
      return Promise.resolve({ rows: [{ databaseName: "refund_sandbox" }] });
    }
    if (statement.includes("AS installed")) return Promise.resolve({ rows: [{ installed: false }] });
    if (statement.includes("count(*)::int AS count")) {
      return Promise.resolve({ rows: [{ count: 1 }] });
    }
    if (statement.includes('role.rolcanlogin AS "canLogin"')) {
      events.push("VERIFIER");
      return Promise.resolve({ rows: [roleSafety([])] });
    }
    if (statement.includes('AS "tableName"') || statement.includes('AS "columnName"')
      || statement.includes('AS "sequenceName"')) return Promise.resolve({ rows: [] });
    throw new Error("UNEXPECTED_DATABASE_QUERY");
  });
  Object.defineProperty(database, "query", { configurable: true, value: query });
  return database;
}

function transactionDependencies(
  events: string[],
): EximbayP3eCanaryRoleGrantDependencies {
  return Object.freeze({
    readArtifact: (artifact: EximbayP3eBootstrapArtifact) =>
      Promise.resolve(readFileSync(artifact.absolutePath, "utf8")),
    executeArtifact: () => {
      events.push("SQL_ASSET");
      return Promise.resolve();
    },
    verifyExactLedger: () => Promise.resolve(),
    beforePostcondition: () => Promise.resolve(),
  });
}

function bootstrapEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    MIRA_DB_BOOTSTRAP_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_DB_BOOTSTRAP_REGION: "asia-northeast3",
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME:
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    MIRA_DB_BOOTSTRAP_DATABASE_NAME: "refund_sandbox",
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME:
      "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam",
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT: "a".repeat(40),
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI:
      `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:${"b".repeat(64)}`,
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT: "41",
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256:
      "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    CLOUD_RUN_JOB: "mira-p3e-sbx-refund-db-bootstrap",
    CLOUD_RUN_EXECUTION: "acl-lifecycle", CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0",
  });
}

function runtimeDependencies(execute: RuntimeDependencies["execute"]): RuntimeDependencies {
  return Object.freeze({
    readSourceCommit: () => Promise.resolve(`${"a".repeat(40)}\n`),
    loadMigrationInventory: () => Promise.resolve(Object.freeze({
      entries: Object.freeze([]), migrationCount: 41,
      migrationDigest: "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    })),
    execute,
  });
}

function outputSink() {
  return { stdout: { write: () => true }, stderr: { write: () => true } };
}
