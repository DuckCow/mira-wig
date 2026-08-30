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
  it("keeps every resource behind one source-literal hard-false apply gate", () => {
    const main = source("main.tf");
    const locals = source("locals.tf");
    const resourceCount = matches(main, /^resource\s+"/gmu);
    expect(resourceCount).toBe(5);
    expect(matches(main, /condition\s*=\s*local\.runtime_apply_authorized/gmu))
      .toBe(resourceCount);
    expect(matches(main, /R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED/gmu))
      .toBe(resourceCount);
    expect(locals).toMatch(/runtime_apply_authorized\s*=\s*false/u);
    expect(allTerraform()).not.toMatch(/variable\s+"runtime_apply_authorized"/u);
    expect(allTerraform()).toContain(
      'runtime_root_apply_policy = "UNCONDITIONALLY_BLOCKED_IN_R2B1"',
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
    expect(terraform).not.toMatch(/scheduler|runWithOverrides|roles\/run\.invoker/iu);
    expect(terraform).not.toMatch(/google_service_account_key|roles\/owner|roles\/editor/iu);
    expect(terraform).not.toMatch(/LIVE|EXIMBAY_LIVE/iu);
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
    expect(terraform).toContain('can(regex("^[1-9][0-9]*$", var.database_url_secret_version))');
    expect(terraform).toContain('can(regex("^[1-9][0-9]*$", var.eximbay_api_key_secret_version))');
    expect(terraform).not.toMatch(/secret_data|EXIMBAY_SANDBOX_API_KEY\s*=/u);
    expect(terraform).not.toMatch(/google_secret_manager_secret(?:_version)?\s+"/u);
  });

  it("preserves the frozen historical bytes and installs a self-contained convergence owner", () => {
    expect(sha256(readFileSync(FROZEN_DATABASE_ROLES))).toBe(
      "a01d35767a4e9976cfaa3dd7be35b720987346dd034a814247725a5373dda742",
    );
    const grants = source("database-role-grants.sql");
    expect(grants).toContain(
      "20260825130000_eximbay_refund_sandbox_canary_approval",
    );
    expect(grants).toContain("CREATE ROLE mira_refund_canary");
    expect(grants).toContain("NOBYPASSRLS");
    expect(grants).toMatch(
      /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public/u,
    );
    expect(grants).toMatch(
      /"EximbayRefundSandboxCanaryApproval"\s+TO mira_refund_canary;/u,
    );
    expect(grants).toMatch(
      /GRANT UPDATE \(\s*"consumedAt",\s*"consumedExecutionId",\s*"consumedExecutionBindingDigest"\s*\) ON TABLE "EximbayRefundSandboxCanaryApproval"\s+TO mira_refund_canary;/u,
    );
    expect(grants).toMatch(/"PaymentOutbox"\s+TO mira_refund_canary;/u);
    expect(grants).toMatch(/GRANT SELECT \("id", "communicationLocale"\)/u);
    expect(grants).not.toMatch(
      /GRANT INSERT ON TABLE(?:(?!TO mira_refund_canary;)[\s\S])*"RefundExecutionProviderOperationBinding"/u,
    );
    expect(grants).not.toMatch(
      /GRANT INSERT ON TABLE(?:(?!TO mira_refund_canary;)[\s\S])*"RefundExecutionProviderContactEligibilityProof"/u,
    );
    expect(grants).not.toMatch(/GRANT\s+(?:DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
    expect(grants).not.toMatch(/GRANT\s+(?:ALL|CREATE|ALTER|OWNERSHIP)/u);
    expect(grants).not.toMatch(/GRANT UPDATE ON TABLE/u);
    expect(grants).not.toContain("Apply only after the frozen historical");
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
