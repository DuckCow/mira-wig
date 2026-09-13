import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
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
