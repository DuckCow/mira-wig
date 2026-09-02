import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SALE_ROOT = join(ROOT, "infra/refund-sandbox/p3e-b2/synthetic-sale-service");
const read = (path: string) => readFileSync(join(SALE_ROOT, path), "utf8");
const terraform = () => [
  "checks.tf",
  "locals.tf",
  "main.tf",
  "outputs.tf",
  "providers.tf",
  "variables.tf",
  "versions.tf",
].map(read).join("\n");
const expectedAddresses = [
  "google_cloud_run_v2_service.sale",
  "google_cloud_run_v2_service_iam_member.public_invoker",
  "google_project_iam_member.cloud_sql_client",
  "google_secret_manager_secret_iam_member.database_url",
  "google_secret_manager_secret_iam_member.eximbay_api_key",
  "google_service_account.sale",
].sort();

describe("P3E-B2 synthetic-sale backend authority", () => {
  it("freezes the exact partial GCS handoff and rejects every alternate custody path", () => {
    const source = terraform();
    expect(read("versions.tf")).toMatch(/backend\s+"gcs"\s+\{\}/u);
    expect(read("versions.tf")).not.toMatch(/backend\s+"local"/u);
    expect(source).toContain('backend_bucket_contract                = "mira-refund-sandbox-0001-tfstate-925882331349"');
    expect(source).toContain('backend_prefix_contract                = "p3e-b2/synthetic-sale-service"');
    expect(source).toContain('backend_state_runner_contract          = "mira-refund-state-runner@mira-refund-sandbox-0001.iam.gserviceaccount.com"');
    expect(source).toContain('backend_authentication_contract        = "IMPERSONATE_EXACT_STATE_RUNNER_ONLY"');
    expect(source).toContain('backend_persistent_local_state_policy  = "FORBIDDEN"');
    expect(source).toContain('backend_workspace_multiplexing_policy  = "FORBIDDEN"');
    expect(source).toContain('backend_normal_migration_import_policy = "NOT_PART_OF_NORMAL_RELEASE"');
    expect(source).toContain("backend_expected_initial_resources     = 0");
    expect(source).not.toMatch(/terraform_remote_state|impersonate_service_account\s*=\s*var\.|backend_prefix_contract\s*=\s*var\./u);
    for (const forbiddenPrefix of [
      "p3e-b2/database-bootstrap",
      "p3e-b2/runtime",
      "p3e-b2/foundation",
      "p3e-b2/eximbay-canary",
    ]) {
      expect(source).not.toContain(forbiddenPrefix);
    }
  });

  it("preserves the exact six-resource graph and baseline resource semantics", () => {
    const source = terraform();
    const addresses = [...source.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/gu)]
      .map((match) => `${match[1]}.${match[2]}`)
      .sort();
    expect(addresses).toEqual(expectedAddresses);
    expect(createHash("sha256").update(addresses.join("\n")).digest("hex"))
      .toBe("f9f0914c5b8ada8313604ec56821b9bc6bcbc22cd9619447d3b299082fb0fcf5");
    expect(createHash("sha256").update(read("main.tf")).digest("hex"))
      .toBe("b431cdbbc7a7a6dc3ffcbb1d93c8a9c6e3593efe109dd56869c51f30dc4ded6a");
    expect(createHash("sha256").update(read("variables.tf")).digest("hex"))
      .toBe("9ef8e2bf292152373bd5887e51027f6f3e6d0e0150103748f9bd8782bfb8ba38");
  });

  it("preserves the fixed runtime, IAM, network, secret, and public-invocation model", () => {
    const source = terraform();
    expect(source).toContain('MIRA_SYNTHETIC_SALE_PROJECT_ID     = "mira-refund-sandbox-0001"');
    expect(source).toContain('MIRA_SYNTHETIC_SALE_PROVIDER       = "EXIMBAY"');
    expect(source).toContain('PAYMENT_MODE                       = "SANDBOX"');
    expect(source).toContain('EXIMBAY_SANDBOX_MID                = "1849705C64"');
    expect(source).toContain('MIRA_SYNTHETIC_SALE_MARKET         = "US"');
    expect(source).toContain('MIRA_SYNTHETIC_SALE_CURRENCY       = "USD"');
    expect(source).toContain('egress = "PRIVATE_RANGES_ONLY"');
    expect(source).toContain('tags       = ["refund-provider-free"]');
    expect(source).toContain('default = "mira-p3e-sbx-canary-database-url"');
    expect(source).toContain('default = "mira-p3e-sbx-eximbay-api-key"');
    expect(source).toContain("secret  = var.database_url_secret_id");
    expect(source).toContain("secret  = var.eximbay_api_key_secret_id");
    expect(source.match(/version = "1"/gu)).toHaveLength(2);
    expect(source).toContain('role    = "roles/cloudsql.client"');
    expect(source).not.toContain("roles/cloudsql.instanceUser");
    expect(source).toContain('member   = "allUsers"');
  });
});
