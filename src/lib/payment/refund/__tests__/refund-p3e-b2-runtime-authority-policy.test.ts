import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json";
import imageContract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/runtime-image-connection-v1.json";
import historicalOwnership from "../../../../../infra/refund-sandbox/p3e-b2/runtime-deferred/resource-ownership-v1.json";
import { walkRefundP3eRealFiles as walk } from "./refund-p3e-real-filesystem-inventory";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const RUNTIME = join(INFRA, "runtime");
const POLICY_DOCUMENT = join(
  ROOT,
  "docs/payment_policy/refund_worker_p3e_b2_dormant_runtime_authority_v1.md",
);

const EXPECTED_R2B1_PATHS = Object.freeze([
  "docs/payment_policy/refund_worker_p3e_b2_dormant_runtime_authority_v1.md",
  "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md",
  "docs/payment_policy/refund_worker_p3e_b2_runtime_image_connection_v1.md",
  "infra/refund-sandbox/p3e-b2/README.md",
  "infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json",
  "infra/refund-sandbox/p3e-b2/runtime-deferred/README.md",
  "infra/refund-sandbox/p3e-b2/runtime-deferred/resource-ownership-v1.json",
  "infra/refund-sandbox/p3e-b2/runtime/.terraform.lock.hcl",
  "infra/refund-sandbox/p3e-b2/runtime/checks.tf",
  "infra/refund-sandbox/p3e-b2/runtime/locals.tf",
  "infra/refund-sandbox/p3e-b2/runtime/main.tf",
  "infra/refund-sandbox/p3e-b2/runtime/outputs.tf",
  "infra/refund-sandbox/p3e-b2/runtime/providers.tf",
  "infra/refund-sandbox/p3e-b2/runtime/terraform.tfvars.example",
  "infra/refund-sandbox/p3e-b2/runtime/tests/policy.tftest.hcl",
  "infra/refund-sandbox/p3e-b2/runtime/variables.tf",
  "infra/refund-sandbox/p3e-b2/runtime/versions.tf",
  "src/lib/payment/refund/__tests__/refund-p3e-b2-foundation-authority-policy.test.ts",
  "src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-authority-policy.test.ts",
  "src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-image-policy.test.ts",
]);

const EXPECTED_ADDRESSES = Object.freeze([
  "google_cloud_run_v2_job.dormant_canary",
  "google_cloud_run_v2_job.preflight",
  'google_project_iam_member.cloud_sql_client["dormant_canary"]',
  'google_project_iam_member.cloud_sql_client["preflight"]',
  "google_secret_manager_secret_iam_member.canary_database_access",
  "google_secret_manager_secret_iam_member.preflight_database_access",
  "google_service_account.dormant_canary",
  "google_service_account.preflight",
]);

const EXPECTED_TYPES = Object.freeze([
  "google_cloud_run_v2_job",
  "google_project_iam_member",
  "google_secret_manager_secret_iam_member",
  "google_service_account",
]);

describe("P3E-B2-R2B1 dormant runtime authority policy", () => {
  it("freezes the exact 20-path R2B1 inventory including the runtime dotfile", () => {
    const observed = discoverR2b1Paths();
    expect(EXPECTED_R2B1_PATHS).toHaveLength(20);
    expect(new Set(EXPECTED_R2B1_PATHS).size).toBe(20);
    expect(observed).toEqual(EXPECTED_R2B1_PATHS);
    expect(observed).toContain(
      "infra/refund-sandbox/p3e-b2/runtime/.terraform.lock.hcl",
    );
    for (const path of observed) {
      expect(lstatSync(join(ROOT, path)).isFile()).toBe(true);
      expect(lstatSync(join(ROOT, path)).isSymbolicLink()).toBe(false);
      expect(realpathSync(join(ROOT, path))).toBe(join(ROOT, path));
    }
  });

  it("freezes the exact eight-instance resource graph and digest", () => {
    expect(contract.resourceGraph.resourceCount).toBe(8);
    expect(contract.resourceGraph.addresses).toEqual(EXPECTED_ADDRESSES);
    expect(contract.resourceGraph.resourceTypes).toEqual(EXPECTED_TYPES);
    expect(exactSetHash(EXPECTED_ADDRESSES)).toBe(
      "7d1fe521be626a73ecfc31f98f78cb6bc3e358bf82406e894b620a34e34779fa",
    );
    expect(contract.resourceGraph.sortedAddressSha256).toBe(
      exactSetHash(EXPECTED_ADDRESSES),
    );

    const declarations = terraformResourceDeclarations(readTerraform());
    expect(declarations).toEqual([
      "google_cloud_run_v2_job.dormant_canary",
      "google_cloud_run_v2_job.preflight",
      "google_project_iam_member.cloud_sql_client",
      "google_secret_manager_secret_iam_member.canary_database_access",
      "google_secret_manager_secret_iam_member.preflight_database_access",
      "google_service_account.dormant_canary",
      "google_service_account.preflight",
    ]);
  });

  it("unconditionally blocks every production resource declaration from plan and apply", () => {
    const main = readFileSync(join(RUNTIME, "main.tf"), "utf8");
    const locals = readFileSync(join(RUNTIME, "locals.tf"), "utf8");
    const variables = readFileSync(join(RUNTIME, "variables.tf"), "utf8");
    expect(main.match(
      /condition\s*=\s*local\.runtime_apply_authorized/gu,
    )).toHaveLength(7);
    expect(main.match(
      /error_message\s*=\s*"R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"/gu,
    )).toHaveLength(7);
    expect(locals.match(
      /runtime_apply_authorized\s*=\s*false/gu,
    )).toHaveLength(1);
    expect(locals).toContain(
      'runtime_root_apply_policy = "UNCONDITIONALLY_BLOCKED_IN_R2B1"',
    );
    expect(variables).not.toContain("runtime_apply_authorized");
    expect(variables).not.toContain("runtime_root_apply_policy");
    expect(contract.applyEnforcement).toEqual({
      policy: "UNCONDITIONALLY_BLOCKED_IN_R2B1",
      authorized: false,
      callerOverride: "ABSENT",
      environmentOverride: "ABSENT",
      workspaceOverride: "ABSENT",
      testOverride: "ABSENT",
      coveredResourceInstances: 8,
      mechanism:
        "RESOURCE_LIFECYCLE_PRECONDITION_ON_EVERY_RESOURCE_DECLARATION",
      error: "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED",
      futureRelease:
        "SEPARATE_INDEPENDENTLY_REVIEWED_PACKAGE_AFTER_CLOUD_AUTHENTICATED_DENY_EVIDENCE",
    });
  });

  it("defines distinct identities and only exact connection and secret-read IAM", () => {
    expect(contract.runtimeIdentities).toMatchObject({
      count: 2,
      sharedIdentity: false,
      serviceAccountKeys: "FORBIDDEN",
      defaultComputeServiceAccount: "FORBIDDEN",
      impersonation: "FORBIDDEN",
      deployerBinding: "ABSENT",
      invokerBinding: "ABSENT",
    });
    expect(contract.iam.cloudSqlClient).toEqual({
      role: "roles/cloudsql.client",
      principalCount: 2,
      scope: "EXACT_PROJECT_MEMBER_WITH_SINGLE_INSTANCE_IAM_CONDITION",
      conditionTemplate:
        "resource.name == '<exact-foundation-instance-resource-name>' && resource.service == 'sqladmin.googleapis.com'",
      connectionMode:
        "PRIVATE_IP_PROXY_WITHOUT_IAM_DATABASE_AUTHENTICATION",
    });
    expect(contract.iam.databaseSecrets).toMatchObject({
      role: "roles/secretmanager.secretAccessor",
      scope: "EXACT_SECRET_RESOURCE",
      crossAccess: "FORBIDDEN",
      projectLevelBinding: "FORBIDDEN",
      secretVersionCreation: "ABSENT",
    });
    expect(contract.iam.loggingRoleDisposition).toBe(
      "REJECTED_APPLICATION_DOES_NOT_CALL_LOGGING_API",
    );
  });

  it("keeps both jobs exact, private, provider-free, and non-executable", () => {
    expect(contract.jobs).toMatchObject({
      taskCount: 1,
      parallelism: 1,
      maxRetries: 0,
      executionEnvironment: "SECOND_GENERATION",
      resources: { cpu: "1", memory: "512Mi" },
      taskTimeout: {
        seconds: 300,
        proxyReadinessSeconds: 120,
        workerCooperativeBudgetSeconds: 120,
        workerExternalDeadlineSeconds: 150,
        proxyShutdownSeconds: 3,
        serializationAndProcessMarginSeconds: 27,
      },
      preflight: {
        arguments: ["sandbox-preflight"],
        providerContact: "FORBIDDEN",
      },
      dormantCanary: {
        arguments: ["worker-once"],
        providerCredential: "ABSENT",
        target: "ABSENT",
        approval: "ABSENT",
        executable: false,
      },
    });
    expect(contract.network).toMatchObject({
      mode: "DIRECT_VPC_EGRESS",
      egress: "PRIVATE_RANGES_ONLY",
      tags: ["refund-provider-free"],
      foundationFirewallTargetTag: "refund-provider-free",
      serverlessVpcAccessConnector: "FORBIDDEN",
      databaseEndpoint: "CLOUD_SQL_PRIVATE_IP_ONLY",
      applicationTransport: "POSTGRESQL_UNIX_SOCKET",
      socketRoot: "/cloudsql",
    });
    expect(contract.providerScope.classification).toBe("TOSS_ONLY_EXPLICIT");
    expect(contract.providerScope.r2b1ProviderCredentialBindings).toBe(0);
  });

  it("attaches both Job interfaces to the exact foundation firewall target", () => {
    const runtimeMain = readFileSync(join(RUNTIME, "main.tf"), "utf8");
    const runtimeLocals = readFileSync(join(RUNTIME, "locals.tf"), "utf8");
    const foundationNetwork = readFileSync(
      join(INFRA, "foundation/network.tf"),
      "utf8",
    );
    for (const job of ["preflight", "dormant_canary"]) {
      const block = terraformResourceBlock(
        runtimeMain,
        "google_cloud_run_v2_job",
        job,
      );
      expect(block.match(/tags\s*=\s*local\.network_tags/gu)).toHaveLength(1);
      expect(block).toContain('egress = "PRIVATE_RANGES_ONLY"');
      expect(block).not.toContain("connector");
    }
    expect(runtimeLocals.match(
      /network_tags\s*=\s*\["refund-provider-free"\]/gu,
    )).toHaveLength(1);
    for (const firewall of ["allow_private_sql", "deny_other_egress"]) {
      const block = terraformResourceBlock(
        foundationNetwork,
        "google_compute_firewall",
        firewall,
      );
      expect(block.match(
        /target_tags\s*=\s*\["refund-provider-free"\]/gu,
      )).toHaveLength(1);
    }
  });

  it("admits only exact handoffs while retaining absent real release and secret versions", () => {
    expect(contract.handoffs.releaseImage).toMatchObject({
      currentRealStatus: "ABSENT",
      localR2aDigestAccepted: false,
    });
    expect(contract.handoffs.databaseSecretVersionReference).toMatchObject({
      fields: ["secret_resource_name", "version"],
      versionGrammar: "^[1-9][0-9]{0,18}$",
      payload: "FORBIDDEN",
      currentRealStatus: "ABSENT",
    });
    expect(contract.handoffs.executionDeny.deniedPermissions).toEqual([
      "run.googleapis.com/jobs.run",
      "run.googleapis.com/jobs.runWithOverrides",
    ]);
    expect(contract.handoffs.executionDeny.exceptions).toBe("FORBIDDEN");
    expect(contract.status.RELEASE_IMAGE_DIGEST).toBe("ABSENT");
    expect(contract.status.DB_SECRET_VERSIONS).toBe("ABSENT_IN_REAL_CLOUD");
  });

  it("preserves the historical ownership ledger and records bounded supersession", () => {
    expect(historicalOwnership.statuses).toEqual({
      RUNTIME_IDENTITY_AUTHORITY: "DEFERRED",
      RUNTIME_SECRET_BINDINGS: "DEFERRED",
      RUNTIME_JOB_DEFINITIONS: "DEFERRED",
      IMAGE_DIGEST: "ABSENT",
      DB_SECRET_VERSIONS: "ABSENT",
      PRIVATE_CONNECTION_PATH: "UNRESOLVED",
      DB_BOOTSTRAP: "UNIMPLEMENTED",
      RUNTIME_DEPLOYABLE: "FALSE",
      CANARY_EXECUTABLE: "FALSE",
    });
    expect(historicalOwnership.ownership).toHaveLength(18);
    expect(historicalOwnership.supersession).toMatchObject({
      package: "P3E-B2-R2B1",
      contract: "../contracts/runtime-authority-v1.json",
      status: "DORMANT_DEFINITIONS_ONLY_NOT_PROVISIONED",
      executionAuthority: "ABSENT",
    });
    expect(historicalOwnership.supersession.ownedIdentities).toHaveLength(8);
    expect(contract.deferredOwnership).toEqual([
      "database_bootstrap_and_grants",
      "future_invocation_authority",
      "image_publication",
      "later_deny_exception",
      "migrations_and_role_grants",
      "monitoring_and_alert_deployment",
      "preflight_invocation_binding",
      "provider_credential_secret_versions",
    ]);
  });

  it("contains no invocation, scheduler, secret payload, remote-state, or executable authority", () => {
    const source = readTerraform();
    const declarations = terraformResourceDeclarations(source);
    expect(declarations.some((address) =>
      address.startsWith("google_cloud_scheduler_") ||
      address.includes("_job_iam_") ||
      address === "google_secret_manager_secret_version" ||
      address === "google_service_account_key"
    )).toBe(false);
    expect(source).not.toMatch(
      /\b(?:data|resource)\s+"terraform_remote_state"|local-exec|remote-exec|external\s*=|http\s*=/u,
    );
    expect(source).not.toMatch(
      /(?:TOSS_SECRET_KEY|EXIMBAY|PAYPAL|REFUND_SANDBOX_TARGET|EXECUTABLE_APPROVAL|secret_data|DATABASE_URL=)/u,
    );
    expect(contract.forbiddenResources).toContain(
      "google_cloud_scheduler_job",
    );
    expect(contract.status).toMatchObject({
      RUNTIME_DEPLOYABLE: "FALSE",
      CANARY_EXECUTABLE: "FALSE",
      PROVIDER_EXECUTION: "BLOCKED",
      SCHEDULED_SANDBOX: "BLOCKED",
      LIVE: "UNREACHABLE",
      JOB_EXECUTION_DENY_EFFECTIVE: "NOT_CLOUD_PROVEN",
      RUNTIME_APPLY_AUTHORIZED: "FALSE",
      RUNTIME_ROOT_APPLY_POLICY: "UNCONDITIONALLY_BLOCKED_IN_R2B1",
    });
    expect(contract.portability).toEqual({
      classification: "PORTABLE_CORE_WITH_CLOUD_RUN_RUNTIME_ADAPTER",
      cloudRunScope: "R2B1_TERRAFORM_ONLY",
      domainCoreCloudRunDependency: false,
      r2aImageCloudRunSpecificLogic: false,
    });
  });

  it("pins frozen R2A authority and the current production runtime inputs", () => {
    expect(imageContract.localProof.releaseImageDigest).toBe("ABSENT");
    expect(imageContract.connection).toMatchObject({
      networkMode: "DIRECT_VPC_EGRESS",
      egressMode: "PRIVATE_RANGES_ONLY",
      databaseEndpoint: "CLOUD_SQL_PRIVATE_IP_ONLY",
      applicationTransport: "POSTGRESQL_UNIX_SOCKET",
    });
    expect(sha256(readFileSync(join(ROOT, "containers/refund-worker/Dockerfile"))))
      .toBe("7f337fb07c6fea4fde1dca685772f596a1924e3b5d26c3e8d50bffa3e964327b");
    expect(sha256(readFileSync(join(ROOT, "package-lock.json"))))
      .toBe("cf756d54576dbd4bd8b7cb19787aa2dde80f4b7c1cf431f99aa34002eb8e0fdd");
    expect(sha256(readFileSync(join(
      INFRA,
      "contracts/runtime-image-connection-v1.json",
    )))).toBe("9d5a8c87a4a1fa3dea6b3a653fda0d2d5ab26fc2b3c44711db2dc286fe2cad2a");
  });

  it("publishes every exact non-authorizing status in the policy document", () => {
    const documentation = readFileSync(POLICY_DOCUMENT, "utf8");
    for (const [key, value] of Object.entries(contract.status)) {
      expect(documentation).toContain(`${key}: ${value}`);
    }
    expect(documentation).toContain("TOSS_ONLY_EXPLICIT");
    expect(documentation).toContain("p3e-b2/runtime");
    expect(documentation).toContain("No Google Cloud project or resource was inspected");
  });

  it("fails closed on symlinks and path escape while retaining dotfiles", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "mira-r2b1-inventory-"));
    try {
      const root = join(temporaryRoot, "root");
      mkdirSync(join(root, "nested"), { recursive: true });
      writeFileSync(join(root, ".terraform.lock.hcl"), "lock", "utf8");
      writeFileSync(join(root, "nested", "main.tf"), "main", "utf8");
      expect(relativeFiles(root)).toEqual([
        ".terraform.lock.hcl",
        "nested/main.tf",
      ]);

      const outside = join(temporaryRoot, "outside.tf");
      writeFileSync(outside, "outside", "utf8");
      symlinkSync(outside, join(root, "escape.tf"));
      expect(() => walk(root)).toThrow(/symlink/u);
      rmSync(join(root, "escape.tf"));

      const unreadable = join(temporaryRoot, "unreadable.tf");
      writeFileSync(unreadable, "unreadable", "utf8");
      chmodSync(unreadable, 0);
      symlinkSync(unreadable, join(root, "unreadable-link.tf"));
      expect(() => walk(root)).toThrow(/symlink/u);
      chmodSync(unreadable, 0o600);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function discoverR2b1Paths(): readonly string[] {
  const paths = new Set<string>([
    "docs/payment_policy/refund_worker_p3e_b2_dormant_runtime_authority_v1.md",
    "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md",
    "docs/payment_policy/refund_worker_p3e_b2_runtime_image_connection_v1.md",
    "infra/refund-sandbox/p3e-b2/README.md",
    "infra/refund-sandbox/p3e-b2/contracts/runtime-authority-v1.json",
    "infra/refund-sandbox/p3e-b2/runtime-deferred/README.md",
    "infra/refund-sandbox/p3e-b2/runtime-deferred/resource-ownership-v1.json",
    "src/lib/payment/refund/__tests__/refund-p3e-b2-foundation-authority-policy.test.ts",
    "src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-authority-policy.test.ts",
    "src/lib/payment/refund/__tests__/refund-p3e-b2-runtime-image-policy.test.ts",
  ]);
  for (const path of relativeFiles(RUNTIME)) {
    paths.add(`infra/refund-sandbox/p3e-b2/runtime/${path}`);
  }
  return Object.freeze([...paths].sort());
}

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

function relativeFiles(root: string): string[] {
  const canonicalRoot = realpathSync(root);
  return walk(root)
    .map((path) => relative(canonicalRoot, path).split(sep).join("/"))
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
