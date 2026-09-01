import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import bootstrapContract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v1.json";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/contacted-reconciliation-runtime-v1.json";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const RUNTIME = join(INFRA, "contacted-reconciliation");
const BOOTSTRAP = join(INFRA, "database-bootstrap");
const WORKER_DIGEST =
  "sha256:4137f0b63724f637f19b139ada7de7d589e2508dd1a5afb805428033b803db2d";
const BOOTSTRAP_DIGEST =
  "sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2";
const EXPECTED_ADDRESSES = Object.freeze([
  'google_cloud_run_v2_job.reconciliation["runtime"]',
  'google_project_iam_member.cloud_sql_client["runtime"]',
  'google_secret_manager_secret_iam_member.runtime_secret_access["database_url"]',
  'google_secret_manager_secret_iam_member.runtime_secret_access["eximbay_api_key"]',
  'google_service_account.reconciliation["runtime"]',
]);

describe("P3E-B2 fixed CONTACTED reconciliation Terraform runtime", () => {
  it("owns one default-disabled five-resource materialization and retirement boundary", () => {
    const source = readTerraform(RUNTIME);
    const variables = readFileSync(join(RUNTIME, "variables.tf"), "utf8");
    expect(contract.terraform).toMatchObject({
      root: "infra/refund-sandbox/p3e-b2/contacted-reconciliation",
      backendPrefix: "p3e-b2/contacted-reconciliation",
      providerVersion: "7.40.0",
    });
    expect(contract.materialization).toEqual({
      variable: "runtime_materialized",
      default: false,
      disabled: "ALL_PURPOSE_SPECIFIC_RESOURCES_ABSENT",
      enabled: "EXACT_FIVE_RESOURCE_RUNTIME_MATERIALIZED_WITHOUT_EXECUTION",
      retirement: "SET_FALSE_AND_APPLY_UNDER_SEPARATE_HUMAN_AUTHORITY",
    });
    expect(contract.resourceGraph).toMatchObject({
      defaultResourceCount: 0,
      materializedResourceCount: 5,
      materializedAddresses: EXPECTED_ADDRESSES,
      materializedSortedAddressSha256:
        "4d469c179f981c4d534a1ee83c6cdafbc295cdb4a67e76cf6c1e3f4bcb76f6ad",
    });
    expect(exactSetHash(EXPECTED_ADDRESSES)).toBe(
      contract.resourceGraph.materializedSortedAddressSha256,
    );
    expect(terraformResourceDeclarations(source)).toEqual([
      "google_cloud_run_v2_job.reconciliation",
      "google_project_iam_member.cloud_sql_client",
      "google_secret_manager_secret_iam_member.runtime_secret_access",
      "google_service_account.reconciliation",
    ]);
    expect(variables.match(/variable\s+"/gu)).toHaveLength(1);
    expect(variables).toMatch(
      /variable "runtime_materialized"[\s\S]*type\s*=\s*bool[\s\S]*default\s*=\s*false/u,
    );
    expect(source).toMatch(
      /runtime_instances\s*=\s*var\.runtime_materialized \? \{ runtime = true \} : \{\}/u,
    );
  });

  it("fixes the purpose-specific identity, immutable image, command, and target", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.identity).toMatchObject({
      serviceAccountId: "mira-p3e-sbx-contacted-recon",
      serviceAccountEmail:
        "mira-p3e-sbx-contacted-recon@mira-refund-sandbox-0001.iam.gserviceaccount.com",
      purpose: "ONE_FIXED_EXIMBAY_CONTACTED_RECONCILIATION",
      userManagedKeys: 0,
      tokenCreator: "ABSENT",
    });
    expect(contract.image.digestUri).toContain(WORKER_DIGEST);
    expect(contract.target).toMatchObject({
      runId: "a764f61f4e4ba799ab16b318a676db65",
      checkoutSessionId: "cmthg2mzu000001s6iuvx7u5x",
      paymentId: "DERIVED_BY_APPLICATION",
      providerOrderId: "DERIVED_BY_APPLICATION",
      authenticatedUserId: "DERIVED_BY_APPLICATION",
      operatorTargetInputs: 0,
    });
    expect(source).toContain(`refund-worker@${WORKER_DIGEST}`);
    expect(source).toMatch(/command\s*=\s*"eximbay-contacted-reconciliation-once"/u);
    expect(source).toContain('args  = [local.command]');
    expect(source).toMatch(/service_account_id\s*=\s*"mira-p3e-sbx-contacted-recon"/u);
    expect(source).not.toMatch(
      /variable\s+"(?:run_id|checkout_session_id|payment_id|provider_order_id|user_id|command|args|environment)"/iu,
    );
  });

  it("binds only the exact installed environment and two secret authorities", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.environment).toEqual({
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID:
        "a764f61f4e4ba799ab16b318a676db65",
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID:
        "cmthg2mzu000001s6iuvx7u5x",
      EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED: "ENABLED",
      EXIMBAY_SANDBOX_MID: "1849705C64",
      MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE:
        "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key",
      MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "1",
      REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME:
        "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    });
    expect(contract.iam.secretAccessorResources).toEqual([
      "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-canary-database-url",
      "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key",
    ]);
    expect(source).toMatch(/database_url_secret_version\s*=\s*"1"/u);
    expect(source).toMatch(/eximbay_api_key_secret_version\s*=\s*"1"/u);
    expect(source).toContain('name = "DATABASE_URL"');
    expect(source).toContain('secret  = local.database_url_secret_id');
    expect(source).toContain('version = local.database_url_secret_version');
    expect(source).not.toMatch(
      /EXIMBAY_SANDBOX_API_KEY\s*=|EXIMBAY_LIVE_API_KEY|EXIMBAY_LIVE_MID|secret_data/iu,
    );
    expect(source).not.toMatch(
      /EXIMBAY_REFUND_SANDBOX_(?:MERCHANT_ACCOUNT|CREDENTIAL_GENERATION)_BINDING/u,
    );
  });

  it("uses least-privilege Cloud SQL, secret, and provider-capable Direct VPC authority", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.iam.cloudSqlClient).toEqual({
      role: "roles/cloudsql.client",
      condition:
        "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'",
    });
    expect(contract.network).toMatchObject({
      mode: "GEN2_DIRECT_VPC",
      network:
        "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc",
      subnetwork:
        "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3",
      egress: "PRIVATE_RANGES_ONLY",
      networkTags: ["refund-provider-free"],
      vpcConnector: "ABSENT",
      nat: "ABSENT",
    });
    expect(source).toContain('role    = "roles/cloudsql.client"');
    expect(source).toContain("expression  = local.cloud_sql_condition_expression");
    expect(source).toContain('role      = "roles/secretmanager.secretAccessor"');
    expect(source).toContain('egress = "PRIVATE_RANGES_ONLY"');
    expect(source).toContain("network    = local.network_resource_name");
    expect(source).toContain("subnetwork = local.subnetwork_resource_name");
    expect(source).toContain("tags       = local.network_tags");
    expect(source).not.toMatch(
      /roles\/(?:cloudsql\.instanceUser|owner|editor)|google_vpc_access_connector|google_compute_router_nat|google_service_account_key|roles\/iam\.serviceAccountTokenCreator/iu,
    );
  });

  it("freezes one task, zero retries, the smallest comparable worker profile, and 180 seconds", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.job).toMatchObject({
      name: "mira-p3e-sbx-contacted-reconciliation",
      command: "eximbay-contacted-reconciliation-once",
      taskCount: 1,
      parallelism: 1,
      maxRetries: 0,
      timeoutSeconds: 180,
      executionEnvironment: "SECOND_GENERATION",
      resources: { cpu: "1", memory: "512Mi" },
      automaticExecution: "NONE",
      executionOnApply: false,
    });
    for (const expected of [
      "task_count  = local.task_count",
      "parallelism = local.parallelism",
      "max_retries           = local.max_retries",
      "timeout               = local.task_timeout",
      'cpu    = local.cpu',
      'memory = local.memory',
    ]) expect(source).toContain(expected);
    expect(source).toMatch(/\bcpu\s*=\s*"1"/u);
    expect(source).toMatch(/\bmemory\s*=\s*"512Mi"/u);
    expect(source).toMatch(/task_timeout_seconds\s*=\s*180/u);
  });

  it("contains no automatic execution, listener, queue, service, or generic provider operation", () => {
    const source = readTerraform(RUNTIME);
    expect(source).toContain("deletion_protection = false");
    expect(source).not.toMatch(
      /google_cloud_scheduler_job|google_eventarc_trigger|google_pubsub|google_workflows|google_cloud_run_v2_service|google_cloud_run_v2_job_execution|null_resource|local-exec|data\s+"external"|roles\/run\.invoker/iu,
    );
    expect(source).not.toMatch(/eximbay-canary-once|sandbox-preflight|worker-once/iu);
    expect(contract.providerSafety).toEqual({
      providerRetrieveMaximum: 1,
      applicationProviderRetries: 0,
      ready: 0,
      requestPay: 0,
      newVerify: 0,
      sale: 0,
      refund: 0,
      cancel: 0,
    });
    const owner = read("src/lib/payment/refund/run-eximbay-contacted-reconciliation-once.ts");
    const ownerTest = read("src/lib/payment/refund/__tests__/eximbay-contacted-reconciliation.test.ts");
    expect(owner).toContain("PROVIDER_RETRIEVE_LIMIT_EXCEEDED");
    for (const prohibited of ["ready", "requestPay", "newPaymentVerify", "sale", "refund", "cancel"]) {
      expect(ownerTest).toContain(`"${prohibited}"`);
    }
  });

  it("pins the mode-capable bootstrap successor without changing its safe default or IAM gate", () => {
    const source = readTerraform(BOOTSTRAP);
    const variables = readFileSync(join(BOOTSTRAP, "variables.tf"), "utf8");
    expect(bootstrapContract.image).toMatchObject({
      digestUri:
        `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@${BOOTSTRAP_DIGEST}`,
      configDigest:
        "sha256:9b3482a74b764b5ea0e56c23c53457a448091d9163466967831daf6334b52c8a",
      sourceCommit: "81e785448f834f4176cd5153eb3cbdf6d79d936c",
      defaultMode: "check",
    });
    expect(bootstrapContract.image.mutatingModes).toEqual(expect.arrayContaining([
      "apply-contacted-reconciliation-role-grants",
      "restore-canary-refund-role-grants",
    ]));
    expect(bootstrapContract.job.contactedReconciliationArguments).toEqual([
      "apply-contacted-reconciliation-role-grants",
      "restore-canary-refund-role-grants",
    ]);
    expect(bootstrapContract.job.terraformModeSelector).toEqual({
      input: "bootstrap_mode",
      owner: "TERRAFORM",
      allowedModes: [
        "check",
        "apply",
        "apply-canary-role-grants",
        "apply-synthetic-sale-role-grants",
        "apply-contacted-reconciliation-role-grants",
        "apply-business-state-readback-role-grants",
        "revoke-business-state-readback-role-grants",
        "contacted-reconciliation-business-state-readback",
        "materialize-synthetic-sale-market-precondition",
        "restore-canary-refund-role-grants",
        "materialize-eximbay-canary-target",
        "issue-eximbay-canary-approval",
        "materialize-application-credentials",
        "recover-canary-application-credential",
      ],
      defaultMode: "check",
      jobArgumentsBinding: ["var.bootstrap_mode"],
      executionOverrideSurface: "ABSENT",
    });
    expect(variables).toContain(`refund-db-bootstrap@${BOOTSTRAP_DIGEST}`);
    expect(variables).toContain('default     = "81e785448f834f4176cd5153eb3cbdf6d79d936c"');
    expect(variables).toMatch(
      /variable "temporary_cloud_sql_access_authorized"[\s\S]*default\s*=\s*false/u,
    );
    expect(source).toContain("args  = [var.bootstrap_mode]");
    expect(source).not.toMatch(
      /variable\s+"[^"]*(?:command|args|override|environment)[^"]*"/iu,
    );
    expect(variables).not.toMatch(/type\s*=\s*list\(string\)/u);
  });

  it("preserves closed worker, execution, transport, supervisor, and historical grant bytes", () => {
    const frozen = {
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json":
        "82cfa63b1c58bf6c289722ba5a56460a1bd1cefb672f8c2fbb8d26b453fbf287",
      "containers/refund-worker/Dockerfile":
        "a72c2c6fb232a6fb1d6e6bb52af546750ba5d728ba8a2164d9153591f96123dc",
      "src/lib/payment/refund/eximbay-contacted-reconciliation-environment.ts":
        "274f4dc1b21f8222007bd6db05039a0d2c36ae52b4b9039e276d24dd4831203e",
      "src/lib/payment/refund/run-eximbay-contacted-reconciliation-once.ts":
        "cf54e9b0e0686e402480899f745f83d17d85815c83fb65ed10d4145f10433a46",
      "scripts/eximbay-contacted-reconciliation.ts":
        "3fc861fe0abe7597a95ccc5b6c3142eda7edd7ac99f782c152d0821b917ecbfa",
      "src/lib/payment/eximbay/bf4-contact.ts":
        "4ed7ff2665982d5b31708a1eb8564dc5e35870cee6614763f4819f3ffc73f660",
      "src/lib/payment/refund/refund-worker-container-supervisor.ts":
        "0d9fd396e5afb2d48d087472aa5f4a1d9dfcd4fe0353347e9c7c42e347ae277a",
      "infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql":
        "fc90079bd22e6e44c7ed5a56891911aa789af6d582c73c330b143927be79834a",
    } as const;
    for (const [path, expected] of Object.entries(frozen)) {
      expect(sha256(readFileSync(join(ROOT, path))), path).toBe(expected);
    }
  });
});

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function readTerraform(root: string): string {
  return readdirSync(root)
    .filter((name) => name.endsWith(".tf"))
    .sort()
    .map((name) => readFileSync(join(root, name), "utf8"))
    .join("\n");
}

function terraformResourceDeclarations(source: string): string[] {
  return [...source.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/gu)]
    .map((match) => `${match[1]}.${match[2]}`)
    .sort();
}

function exactSetHash(values: readonly string[]): string {
  return createHash("sha256")
    .update([...values].sort().join("\n"), "utf8")
    .digest("hex");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
