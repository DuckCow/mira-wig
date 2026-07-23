import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b");
const terraformFiles = readdirSync(INFRA)
  .filter((name) => name.endsWith(".tf"))
  .map((name) => readFileSync(join(INFRA, name), "utf8"));
const terraform = terraformFiles.join("\n");
const ACTIVATION_KEYS = Object.freeze([
  "REFUND_EXECUTION_CLAIM_ENABLED",
  "REFUND_EXECUTION_LEASE_ENABLED",
  "REFUND_EXECUTION_LEASE_RELEASE_ENABLED",
  "REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED",
  "REFUND_EXECUTION_WORKER_ENABLED",
  "REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED",
  "REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED",
  "REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED",
  "REFUND_EXECUTION_TOSS_CONTACT_ENABLED",
  "REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED",
  "REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED",
  "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED",
]);

describe("P3E-B provider-free Terraform policy", () => {
  it("pins Terraform and Google provider while keeping the backend partial", () => {
    const versions = readFileSync(join(INFRA, "versions.tf"), "utf8");
    expect(versions).toContain('required_version = ">= 1.7.0, < 2.0.0"');
    expect(versions).toContain('version = "= 7.40.0"');
    expect(versions).toContain('source  = "hashicorp/google"');
    expect(versions).toMatch(/backend\s+"gcs"\s+\{\}/u);
    expect(versions).not.toMatch(/bucket\s*=/u);
    expect(terraform).not.toMatch(/module\s+"/u);
  });

  it("declares only the reviewed provider-free API inventory", () => {
    const locals = readFileSync(join(INFRA, "locals.tf"), "utf8");
    const services = [...locals.matchAll(/"([a-z]+(?:[a-z.]*)\.googleapis\.com)"/gu)]
      .map((match) => match[1]).sort();
    expect(services).toEqual([
      "artifactregistry.googleapis.com",
      "compute.googleapis.com",
      "iam.googleapis.com",
      "logging.googleapis.com",
      "monitoring.googleapis.com",
      "run.googleapis.com",
      "secretmanager.googleapis.com",
      "servicenetworking.googleapis.com",
      "serviceusage.googleapis.com",
      "sqladmin.googleapis.com",
    ]);
    expect(terraform).not.toMatch(/scheduler|workflows|cloudtasks|pubsub/iu);
    expect(readFileSync(join(INFRA, "apis.tf"), "utf8"))
      .toContain("disable_on_destroy = false");
  });

  it("defines one immutable protected regional Artifact Registry repository", () => {
    const artifact = readFileSync(join(INFRA, "artifact_registry.tf"), "utf8");
    expect(resourceCount(artifact, "google_artifact_registry_repository")).toBe(1);
    expect(artifact).toContain("location      = local.region");
    expect(artifact).toContain('format        = "DOCKER"');
    expect(artifact).toContain("immutable_tags = true");
    expect(artifact).toContain("prevent_destroy = true");
    expect(artifact).not.toMatch(/cleanup_polic|allUsers|writer/iu);
  });

  it("keeps network egress private with no NAT, connector, public SQL, or authorized network", () => {
    const network = readFileSync(join(INFRA, "network.tf"), "utf8");
    const sql = readFileSync(join(INFRA, "cloud_sql.tf"), "utf8");
    const jobs = readFileSync(join(INFRA, "cloud_run_jobs.tf"), "utf8");
    expect(network).toContain("auto_create_subnetworks = false");
    expect(network).toContain('purpose       = "VPC_PEERING"');
    expect(network).toContain('direction          = "EGRESS"');
    expect(network).toContain('destination_ranges = ["0.0.0.0/0"]');
    expect(network).toContain('protocol = "all"');
    expect(terraform).not.toMatch(/google_compute_router_nat|vpc_access_connector/iu);
    expect(sql).toContain("ipv4_enabled                                  = false");
    expect(sql).toContain("private_network");
    expect(sql).not.toMatch(/authorized_networks/iu);
    expect(jobs.match(/egress = "ALL_TRAFFIC"/gu)).toHaveLength(2);
    expect(jobs.match(/tags\s+= \["refund-provider-free"\]/gu)).toHaveLength(2);
  });

  it("freezes PostgreSQL 18 and every Cloud SQL protection", () => {
    const sql = readFileSync(join(INFRA, "cloud_sql.tf"), "utf8");
    const variables = readFileSync(join(INFRA, "variables.tf"), "utf8");
    expect(variables).toContain("var.database_major_version == 18");
    expect(sql).toContain('database_version    = "POSTGRES_${var.database_major_version}"');
    expect(sql).toContain("deletion_protection = true");
    expect(sql).toContain("deletion_protection_enabled = true");
    expect(sql).toContain('availability_type           = "ZONAL"');
    expect(sql).toContain("point_in_time_recovery_enabled = true");
    expect(sql).toContain("transaction_log_retention_days = 7");
    expect(sql).toContain('data_api_access             = "DISALLOW_DATA_API"');
    expect(sql).toContain("prevent_destroy = true");
    expect(terraform).not.toMatch(/google_sql_user|password\s*=/iu);
  });

  it("defines two distinct keyless service accounts and exact narrow runtime grants", () => {
    const identities = readFileSync(join(INFRA, "identities.tf"), "utf8");
    expect(resourceCount(identities, "google_service_account")).toBe(2);
    expect(identities).toContain('role   = "roles/cloudsql.client"');
    expect(identities).toContain('role   = "roles/logging.logWriter"');
    expect(terraform).not.toMatch(/google_service_account_key|compute@developer|roles\/owner|roles\/editor/iu);
    expect(terraform).not.toMatch(/roles\/run\.(?:jobsExecutor|jobsExecutorWithOverrides|developer|admin)/u);
    expect(terraform).not.toMatch(/run\.jobs\.run(?:WithOverrides)?/u);
  });

  it("creates only separate database secret containers and numeric references", () => {
    const secrets = readFileSync(join(INFRA, "secrets.tf"), "utf8");
    const jobs = readFileSync(join(INFRA, "cloud_run_jobs.tf"), "utf8");
    expect(resourceCount(secrets, "google_secret_manager_secret")).toBe(2);
    expect(terraform).not.toMatch(/google_secret_manager_secret_version/iu);
    expect(secrets).not.toMatch(/toss|paypal|provider|target|live/iu);
    expect(jobs).toContain("version = tostring(var.preflight_database_secret_version)");
    expect(jobs).toContain("version = tostring(var.canary_database_secret_version)");
    expect(terraform).not.toMatch(/version\s*=\s*"latest"/iu);
  });

  it("freezes both jobs to one task, one-way execution, one digest, and dormant canary flags", () => {
    const jobs = readFileSync(join(INFRA, "cloud_run_jobs.tf"), "utf8");
    expect(resourceCount(jobs, "google_cloud_run_v2_job")).toBe(2);
    expect(jobs.match(/task_count\s+= 1/gu)).toHaveLength(2);
    expect(jobs.match(/parallelism\s+= 1/gu)).toHaveLength(2);
    expect(jobs.match(/max_retries\s+= 0/gu)).toHaveLength(2);
    expect(jobs.match(/timeout\s+= "150s"/gu)).toHaveLength(2);
    expect(jobs.match(/image\s+= var\.container_image_digest_uri/gu)).toHaveLength(2);
    expect(jobs).toContain('"scripts/refund-sandbox-provider-free-preflight.ts"');
    expect(jobs).toContain('"scripts/refund-execution-worker.ts"');
    expect(jobs).toContain('"p3e-b-dormant"');
    expect(jobs).toContain('"disabled"');
    expect(readFileSync(join(INFRA, "locals.tf"), "utf8"))
      .toContain("canary_internal_budget_seconds = 120");
    for (const key of ACTIVATION_KEYS) {
      expect(readFileSync(join(INFRA, "locals.tf"), "utf8")).toContain(`${key}`);
    }
    expect(jobs).not.toMatch(/TOSS.*SECRET|PAYPAL|TARGET|APPROVAL/iu);
  });

  it("keeps database roles least-privilege and the manifest unexecuted", () => {
    const sql = readFileSync(join(INFRA, "database_roles.sql"), "utf8");
    const packageJson = readFileSync(join(ROOT, "package.json"), "utf8");
    expect(sql).toContain("NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION");
    expect(sql).toContain("GRANT SELECT ON TABLE");
    expect(sql).toContain("TO mira_refund_preflight");
    expect(sql).toContain("GRANT UPDATE ON TABLE");
    expect(sql).toContain("GRANT INSERT ON TABLE");
    expect(sql).toContain("TO mira_refund_canary");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public");
    expect(sql).toContain("REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES");
    expect(sql).not.toMatch(/GRANT ALL|\bSUPERUSER\b|\bCREATEDB\b|\bCREATEROLE\b/iu);
    expect(packageJson).not.toContain("database_roles.sql");
  });

  it("documents a call-graph justification for every granted database table", () => {
    const sql = readFileSync(join(INFRA, "database_roles.sql"), "utf8");
    const documentation = readFileSync(
      join(ROOT, "docs/payment_policy/refund_worker_p3e_b_provider_free_infrastructure_v1.md"),
      "utf8",
    );
    const grantedTables = [...sql.matchAll(/^\s+"([A-Za-z_]+)"[,]?$/gmu)]
      .map((match) => match[1]);
    for (const table of new Set(grantedTables)) {
      expect(documentation).toContain(`| \`${table}\` |`);
    }
  });

  it("keeps alert delivery disabled and records all six future event definitions", () => {
    const locals = readFileSync(join(INFRA, "locals.tf"), "utf8");
    const monitoring = readFileSync(join(INFRA, "logging_monitoring.tf"), "utf8");
    for (const event of [
      "cloud_run_execution_failure", "task_timeout", "missing_final_result",
      "overlap_skipped", "preflight_failure", "configuration_failure",
    ]) expect(locals).toContain(event);
    expect(monitoring).toContain("creates no alert policy or notification channel");
    expect(terraform).not.toMatch(/google_monitoring_alert_policy|google_monitoring_notification_channel/iu);
  });
});

function resourceCount(source: string, type: string): number {
  return [...source.matchAll(new RegExp(`resource\\s+"${type}"`, "gu"))].length;
}
