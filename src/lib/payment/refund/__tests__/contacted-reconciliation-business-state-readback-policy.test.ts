import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import contract from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/business-state-readback-runtime-v1.json";
import bootstrapContract from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v1.json";
import {
  applyBusinessStateReadbackRoleGrants,
  BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  type EximbayP3eBootstrapArtifact,
  type EximbayP3eCanaryRoleGrantDependencies,
  type EximbayP3eDatabaseBootstrapInput,
  requireBusinessStateReadbackRoleSafety,
  requireBusinessStateReadbackRetiredRoleSafety,
  requireExactBusinessStateReadbackColumnPrivileges,
  requireNoBusinessStateReadbackColumnPrivileges,
  requireNoBusinessStateReadbackTablePrivileges,
  revokeBusinessStateReadbackRoleGrants,
  type BusinessStateReadbackColumnPrivilegeRow,
  type BusinessStateReadbackRoleSafetyRow,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2/business-state-readback");
const REQUIRED_SYSTEM_MEMBERSHIP = Object.freeze([
  BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP,
]);
const BOOTSTRAP_INPUT = Object.freeze<EximbayP3eDatabaseBootstrapInput>({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "refund_sandbox",
});

describe("CONTACTED reconciliation business-state readback source policy", () => {
  it("defines only exact column SELECT authority and no write/sequence authority", () => {
    const sql = read("database-role-grants.sql");
    expect(sql).toContain('GRANT SELECT (\n  "id", "status", "expiresAt", "createdAt", "updatedAt"\n) ON TABLE "CheckoutSession"');
    for (const table of ["CheckoutSession", "Payment", "PaymentEvent", "Order"]) {
      expect(sql).toContain(`ON TABLE "${table}"`);
    }
    expect([...sql.matchAll(/GRANT\s+SELECT\s*\([\s\S]*?\)\s+ON TABLE\s+"([^"]+)"/gu)]
      .map((match) => match[1])).toEqual([
      "CheckoutSession", "Payment", "PaymentEvent", "Order",
    ]);
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+(?:ALL\s+TABLES|TABLE)/u);
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public");
  });

  it("defines an exact revoke-before-delete retirement path", () => {
    const sql = read("database-role-revoke.sql");
    for (const table of ["CheckoutSession", "Payment", "PaymentEvent", "Order"]) {
      expect(sql).toContain(`ON TABLE "${table}"`);
    }
    expect([...sql.matchAll(/REVOKE\s+SELECT\s*\([\s\S]*?\)\s+ON TABLE\s+"([^"]+)"/gu)]
      .map((match) => match[1])).toEqual([
      "CheckoutSession", "Payment", "PaymentEvent", "Order",
    ]);
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public");
    expect(sql).toContain("REVOKE CONNECT ON DATABASE refund_sandbox");
    expect(contract.materialization.roleRevokeMode).toBe(
      "revoke-business-state-readback-role-grants",
    );
  });

  it("requires only the exact Cloud SQL IAM service-account system membership", () => {
    const exactRole = roleSafety(REQUIRED_SYSTEM_MEMBERSHIP);
    const exactColumns = grantedColumns(read("database-role-grants.sql"));
    expect(() => requireBusinessStateReadbackRoleSafety([exactRole])).not.toThrow();
    expect(() => requireBusinessStateReadbackRetiredRoleSafety([exactRole])).not.toThrow();
    for (const membershipRoleNames of [
      [],
      ["some_custom_role"],
      [BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP, "some_custom_role"],
      ["cloudsqlsuperuser"],
      ["pg_read_all_data"],
      ["pg_write_all_data"],
    ]) {
      expect(() => requireBusinessStateReadbackRoleSafety([
        roleSafety(membershipRoleNames),
      ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    }
    expect(() => requireBusinessStateReadbackRetiredRoleSafety([
      roleSafety([
        BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP,
        "residual_custom_role",
      ]),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireBusinessStateReadbackRoleSafety([
      roleSafety([
        BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP,
        BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP,
      ]),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireBusinessStateReadbackRoleSafety([
      roleSafety(["some_custom_role", BUSINESS_STATE_READBACK_REQUIRED_SYSTEM_MEMBERSHIP]),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireBusinessStateReadbackRoleSafety([
      roleSafety(REQUIRED_SYSTEM_MEMBERSHIP),
    ])).not.toThrow();

    expect(() => requireNoBusinessStateReadbackTablePrivileges([])).not.toThrow();
    expect(() => requireExactBusinessStateReadbackColumnPrivileges(exactColumns)).not.toThrow();
    expect(() => requireNoBusinessStateReadbackColumnPrivileges(
      withoutColumnPrivileges(exactColumns),
    )).not.toThrow();
    expect(() => requireExactBusinessStateReadbackColumnPrivileges([
      ...exactColumns,
      columnPrivilege("Payment", "providerCredential", true),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireExactBusinessStateReadbackColumnPrivileges([
      { ...exactColumns[0], update: true },
      ...exactColumns.slice(1),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireExactBusinessStateReadbackColumnPrivileges(
      exactColumns.slice(1),
    )).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
    expect(() => requireNoBusinessStateReadbackColumnPrivileges([
      columnPrivilege("Payment", "status", true),
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
  });

  it.each([
    ["grant", applyBusinessStateReadbackRoleGrants],
    ["revoke", revokeBusinessStateReadbackRoleGrants],
  ] as const)("rolls back the %s SQL before commit when its verifier fails", async (
    _mode,
    execute,
  ) => {
    const events: string[] = [];
    const database = verifierFailureDatabase(events);

    await expect(execute(
      database,
      BOOTSTRAP_INPUT,
      transactionDependencies(events),
    )).rejects.toMatchObject({ code: "ROLE_AUTHORITY_POSTCONDITION_FAILED" });

    expect(events).toEqual(["BEGIN", "SQL_ASSET", "VERIFIER", "ROLLBACK"]);
    expect(events).not.toContain("COMMIT");
  });

  it("keeps the runtime default-off, exact-target, one-shot, and secret-free", () => {
    const terraform = [
      "main.tf", "locals.tf", "variables.tf", "checks.tf", "outputs.tf", "versions.tf",
    ]
      .map(read)
      .join("\n");
    expect(terraform).toContain("default     = false");
    expect(terraform).toContain('task_count  = local.task_count');
    expect(terraform).toContain('parallelism = local.parallelism');
    expect(terraform).toContain('max_retries           = local.max_retries');
    expect(terraform).toContain('args  = [local.command]');
    expect(terraform).toContain('deletion_policy = "DELETE"');
    expect(terraform).toContain('type            = "CLOUD_IAM_SERVICE_ACCOUNT"');
    expect(terraform).not.toContain("google_secret_manager");
    expect(terraform).not.toMatch(/scheduler|eventarc|pubsub|workflows/iu);
    expect(terraform).toContain("a764f61f4e4ba799ab16b318a676db65");
    expect(terraform).toContain("cmthg2mzu000001s6iuvx7u5x");
    expect(terraform).toContain("87d659b0-a6a3-4353-9678-c18f629df434");
    expect(contract.runtime.providerSecretAccess).toBe(false);
    expect(contract.runtime.executionOnApply).toBe(false);
  });

  it("freezes the exact backend and source-owned successor without an override workflow", () => {
    const versions = read("versions.tf");
    const backend = read("business-state-readback.gcs.tfbackend");
    const variables = read("variables.tf");
    const locals = read("locals.tf");
    expect(versions).toContain('backend "gcs" {}');
    expect(backend).toBe(
      'bucket = "mira-refund-sandbox-0001-tfstate-925882331349"\n' +
      'prefix = "p3e-b2/business-state-readback"\n',
    );
    expect(contract.terraform).toEqual({
      root: "infra/refund-sandbox/p3e-b2/business-state-readback",
      backendConfig: "business-state-readback.gcs.tfbackend",
      backendBucket: "mira-refund-sandbox-0001-tfstate-925882331349",
      backendPrefix: "p3e-b2/business-state-readback",
      backendOverride: "ABSENT_EXACT_COMMITTED_CONFIG_ONLY",
      initialStateWhenAbsent: "NORMAL_INITIAL_BACKEND_STATE",
      provider: "hashicorp/google",
      providerVersion: "7.40.0",
    });
    expect(variables).toMatch(
      /variable "source_commit"[\s\S]*default\s*=\s*"81e785448f834f4176cd5153eb3cbdf6d79d936c"[\s\S]*nullable\s*=\s*false/u,
    );
    expect(variables).toMatch(
      /variable "bootstrap_image_digest_uri"[\s\S]*default\s*=\s*"asia-northeast3-docker\.pkg\.dev\/mira-refund-sandbox-0001\/mira-p3e-sbx-refund-images\/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2"[\s\S]*nullable\s*=\s*false/u,
    );
    expect(variables).not.toMatch(/==\s*null|null\s*\|\|/u);
    expect(locals).toContain("source_commit                      = var.source_commit");
    expect(locals).toContain(
      "bootstrap_image_digest_uri         = var.bootstrap_image_digest_uri",
    );
    expect(locals).not.toContain("SOURCE_ONLY_NOT_MATERIALIZED");
    expect(contract.materialization.artifactOverrideRequired).toBe(false);
  });

  it("freezes the exact five-resource graph", () => {
    const addresses = Object.freeze([
      'google_cloud_run_v2_job.readback["runtime"]',
      'google_project_iam_member.cloud_sql_client["runtime"]',
      'google_project_iam_member.cloud_sql_instance_user["runtime"]',
      'google_service_account.readback["runtime"]',
      'google_sql_user.readback["runtime"]',
    ].sort(compareUtf8));
    expect(contract.resourceGraph.defaultResourceCount).toBe(0);
    expect(contract.resourceGraph.materializedResourceCount).toBe(addresses.length);
    expect(contract.resourceGraph.materializedAddresses).toEqual(addresses);
    expect(sha256(addresses.join("\n"))).toBe(
      contract.resourceGraph.materializedSortedAddressSha256,
    );
  });

  it("binds the exact current bootstrap image independently of role lifecycle mode", () => {
    const variables = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/database-bootstrap/variables.tf"),
      "utf8",
    );
    const locals = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/database-bootstrap/locals.tf"),
      "utf8",
    );
    const checks = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/database-bootstrap/checks.tf"),
      "utf8",
    );
    expect(variables).toContain('"apply-business-state-readback-role-grants"');
    expect(variables).toContain('"revoke-business-state-readback-role-grants"');
    expect(locals).toContain('"apply-business-state-readback-role-grants",');
    expect(locals).toContain('"revoke-business-state-readback-role-grants",');
    expect(locals).toContain("], var.bootstrap_mode)");
    expect(locals).toMatch(/^\s*job_source_commit\s*=\s*var\.source_commit\s*$/mu);
    expect(locals).toMatch(/^\s*job_image_digest_uri\s*=\s*var\.bootstrap_image_digest_uri\s*$/mu);
    expect(checks).toContain("var.temporary_cloud_sql_access_authorized");
    expect(variables).toContain(`var.source_commit == "${bootstrapContract.image.sourceCommit}"`);
    expect(variables).toContain(`var.bootstrap_image_digest_uri == "${bootstrapContract.image.digestUri}"`);
    expect(contract.runtime.sourceCommit).toBe("81e785448f834f4176cd5153eb3cbdf6d79d936c");
    expect(contract.runtime.imageDigestUri).toContain(
      "sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2",
    );
    expect(variables).not.toContain('variable "readback_source_commit"');
    expect(variables).not.toContain('variable "readback_bootstrap_image_digest_uri"');
  });
});

function read(path: string): string {
  return readFileSync(join(INFRA, path), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right));
}

function grantedColumns(sql: string): readonly BusinessStateReadbackColumnPrivilegeRow[] {
  const blocks = [...sql.matchAll(
    /GRANT SELECT \(([\s\S]*?)\) ON TABLE "([^"]+)"/gu,
  )];
  return Object.freeze(blocks.flatMap((match) => {
    const columns = match[1];
    const table = match[2];
    if (!columns || !table) throw new Error("GRANT_FIXTURE_INVALID");
    return [...columns.matchAll(/"([^"]+)"/gu)].map((column) => {
      const name = column[1];
      if (!name) throw new Error("GRANT_FIXTURE_INVALID");
      return columnPrivilege(table, name, true);
    });
  }));
}

function columnPrivilege(
  tableName: string,
  columnName: string,
  select: boolean,
): BusinessStateReadbackColumnPrivilegeRow {
  return Object.freeze({
    tableName,
    columnName,
    select,
    insert: false,
    update: false,
    references: false,
  });
}

function withoutColumnPrivileges(
  rows: readonly BusinessStateReadbackColumnPrivilegeRow[],
): readonly BusinessStateReadbackColumnPrivilegeRow[] {
  return rows.map((row) => Object.freeze({ ...row, select: false }));
}

function roleSafety(
  membershipRoleNames: readonly string[],
): BusinessStateReadbackRoleSafetyRow {
  return Object.freeze({
    canLogin: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    inherit: true,
    replication: false,
    bypassRls: false,
    connect: true,
    databaseCreate: false,
    schemaUsage: true,
    schemaCreate: false,
    membershipRoleNames: Object.freeze([...membershipRoleNames]),
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
    // This legacy verifier-failure fixture represents the pre-M authority.
    if (statement.includes("AS installed")) return Promise.resolve({ rows: [{ installed: false }] });
    if (statement.includes('count(*)::int AS count')) {
      return Promise.resolve({ rows: [{ count: 1 }] });
    }
    if (statement.includes('role.rolcanlogin AS "canLogin"')) {
      events.push("VERIFIER");
      return Promise.resolve({ rows: [roleSafety([])] });
    }
    if (statement.includes('AS "tableName"')
      || statement.includes('AS "columnName"')
      || statement.includes('AS "sequenceName"')) {
      return Promise.resolve({ rows: [] });
    }
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
