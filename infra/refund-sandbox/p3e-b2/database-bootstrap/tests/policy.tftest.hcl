mock_provider "google" {}

variables {
  project_id                 = "mira-refund-sandbox-0001"
  resource_prefix            = "mira-p3e-sbx"
  source_commit              = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

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
      var.bootstrap_image_digest_uri
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
      output.bootstrap_manifest.explicit_mutating_mode == "apply" &&
      output.bootstrap_manifest.credential_materialization_mode == "materialize-application-credentials" &&
      output.bootstrap_manifest.credential_recovery_mode == "recover-canary-application-credential" &&
      output.bootstrap_manifest.automatic_trigger == "NONE" &&
      output.bootstrap_manifest.provider_credentials == "NONE" &&
      output.bootstrap_manifest.cloud_sql_login_authority == "NONE" &&
      output.bootstrap_manifest.credential_secret_iam_authority == "NONE" &&
      output.bootstrap_manifest.secret_manager_dependencies == "NO_STANDING_AUTHORITY_IMAGE_CAPABILITY_RETAINED" &&
      output.bootstrap_manifest.future_migration_reentry == "SEPARATELY_AUTHORIZED_CLOUD_SQL_IAM_REGRANT_REQUIRED" &&
      output.bootstrap_manifest.execution_status == "RETAINED_DORMANT_NO_AUTOMATIC_TRIGGER"
    )
    error_message = "The retained bootstrap handoff must expose no standing login or secret IAM authority."
  }
}

run "reject_mutable_image_tag" {
  command = plan
  variables {
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap:latest"
  }
  expect_failures = [var.bootstrap_image_digest_uri]
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
