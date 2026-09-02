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
  "sha256:44bf4d246a5a23b02d09dadc8be14f21f3d8a5a5f00bac6a68dfcc78a96e1d08";
const WORKER_CONFIG_DIGEST =
  "sha256:8db81d36d6354f183bf28cdaee645dfae414afbe87913a1e721708a6838a2d06";
const HISTORICAL_WORKER_DIGEST =
  "sha256:95b1d7fb170e7af503aab8ad8c6758fa43b5f63afad510c4004b58275dff5662";
const CURRENT_POLICY_SHA256 =
  "5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851";
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
    expect(contract.image).toEqual({
      digestUri:
        `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@${WORKER_DIGEST}`,
      configDigest: WORKER_CONFIG_DIGEST,
      sourceCheckpoint: "6e1aaa32b66876252dcce40296970ea23d592d64",
      sourceContextSha256:
        "15134b546f11bc265260d384ef6ef1f6b9372a9ee0d9d635459625e89cb6a6ed",
      imagePolicyPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json",
      imagePolicyVersion: "V10",
      imagePolicySha256: CURRENT_POLICY_SHA256,
      supervisorSourceSha256:
        "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711",
      predecessor: {
        digestUri:
          `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@${HISTORICAL_WORKER_DIGEST}`,
        configDigest:
          "sha256:40a4b24105208ceab415ad6d198ac0b4a2dd655ed3737f21c7d7f4a47b1a0d97",
        sourceCheckpoint: "5ff10b135efdc4e8efcc0599c9f74a738be7cc35",
        sourceContextSha256:
          "5e3261cc4882b39faadfca628b096c536d4afa40ec8257d16f2c22d888772075",
        imagePolicyPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json",
        imagePolicyVersion: "V8",
        imagePolicySha256:
          "edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a",
        status: "SUPERSEDED_HISTORICAL_ONLY",
      },
    });
    expect(contract.target).toMatchObject({
      runId: "4c5c9b039f18037c6f3356c903df1372",
      checkoutSessionId: "cmtk62h80000001s626b90f9y",
      paymentId: "DERIVED_BY_APPLICATION",
      providerOrderId: "DERIVED_BY_APPLICATION",
      authenticatedUserId: "DERIVED_BY_APPLICATION",
      operatorTargetInputs: 0,
      predecessor: {
        runId: "89682c544f42d4debb260f5e3186087a",
        checkoutSessionId: "cmtjsiiqw000001s6uimkjhj5",
        status: "SUPERSEDED_HISTORICAL_ONLY",
        predecessor: {
          runId: "da7783b013d20713d6db207c7657b559",
          checkoutSessionId: "cmtjnvso1000001s60xfg0tyu",
          status: "SUPERSEDED_HISTORICAL_ONLY",
          predecessor: {
            runId: "a764f61f4e4ba799ab16b318a676db65",
            checkoutSessionId: "cmthg2mzu000001s6iuvx7u5x",
            status: "SUPERSEDED_HISTORICAL_ONLY",
          },
        },
      },
    });
    expect(source).toContain(`refund-worker@${WORKER_DIGEST}`);
    expect(source).toMatch(/command\s*=\s*"eximbay-contacted-reconciliation-once"/u);
    expect(source).toContain('args  = [local.command]');
    for (const binding of [
      "image_config_digest          = local.worker_image_config_digest",
      "image_source_commit          = local.worker_image_source_commit",
      "image_source_context_sha256  = local.worker_image_source_context_sha256",
      "image_policy_path            = local.worker_image_policy_path",
      "image_policy_version         = local.worker_image_policy_version",
      "image_policy_sha256          = local.worker_image_policy_sha256",
      "supervisor_source_sha256     = local.worker_supervisor_source_sha256",
    ]) expect(source).toContain(binding);
    expect(source).toMatch(/service_account_id\s*=\s*"mira-p3e-sbx-contacted-recon"/u);
    expect(source).not.toMatch(
      /variable\s+"(?:run_id|checkout_session_id|payment_id|provider_order_id|user_id|command|args|environment)"/iu,
    );
    expect(source).not.toMatch(/variable\s+"[^"]*(?:image|digest|source|policy)[^"]*"/iu);
    expect(source).not.toMatch(
      new RegExp(`worker_image_digest_uri\\s*=\\s*"[^"]*@${HISTORICAL_WORKER_DIGEST}"`, "u"),
    );
    expect(contract.image.digestUri).not.toMatch(/refund-worker:[^/]+$/u);
    expect(contract.image.predecessor.status).toBe("SUPERSEDED_HISTORICAL_ONLY");
  });

  it("binds only the exact installed environment and two secret authorities", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.environment).toEqual({
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID:
        "4c5c9b039f18037c6f3356c903df1372",
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID:
        "cmtk62h80000001s626b90f9y",
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

  it("preserves historical policies and binds the published supervisor correction", () => {
    const frozen = {
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v1.json":
        "5ffc8c8af5ba5892296e15d78932dc61ce883aeaac6861bb9bb006a4b790e876",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json":
        "82cfa63b1c58bf6c289722ba5a56460a1bd1cefb672f8c2fbb8d26b453fbf287",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json":
        "9094297f20d5c2db8e12088d5bb7769da690d9fec29f9309426ff6e6ade56062",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v4.json":
        "e9ffcb71011465099280e199d94b1156ef40b7ea1b90b3a10cef573aba291408",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v5.json":
        "ce703401c5b17cd799a8e6ffb01c9a1337351ddfe180744345e6a551b9eeb398",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v6.json":
        "8cb641f5f945ce392d19c7b410824f356e205704c0e90f275821d412b2d5979d",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v7.json":
        "6c54d36686b9fbbc41daf1d5023a8ec857b0afec34122c2c71d455b5485f5af8",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json":
        "edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v9.json":
        "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf",
      "containers/refund-worker/Dockerfile":
        "bee4fbc2d3ef914f34327a6bd2b5ce921a8a4c6354f58340b682bdf4e485ede0",
      "src/lib/payment/refund/eximbay-contacted-reconciliation-environment.ts":
        "8344429cdfa850a89f757012ee9f88104878f97f7c290adecb610cb2577c62bd",
      "src/lib/payment/refund/run-eximbay-contacted-reconciliation-once.ts":
        "cf54e9b0e0686e402480899f745f83d17d85815c83fb65ed10d4145f10433a46",
      "scripts/eximbay-contacted-reconciliation.ts":
        "3fc861fe0abe7597a95ccc5b6c3142eda7edd7ac99f782c152d0821b917ecbfa",
      "src/lib/payment/eximbay/bf4-contact.ts":
        "4ed7ff2665982d5b31708a1eb8564dc5e35870cee6614763f4819f3ffc73f660",
      "infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql":
        "fc90079bd22e6e44c7ed5a56891911aa789af6d582c73c330b143927be79834a",
    } as const;
    for (const [path, expected] of Object.entries(frozen)) {
      expect(sha256(readFileSync(join(ROOT, path))), path).toBe(expected);
    }
    expect(contract.image.supervisorSourceSha256).toBe(
      "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711",
    );
    const currentSupervisorSha256 = sha256(readFileSync(join(
      ROOT,
      "src/lib/payment/refund/refund-worker-container-supervisor.ts",
    )));
    expect(currentSupervisorSha256).toBe(
      "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711",
    );
    expect(currentSupervisorSha256).toBe(contract.image.supervisorSourceSha256);
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
