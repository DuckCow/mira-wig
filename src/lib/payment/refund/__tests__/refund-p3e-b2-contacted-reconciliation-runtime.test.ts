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
  "sha256:64e3dd80c4b0ce0a18999d81c5e12c6ce8dc9f5a9f705ace2391111f1e9839b0";
const WORKER_CONFIG_DIGEST =
  "sha256:28ea3ab96e2f5f8ed979060e9348b25a444d7799ff9979f28d2f8c78d822c1ab";
const HISTORICAL_WORKER_DIGEST =
  "sha256:95b1d7fb170e7af503aab8ad8c6758fa43b5f63afad510c4004b58275dff5662";
const CURRENT_POLICY_SHA256 =
  "8665dec8197d4c8c5a948cd95479974b1de818e4007c6412dad6f3f2f6b61962";
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
      sourceCheckpoint: "1f6bdaab3c7a0ffd45c2037943855661ecd8d109",
      sourceContextSha256:
        "afbe2ebc50cb7ed2ae7524d573f31791e671729e688b16f6ecabc717def31290",
      imagePolicyPath: "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v13.json",
      imagePolicyVersion: "V13",
      imagePolicySha256: CURRENT_POLICY_SHA256,
      supervisorSourceSha256:
        "f31ad5019ce4823e40a2d2589599e20d9fe5b9a2e6b126f6d56975064efaba15",
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
      runId: "1f93662ed1b45856aceac782029111fd",
      checkoutSessionId: "cmtqwntmf000001s6ol01azw8",
      paymentId: "DERIVED_BY_APPLICATION",
      providerOrderId: "DERIVED_BY_APPLICATION",
      authenticatedUserId: "DERIVED_BY_APPLICATION",
      operatorTargetInputs: 0,
      predecessor: {
        runId: "e03b436e666b4b188ec65c0ee4139790",
        checkoutSessionId: "cmtktx8rx000001s6lfbjivo1",
        status: "SUPERSEDED_HISTORICAL_ONLY",
        predecessor: {
          runId: "4c5c9b039f18037c6f3356c903df1372",
          checkoutSessionId: "cmtk62h80000001s626b90f9y",
          status: "SUPERSEDED_HISTORICAL_ONLY",
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

  it("keeps the Terraform check aligned with the complete immutable target chain", () => {
    const checks = readFileSync(join(RUNTIME, "checks.tf"), "utf8");
    const expected = [
      { depth: 0, field: "runId", value: "1f93662ed1b45856aceac782029111fd" },
      { depth: 0, field: "checkoutSessionId", value: "cmtqwntmf000001s6ol01azw8" },
      { depth: 1, field: "runId", value: "e03b436e666b4b188ec65c0ee4139790" },
      { depth: 1, field: "checkoutSessionId", value: "cmtktx8rx000001s6lfbjivo1" },
      { depth: 1, field: "status", value: "SUPERSEDED_HISTORICAL_ONLY" },
      { depth: 2, field: "runId", value: "4c5c9b039f18037c6f3356c903df1372" },
      { depth: 2, field: "checkoutSessionId", value: "cmtk62h80000001s626b90f9y" },
      { depth: 2, field: "status", value: "SUPERSEDED_HISTORICAL_ONLY" },
      { depth: 3, field: "runId", value: "89682c544f42d4debb260f5e3186087a" },
      { depth: 3, field: "checkoutSessionId", value: "cmtjsiiqw000001s6uimkjhj5" },
      { depth: 3, field: "status", value: "SUPERSEDED_HISTORICAL_ONLY" },
      { depth: 4, field: "runId", value: "da7783b013d20713d6db207c7657b559" },
      { depth: 4, field: "checkoutSessionId", value: "cmtjnvso1000001s60xfg0tyu" },
      { depth: 4, field: "status", value: "SUPERSEDED_HISTORICAL_ONLY" },
      { depth: 5, field: "runId", value: "a764f61f4e4ba799ab16b318a676db65" },
      { depth: 5, field: "checkoutSessionId", value: "cmthg2mzu000001s6iuvx7u5x" },
      { depth: 5, field: "status", value: "SUPERSEDED_HISTORICAL_ONLY" },
    ] as const;

    expect(() => assertExactContactedTargetChain(checks, expected)).not.toThrow();

    const omittedPredecessor = checks
      .replace(
        /^[ \t]*local\.contract\.target\.predecessor\.(?:runId|checkoutSessionId|status)[ \t]*==[ \t]*"[^"]+" &&\n/gmu,
        "",
      )
      .replace("e03b436e666b4b188ec65c0ee4139790", "4c5c9b039f18037c6f3356c903df1372")
      .replace("cmtktx8rx000001s6lfbjivo1", "cmtk62h80000001s626b90f9y");
    const missingPredecessor = checks.replace(
      /^[ \t]*local\.contract\.target\.predecessor(?:\.predecessor)*\.(?:runId|checkoutSessionId|status)[ \t]*==[ \t]*"[^"]+" &&\n/gmu,
      "",
    );
    const wrongPredecessor = checks.replace(
      "e03b436e666b4b188ec65c0ee4139790",
      "00000000000000000000000000000000",
    );
    for (const mutant of [omittedPredecessor, missingPredecessor, wrongPredecessor]) {
      expect(() => assertExactContactedTargetChain(mutant, expected))
        .toThrow("CONTACTED_TERRAFORM_TARGET_CHAIN_NOT_EXACT");
    }
  });

  it("binds only the exact installed environment and two secret authorities", () => {
    const source = readTerraform(RUNTIME);
    expect(contract.environment).toEqual({
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID:
        "1f93662ed1b45856aceac782029111fd",
      MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID:
        "cmtqwntmf000001s6ol01azw8",
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

  it("preserves historical policies while binding the source correction successor", () => {
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
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json":
        "5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v11.json":
        "80c15e7f247991e466ae3b04f736be8b8e96ccc9aec9a161a9df57d8733a0d54",
      "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v12.json":
        "cc313693936f0928558778b856196ffc2cb1ed9c6323c8ffb15e501542cdf200",
      "containers/refund-worker/Dockerfile":
        "bee4fbc2d3ef914f34327a6bd2b5ce921a8a4c6354f58340b682bdf4e485ede0",
      "src/lib/payment/refund/eximbay-contacted-reconciliation-environment.ts":
        "553bc20432cd99236315f50704006e45001359052e686b4af9bbdc40aeb473a1",
      "scripts/eximbay-contacted-reconciliation.ts":
        "3fc861fe0abe7597a95ccc5b6c3142eda7edd7ac99f782c152d0821b917ecbfa",
      "infra/refund-sandbox/p3e-b2/contacted-reconciliation/database-role-grants.sql":
        "fc90079bd22e6e44c7ed5a56891911aa789af6d582c73c330b143927be79834a",
    } as const;
    for (const [path, expected] of Object.entries(frozen)) {
      expect(sha256(readFileSync(join(ROOT, path))), path).toBe(expected);
    }
    expect(contract.image.supervisorSourceSha256).toBe(
      "f31ad5019ce4823e40a2d2589599e20d9fe5b9a2e6b126f6d56975064efaba15",
    );
    const sourceHashes = Object.freeze({
      "src/lib/payment/refund/run-eximbay-contacted-reconciliation-once.ts":
        "212ed5768f5b661f8df106000b39257411d73aaac4ced12429c584f5b1485a6f",
      "src/lib/payment/refund/refund-worker-container-supervisor.ts":
        "f31ad5019ce4823e40a2d2589599e20d9fe5b9a2e6b126f6d56975064efaba15",
      "src/lib/payment/eximbay/bf4-contact.ts":
        "1d9b3d3a99ab2168de8c19f8296130cfe0349c64bf2229b9fbae997da1336b8e",
      "src/lib/payment/eximbay/checkout-recovery.ts":
        "c3f444c8e72a3c1b5987d44c145abc6e3b8405a8853b69b8ff45e96db10941d3",
    });
    for (const [path, expectedHash] of Object.entries(sourceHashes)) {
      expect(sha256(readFileSync(join(ROOT, path))), path).toBe(expectedHash);
    }
    const currentPolicy = read("infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v13.json");
    expect(currentPolicy).toContain(sourceHashes[
      "src/lib/payment/refund/run-eximbay-contacted-reconciliation-once.ts"
    ]);
    expect(currentPolicy).toContain(sourceHashes[
      "src/lib/payment/refund/refund-worker-container-supervisor.ts"
    ]);
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

type ContactedTargetAssertion = Readonly<{
  depth: number;
  field: "runId" | "checkoutSessionId" | "status";
  value: string;
}>;

function assertExactContactedTargetChain(
  source: string,
  expected: readonly ContactedTargetAssertion[],
): void {
  if (JSON.stringify(parseContactedTargetAssertions(source)) !== JSON.stringify(expected)) {
    throw new Error("CONTACTED_TERRAFORM_TARGET_CHAIN_NOT_EXACT");
  }
}

function parseContactedTargetAssertions(source: string): ContactedTargetAssertion[] {
  const start = source.indexOf('check "exact_runtime_authority"');
  const end = source.indexOf('check "one_shot_runtime_shape"', start);
  if (start < 0 || end < 0) throw new Error("CONTACTED_TERRAFORM_CHECK_MISSING");
  const block = source.slice(start, end);
  return [...block.matchAll(
    /local\.contract\.target((?:\.predecessor)*)\.(runId|checkoutSessionId|status)\s*==\s*"([^"]+)"/gu,
  )].map((match) => {
    const field = match[2];
    const value = match[3];
    if (field !== "runId" && field !== "checkoutSessionId" && field !== "status") {
      throw new Error("CONTACTED_TERRAFORM_TARGET_FIELD_INVALID");
    }
    if (value === undefined) throw new Error("CONTACTED_TERRAFORM_TARGET_VALUE_MISSING");
    return {
      depth: (match[1]?.match(/\.predecessor/gu) ?? []).length,
      field,
      value,
    };
  });
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
