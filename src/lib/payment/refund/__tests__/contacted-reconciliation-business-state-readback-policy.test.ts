import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from
  "../../../../../infra/refund-sandbox/p3e-b2/contracts/business-state-readback-runtime-v1.json";
import {
  requireBusinessStateReadbackRoleSafety,
  requireExactBusinessStateReadbackColumnPrivileges,
  requireNoBusinessStateReadbackColumnPrivileges,
  requireNoBusinessStateReadbackTablePrivileges,
  type BusinessStateReadbackColumnPrivilegeRow,
  type BusinessStateReadbackRoleSafetyRow,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2/business-state-readback");

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

  it("fails the effective privilege postcondition on membership, extra SELECT, or write access", () => {
    const exactRole = Object.freeze<BusinessStateReadbackRoleSafetyRow>({
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
      membershipCount: 0,
    });
    const exactColumns = grantedColumns(read("database-role-grants.sql"));
    expect(() => requireBusinessStateReadbackRoleSafety([exactRole])).not.toThrow();
    expect(() => requireNoBusinessStateReadbackTablePrivileges([])).not.toThrow();
    expect(() => requireExactBusinessStateReadbackColumnPrivileges(exactColumns)).not.toThrow();
    expect(() => requireNoBusinessStateReadbackColumnPrivileges(
      withoutColumnPrivileges(exactColumns),
    )).not.toThrow();
    expect(() => requireBusinessStateReadbackRoleSafety([
      { ...exactRole, membershipCount: 1 },
    ])).toThrowError("ROLE_AUTHORITY_POSTCONDITION_FAILED");
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
  });

  it("keeps the runtime default-off, exact-target, one-shot, and secret-free", () => {
    const terraform = ["main.tf", "locals.tf", "variables.tf", "checks.tf", "outputs.tf"]
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
    expect(locals).toContain("job_source_commit    = var.source_commit");
    expect(locals).toContain("job_image_digest_uri = var.bootstrap_image_digest_uri");
    expect(checks).toContain("var.temporary_cloud_sql_access_authorized");
    expect(variables).toContain("d908d71b5de5dc4223db77268719ed9e97277253");
    expect(variables).toContain(
      "sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3",
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
