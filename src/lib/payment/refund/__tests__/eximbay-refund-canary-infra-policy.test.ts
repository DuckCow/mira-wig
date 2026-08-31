import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "infra/refund-sandbox/p3e-b2/eximbay-canary");
const FROZEN_DATABASE_ROLES = join(
  process.cwd(),
  "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql",
);

describe("dormant Eximbay refund canary Terraform policy", () => {
  it("keeps every resource behind exact explicit dormant-release authority", () => {
    const main = source("main.tf");
    const locals = source("locals.tf");
    const resourceCount = matches(main, /^resource\s+"/gmu);
    expect(resourceCount).toBe(5);
    expect(matches(main, /condition\s*=\s*local\.runtime_apply_authorized/gmu))
      .toBe(resourceCount);
    expect(matches(main, /EXIMBAY_CANARY_RELEASE_AUTHORITY_MISSING/gmu))
      .toBe(resourceCount);
    expect(locals).toContain("var.release_authority.human_authorized == true");
    expect(allTerraform()).toContain('variable "release_authority"');
    expect(allTerraform()).toContain(
      'runtime_root_apply_policy      = "EXPLICIT_DORMANT_EXIMBAY_SANDBOX_CANARY_RELEASE"',
    );
  });

  it("defines only the dedicated manual one-shot Job and least-scope runtime identity", () => {
    const terraform = allTerraform();
    expect(terraform).toContain('resource "google_service_account" "canary"');
    expect(terraform).toContain('resource "google_cloud_run_v2_job" "canary"');
    expect(terraform).toContain('task_count  = 1');
    expect(terraform).toContain('parallelism = 1');
    expect(terraform).toContain('max_retries           = 0');
    expect(terraform).toContain('args  = ["eximbay-canary-once"]');
    expect(terraform).toContain('egress = "PRIVATE_RANGES_ONLY"');
    expect(terraform).toContain('tags       = ["refund-provider-free"]');
    expect(terraform).toContain('timeout               = "150s"');
    expect(terraform).not.toMatch(/scheduler|runWithOverrides|roles\/run\.invoker/iu);
    expect(terraform).not.toMatch(/google_service_account_key|roles\/owner|roles\/editor/iu);
    expect(terraform).not.toContain("EXIMBAY_LIVE");
    expect(terraform).not.toContain("https://api.eximbay.com");
  });

  it("pins numeric secret versions without provider secret payload or broad secret IAM", () => {
    const terraform = allTerraform();
    expect(terraform).toContain('role      = "roles/secretmanager.secretAccessor"');
    expect(matches(terraform, /roles\/secretmanager\.secretAccessor/gu)).toBe(2);
    expect(terraform).toContain('secret_id = var.database_url_secret_id');
    expect(terraform).toContain('secret_id = var.eximbay_api_key_secret_id');
    expect(terraform).toContain('version = var.database_url_secret_version');
    expect(terraform).toContain(
      'MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                   = var.eximbay_api_key_secret_version',
    );
    expect(terraform).toContain('var.database_url_secret_version == "1"');
    expect(terraform).toContain('var.eximbay_api_key_secret_version == "1"');
    expect(terraform).not.toMatch(/secret_data|EXIMBAY_SANDBOX_API_KEY\s*=/u);
    expect(terraform).not.toMatch(/google_secret_manager_secret(?:_version)?\s+"/u);
  });

  it("preserves corrected role authority and adds only the exact canary delta", () => {
    expect(sha256(readFileSync(FROZEN_DATABASE_ROLES))).toBe(
      "a8ddd82fc14f09db4caee476377d15b6584e3c7e9cf4828ad8aed977d924d614",
    );
    const grants = source("database-role-grants.sql");
    expect(grants).toContain(
      "20260825130000_eximbay_refund_sandbox_canary_approval",
    );
    expect(grants).toMatch(
      /GRANT SELECT ON TABLE "EximbayRefundSandboxCanaryApproval"\s+TO mira_refund_preflight, mira_refund_canary;/u,
    );
    expect(grants).toMatch(
      /GRANT UPDATE \(\s*"consumedAt",\s*"consumedExecutionId",\s*"consumedExecutionBindingDigest"\s*\) ON TABLE "EximbayRefundSandboxCanaryApproval"\s+TO mira_refund_canary;/u,
    );
    expect(grants).toMatch(
      /GRANT SELECT ON TABLE "CheckoutSession"\s+TO mira_refund_canary;/u,
    );
    expect(grants).toMatch(
      /GRANT INSERT ON TABLE "PaymentOutbox"\s+TO mira_refund_canary;/u,
    );
    expect(grants).toMatch(
      /GRANT SELECT, INSERT ON TABLE "RefundExecutionEximbayPreflightObservation"\s+TO mira_refund_canary;/u,
    );
    expect(grants).not.toMatch(/GRANT\s+(?:DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
    expect(grants).not.toMatch(/GRANT INSERT ON TABLE "CheckoutSession"/u);
    expect(grants).not.toMatch(/GRANT (?:SELECT|UPDATE) ON TABLE "PaymentOutbox"/u);
    expect(grants).not.toMatch(/GRANT (?:UPDATE|DELETE) ON TABLE "RefundExecutionEximbayPreflightObservation"/u);
    expect(grants).toMatch(/GRANT UPDATE \("id"\) ON TABLE "Payment"\s+TO mira_refund_canary;/u);
    expect(grants).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionProviderOperationBinding"\s+TO mira_refund_canary;/u);
    expect(grants).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionEvidence"\s+TO mira_refund_canary;/u);
    expect(grants).toMatch(/GRANT UPDATE \("id"\) ON TABLE "RefundExecutionCommandEvent"\s+TO mira_refund_canary;/u);
    expect(grants).not.toMatch(/GRANT\s+(?:ALL|CREATE|USAGE|ALTER|OWNERSHIP)/u);
    expect(grants).not.toMatch(/GRANT UPDATE ON TABLE/u);
  });
});

function source(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

function allTerraform(): string {
  return readdirSync(ROOT)
    .filter((name) => name.endsWith(".tf"))
    .sort()
    .map(source)
    .join("\n");
}

function matches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
