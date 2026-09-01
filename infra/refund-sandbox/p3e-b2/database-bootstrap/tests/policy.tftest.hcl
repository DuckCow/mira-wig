mock_provider "google" {}

variables {
  project_id      = "mira-refund-sandbox-0001"
  resource_prefix = "mira-p3e-sbx"
  foundation_handoff = {
    contract_version                 = "mira-refund-p3e-b2-foundation-authority/v1"
    project_id                       = "mira-refund-sandbox-0001"
    region                           = "asia-northeast3"
    network_resource_name            = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
    subnetwork_resource_name         = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    cloud_sql_instance_name          = "mira-p3e-sbx-refund-pg18"
    cloud_sql_instance_resource_name = "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18"
    cloud_sql_connection_name        = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
    database_name                    = "refund_sandbox"
    cloud_sql_iam_authentication     = "on"
    foundation_resource_graph_sha256 = "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f"
    source_state_prefix              = "p3e-b2/foundation"
    apply_status                     = "APPLIED"
    operator_review_status           = "OPERATOR_REVIEWED"
  }
}

run "exact_retired_bootstrap_authority_shape" {
  command = plan

  override_resource {
    target          = google_service_account.bootstrap
    override_during = plan
    values = {
      email = "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com"
    }
  }

  assert {
    condition = (
      google_service_account.bootstrap.account_id == "mira-p3e-sbx-db-bootstrap" &&
      google_service_account.bootstrap.disabled == false
    )
    error_message = "The exact enabled bootstrap service account is required."
  }

  assert {
    condition     = length(google_project_iam_member.cloud_sql_access) == 0
    error_message = "The bootstrap identity must have no standing Cloud SQL IAM login grant."
  }

  assert {
    condition     = length(google_secret_manager_secret_iam_member.credential_materialization) == 0
    error_message = "The bootstrap identity must have no standing credential-secret IAM grant."
  }

  assert {
    condition = (
      google_sql_user.bootstrap.name ==
      "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam" &&
      google_sql_user.bootstrap.instance == "mira-p3e-sbx-refund-pg18" &&
      google_sql_user.bootstrap.type == "CLOUD_IAM_SERVICE_ACCOUNT" &&
      google_sql_user.bootstrap.database_roles == tolist(["cloudsqlsuperuser"])
    )
    error_message = "The passwordless IAM database user must have only cloudsqlsuperuser."
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.name == "mira-p3e-sbx-refund-db-bootstrap" &&
      google_cloud_run_v2_job.bootstrap.deletion_protection &&
      google_cloud_run_v2_job.bootstrap.template[0].task_count == 1 &&
      google_cloud_run_v2_job.bootstrap.template[0].parallelism == 1 &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].service_account ==
      "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args == tolist(["check"]) &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      output.bootstrap_manifest.source_commit == "81e785448f834f4176cd5153eb3cbdf6d79d936c"
    )
    error_message = "The bootstrap Job must remain one-task, zero-retry, check-default and digest-bound."
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].vpc_access[0].egress ==
      "ALL_TRAFFIC" &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].vpc_access[0].network_interfaces[0].network ==
      var.foundation_handoff.network_resource_name &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].vpc_access[0].network_interfaces[0].subnetwork ==
      var.foundation_handoff.subnetwork_resource_name &&
      toset(google_cloud_run_v2_job.bootstrap.template[0].template[0].vpc_access[0].network_interfaces[0].tags) ==
      toset(["refund-provider-free"])
    )
    error_message = "The exact Direct VPC ALL_TRAFFIC path and firewall tag are required."
  }

  assert {
    condition = (
      output.bootstrap_manifest.default_mode == "check" &&
      output.bootstrap_manifest.selected_mode == "check" &&
      output.bootstrap_manifest.allowed_modes == [
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
      ] &&
      output.bootstrap_manifest.explicit_mutating_mode == "apply" &&
      output.bootstrap_manifest.grant_only_mode == "apply-canary-role-grants" &&
      output.bootstrap_manifest.contacted_reconciliation_grant == "apply-contacted-reconciliation-role-grants" &&
      output.bootstrap_manifest.canonical_refund_grants_restore == "restore-canary-refund-role-grants" &&
      output.bootstrap_manifest.credential_materialization_mode == "materialize-application-credentials" &&
      output.bootstrap_manifest.credential_recovery_mode == "recover-canary-application-credential" &&
      output.bootstrap_manifest.automatic_trigger == "NONE" &&
      output.bootstrap_manifest.provider_credentials == "NONE" &&
      output.bootstrap_manifest.temporary_cloud_sql_access == false &&
      output.bootstrap_manifest.cloud_sql_login_authority == "NONE" &&
      output.bootstrap_manifest.credential_secret_iam_authority == "NONE" &&
      output.bootstrap_manifest.secret_manager_dependencies == "NO_STANDING_AUTHORITY_IMAGE_CAPABILITY_RETAINED" &&
      output.bootstrap_manifest.future_migration_reentry == "SEPARATELY_AUTHORIZED_DEFAULT_FALSE_INPUT_TRUE_REQUIRED" &&
      output.bootstrap_manifest.execution_status == "RETAINED_DORMANT_NO_AUTOMATIC_TRIGGER"
    )
    error_message = "The retained bootstrap handoff must expose no standing login or secret IAM authority."
  }
}

run "bind_contacted_reconciliation_grant_mode_to_job_args" {
  command = plan

  variables {
    bootstrap_mode = "apply-contacted-reconciliation-role-grants"
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args ==
      tolist(["apply-contacted-reconciliation-role-grants"]) &&
      output.bootstrap_manifest.selected_mode == "apply-contacted-reconciliation-role-grants"
    )
    error_message = "The contacted-reconciliation grant mode must be the Job's only argument."
  }

  assert {
    condition     = length(google_project_iam_member.cloud_sql_access) == 0
    error_message = "Selecting the contacted-reconciliation grant mode must not enable temporary Cloud SQL IAM."
  }
}

run "bind_business_state_readback_grant_reentry_to_reviewed_successor" {
  command = plan

  variables {
    bootstrap_mode                        = "apply-business-state-readback-role-grants"
    temporary_cloud_sql_access_authorized = true
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args ==
      tolist(["apply-business-state-readback-role-grants"]) &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      output.bootstrap_manifest.source_commit == "81e785448f834f4176cd5153eb3cbdf6d79d936c" &&
      output.bootstrap_manifest.business_state_readback_grant ==
      "apply-business-state-readback-role-grants" &&
      length(google_project_iam_member.cloud_sql_access) == 2
    )
    error_message = "The readback role grant must use only the reviewed successor image/source and explicit temporary Cloud SQL IAM."
  }
}

run "bind_business_state_readback_revoke_to_reviewed_successor" {
  command = plan

  variables {
    bootstrap_mode                        = "revoke-business-state-readback-role-grants"
    temporary_cloud_sql_access_authorized = true
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args ==
      tolist(["revoke-business-state-readback-role-grants"]) &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      output.bootstrap_manifest.business_state_readback_revoke ==
      "revoke-business-state-readback-role-grants"
    )
    error_message = "The readback role retirement must use only the exact revoke mode and reviewed successor."
  }
}

run "return_to_check_preserves_reviewed_successor" {
  command = plan

  variables {
    bootstrap_mode = "check"
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args ==
      tolist(["check"]) &&
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      length(google_project_iam_member.cloud_sql_access) == 0
    )
    error_message = "Returning to check must preserve the exact current successor with temporary IAM absent."
  }
}

run "readback_mode_alone_does_not_materialize_iam" {
  command = plan

  variables {
    bootstrap_mode = "apply-business-state-readback-role-grants"
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      length(google_project_iam_member.cloud_sql_access) == 0
    )
    error_message = "Selecting a readback role mode must not implicitly materialize temporary Cloud SQL IAM."
  }

  expect_failures = [check.business_state_readback_role_lifecycle_reentry]
}

run "bind_canonical_refund_grants_restore_mode_to_job_args" {
  command = plan

  variables {
    bootstrap_mode = "restore-canary-refund-role-grants"
  }

  assert {
    condition = (
      google_cloud_run_v2_job.bootstrap.template[0].template[0].containers[0].args ==
      tolist(["restore-canary-refund-role-grants"]) &&
      output.bootstrap_manifest.selected_mode == "restore-canary-refund-role-grants"
    )
    error_message = "The canonical refund-grants restore mode must be the Job's only argument."
  }

  assert {
    condition     = length(google_project_iam_member.cloud_sql_access) == 0
    error_message = "Selecting the canonical restore mode must not enable temporary Cloud SQL IAM."
  }
}

run "exact_temporary_cloud_sql_access_shape" {
  command = plan

  variables {
    temporary_cloud_sql_access_authorized = true
  }

  override_resource {
    target          = google_service_account.bootstrap
    override_during = plan
    values = {
      email = "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com"
    }
  }

  assert {
    condition = (
      length(google_project_iam_member.cloud_sql_access) == 2 &&
      toset(keys(google_project_iam_member.cloud_sql_access)) ==
      toset(["client", "instance_user"])
    )
    error_message = "Temporary admission must add exactly the two historical Cloud SQL IAM addresses."
  }

  assert {
    condition = alltrue([
      for binding in values(google_project_iam_member.cloud_sql_access) :
      binding.member == "serviceAccount:mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      binding.condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'"
    ])
    error_message = "Both temporary bindings must retain the exact bootstrap principal and single-instance/service condition."
  }

  assert {
    condition = (
      google_project_iam_member.cloud_sql_access["client"].role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_access["instance_user"].role == "roles/cloudsql.instanceUser"
    )
    error_message = "Temporary admission must restore only Cloud SQL Client and Instance User."
  }

  assert {
    condition     = length(google_secret_manager_secret_iam_member.credential_materialization) == 0
    error_message = "Temporary Cloud SQL admission must never restore bootstrap Secret Manager IAM."
  }

  assert {
    condition = (
      output.bootstrap_manifest.temporary_cloud_sql_access == true &&
      output.bootstrap_manifest.cloud_sql_login_authority == "EXACT_TWO_CONDITIONED_BINDINGS" &&
      output.bootstrap_manifest.credential_secret_iam_authority == "NONE"
    )
    error_message = "The temporary handoff must identify only the exact two conditioned bindings."
  }
}

run "reject_mutable_image_tag" {
  command = plan
  variables {
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap:latest"
  }
  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_superseded_verifier_defective_image_as_current" {
  command = plan
  variables {
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3"
  }
  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_historical_predecessor_as_current_image" {
  command = plan
  variables {
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086"
  }
  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_arbitrary_immutable_image" {
  command = plan
  variables {
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }
  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_arbitrary_bootstrap_mode" {
  command = plan
  variables {
    bootstrap_mode = "shell"
  }
  expect_failures = [var.bootstrap_mode]
}

run "reject_foundation_drift" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      cloud_sql_iam_authentication = "off"
    })
  }
  expect_failures = [check.exact_foundation_handoff]
}
