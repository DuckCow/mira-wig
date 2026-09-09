import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json";
import historicalOwnership from "../../../../../infra/refund-sandbox/p3e-b2/runtime-deferred/resource-ownership-v1.json";
import { walkRefundP3eRealFiles as walk } from "./refund-p3e-real-filesystem-inventory";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const RUNTIME = join(INFRA, "runtime");
const POLICY_DOCUMENT = join(
  ROOT,
  "docs/payment_policy/refund_worker_p3e_b2_dormant_runtime_authority_v1.md",
);

const EXPECTED_ADDRESSES = Object.freeze([
  "google_cloud_run_v2_job.preflight",
  'google_project_iam_member.cloud_sql_client["preflight"]',
  "google_secret_manager_secret_iam_member.preflight_database_access",
  "google_service_account.preflight",
]);

const EXPECTED_TYPES = Object.freeze([
  "google_cloud_run_v2_job",
  "google_project_iam_member",
  "google_secret_manager_secret_iam_member",
  "google_service_account",
]);

describe("P3E-B2 provider-free preflight runtime authority", () => {
  it("freezes the exact four-resource release graph", () => {
    expect(contract.resourceGraph).toMatchObject({
      resourceCount: 4,
      addresses: EXPECTED_ADDRESSES,
      resourceTypes: EXPECTED_TYPES,
      sortedAddressSha256:
        "2f4d2e2009f6a1e1b4fe0971bb40fcbe7a0a6d34e8a1c1e8994647f78b9e9d2d",
    });
    expect(exactSetHash(EXPECTED_ADDRESSES)).toBe(
      contract.resourceGraph.sortedAddressSha256,
    );
    expect(terraformResourceDeclarations(readTerraform())).toEqual([
      "google_cloud_run_v2_job.preflight",
      "google_project_iam_member.cloud_sql_client",
      "google_secret_manager_secret_iam_member.preflight_database_access",
      "google_service_account.preflight",
    ]);
  });

  it("admits the exact release without exposing a caller override", () => {
    const main = readFileSync(join(RUNTIME, "main.tf"), "utf8");
    const locals = readFileSync(join(RUNTIME, "locals.tf"), "utf8");
    const variables = readFileSync(join(RUNTIME, "variables.tf"), "utf8");
    expect(main.match(/condition\s*=\s*local\.runtime_apply_authorized/gu))
      .toHaveLength(4);
    expect(main.match(/error_message\s*=\s*"PREFLIGHT_RELEASE_AUTHORITY_MISSING"/gu))
      .toHaveLength(4);
    expect(locals).toMatch(/runtime_apply_authorized\s*=\s*true/u);
    expect(locals).toContain(
      'runtime_root_apply_policy  = "EXPLICIT_PREFLIGHT_RELEASE_AUTHORIZED"',
    );
    expect(variables).not.toContain("runtime_apply_authorized");
    expect(contract.applyEnforcement).toEqual({
      policy: "EXPLICIT_PREFLIGHT_RELEASE_AUTHORIZED",
      authorized: true,
      callerOverride: "ABSENT",
      environmentOverride: "ABSENT",
      workspaceOverride: "ABSENT",
      testOverride: "ABSENT",
      coveredResourceInstances: 4,
      mechanism: "RESOURCE_LIFECYCLE_PRECONDITION_ON_EVERY_RESOURCE_DECLARATION",
      error: "PREFLIGHT_RELEASE_AUTHORITY_MISSING",
      futureRelease: "CANARY_REMAINS_SEPARATE_AND_NOT_MATERIALIZED",
    });
  });

  it("uses one exact identity with minimum connection and secret-read IAM", () => {
    expect(contract.runtimeIdentities).toEqual({
      count: 1,
      preflightAccountIdTemplate: "<resource-prefix>-preflight",
      sharedIdentity: false,
      serviceAccountKeys: "FORBIDDEN",
      defaultComputeServiceAccount: "FORBIDDEN",
      impersonation: "FORBIDDEN",
      deployerBinding: "ABSENT",
      invokerBinding: "ABSENT",
    });
    expect(contract.iam.cloudSqlClient).toEqual({
      role: "roles/cloudsql.client",
      principalCount: 1,
      scope: "EXACT_PROJECT_MEMBER_WITH_SINGLE_INSTANCE_IAM_CONDITION",
      conditionTemplate:
        "resource.name == '<exact-foundation-instance-resource-name>' && resource.service == 'sqladmin.googleapis.com'",
      connectionMode: "PRIVATE_IP_PROXY_WITHOUT_IAM_DATABASE_AUTHENTICATION",
    });
    expect(contract.iam.databaseSecrets).toMatchObject({
      role: "roles/secretmanager.secretAccessor",
      scope: "EXACT_SECRET_RESOURCE",
      crossAccess: "FORBIDDEN",
      projectLevelBinding: "FORBIDDEN",
      secretVersionCreation: "ABSENT",
    });
    expect(readTerraform()).not.toContain("roles/cloudsql.instanceUser");
  });

  it("couples exact identity, IAM, secret, image, and network authority to Terraform source", () => {
    const main = readFileSync(join(RUNTIME, "main.tf"), "utf8");
    const locals = readFileSync(join(RUNTIME, "locals.tf"), "utf8");
    const serviceAccount = terraformResourceBlock(
      main,
      "google_service_account",
      "preflight",
    );
    expect(serviceAccount).toContain("account_id   = local.preflight_service_account_id");
    expect(locals).toContain(
      'preflight_service_account_id = "${var.resource_prefix}-preflight"',
    );

    const cloudSql = terraformResourceBlock(
      main,
      "google_project_iam_member",
      "cloud_sql_client",
    );
    expect(cloudSql).toContain("for_each = local.runtime_identities");
    expect(cloudSql).toContain('role    = "roles/cloudsql.client"');
    expect(cloudSql).toContain("member  = \"serviceAccount:${each.value}\"");
    expect(cloudSql).toContain("expression  = local.cloud_sql_condition_expression");
    expect(locals).toContain(
      "cloud_sql_condition_expression = \"resource.name == '${local.foundation_cloud_sql_instance_resource_name}' && resource.service == 'sqladmin.googleapis.com'\"",
    );
    expect(locals).toMatch(
      /runtime_identities\s*=\s*\{\s*preflight\s*=\s*google_service_account\.preflight\.email\s*\}/u,
    );

    const secret = terraformResourceBlock(
      main,
      "google_secret_manager_secret_iam_member",
      "preflight_database_access",
    );
    expect(secret).toContain(
      "secret_id = local.foundation_preflight_database_secret_resource_name",
    );
    expect(secret).toContain('role      = "roles/secretmanager.secretAccessor"');
    expect(secret).toContain(
      'member    = "serviceAccount:${google_service_account.preflight.email}"',
    );

    const job = terraformResourceBlock(main, "google_cloud_run_v2_job", "preflight");
    expect(job).toContain("service_account       = google_service_account.preflight.email");
    expect(job).toContain("image = local.release_image_digest_uri");
    expect(job).toContain('args  = ["sandbox-preflight"]');
    expect(job).toContain("secret  = local.preflight_database_secret_version_resource_name");
    expect(job).toContain("version = local.preflight_database_secret_version");
    expect(job).toContain('egress = "ALL_TRAFFIC"');
    expect(job).toContain("network    = local.foundation_network_resource_name");
    expect(job).toContain("subnetwork = local.foundation_subnetwork_resource_name");
    expect(job).toContain("tags       = local.network_tags");
    expect(job.match(/\benv\s*\{/gu)).toHaveLength(3);

    expect(locals).toContain(
      "${var.resource_prefix}-refund-images/refund-worker@sha256:[0-9a-f]{64}$",
    );
    expect(locals).not.toContain("refund-images/[a-z0-9]");
  });

  it("materializes only the provider-free preflight Job contract", () => {
    expect(contract.jobs).toMatchObject({
      taskCount: 1,
      parallelism: 1,
      maxRetries: 0,
      automaticExecution: "NOT_ADMITTED",
      persistentAutomaticTrigger: "NONE",
      executionEnvironment: "SECOND_GENERATION",
      resources: { cpu: "1", memory: "512Mi" },
      taskTimeout: { seconds: 300 },
      preflight: {
        arguments: ["sandbox-preflight"],
        environmentKeys: [
          "DATABASE_URL",
          "MIRA_REFUND_P3E_PREFLIGHT_MODE",
          "REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME",
        ],
        providerContact: "FORBIDDEN",
      },
      canary: {
        materialized: false,
        providerCredential: "ABSENT",
        target: "ABSENT",
        approval: "ABSENT",
        executable: false,
      },
    });
    expect(contract.network).toMatchObject({
      mode: "DIRECT_VPC_EGRESS",
      egress: "ALL_TRAFFIC",
      tags: ["refund-provider-free"],
      serverlessVpcAccessConnector: "FORBIDDEN",
      databaseEndpoint: "CLOUD_SQL_PRIVATE_IP_ONLY",
      applicationTransport: "POSTGRESQL_UNIX_SOCKET",
    });
    expect(contract.providerScope).toMatchObject({
      classification: "PREFLIGHT_ONLY_NO_PROVIDER_ROUTE",
      runtimeProviderCredentialBindings: 0,
    });
  });

  it("requires preflight secret version 1 and an immutable reviewed image", () => {
    expect(contract.handoffs.releaseImage).toMatchObject({
      localR2aDigestAccepted: false,
      currentRealStatus: "REQUIRED_FOR_RELEASE_NOT_YET_PUBLISHED",
    });
    expect(contract.handoffs.databaseSecretVersionReference).toEqual({
      schemaFieldNamesSha256:
        "c41ee7d427a8978d8b5e1bdd2245b0810499bf23deaca2be862aa487473328ee",
      fields: ["secret_resource_name", "version"],
      versionGrammar: "^1$",
      payload: "FORBIDDEN",
      currentRealStatus: "PREFLIGHT_VERSION_1_ENABLED",
    });
    expect(readFileSync(join(RUNTIME, "locals.tf"), "utf8"))
      .toContain('var.preflight_database_secret_version_reference.version == "1"');
  });

  it("contains no canary resource, trigger, secret payload, or provider credential", () => {
    const source = readTerraform();
    expect(source).not.toMatch(/resource\s+"[^"]+"\s+"[^"\n]*canary/u);
    expect(source).not.toMatch(
      /google_cloudbuild_trigger|google_cloud_scheduler_job|google_eventarc_trigger|google_pubsub_subscription|google_workflows_workflow|google_secret_manager_secret_version|google_service_account_key/u,
    );
    expect(source).not.toMatch(
      /TOSS_SECRET_KEY|EXIMBAY|PAYPAL|REFUND_SANDBOX_TARGET|EXECUTABLE_APPROVAL|secret_data/u,
    );
    expect(contract.status).toMatchObject({
      RUNTIME_APPLY_AUTHORIZED: "TRUE_EXACT_PREFLIGHT_RELEASE_ONLY",
      RUNTIME_ROOT_APPLY_POLICY: "EXPLICIT_PREFLIGHT_RELEASE_AUTHORIZED",
      CANARY_EXECUTABLE: "FALSE",
      PROVIDER_EXECUTION: "BLOCKED",
      SCHEDULED_SANDBOX: "BLOCKED",
      LIVE: "UNREACHABLE",
    });
  });

  it("keeps historical deny-era ownership frozen and superseded", () => {
    expect(historicalOwnership.statuses.RUNTIME_IDENTITY_AUTHORITY).toBe("DEFERRED");
    expect(historicalOwnership.ownership).toHaveLength(18);
    expect(historicalOwnership.supersession).toMatchObject({
      package: "P3E-B2-R2B1",
      contract: "../contracts/runtime-authority-v1.json",
      status: "DORMANT_DEFINITIONS_ONLY_NOT_PROVISIONED",
      executionAuthority: "ABSENT",
    });
    expect(contract.historicalAuthorityDisposition.currentStatusValue).toBe(
      "NOT_APPLICABLE_NO_ORGANIZATION",
    );
  });

  it("preserves foundation/proxy bytes and validates superseded source against its own committed authority", () => {
    const frozen = {
      "infra/refund-sandbox/p3e-b2/foundation/network.tf":
        "affe2fdca13b42ee287e5439c12c220c61f0c37b0e5d0e1f5f777d7b4cab045e",
      "infra/refund-sandbox/p3e-b2/foundation/cloud-sql.tf":
        "27ad2958fa386c39a84b23528f8acbedb0e6b63891873db5ce0d7bb30e0f2b14",
      "src/lib/payment/refund/refund-sandbox-provider-free-preflight-environment.ts":
        "838e5d1405ba1330d334b4f9006ab753f6dba9c59533e3c1bcc04b9f960ebe27",
    } as const;
    for (const [path, expected] of Object.entries(frozen)) {
      expect(sha256(readFileSync(join(ROOT, path))), path).toBe(expected);
    }
    // R2B1's canary source and the later strict-supervisor checkpoint have distinct lifetimes.
    // Current canary/re-entry behavior is checked by their own contracts and behavior tests.
    const historical = [
      ["7958fb0b228266d502f5e55a14929e8d5510e913", "src/lib/payment/refund/refund-worker-container-supervisor.ts",
        "0d9fd396e5afb2d48d087472aa5f4a1d9dfcd4fe0353347e9c7c42e347ae277a"],
      ["0b4ba9dc2625030909f6a19134a0c01692120b97", "infra/refund-sandbox/p3e-b2/eximbay-canary/main.tf",
        "6b4865199543b45a996aefbfe0b5c896bbda45542c0941080f67c1d8a82ca3f7"],
      ["0b4ba9dc2625030909f6a19134a0c01692120b97", "src/lib/payment/refund/eximbay-refund-canary-target-binding.ts",
        "36a215ebc6ccfa504e4f9d5ace54de32dd480de73947317e002ca9be0aecf4da"],
    ] as const;
    for (const [revision, path, expected] of historical) {
      expect(sha256(execFileSync("git", ["show", `${revision}:${path}`], { cwd: ROOT })), path).toBe(expected);
    }
  });

  it("publishes the machine statuses in the current policy document", () => {
    const documentation = readFileSync(POLICY_DOCUMENT, "utf8");
    for (const [key, value] of Object.entries(contract.status)) {
      expect(documentation).toContain(`${key}: ${value}`);
    }
    expect(documentation).toContain("p3e-b2/runtime");
  });
});

function readTerraform(): string {
  return walk(RUNTIME)
    .filter((path) => path.endsWith(".tf"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function terraformResourceDeclarations(source: string): string[] {
  return [...source.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/gu)]
    .map((match) => `${match[1]}.${match[2]}`)
    .sort();
}

function terraformResourceBlock(
  source: string,
  type: string,
  name: string,
): string {
  const declaration = `resource "${type}" "${name}"`;
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Missing Terraform resource: ${type}.${name}`);
  const opening = source.indexOf("{", start + declaration.length);
  if (opening < 0) throw new Error(`Missing Terraform block: ${type}.${name}`);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed Terraform block: ${type}.${name}`);
}

function exactSetHash(values: readonly string[]): string {
  return createHash("sha256")
    .update([...values].sort().join("\n"), "utf8")
    .digest("hex");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
