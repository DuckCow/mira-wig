import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/eximbay-canary-runtime-v1.json";

const ROOT = process.cwd();
const CANARY = join(ROOT, "infra/refund-sandbox/p3e-b2/eximbay-canary");
const read = (path: string) => readFileSync(join(CANARY, path), "utf8");
const terraform = () => ["checks.tf", "locals.tf", "main.tf", "outputs.tf", "providers.tf", "variables.tf", "versions.tf"]
  .map(read).join("\n");
const addresses = [
  "google_cloud_run_v2_job.canary",
  "google_project_iam_member.cloud_sql_client",
  "google_secret_manager_secret_iam_member.database_url",
  "google_secret_manager_secret_iam_member.eximbay_api_key",
  "google_service_account.canary",
].sort();

describe("P3E-B2 dormant Eximbay canary release authority", () => {
  it("freezes the exact five-resource graph and backend boundary", () => {
    const source = terraform();
    expect(source.match(/resource\s+"[^"]+"\s+"[^"]+"/gu)).toHaveLength(5);
    expect(contract.resourceGraph.addresses).toEqual(addresses);
    expect(createHash("sha256").update(addresses.join("\n")).digest("hex"))
      .toBe(contract.resourceGraph.sortedAddressSha256);
    expect(read("versions.tf")).toContain('backend "gcs" {}');
    expect(contract.backend).toEqual({
      type: "gcs",
      bucket: "mira-refund-sandbox-0001-tfstate-925882331349",
      prefix: "p3e-b2/eximbay-canary",
    });
  });

  it("requires explicit dormant-release authority and exact immutable handoffs", () => {
    const source = terraform();
    expect(source).not.toContain("UNCONDITIONALLY_BLOCKED_IN_R2B1");
    expect(read("main.tf").match(/condition\s+=\s+local\.runtime_apply_authorized/gu))
      .toHaveLength(5);
    expect(read("main.tf").match(/EXIMBAY_CANARY_RELEASE_AUTHORITY_MISSING/gu))
      .toHaveLength(5);
    expect(read("variables.tf")).toContain("provider_contact_authorized == false");
    expect(read("variables.tf")).toContain(contract.image.digestUri);
    expect(read("variables.tf")).toContain("mira-p3e-sbx-canary-database-url");
    expect(read("variables.tf")).toContain("mira-p3e-sbx-eximbay-api-key");
    expect(read("variables.tf")).not.toContain('"latest"');
  });

  it("keeps IAM, secrets, network, and attended Job configuration narrow", () => {
    const source = terraform();
    expect(source).toContain('role    = "roles/cloudsql.client"');
    expect(source).not.toContain("roles/cloudsql.instanceUser");
    expect(read("locals.tf")).toContain(
      "resource.name == '${local.cloud_sql_instance_resource}' && resource.service == 'sqladmin.googleapis.com'",
    );
    expect(contract.iam.cloudSqlCondition).toContain(
      "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18",
    );
    expect(source.match(/roles\/secretmanager\.secretAccessor/gu)).toHaveLength(2);
    expect(read("main.tf")).toContain('egress = "PRIVATE_RANGES_ONLY"');
    expect(read("main.tf")).toContain('tags       = ["refund-provider-free"]');
    expect(read("main.tf")).toContain('timeout               = "150s"');
    expect(read("main.tf")).toContain('args  = ["eximbay-canary-once"]');
    expect(source).not.toMatch(/google_(?:cloud_run_v2_job_iam|cloud_scheduler|pubsub|cloud_tasks)/u);
  });

  it("grants only the two missing atomic-success privileges", () => {
    const sql = read("database-role-grants.sql");
    expect(sql).toContain('GRANT SELECT ON TABLE "CheckoutSession"\n  TO mira_refund_canary;');
    expect(sql).toContain('GRANT INSERT ON TABLE "PaymentOutbox"\n  TO mira_refund_canary;');
    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE "RefundExecutionEximbayPreflightObservation"\n  TO mira_refund_canary;',
    );
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|UPDATE|DELETE)\s+ON\s+TABLE\s+"PaymentOutbox"/iu);
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+"CheckoutSession"/iu);
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|UPDATE|DELETE)\s+ON\s+TABLE\s+"RefundExecutionEximbayPreflightObservation"/iu);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "Payment"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionProviderOperationBinding"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionEvidence"\s+TO mira_refund_canary;/u);
    expect(sql).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionCommandEvent"\s+TO mira_refund_canary;/u);
  });
});
