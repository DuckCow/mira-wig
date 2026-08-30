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

run "exact_dormant_database_bootstrap_shape" {
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
    condition = (
      toset(values(google_project_iam_member.cloud_sql_access)[*].role) ==
      toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"]) &&
      alltrue([
        for grant in values(google_project_iam_member.cloud_sql_access) :
        grant.member == "serviceAccount:mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
        one(grant.condition).expression ==
        "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'"
      ])
    )
    error_message = "Only the two exact instance-conditioned Cloud SQL grants are admitted."
  }

  assert {
    condition = (
      length(google_secret_manager_secret_iam_member.credential_materialization) == 4 &&
      toset([
        for grant in values(google_secret_manager_secret_iam_member.credential_materialization) :
        "${grant.secret_id}|${grant.role}"
      ]) == toset([
        "mira-p3e-sbx-preflight-database-url|roles/secretmanager.secretVersionAdder",
        "mira-p3e-sbx-preflight-database-url|roles/secretmanager.viewer",
        "mira-p3e-sbx-canary-database-url|roles/secretmanager.secretVersionAdder",
        "mira-p3e-sbx-canary-database-url|roles/secretmanager.viewer",
      ]) &&
      alltrue([
        for grant in values(google_secret_manager_secret_iam_member.credential_materialization) :
        grant.member == "serviceAccount:mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com"
      ])
    )
    error_message = "Only exact-secret metadata and version-add authority is admitted."
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
      output.bootstrap_manifest.automatic_trigger == "NONE" &&
      output.bootstrap_manifest.provider_credentials == "NONE" &&
      output.bootstrap_manifest.secret_manager_dependencies == "EXACT_SECRET_METADATA_AND_VERSION_ADD_ONLY" &&
      output.bootstrap_manifest.execution_status == "DORMANT_NOT_EXECUTED"
    )
    error_message = "The bootstrap handoff must remain dormant and provider/secret free."
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
