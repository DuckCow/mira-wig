mock_provider "google" {}

variables {
  project_id = "mira-refund-sbx-example"
}

run "exact_foundation_authority_api_set" {
  command = plan

  assert {
    condition = toset(keys(google_project_service.required)) == toset([
      "artifactregistry.googleapis.com",
      "cloudresourcemanager.googleapis.com",
      "compute.googleapis.com",
      "dns.googleapis.com",
      "iam.googleapis.com",
      "secretmanager.googleapis.com",
      "servicenetworking.googleapis.com",
      "serviceusage.googleapis.com",
      "sqladmin.googleapis.com",
      "storage.googleapis.com",
    ])
    error_message = "Service activation API inventory drifted."
  }

  assert {
    condition = alltrue([
      for service in google_project_service.required :
      service.disable_on_destroy == false && service.disable_dependent_services == false
    ])
    error_message = "Service activation must never disable APIs or dependent APIs on removal."
  }

  assert {
    condition = (
      output.service_activation_manifest.contract_version ==
      "mira-refund-p3e-b2-foundation-authority/v1" &&
      output.service_activation_manifest.api_names == tolist([
        "artifactregistry.googleapis.com",
        "cloudresourcemanager.googleapis.com",
        "compute.googleapis.com",
        "dns.googleapis.com",
        "iam.googleapis.com",
        "secretmanager.googleapis.com",
        "servicenetworking.googleapis.com",
        "serviceusage.googleapis.com",
        "sqladmin.googleapis.com",
        "storage.googleapis.com",
      ]) &&
      output.service_activation_manifest.api_set_sha256 ==
      "a281c1c9cd5adcb27aeb15e93256ccebf7b49a4e5e4d812f1199bce0c0d2d7d5" &&
      output.service_activation_manifest.bootstrap_preenabled_api_names == tolist([
        "cloudresourcemanager.googleapis.com",
        "serviceusage.googleapis.com",
        "storage.googleapis.com",
      ]) &&
      output.service_activation_manifest.bootstrap_preenabled_api_set_sha256 ==
      "2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7" &&
      output.service_activation_manifest.source_state_prefix == "p3e-b2/service-activation" &&
      output.service_activation_manifest.provider_source == "hashicorp/google" &&
      output.service_activation_manifest.provider_version == "7.40.0" &&
      output.service_activation_manifest.resource_type == "google_project_service" &&
      output.service_activation_manifest.methods == tolist([
        "cloudresourcemanager.projects.get",
        "serviceusage.operations.get",
        "serviceusage.services.batchEnable",
        "serviceusage.services.enable",
        "serviceusage.services.list",
      ]) &&
      output.service_activation_manifest.method_set_sha256 ==
      "ddc12bb0dae1cdbe0e9b7a8cd5838cc6cb8759b9323fb32171ad239963050120" &&
      output.service_activation_manifest.permissions == tolist([
        "resourcemanager.projects.get",
        "servicemanagement.services.bind",
        "serviceusage.operations.get",
        "serviceusage.services.enable",
        "serviceusage.services.list",
      ]) &&
      output.service_activation_manifest.permission_set_sha256 ==
      "3371ab566521c0c48800e932b2d11ab09382e9e249f061b395c5a45576fff7ef"
    )
    error_message = "Service activation manifest drifted."
  }

  assert {
    condition = (
      output.service_activation_manifest.shared_read_permissions == tolist([
        "resourcemanager.projects.get",
      ]) &&
      output.service_activation_manifest.shared_read_permission_set_sha256 ==
      "066987a0d6fc58a75ade7e31b099ea0c31bc101a829e7dc094c135b052587a61" &&
      output.service_activation_manifest.activation_exclusive_permissions == tolist([
        "servicemanagement.services.bind",
        "serviceusage.operations.get",
        "serviceusage.services.enable",
        "serviceusage.services.list",
      ]) &&
      output.service_activation_manifest.activation_exclusive_permission_set_sha256 ==
      "c9ca2657b673902e5f80ff6e8d2a091c5e9984f441d9176f17c0bc8e0358ce19" &&
      output.service_activation_manifest.activation_foundation_permission_intersection == tolist([
        "resourcemanager.projects.get",
      ]) &&
      length(output.service_activation_manifest.activation_exclusive_foundation_intersection) == 0 &&
      output.service_activation_manifest.foundation_deployer_permission_count == 60 &&
      output.service_activation_manifest.foundation_deployer_permission_set_sha256 ==
      "7460121269bcfd3a129ae36c9b24c0e49d17ae67b70624d288cf5796ba3ce8b7" &&
      output.service_activation_manifest.foundation_deployer_can_complete_activation_lifecycle == false
    )
    error_message = "Shared-read and activation-exclusive authority drifted."
  }

  assert {
    condition = (
      output.service_activation_manifest.user_project_override == false &&
      output.service_activation_manifest.billing_project_override == false &&
      output.service_activation_manifest.quota_project_override == false &&
      output.service_activation_manifest.operator_status ==
      "EXTERNAL_PERMISSION_CONTRACT_DEFINED_NOT_GRANTED" &&
      output.service_activation_manifest.grant_authority == "EXTERNAL_SEPARATE" &&
      output.service_activation_manifest.role == "NOT_DEFINED" &&
      output.service_activation_manifest.identity == "NOT_SELECTED" &&
      output.service_activation_manifest.binding == "ABSENT" &&
      output.service_activation_manifest.activation_apply_status == "APPLIED" &&
      output.service_activation_manifest.operator_review_status == "REVIEW_REQUIRED" &&
      output.service_activation_manifest.evidence_type == "TERRAFORM_APPLY_OUTPUT_NOT_CLOUD_AUTHENTICATED" &&
      !contains(output.service_activation_manifest.permissions, "serviceusage.services.get") &&
      !contains(output.service_activation_manifest.permissions, "serviceusage.services.disable") &&
      !contains(output.service_activation_manifest.permissions, "serviceusage.services.use") &&
      !contains(output.service_activation_manifest.methods, "serviceusage.services.get") &&
      !contains(output.service_activation_manifest.methods, "serviceusage.services.disable") &&
      contains(output.service_activation_manifest.methods, "serviceusage.services.batchEnable") &&
      !contains(output.service_activation_manifest.permissions, "serviceusage.services.batchEnable")
    )
    error_message = "Activation exclusions or unbound operator status drifted."
  }
}

run "reject_production_project" {
  command = plan
  variables {
    project_id = "mira-production"
  }
  expect_failures = [var.project_id]
}
