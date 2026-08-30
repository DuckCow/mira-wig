import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const MODULE = join(INFRA, "modules/state-bucket");
const BOOTSTRAP = join(INFRA, "state-bootstrap-create");
const AUTHORITY = join(INFRA, "state-backend-authority");
const GUARDRAILS = join(INFRA, "authority-guardrails");
const POLICY_DOCUMENT = join(
  ROOT,
  "docs/payment_policy/refund_worker_p3e_b2_state_authority_v1.md",
);
const EXECUTABLE_ROOTS = Object.freeze([BOOTSTRAP, AUTHORITY]);
const EXPECTED_R1A_INFRASTRUCTURE_FILES = Object.freeze([
  "README.md",
  "authority-guardrails/README.md",
  "modules/state-bucket/.terraform.lock.hcl",
  "modules/state-bucket/checks.tf",
  "modules/state-bucket/main.tf",
  "modules/state-bucket/outputs.tf",
  "modules/state-bucket/tests/policy.tftest.hcl",
  "modules/state-bucket/variables.tf",
  "modules/state-bucket/versions.tf",
  "state-backend-authority/.terraform.lock.hcl",
  "state-backend-authority/imports.tf",
  "state-backend-authority/main.tf",
  "state-backend-authority/outputs.tf",
  "state-backend-authority/providers.tf",
  "state-backend-authority/terraform.tfvars.example",
  "state-backend-authority/tests/policy.tftest.hcl",
  "state-backend-authority/variables.tf",
  "state-backend-authority/versions.tf",
  "state-bootstrap-create/.terraform.lock.hcl",
  "state-bootstrap-create/main.tf",
  "state-bootstrap-create/outputs.tf",
  "state-bootstrap-create/providers.tf",
  "state-bootstrap-create/terraform.tfvars.example",
  "state-bootstrap-create/tests/policy.tftest.hcl",
  "state-bootstrap-create/variables.tf",
  "state-bootstrap-create/versions.tf",
]);

describe("P3E-B2-R1A state authority and retired deny policy", () => {
  it("preserves the exact committed R1A-owned 26-path subinventory", () => {
    const infrastructureRoot = realpathSync(INFRA);
    const files = walk(infrastructureRoot)
      .map((path) => relative(infrastructureRoot, path).split(sep).join("/"))
      .filter((path) => (
        path === "README.md" ||
        path.startsWith("authority-guardrails/") ||
        path.startsWith("modules/state-bucket/") ||
        path.startsWith("state-backend-authority/") ||
        path.startsWith("state-bootstrap-create/")
      ))
      .sort();
    expect(EXPECTED_R1A_INFRASTRUCTURE_FILES).toHaveLength(26);
    expect(new Set(EXPECTED_R1A_INFRASTRUCTURE_FILES).size).toBe(26);
    expect(files).toEqual(EXPECTED_R1A_INFRASTRUCTURE_FILES);
  });

  it("pins the reviewed toolchain and preserves local versus partial-backend ownership", () => {
    for (const root of EXECUTABLE_ROOTS) {
      const versions = readFileSync(join(root, "versions.tf"), "utf8");
      expect(versions).toContain('required_version = ">= 1.7.0, < 2.0.0"');
      expect(versions).toContain('source  = "hashicorp/google"');
      expect(versions).toContain('version = "= 7.40.0"');
      expect(versions).not.toMatch(/credentials\s*=/u);
    }

    const bootstrapVersions = readFileSync(join(BOOTSTRAP, "versions.tf"), "utf8");
    const authorityVersions = readFileSync(join(AUTHORITY, "versions.tf"), "utf8");
    expect(bootstrapVersions).toMatch(/backend\s+"local"\s+\{\}/u);
    expect(bootstrapVersions).not.toMatch(/backend\s+"gcs"/u);
    expect(authorityVersions).toMatch(/backend\s+"gcs"\s+\{\}/u);
    expect(authorityVersions).not.toMatch(
      /\b(?:bucket|prefix|credentials)\s*=/u,
    );
  });

  it("uses one protected bucket module with bucket-scoped IAM only", () => {
    const moduleSource = readTerraform(MODULE);
    const bucketDefinition = readFileSync(join(MODULE, "main.tf"), "utf8");
    expect(resourceTypes(moduleSource)).toEqual([
      "google_storage_bucket",
      "google_storage_bucket_iam_member",
      "google_storage_bucket_iam_member",
      "google_storage_bucket_iam_member",
    ]);
    expect(moduleSource).toContain('location                    = var.location');
    expect(moduleSource).toContain('storage_class               = "STANDARD"');
    expect(moduleSource).toContain("uniform_bucket_level_access = true");
    expect(moduleSource).toContain('public_access_prevention    = "enforced"');
    expect(moduleSource).toContain("force_destroy               = false");
    expect(moduleSource).toContain("enabled = var.recovery_configuration.versioning_enabled");
    expect(moduleSource).toContain("retention_duration_seconds = 0");
    expect(moduleSource).toContain("prevent_destroy = true");
    expect(moduleSource).toContain('role   = "roles/storage.objectAdmin"');
    expect(moduleSource.match(/role\s+= "roles\/storage\.admin"/gu)).toHaveLength(2);
    expect(bucketDefinition).not.toMatch(
      /google_(?:project|storage_bucket_(?:acl|default_object_acl)|service_account_key)/u,
    );
    expect(bucketDefinition).not.toMatch(
      /member\s*=\s*"(?:allUsers|allAuthenticatedUsers)"|roles\/(?:owner|editor|viewer)/iu,
    );
    expect(bucketDefinition).not.toMatch(
      /^\s*(?:website|requester_pays|retention_policy|lifecycle_rule)\s*(?:\{|=)/mu,
    );
  });

  it("keeps local and remote roots on the same module and freezes one-way adoption", () => {
    const bootstrap = readTerraform(BOOTSTRAP);
    const authority = readTerraform(AUTHORITY);
    expect(bootstrap).toContain('source = "../modules/state-bucket"');
    expect(authority).toContain('source = "../modules/state-bucket"');
    expect(resourceTypes(bootstrap)).toEqual([]);
    expect(resourceTypes(authority)).toEqual([]);
    expect(bootstrap).toContain('"ONE_TIME_LOCAL_BOOTSTRAP_ONLY"');

    const imports = readFileSync(join(AUTHORITY, "imports.tf"), "utf8");
    expect(imports).toContain("to = module.state_bucket.google_storage_bucket.state");
    expect(imports).toContain(
      "module.state_bucket.google_storage_bucket_iam_member.state_runner",
    );
    expect(imports).toContain(
      "module.state_bucket.google_storage_bucket_iam_member.state_administrator",
    );
    expect(imports).toContain(
      "module.state_bucket.google_storage_bucket_iam_member.break_glass_state_administrator",
    );
    expect(imports).not.toMatch(/\b(?:destroy|state rm|-target)\b/u);
  });

  it("retires the infeasible deny root and permanently rejects its failed plan", () => {
    const files = walk(GUARDRAILS).map((path) => basename(path));
    const marker = readFileSync(join(GUARDRAILS, "README.md"), "utf8");
    expect(files).toEqual(["README.md"]);
    expect(readTerraform(GUARDRAILS)).toBe("");
    expect(marker).toContain("not attached to an organization");
    expect(marker).toContain("unavailable");
    expect(marker).toContain("not required");
    expect(marker).toContain(
      "d26b446e26b41c1b88f52e530dadc2ef4ec82420b7acce87faf5e8ddd995e86b",
    );
    expect(marker).toMatch(/must\s+never be retried/u);
    expect(marker).toMatch(/must\s+never be reused/u);
  });

  it("contains no R1A foundation, runtime, credential, or execution resource", () => {
    const source = EXECUTABLE_ROOTS.map(readTerraform).join("\n");
    const forbiddenResourceTypes = [
      "google_project",
      "google_billing_project_info",
      "google_cloud_run_v2_job",
      "google_sql_database_instance",
      "google_artifact_registry_repository",
      "google_secret_manager_secret_version",
      "google_cloud_scheduler_job",
      "google_service_account",
      "google_service_account_key",
    ];
    for (const type of forbiddenResourceTypes) {
      expect(resourceTypes(source)).not.toContain(type);
    }
    expect(source).not.toMatch(
      /(?:GOOGLE_APPLICATION_CREDENTIALS|TOSS_SECRET_KEY|PAYPAL|REFUND_SANDBOX_TARGET|EXECUTABLE_APPROVAL)/u,
    );
    expect(source).not.toMatch(/(?:src\/lib\/payment|scripts\/refund|infra\/refund-sandbox\/p3e-b\/)/u);
    expect(source).not.toMatch(/data\s+"terraform_remote_state"/u);
  });

  it("keeps examples synthetic and detects a real-looking identity mutation", () => {
    for (const root of EXECUTABLE_ROOTS) {
      const example = readFileSync(join(root, "terraform.tfvars.example"), "utf8");
      expect(findNonsyntheticExampleIdentities(example)).toEqual([]);
      expect(example).not.toMatch(
        /(?:googleusercontent\.com|iam\.gserviceaccount\.com|@gmail\.com|@googlemail\.com)/u,
      );
    }

    const bootstrapExample = readFileSync(
      join(BOOTSTRAP, "terraform.tfvars.example"),
      "utf8",
    );
    const mutated = bootstrapExample.replace(
      "state-runner@example.invalid",
      "state-runner@gmail.com",
    );
    expect(findNonsyntheticExampleIdentities(mutated)).toEqual([
      "serviceAccount:state-runner@gmail.com",
    ]);
  });

  it("adds no apply, target, or state-operation package command", () => {
    const packageJson = readFileSync(join(ROOT, "package.json"), "utf8");
    expect(packageJson).not.toMatch(/terraform\s+(?:apply|destroy|import|refresh|state)\b/u);
    expect(packageJson).not.toMatch(/terraform\b[^\n"]*-target\b/u);
    expect(packageJson).not.toContain("p3e-b2");
  });

  it("freezes handoff, isolation, recovery, and authority separation in documentation", () => {
    const documentation = readFileSync(POLICY_DOCUMENT, "utf8");
    for (const prefix of [
      "p3e-b2/state-backend-authority",
      "p3e-b2/service-activation",
      "p3e-b2/foundation",
      "p3e-b2/foundation-deployer-authority",
      "p3e-b2/runtime",
      "p3e-b2/database-bootstrap",
      "p3e-b2/preflight-invocation",
    ]) {
      expect(documentation).toContain(prefix);
    }
    expect(documentation).toContain("p3e-b2/authority-guardrails");
    expect(documentation).toContain("must never be reused");
    for (const step of [
      "review the local creation plan",
      "adopt/import the existing bucket and IAM",
      "prove the local root owns zero resources",
      "prohibit future local-root execution",
    ]) {
      expect(documentation).toContain(step);
    }
    expect(documentation).toContain("Object versioning is the R1A");
    expect(documentation).toContain("recovery authority");
    expect(documentation).toContain("soft-delete retention duration explicitly to zero");
    expect(documentation).toContain("non-executable retirement marker");
    expect(documentation).toContain(
      "IAM Deny is not applicable to the current no-organization project",
    );
    expect(documentation).toContain(
      "FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED",
    );
  });

  it("publishes every exact non-authorizing R1A status", () => {
    const documentation = readFileSync(POLICY_DOCUMENT, "utf8");
    for (const status of [
      "STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED",
      "IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION",
      "FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED",
      "P3E_B2_FOUNDATION: NOT_PROVISIONED",
      "P3E_B2_RUNTIME: NOT_DEPLOYABLE",
      "PROVIDER_EXECUTION: BLOCKED",
      "SCHEDULED_SANDBOX: BLOCKED",
      "LIVE: UNREACHABLE",
    ]) {
      expect(documentation).toContain(status);
    }
  });

  it("retains only lockfiles as generated Terraform material", () => {
    const forbidden = walk(INFRA)
      .map((path) => basename(path))
      .filter((name) => (
        name.endsWith(".tfstate") ||
        name.includes(".tfstate.") ||
        name.endsWith(".tfplan") ||
        name === "terraform.tfvars" ||
        name === "backend.hcl" ||
        name.startsWith("crash.")
      ));
    expect(forbidden).toEqual([]);
  });
});

function readTerraform(root: string): string {
  return walk(root)
    .filter((path) => path.endsWith(".tf"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function walk(root: string): string[] {
  return readdirSync(root)
    .filter((name) => name !== ".terraform")
    .flatMap((name) => {
      const path = join(root, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function resourceTypes(source: string): string[] {
  return [...source.matchAll(/resource\s+"([^"]+)"/gu)]
    .map((match) => match[1])
    .sort();
}

function findNonsyntheticExampleIdentities(source: string): string[] {
  return [...source.matchAll(
    /"(?:user|group|serviceAccount):([^"@]+@[^"]+)"/gu,
  )]
    .map((match) => match[0].slice(1, -1))
    .filter((member) => !member.endsWith("@example.invalid"));
}
