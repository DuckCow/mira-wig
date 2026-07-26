locals {
  authority_contract = jsondecode(file("${path.module}/../contracts/runtime-authority-v1.json"))
  project_id         = var.project_id
  region             = "asia-northeast3"

  runtime_apply_authorized  = false
  runtime_root_apply_policy = "UNCONDITIONALLY_BLOCKED_IN_R2B1"
  network_tags              = ["refund-provider-free"]

  preflight_service_account_id = "${var.resource_prefix}-preflight"
  canary_service_account_id    = "${var.resource_prefix}-canary"
  preflight_job_name           = "${var.resource_prefix}-refund-preflight"
  canary_job_name              = "${var.resource_prefix}-refund-canary"

  foundation_cloud_sql_instance_connection_name = try(
    var.foundation_handoff.cloud_sql_instance_connection_name,
    "",
  )
  foundation_cloud_sql_instance_resource_name = try(
    var.foundation_handoff.cloud_sql_instance_resource_name,
    "",
  )
  foundation_network_resource_name = try(
    var.foundation_handoff.network_resource_name,
    "",
  )
  foundation_subnetwork_resource_name = try(
    var.foundation_handoff.subnetwork_resource_name,
    "",
  )
  foundation_preflight_database_secret_resource_name = try(
    var.foundation_handoff.preflight_database_secret_resource_name,
    "",
  )
  foundation_canary_database_secret_resource_name = try(
    var.foundation_handoff.canary_database_secret_resource_name,
    "",
  )
  release_image_digest_uri = try(
    var.release_image_handoff.image_digest_uri,
    "",
  )
  preflight_database_secret_version_resource_name = try(
    var.preflight_database_secret_version_reference.secret_resource_name,
    "",
  )
  preflight_database_secret_version = try(
    var.preflight_database_secret_version_reference.version,
    "",
  )
  canary_database_secret_version_resource_name = try(
    var.canary_database_secret_version_reference.secret_resource_name,
    "",
  )
  canary_database_secret_version = try(
    var.canary_database_secret_version_reference.version,
    "",
  )

  cloud_sql_condition_expression = "resource.name == '${local.foundation_cloud_sql_instance_resource_name}' && resource.service == 'sqladmin.googleapis.com'"

  runtime_identities = {
    dormant_canary = google_service_account.dormant_canary.email
    preflight      = google_service_account.preflight.email
  }

  task_timeout_seconds = 300
  task_timeout         = "${local.task_timeout_seconds}s"
  task_count           = 1
  parallelism          = 1
  max_retries          = 0
  cpu                  = "1"
  memory               = "512Mi"

  foundation_handoff_valid = try(
    toset(keys(var.foundation_handoff)) == toset([
      "activation_apply_status",
      "activation_operator_review_status",
      "artifact_repository_resource_name",
      "canary_database_secret_resource_name",
      "cloud_sql_instance_connection_name",
      "cloud_sql_instance_resource_name",
      "contract_version",
      "evidence_type",
      "foundation_apply_status",
      "foundation_operator_review_status",
      "foundation_resource_graph_sha256",
      "network_resource_name",
      "preflight_database_secret_resource_name",
      "project_id",
      "project_number",
      "provider_source",
      "provider_version",
      "region",
      "source_state_prefix",
      "subnetwork_resource_name",
    ]) &&
    var.foundation_handoff.contract_version == "mira-refund-p3e-b2-foundation-authority/v1" &&
    var.foundation_handoff.project_id == var.project_id &&
    can(regex("^[1-9][0-9]{5,19}$", var.foundation_handoff.project_number)) &&
    var.foundation_handoff.region == "asia-northeast3" &&
    var.foundation_handoff.network_resource_name ==
    "projects/${var.project_id}/global/networks/${var.resource_prefix}-refund-vpc" &&
    var.foundation_handoff.subnetwork_resource_name ==
    "projects/${var.project_id}/regions/asia-northeast3/subnetworks/${var.resource_prefix}-refund-ane3" &&
    var.foundation_handoff.cloud_sql_instance_connection_name ==
    "${var.project_id}:asia-northeast3:${var.resource_prefix}-refund-pg18" &&
    var.foundation_handoff.cloud_sql_instance_resource_name ==
    "projects/${var.project_id}/instances/${var.resource_prefix}-refund-pg18" &&
    var.foundation_handoff.preflight_database_secret_resource_name ==
    "projects/${var.project_id}/secrets/${var.resource_prefix}-preflight-database-url" &&
    var.foundation_handoff.canary_database_secret_resource_name ==
    "projects/${var.project_id}/secrets/${var.resource_prefix}-canary-database-url" &&
    var.foundation_handoff.artifact_repository_resource_name ==
    "projects/${var.project_id}/locations/asia-northeast3/repositories/${var.resource_prefix}-refund-images" &&
    var.foundation_handoff.foundation_resource_graph_sha256 ==
    "f15f2716c0524ccd5ca3b86757076b433cce9a5c4c468aa808eae645c028c0ec" &&
    var.foundation_handoff.source_state_prefix == "p3e-b2/foundation" &&
    var.foundation_handoff.activation_apply_status == "APPLIED" &&
    var.foundation_handoff.activation_operator_review_status == "OPERATOR_REVIEWED" &&
    var.foundation_handoff.foundation_apply_status == "APPLIED" &&
    var.foundation_handoff.foundation_operator_review_status == "OPERATOR_REVIEWED" &&
    var.foundation_handoff.evidence_type == "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED" &&
    var.foundation_handoff.provider_source == "hashicorp/google" &&
    var.foundation_handoff.provider_version == "7.40.0",
    false,
  )

  execution_deny_handoff_valid = try(
    toset(keys(var.execution_deny_handoff)) == toset([
      "attachment_parent",
      "contract_version",
      "denied_permissions",
      "denied_principals",
      "deny_apply_status",
      "evidence_type",
      "exception_permissions",
      "exception_principals",
      "operator_review_status",
      "policy_id",
      "project_id",
      "project_number",
      "source_state_prefix",
    ]) &&
    var.execution_deny_handoff.contract_version ==
    "mira-refund-p3e-b2-job-execution-deny/v1" &&
    var.execution_deny_handoff.project_id == var.project_id &&
    var.execution_deny_handoff.project_number == var.foundation_handoff.project_number &&
    var.execution_deny_handoff.attachment_parent ==
    "cloudresourcemanager.googleapis.com/projects/${var.foundation_handoff.project_number}" &&
    var.execution_deny_handoff.policy_id == "refund-job-execution-deny" &&
    var.execution_deny_handoff.source_state_prefix == "p3e-b2/authority-guardrails" &&
    var.execution_deny_handoff.denied_principals == ["principalSet://goog/public:all"] &&
    toset(var.execution_deny_handoff.denied_permissions) == toset([
      "run.googleapis.com/jobs.run",
      "run.googleapis.com/jobs.runWithOverrides",
    ]) &&
    length(var.execution_deny_handoff.denied_permissions) == 2 &&
    length(var.execution_deny_handoff.exception_principals) == 0 &&
    length(var.execution_deny_handoff.exception_permissions) == 0 &&
    var.execution_deny_handoff.deny_apply_status == "APPLIED" &&
    var.execution_deny_handoff.operator_review_status == "OPERATOR_REVIEWED" &&
    var.execution_deny_handoff.evidence_type ==
    "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED",
    false,
  )

  release_image_handoff_valid = try(
    toset(keys(var.release_image_handoff)) == toset([
      "contract_version",
      "evidence_type",
      "image_contract_version",
      "image_digest_uri",
      "local_reproducibility_digest_used",
      "operator_review_status",
      "platform",
      "release_authority_status",
    ]) &&
    var.release_image_handoff.contract_version ==
    "mira-refund-worker-release-image-handoff/v1" &&
    var.release_image_handoff.image_contract_version ==
    "mira-refund-worker-runtime-image-connection/v1" &&
    var.release_image_handoff.platform == "linux/amd64" &&
    can(regex(
      "^asia-northeast3-docker\\.pkg\\.dev/${var.project_id}/${var.resource_prefix}-refund-images/[a-z0-9][a-z0-9._/-]{0,127}@sha256:[0-9a-f]{64}$",
      var.release_image_handoff.image_digest_uri,
    )) &&
    var.release_image_handoff.release_authority_status ==
    "SEPARATELY_REVIEWED_RELEASE_DIGEST" &&
    var.release_image_handoff.operator_review_status == "OPERATOR_REVIEWED" &&
    var.release_image_handoff.evidence_type ==
    "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED" &&
    var.release_image_handoff.local_reproducibility_digest_used == false,
    false,
  )

  preflight_database_secret_version_reference_valid = try(
    toset(keys(var.preflight_database_secret_version_reference)) == toset([
      "secret_resource_name",
      "version",
    ]) &&
    var.preflight_database_secret_version_reference.secret_resource_name ==
    var.foundation_handoff.preflight_database_secret_resource_name &&
    can(regex("^[1-9][0-9]{0,18}$", var.preflight_database_secret_version_reference.version)),
    false,
  )

  canary_database_secret_version_reference_valid = try(
    toset(keys(var.canary_database_secret_version_reference)) == toset([
      "secret_resource_name",
      "version",
    ]) &&
    var.canary_database_secret_version_reference.secret_resource_name ==
    var.foundation_handoff.canary_database_secret_resource_name &&
    can(regex("^[1-9][0-9]{0,18}$", var.canary_database_secret_version_reference.version)),
    false,
  )
}
