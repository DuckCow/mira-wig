import { createHash } from "node:crypto";
import {
  chmodSync,
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
import authorityContract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/foundation-authority-v1.json";
import resourceGraph from "../../../../../infra/refund-sandbox/p3e-b2/contracts/foundation-resource-graph-v1.json";
import runtimeOwnership from "../../../../../infra/refund-sandbox/p3e-b2/runtime-deferred/resource-ownership-v1.json";
import { walkRefundP3eRealFiles as walk } from "./refund-p3e-real-filesystem-inventory";

const ROOT = process.cwd();
const INFRA = join(ROOT, "infra/refund-sandbox/p3e-b2");
const ACTIVATION = join(INFRA, "service-activation");
const FOUNDATION = join(INFRA, "foundation");
const ROLE_AUTHORITY = join(INFRA, "foundation-deployer-authority");
const RUNTIME_DEFERRED = join(INFRA, "runtime-deferred");
const POLICY_DOCUMENT = join(
  ROOT,
  "docs/payment_policy/refund_worker_p3e_b2_foundation_authority_v1.md",
);
const PACKAGE_README = join(INFRA, "README.md");

const EXPECTED_R1B_FILES = Object.freeze([
  "contracts/foundation-authority-v1.json",
  "contracts/foundation-resource-graph-v1.json",
  "foundation-deployer-authority/.terraform.lock.hcl",
  "foundation-deployer-authority/checks.tf",
  "foundation-deployer-authority/main.tf",
  "foundation-deployer-authority/outputs.tf",
  "foundation-deployer-authority/providers.tf",
  "foundation-deployer-authority/terraform.tfvars.example",
  "foundation-deployer-authority/tests/policy.tftest.hcl",
  "foundation-deployer-authority/variables.tf",
  "foundation-deployer-authority/versions.tf",
  "foundation/.terraform.lock.hcl",
  "foundation/artifact-registry.tf",
  "foundation/checks.tf",
  "foundation/cloud-sql.tf",
  "foundation/locals.tf",
  "foundation/network.tf",
  "foundation/outputs.tf",
  "foundation/providers.tf",
  "foundation/secrets.tf",
  "foundation/terraform.tfvars.example",
  "foundation/tests/policy.tftest.hcl",
  "foundation/variables.tf",
  "foundation/versions.tf",
  "runtime-deferred/README.md",
  "runtime-deferred/database_roles.sql",
  "runtime-deferred/resource-ownership-v1.json",
  "service-activation/.terraform.lock.hcl",
  "service-activation/checks.tf",
  "service-activation/main.tf",
  "service-activation/outputs.tf",
  "service-activation/providers.tf",
  "service-activation/terraform.tfvars.example",
  "service-activation/tests/policy.tftest.hcl",
  "service-activation/variables.tf",
  "service-activation/versions.tf",
]);

const EXPECTED_APIS = Object.freeze([
  "artifactregistry.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "compute.googleapis.com",
  "dns.googleapis.com",
  "iam.googleapis.com",
  "run.googleapis.com",
  "secretmanager.googleapis.com",
  "servicenetworking.googleapis.com",
  "serviceusage.googleapis.com",
  "sqladmin.googleapis.com",
  "storage.googleapis.com",
]);

const EXPECTED_BOOTSTRAP_APIS = Object.freeze([
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "storage.googleapis.com",
]);

const EXPECTED_ACTIVATION_METHODS = Object.freeze([
  "cloudresourcemanager.projects.get",
  "serviceusage.operations.get",
  "serviceusage.services.batchEnable",
  "serviceusage.services.enable",
  "serviceusage.services.list",
]);

const EXPECTED_ACTIVATION_PERMISSIONS = Object.freeze([
  "resourcemanager.projects.get",
  "servicemanagement.services.bind",
  "serviceusage.operations.get",
  "serviceusage.services.enable",
  "serviceusage.services.list",
]);

const EXPECTED_SHARED_READ_PERMISSIONS = Object.freeze([
  "resourcemanager.projects.get",
]);

const EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS = Object.freeze([
  "servicemanagement.services.bind",
  "serviceusage.operations.get",
  "serviceusage.services.enable",
  "serviceusage.services.list",
]);

const EXPECTED_ACTIVATION_PERMISSION_SCOPES = Object.freeze({
  "resourcemanager.projects.get": "exact dedicated consumer project",
  "servicemanagement.services.bind": "every admitted target public service",
  "serviceusage.operations.get": "returned Service Usage long-running operation",
  "serviceusage.services.enable": "exact dedicated consumer project",
  "serviceusage.services.list":
    "exact dedicated consumer project Service Usage collection",
});

const EXPECTED_EXCLUDED_METHODS = Object.freeze([
  "serviceusage.operations.cancel",
  "serviceusage.operations.delete",
  "serviceusage.operations.list",
  "serviceusage.services.batchGet",
  "serviceusage.services.disable",
  "serviceusage.services.get",
]);

const EXPECTED_EXCLUDED_PERMISSIONS = Object.freeze([
  "resourcemanager.projects.list",
  "resourcemanager.projects.setIamPolicy",
  "serviceusage.services.disable",
  "serviceusage.services.get",
  "serviceusage.services.use",
]);

const EXPECTED_EXCLUDED_PERMISSION_PREFIXES = Object.freeze([
  "serviceusage.consumerpolicy.",
  "serviceusage.mcppolicy.",
  "serviceusage.quotas.",
]);

const EXPECTED_FOUNDATION_ADDRESSES = Object.freeze([
  "google_artifact_registry_repository.refund_images",
  "google_compute_firewall.allow_private_sql",
  "google_compute_firewall.allow_restricted_google_apis",
  "google_compute_firewall.deny_other_egress",
  "google_compute_global_address.private_service_access",
  "google_compute_network.refund",
  "google_compute_subnetwork.refund",
  "google_dns_managed_zone.googleapis",
  "google_dns_record_set.restricted_googleapis_a",
  "google_dns_record_set.wildcard_googleapis_cname",
  "google_secret_manager_secret.canary_database_url",
  "google_secret_manager_secret.preflight_database_url",
  "google_service_networking_connection.private_service_access",
  "google_sql_database.refund",
  "google_sql_database_instance.refund",
]);

const EXPECTED_PERMISSIONS = Object.freeze([
  "artifactregistry.locations.get",
  "artifactregistry.locations.list",
  "artifactregistry.repositories.create",
  "artifactregistry.repositories.get",
  "artifactregistry.repositories.list",
  "artifactregistry.repositories.update",
  "cloudsql.databases.create",
  "cloudsql.databases.get",
  "cloudsql.databases.list",
  "cloudsql.databases.update",
  "cloudsql.instances.create",
  "cloudsql.instances.get",
  "cloudsql.instances.list",
  "cloudsql.instances.update",
  "compute.firewalls.create",
  "compute.firewalls.get",
  "compute.firewalls.list",
  "compute.firewalls.update",
  "compute.globalAddresses.create",
  "compute.globalAddresses.createInternal",
  "compute.globalAddresses.get",
  "compute.globalAddresses.list",
  "compute.globalAddresses.use",
  "compute.globalOperations.get",
  "compute.networks.create",
  "compute.networks.get",
  "compute.networks.list",
  "compute.networks.updatePolicy",
  "compute.networks.use",
  "compute.projects.get",
  "compute.regionOperations.get",
  "compute.regions.get",
  "compute.subnetworks.create",
  "compute.subnetworks.get",
  "compute.subnetworks.list",
  "compute.subnetworks.setPrivateIpGoogleAccess",
  "compute.subnetworks.update",
  "compute.subnetworks.use",
  "dns.changes.create",
  "dns.changes.get",
  "dns.managedZones.create",
  "dns.managedZones.get",
  "dns.managedZones.update",
  "dns.networks.bindPrivateDNSZone",
  "dns.networks.targetWithPeeringZone",
  "dns.resourceRecordSets.create",
  "dns.resourceRecordSets.list",
  "dns.resourceRecordSets.update",
  "resourcemanager.projects.get",
  "secretmanager.locations.get",
  "secretmanager.locations.list",
  "secretmanager.secrets.create",
  "secretmanager.secrets.get",
  "secretmanager.secrets.list",
  "secretmanager.secrets.update",
  "servicenetworking.operations.get",
  "servicenetworking.services.addPeering",
  "servicenetworking.services.get",
  "servicenetworking.services.updateConsumerConfig",
  "serviceusage.services.use",
]);

describe("P3E-B2-R1B foundation authority policy", () => {
  it("preserves the exact 36-path R1B subinventory after the R2A supersession", () => {
    const files = walk(INFRA)
      .map((path) => relative(INFRA, path).split(sep).join("/"))
      .sort();
    const r1bFiles = files
      .filter(isR1BPath)
      .filter((path) => ![
        "contracts/runtime-authority-v1.json",
        "contracts/runtime-image-connection-v1.json",
      ].includes(path));
    expect(EXPECTED_R1B_FILES).toHaveLength(36);
    expect(new Set(EXPECTED_R1B_FILES).size).toBe(36);
    expect(r1bFiles).toEqual(EXPECTED_R1B_FILES);
    expect(isR1BPath(
      "contracts/trusted-project-bootstrap-readiness-v1.json",
    )).toBe(false);
    expect(isR1BPath(
      "trusted-project-bootstrap-readiness/evidence.schema.json",
    )).toBe(false);
    expect(isR1BPath(
      "contracts/attended-collector-core-v1.json",
    )).toBe(false);
    expect(isR1BPath(
      "contracts/trusted-project-bootstrap-readiness-v2.json",
    )).toBe(false);
    expect(files).toHaveLength(87);
    expect(files.filter((path) => !isR1BPath(path))).toHaveLength(49);
  });

  it("independently freezes the exact activation, foundation, and role contracts", () => {
    expect(authorityContract.serviceActivationApis).toEqual(EXPECTED_APIS);
    expect(authorityContract.serviceActivationApis).toContain(
      "dns.googleapis.com",
    );
    expect(authorityContract.serviceActivationApis).not.toContain(
      "iamcredentials.googleapis.com",
    );
    expect(authorityContract.serviceActivationApis).not.toContain(
      "oslogin.googleapis.com",
    );
    expect(authorityContract.serviceActivationApiSetSha256).toBe(
      "a26c970477ca78a45b2561e21faf743ee8ad6d49e3ca400618dba9881b4a72f4",
    );
    expect(authorityContract.serviceActivationBootstrap.preenabledApiNames).toEqual(
      EXPECTED_BOOTSTRAP_APIS,
    );
    expect(
      authorityContract.serviceActivationBootstrap.preenabledApiSetSha256,
    ).toBe(
      "2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7",
    );
    expect(authorityContract.serviceActivationOperator.methods).toEqual(
      EXPECTED_ACTIVATION_METHODS,
    );
    expect(authorityContract.serviceActivationOperator.permissions).toEqual(
      EXPECTED_ACTIVATION_PERMISSIONS,
    );
    expect(authorityContract.foundationResourceAddresses).toEqual(
      EXPECTED_FOUNDATION_ADDRESSES,
    );
    expect(authorityContract.foundationDeployerPermissions).toEqual(
      EXPECTED_PERMISSIONS,
    );
    expect(authorityContract.foundationDeployerPermissionSetSha256).toBe(
      "7460121269bcfd3a129ae36c9b24c0e49d17ae67b70624d288cf5796ba3ce8b7",
    );
    expect(authorityContract.statePrefixes).toContain(
      "p3e-b2/service-activation",
    );
    expect(authorityContract.statePrefixes).toContain("p3e-b2/foundation");
    expect(authorityContract.statePrefixes).toContain(
      "p3e-b2/foundation-deployer-authority",
    );
    expect(authorityContract.statePrefixes).not.toContain(
      "p3e-b2/authority-guardrails",
    );
    expect(authorityContract.retiredStatePrefixes).toEqual([
      "p3e-b2/authority-guardrails",
    ]);
  });

  it("freezes the pinned-provider method, permission, shared-read, and exclusive sets independently", () => {
    const operator = authorityContract.serviceActivationOperator;
    expect(operator.provider).toEqual({
      source: "hashicorp/google",
      version: "7.40.0",
      resourceType: "google_project_service",
      userProjectOverride: false,
      billingProjectOverride: false,
      quotaProjectOverride: false,
    });
    expect(operator.methods).toEqual(EXPECTED_ACTIVATION_METHODS);
    expect(operator.permissions).toEqual(EXPECTED_ACTIVATION_PERMISSIONS);
    expect(operator.sharedReadPermissionsWithFoundationDeployer).toEqual(
      EXPECTED_SHARED_READ_PERMISSIONS,
    );
    expect(operator.activationExclusivePermissions).toEqual(
      EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS,
    );
    expect(operator.methodSetSha256).toBe(
      "ddc12bb0dae1cdbe0e9b7a8cd5838cc6cb8759b9323fb32171ad239963050120",
    );
    expect(operator.permissionSetSha256).toBe(
      "3371ab566521c0c48800e932b2d11ab09382e9e249f061b395c5a45576fff7ef",
    );
    expect(operator.sharedReadPermissionSetSha256).toBe(
      "066987a0d6fc58a75ade7e31b099ea0c31bc101a829e7dc094c135b052587a61",
    );
    expect(operator.activationExclusivePermissionSetSha256).toBe(
      "c9ca2657b673902e5f80ff6e8d2a091c5e9984f441d9176f17c0bc8e0358ce19",
    );
    expect(exactSetHash(EXPECTED_ACTIVATION_METHODS)).toBe(
      operator.methodSetSha256,
    );
    expect(exactSetHash(EXPECTED_ACTIVATION_PERMISSIONS)).toBe(
      operator.permissionSetSha256,
    );
    expect(exactSetHash(EXPECTED_SHARED_READ_PERMISSIONS)).toBe(
      operator.sharedReadPermissionSetSha256,
    );
    expect(exactSetHash(EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS)).toBe(
      operator.activationExclusivePermissionSetSha256,
    );
    expect(operator.permissionScopes).toEqual(
      EXPECTED_ACTIVATION_PERMISSION_SCOPES,
    );
    expect(operator.excludedMethods).toEqual(EXPECTED_EXCLUDED_METHODS);
    expect(operator.excludedPermissions).toEqual(
      EXPECTED_EXCLUDED_PERMISSIONS,
    );
    expect(operator.excludedPermissionPrefixes).toEqual(
      EXPECTED_EXCLUDED_PERMISSION_PREFIXES,
    );
    expect(operator.foundationDeployerCanCompleteActivationLifecycle).toBe(
      false,
    );
  });

  it("proves the exact one-permission overlap and four-permission activation-exclusive boundary", () => {
    const activation = new Set(EXPECTED_ACTIVATION_PERMISSIONS);
    const foundation = new Set(EXPECTED_PERMISSIONS);
    const shared = [...activation].filter((permission) =>
      foundation.has(permission),
    );
    const exclusive = [...activation].filter(
      (permission) => !foundation.has(permission),
    );
    expect(shared).toEqual(EXPECTED_SHARED_READ_PERMISSIONS);
    expect(exclusive).toEqual(EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS);
    expect(
      EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS.some((permission) =>
        foundation.has(permission),
      ),
    ).toBe(false);
    expect(EXPECTED_PERMISSIONS).toHaveLength(60);
    expect(authorityContract.foundationDeployerPermissions).toEqual(
      EXPECTED_PERMISSIONS,
    );
    expect(authorityContract.foundationDeployerPermissionSetSha256).toBe(
      "7460121269bcfd3a129ae36c9b24c0e49d17ae67b70624d288cf5796ba3ce8b7",
    );
  });

  it("keeps service activation exact and separate from infrastructure and IAM", () => {
    const source = readTerraform(ACTIVATION);
    expect(resourceAddresses(source)).toEqual(["google_project_service.required"]);
    expect(source).toContain("for_each = local.required_services");
    expect(source).toContain("disable_on_destroy         = false");
    expect(source).toContain("disable_dependent_services = false");
    expect(source).toContain("user_project_override = false");
    expect(source).not.toMatch(/\b(?:billing_project|quota_project)\s*=/u);
    expect(source).not.toMatch(
      /(?:run|logging|monitoring)\.googleapis\.com/u,
    );
    expect(source).not.toMatch(
      /resource\s+"google_(?:project_iam|billing|compute|sql|artifact|secret|cloud_run)/u,
    );
    expect(source).not.toMatch(
      /resource\s+"google_(?:project_iam_custom_role|project_iam_member|project_iam_binding|project_iam_policy|service_account)"/u,
    );
  });

  it("keeps the contract, Terraform manifest tests, and documents aligned", () => {
    const terraform = readTerraform(ACTIVATION);
    const terraformTest = readFileSync(
      join(ACTIVATION, "tests/policy.tftest.hcl"),
      "utf8",
    );
    const documentation = [
      readFileSync(POLICY_DOCUMENT, "utf8"),
      readFileSync(PACKAGE_README, "utf8"),
    ].join("\n");
    for (const value of [
      ...EXPECTED_ACTIVATION_METHODS,
      ...EXPECTED_ACTIVATION_PERMISSIONS,
      ...EXPECTED_SHARED_READ_PERMISSIONS,
      ...EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS,
      "ddc12bb0dae1cdbe0e9b7a8cd5838cc6cb8759b9323fb32171ad239963050120",
      "3371ab566521c0c48800e932b2d11ab09382e9e249f061b395c5a45576fff7ef",
      "066987a0d6fc58a75ade7e31b099ea0c31bc101a829e7dc094c135b052587a61",
      "c9ca2657b673902e5f80ff6e8d2a091c5e9984f441d9176f17c0bc8e0358ce19",
    ]) {
      expect(`${terraform}\n${terraformTest}`).toContain(value);
      expect(documentation).toContain(value);
    }
    for (const method of EXPECTED_EXCLUDED_METHODS) {
      expect(authorityContract.serviceActivationOperator.methods).not.toContain(
        method,
      );
    }
    for (const permission of EXPECTED_EXCLUDED_PERMISSIONS) {
      expect(
        authorityContract.serviceActivationOperator.permissions,
      ).not.toContain(permission);
    }
    expect(documentation).not.toMatch(
      /roles\/(?:serviceusage\.serviceUsageAdmin|owner|editor)/u,
    );
  });

  it("matches every actual foundation resource bidirectionally to the reviewed ledger", () => {
    const source = readTerraform(FOUNDATION);
    expect(resourceAddresses(source)).toEqual(EXPECTED_FOUNDATION_ADDRESSES);
    expect(resourceGraph.resources.map(({ address }) => address).sort()).toEqual(
      EXPECTED_FOUNDATION_ADDRESSES,
    );
    expect(
      resourceGraph.resources.map(({ resourceType }) => resourceType).sort(),
    ).toEqual(resourceTypes(source));
    expect(
      resourceGraph.resources.every(
        ({ deleteIntentionallyExcluded }) => deleteIntentionallyExcluded,
      ),
    ).toBe(true);
    expect(resourceGraph.retrievedAt).toBe("2026-08-30");
    expect(
      Object.values(resourceGraph.sources).every(
        ({ url }) => (
          url.startsWith("https://docs.cloud.google.com/") ||
          url === "https://registry.terraform.io/providers/hashicorp/google/7.40.0/docs"
        ),
      ),
    ).toBe(true);
    const networkPolicyResources = resourceGraph.resources
      .filter(({ permissions }) =>
        permissions.includes("compute.networks.updatePolicy"),
      )
      .map(({ address }) => address)
      .sort();
    expect(networkPolicyResources).toEqual([
      "google_compute_firewall.allow_private_sql",
      "google_compute_firewall.allow_restricted_google_apis",
      "google_compute_firewall.deny_other_egress",
      "google_compute_subnetwork.refund",
    ]);
    expect(
      authorityContract.foundationDeployerPermissions.filter(
        (permission) => permission === "compute.networks.updatePolicy",
      ),
    ).toHaveLength(1);
    expect(resourceGraph.permissionEvidence["compute.networks.updatePolicy"]).toEqual({
      title:
        "Network-policy attachment required by admitted firewall create/update and subnetwork create methods",
      methodResourceRelationships: [
        {
          method: "compute.firewalls.insert",
          resourceAddresses: [
            "google_compute_firewall.allow_private_sql",
            "google_compute_firewall.allow_restricted_google_apis",
            "google_compute_firewall.deny_other_egress",
          ],
        },
        {
          method: "compute.firewalls.patch",
          resourceAddresses: [
            "google_compute_firewall.allow_private_sql",
            "google_compute_firewall.allow_restricted_google_apis",
            "google_compute_firewall.deny_other_egress",
          ],
        },
        {
          method: "compute.subnetworks.insert",
          resourceAddresses: ["google_compute_subnetwork.refund"],
        },
      ],
      resourceScope: "exact foundation VPC network policy",
      resourceAddresses: networkPolicyResources,
      retrievedAt: "2026-07-23",
      sourceIds: [
        "compute",
        "computeNetworkPolicyMethods",
        "customRoleSupport",
        "terraformProvider",
      ],
      customRoleSupport: "SUPPORTED",
      deleteOperationJustification: false,
    });
    expect(
      resourceGraph.permissionEvidence[
        "compute.networks.updatePolicy"
      ].methodResourceRelationships.map(({ method }) => method),
    ).not.toContain("compute.subnetworks.patch");
    expect(resourceGraph.operationEvidence["compute.subnetworks.patch"]).toEqual({
      title:
        "Admitted subnetwork update uses subnetwork read and update permissions without network-policy attachment authority",
      permissions: [
        "compute.subnetworks.get",
        "compute.subnetworks.update",
      ],
      resourceAddresses: ["google_compute_subnetwork.refund"],
      sourceIds: [
        "compute",
        "computeNetworkPolicyMethods",
        "terraformProvider",
      ],
      retrievedAt: "2026-07-23",
      deleteOperationJustification: false,
    });
    const subnetwork = resourceGraph.resources.find(
      ({ address }) => address === "google_compute_subnetwork.refund",
    );
    expect(subnetwork?.permissions).toEqual(
      expect.arrayContaining([
        "compute.networks.updatePolicy",
        "compute.subnetworks.get",
        "compute.subnetworks.update",
      ]),
    );
    expect(authorityContract.foundationResourceAddresses).toHaveLength(15);
    expect(
      exactSetHash(authorityContract.foundationResourceAddresses),
    ).toBe(authorityContract.foundationResourceGraphSha256);
  });

  it("keeps foundation provider-free, private, protected, and runtime-free", () => {
    const source = readTerraform(FOUNDATION);
    expect(source).toMatch(/\bregion\s+= "asia-northeast3"/u);
    expect(source).toContain("auto_create_subnetworks = false");
    expect(source).toContain("ipv4_enabled                                  = false");
    expect(source).toMatch(/\bdeletion_policy\s+= "ABANDON"/u);
    expect(source).toContain("disk_autoresize_limit       = var.database_disk_autoresize_limit_gb");
    expect(source).toContain("prevent_destroy = true");
    expect(source).toContain("immutable_tags = true");
    expect(source).not.toMatch(
      /google_(?:cloud_run|service_account|project_iam|secret_manager_secret_(?:iam|version)|sql_user|cloud_scheduler|compute_router_nat|vpc_access_connector|iam_deny|project_iam_custom_role)/u,
    );
    expect(source).not.toMatch(
      /(?:authorized_networks|terraform_remote_state|credentials\s*=|-target)/u,
    );
  });

  it("routes only proxy data and restricted Google API control traffic before deny-all", () => {
    const network = readFileSync(join(FOUNDATION, "network.tf"), "utf8");
    expect(network).toContain('ports    = ["3307"]');
    expect(network).not.toContain('ports    = ["5432"]');
    expect(network).toContain('destination_ranges = ["199.36.153.4/30"]');
    expect(network).toContain('ports    = ["443"]');
    expect(network).not.toMatch(
      /destination_ranges\s*=\s*\["0\.0\.0\.0\/0"\][\s\S]{0,160}allow\s*\{[\s\S]{0,80}ports\s*=\s*\["443"\]/u,
    );
    expect(network).toContain('priority           = 900');
    expect(network).toContain('priority           = 910');
    expect(network).toContain('priority           = 1000');
    expect(network.match(
      /target_tags\s*=\s*\["refund-provider-free"\]/gu,
    )).toHaveLength(3);
    expect(network).toContain('dns_name    = "googleapis.com."');
    expect(network).toContain('visibility  = "private"');
    expect(network).toContain('name         = "restricted.googleapis.com."');
    expect(network).toContain('name         = "*.googleapis.com."');
    expect(network).toContain('rrdatas      = ["restricted.googleapis.com."]');
    for (const address of [4, 5, 6, 7]) {
      expect(network).toContain(`"199.36.153.${address}"`);
    }
  });

  it("derives the exact supported delete-free role from the resource ledger", () => {
    const graphPermissions = [
      ...new Set(
        resourceGraph.resources.flatMap(({ permissions }) => permissions),
      ),
    ].sort();
    expect(graphPermissions).toEqual(EXPECTED_PERMISSIONS);
    expect(authorityContract.foundationDeployerPermissions).toEqual(
      graphPermissions,
    );
    expect(Object.keys(resourceGraph.permissionSupport).sort()).toEqual(
      EXPECTED_PERMISSIONS,
    );
    for (const [permission, support] of Object.entries(
      resourceGraph.permissionSupport,
    )) {
      expect(support).toBe("SUPPORTED");
      expect(permission).not.toMatch(
        /(?:\.delete$|\.setIamPolicy$|^run\.|^iam\.|^billing\.|\*)/u,
      );
    }
  });

  it("defines exactly one unbound GA/PREVENT custom role and nothing else", () => {
    const source = readTerraform(ROLE_AUTHORITY);
    expect(resourceAddresses(source)).toEqual([
      "google_project_iam_custom_role.foundation_deployer",
    ]);
    expect(source).toContain('role_id     = "refundP3eB2FoundationDeployer"');
    expect(source).toContain("permissions = local.deployer_permissions");
    expect(source).toContain('stage       = "GA"');
    expect(source).toContain('deletion_policy = "PREVENT"');
    expect(source).not.toMatch(
      /google_(?:project_iam_(?:member|binding|policy)|service_account|iam_deny_policy|project_service|cloud_run|compute|sql|secret_manager|artifact_registry)/u,
    );
    expect(source).not.toMatch(/(?:roles\/owner|roles\/editor|member\s*=)/u);
  });

  it("proves every forbidden authority remains absent from the custom role", () => {
    for (const forbidden of authorityContract.forbiddenPermissions) {
      expect(authorityContract.foundationDeployerPermissions).not.toContain(
        forbidden,
      );
    }
    expect(authorityContract.foundationDeployerPermissions).not.toContain(
      "serviceusage.services.enable",
    );
    expect(authorityContract.foundationDeployerPermissions).not.toContain(
      "resourcemanager.projects.setIamPolicy",
    );
    expect(authorityContract.foundationDeployerPermissions).toContain(
      "resourcemanager.projects.get",
    );
    for (const permission of EXPECTED_ACTIVATION_EXCLUSIVE_PERMISSIONS) {
      expect(authorityContract.foundationDeployerPermissions).not.toContain(
        permission,
      );
    }
    expect(
      authorityContract.foundationDeployerPermissions.some(
        (permission) => (
          permission.startsWith("run.") ||
          permission.startsWith("iam.") ||
          permission.startsWith("billing.") ||
          permission.endsWith(".setIamPolicy") ||
          permission.includes("*")
        ),
      ),
    ).toBe(false);
  });

  it("keeps the runtime-deferred boundary non-executable and exhaustive", () => {
    const files = walk(RUNTIME_DEFERRED);
    expect(files.some((path) => path.endsWith(".tf"))).toBe(false);
    expect(files.some((path) => path.endsWith(".tftest.hcl"))).toBe(false);
    expect(files.some((path) => /\.(?:sh|js|mjs|cjs|ts)$/u.test(path))).toBe(false);
    expect(runtimeOwnership.executable).toBe(false);
    expect(runtimeOwnership.statuses).toEqual({
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
    expect(runtimeOwnership.ownership.map(({ identity }) => identity)).toContain(
      "private_ip_proxy_socket_architecture",
    );
    expect(runtimeOwnership.ownership.map(({ identity }) => identity)).toContain(
      "monitoring_and_alert_deployment",
    );
    expect(runtimeOwnership.ownership.map(({ identity }) => identity)).toContain(
      "later_deny_exception",
    );
  });

  it("pins backend and provider boundaries and keeps examples synthetic", () => {
    for (const root of [ACTIVATION, FOUNDATION, ROLE_AUTHORITY]) {
      const versions = readFileSync(join(root, "versions.tf"), "utf8");
      const lockfile = readFileSync(join(root, ".terraform.lock.hcl"), "utf8");
      const example = readFileSync(
        join(root, "terraform.tfvars.example"),
        "utf8",
      );
      expect(versions).toMatch(/backend\s+"gcs"\s+\{\}/u);
      expect(versions).not.toMatch(
        /\b(?:bucket|prefix|credentials)\s*=/u,
      );
      expect(versions).toContain('version = "= 7.40.0"');
      expect(lockfile).toContain('version     = "7.40.0"');
      expect(example).toContain("example");
      expect(example).not.toMatch(
        /(?:googleusercontent\.com|iam\.gserviceaccount\.com|@gmail\.com|credentials|token|private_key)/iu,
      );
    }
  });

  it("adds no apply path, remote-state dependency, credential, target, or approval", () => {
    const packageJson = readFileSync(join(ROOT, "package.json"), "utf8");
    const source = [
      readTerraform(ACTIVATION),
      readTerraform(FOUNDATION),
      readTerraform(ROLE_AUTHORITY),
    ].join("\n");
    expect(packageJson).not.toMatch(/terraform\s+(?:apply|destroy|import|refresh|state)\b/u);
    expect(packageJson).not.toMatch(/terraform\b[^\n"]*-target\b/u);
    expect(source).not.toMatch(/data\s+"terraform_remote_state"/u);
    expect(source).not.toMatch(
      /(?:GOOGLE_APPLICATION_CREDENTIALS|TOSS_SECRET_KEY|PAYPAL|REFUND_SANDBOX_TARGET|EXECUTABLE_APPROVAL)/u,
    );
  });

  it("publishes the exact non-authorizing status and next-package boundary", () => {
    const documentation = readFileSync(POLICY_DOCUMENT, "utf8");
    for (const status of [
      "P3E_B1_MONOLITH: RETIRED_UNAPPLIED",
      "STATE_BACKEND_AUTHORITY: DEFINED_NOT_PROVISIONED",
      "IAM_DENY_CURRENT_PROJECT: NOT_APPLICABLE_NO_ORGANIZATION",
      "SERVICE_ACTIVATION_AUTHORITY: DEFINED_NOT_PROVISIONED",
      "SERVICE_ACTIVATION_BOOTSTRAP_PREREQUISITES: EXTERNAL_PRE_ENABLED_AND_REVIEWED_REQUIRED",
      "SERVICE_ACTIVATION_BOOTSTRAP_API_SET: DEFINED_NOT_VERIFIED",
      "SERVICE_ACTIVATION_ROOT: NOT_INITIALIZABLE_UNTIL_BOOTSTRAP_PREREQUISITES",
      "SERVICE_ACTIVATION_HANDOFF: OPERATOR_ATTESTED_APPLIED_AND_REVIEWED_REQUIRED",
      "SERVICE_ACTIVATION_OPERATOR: EXTERNAL_SEPARATE",
      "SERVICE_ACTIVATION_PROVIDER: HASHICORP_GOOGLE_7_40_0",
      "SERVICE_ACTIVATION_RESOURCE: GOOGLE_PROJECT_SERVICE",
      "SERVICE_ACTIVATION_OPERATOR_PERMISSION_CONTRACT: DEFINED_NOT_GRANTED",
      "SERVICE_ACTIVATION_OPERATOR_METHOD_CONTRACT: DEFINED",
      "SERVICE_ACTIVATION_SHARED_READ_PERMISSION: RESOURCEMANAGER_PROJECTS_GET",
      "SERVICE_ACTIVATION_EXCLUSIVE_PERMISSIONS: DEFINED_NOT_GRANTED",
      "SERVICE_ACTIVATION_OPERATOR_IDENTITY: NOT_SELECTED",
      "SERVICE_ACTIVATION_OPERATOR_ROLE: NOT_DEFINED",
      "SERVICE_ACTIVATION_OPERATOR_BINDING: ABSENT",
      "SERVICE_ACTIVATION_USER_PROJECT_OVERRIDE: DISABLED",
      "FOUNDATION_ROOT: DEFINED_NOT_PROVISIONED",
      "FOUNDATION_ACTIVATION_GATE: ENFORCED",
      "FOUNDATION_CLOUD_AUTHENTICATION: NOT_PERFORMED",
      "FOUNDATION_DEPLOYER_ROLE: DEFINED_NOT_CREATED",
      "FOUNDATION_DEPLOYER_BINDING: ABSENT",
      "RUNTIME_IDENTITY_AUTHORITY: DEFERRED",
      "RUNTIME_JOB_DEFINITIONS: DEFERRED",
      "P3E_B2_FOUNDATION: NOT_PROVISIONED",
      "P3E_B2_RUNTIME: NOT_DEPLOYABLE",
      "PROVIDER_EXECUTION: BLOCKED",
      "SCHEDULED_SANDBOX: BLOCKED",
      "LIVE: UNREACHABLE",
    ]) {
      expect(documentation).toContain(status);
    }
    expect(documentation).toContain("P3E-B2-R2B1");
    expect(documentation).toContain(
      "does not authorize runtime apply, image publication",
    );
  });

  it("fails closed on every symlink shape while accepting the same ordinary inventory", () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "mira-p3e-b2-inventory-"),
    );
    try {
      const ordinaryRoot = join(temporaryRoot, "ordinary");
      mkdirSync(join(ordinaryRoot, "nested"), { recursive: true });
      writeFileSync(join(ordinaryRoot, ".hidden"), "hidden", "utf8");
      writeFileSync(join(ordinaryRoot, "nested", "policy.tf"), "policy", "utf8");
      expect(
        walk(ordinaryRoot).map((path) =>
          relative(realpathSync(ordinaryRoot), path).split(sep).join("/"),
        ),
      ).toEqual([".hidden", "nested/policy.tf"]);

      const outsideFile = join(temporaryRoot, "outside.tf");
      const outsideDirectory = join(temporaryRoot, "outside-directory");
      writeFileSync(outsideFile, "outside", "utf8");
      mkdirSync(outsideDirectory);
      writeFileSync(join(outsideDirectory, "outside.tf"), "outside", "utf8");
      const unreadableTarget = join(temporaryRoot, "unreadable-target");
      writeFileSync(unreadableTarget, "must not be read", "utf8");
      chmodSync(unreadableTarget, 0);

      for (const mutation of [
        {
          name: "internal file symlink",
          target: join(ordinaryRoot, "nested", "policy.tf"),
          link: join(ordinaryRoot, "internal-file-link.tf"),
        },
        {
          name: "external file symlink",
          target: outsideFile,
          link: join(ordinaryRoot, "external-file-link.tf"),
        },
        {
          name: "internal directory symlink",
          target: join(ordinaryRoot, "nested"),
          link: join(ordinaryRoot, "internal-directory-link"),
        },
        {
          name: "external directory symlink",
          target: outsideDirectory,
          link: join(ordinaryRoot, "external-directory-link"),
        },
        {
          name: "dangling symlink",
          target: join(temporaryRoot, "target-must-not-be-read"),
          link: join(ordinaryRoot, "dangling-link.tf"),
        },
        {
          name: "unreadable-target symlink",
          target: unreadableTarget,
          link: join(ordinaryRoot, "unreadable-target-link.tf"),
        },
      ]) {
        symlinkSync(mutation.target, mutation.link);
        const scannedLink = join(
          realpathSync(ordinaryRoot),
          relative(ordinaryRoot, mutation.link),
        );
        expect(
          () => walk(ordinaryRoot),
          mutation.name,
        ).toThrow(`Inventory symlink rejected: ${scannedLink}`);
        rmSync(mutation.link);
      }

      const expectedFile = join(ordinaryRoot, "nested", "policy.tf");
      rmSync(expectedFile);
      symlinkSync(outsideFile, expectedFile);
      expect(() => walk(ordinaryRoot)).toThrow(
        `Inventory symlink rejected: ${join(
          realpathSync(ordinaryRoot),
          "nested",
          "policy.tf",
        )}`,
      );
      rmSync(expectedFile);

      const rootLink = join(temporaryRoot, "root-link");
      symlinkSync(ordinaryRoot, rootLink);
      expect(() => walk(rootLink)).toThrow(
        `Inventory symlink rejected: ${rootLink}`,
      );
      chmodSync(unreadableTarget, 0o600);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function isR1BPath(path: string): boolean {
  if ([
    "contracts/attended-collector-core-v1.json",
    "contracts/trusted-project-bootstrap-readiness-v1.json",
    "contracts/trusted-project-bootstrap-readiness-v2.json",
  ].includes(path)) {
    return false;
  }

  return [
    "contracts/",
    "foundation/",
    "foundation-deployer-authority/",
    "runtime-deferred/",
    "service-activation/",
  ].some((prefix) => path.startsWith(prefix));
}

function readTerraform(root: string): string {
  return walk(root)
    .filter((path) => path.endsWith(".tf"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function resourceAddresses(source: string): string[] {
  return [...source.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/gu)]
    .map((match) => `${match[1]}.${match[2]}`)
    .sort();
}

function resourceTypes(source: string): string[] {
  return resourceAddresses(source)
    .map((address) => address.slice(0, address.indexOf(".")))
    .sort();
}

function exactSetHash(values: readonly string[]): string {
  return createHash("sha256")
    .update([...values].sort().join("\n"), "utf8")
    .digest("hex");
}
