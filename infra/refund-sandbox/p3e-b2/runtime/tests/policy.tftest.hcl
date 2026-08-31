mock_provider "google" {}

variables {
  project_id      = "mira-refund-sandbox-0001"
  resource_prefix = "mira-p3e-sbx"

  foundation_handoff = {
    contract_version                        = "mira-refund-p3e-b2-foundation-authority/v1"
    project_id                              = "mira-refund-sandbox-0001"
    project_number                          = "925882331349"
    region                                  = "asia-northeast3"
    network_resource_name                   = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
    subnetwork_resource_name                = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    cloud_sql_instance_connection_name      = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
    cloud_sql_instance_resource_name        = "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18"
    preflight_database_secret_resource_name = "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url"
    canary_database_secret_resource_name    = "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-canary-database-url"
    artifact_repository_resource_name       = "projects/mira-refund-sandbox-0001/locations/asia-northeast3/repositories/mira-p3e-sbx-refund-images"
    googleapis_private_zone_name            = "mira-p3e-sbx-googleapis"
    restricted_googleapis_ipv4_range        = "199.36.153.4/30"
    foundation_resource_graph_sha256        = "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f"
    source_state_prefix                     = "p3e-b2/foundation"
    activation_apply_status                 = "APPLIED"
    activation_operator_review_status       = "OPERATOR_REVIEWED"
    foundation_apply_status                 = "APPLIED"
    foundation_operator_review_status       = "OPERATOR_REVIEWED"
    evidence_type                           = "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
    provider_source                         = "hashicorp/google"
    provider_version                        = "7.40.0"
  }

  release_image_handoff = {
    contract_version                  = "mira-refund-worker-release-image-handoff/v1"
    image_digest_uri                  = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    image_contract_version            = "mira-refund-worker-runtime-image-connection/v1"
    platform                          = "linux/amd64"
    release_authority_status          = "SEPARATELY_REVIEWED_RELEASE_DIGEST"
    operator_review_status            = "OPERATOR_REVIEWED"
    evidence_type                     = "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
    local_reproducibility_digest_used = false
  }

  preflight_database_secret_version_reference = {
    secret_resource_name = "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url"
    version              = "1"
  }
}

run "admit_exact_preflight_release" {
  command = plan

  assert {
    condition = (
      output.status == "PREFLIGHT_RUNTIME_RELEASE_AUTHORIZED_NOT_YET_APPLIED" &&
      output.runtime_root_apply_policy == "EXPLICIT_PREFLIGHT_RELEASE_AUTHORIZED" &&
      output.runtime_manifest.canary_materialized == false &&
      output.runtime_manifest.canary_executable == false
    )
    error_message = "Only the exact provider-free preflight release may be admitted."
  }

  assert {
    condition = (
      google_service_account.preflight.account_id == "mira-p3e-sbx-preflight" &&
      google_project_iam_member.cloud_sql_client["preflight"].role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_client["preflight"].condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      google_secret_manager_secret_iam_member.preflight_database_access.secret_id == "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url" &&
      google_secret_manager_secret_iam_member.preflight_database_access.role == "roles/secretmanager.secretAccessor" &&
      google_cloud_run_v2_job.preflight.name == "mira-p3e-sbx-refund-preflight" &&
      google_cloud_run_v2_job.preflight.template[0].task_count == 1 &&
      google_cloud_run_v2_job.preflight.template[0].parallelism == 1 &&
      google_cloud_run_v2_job.preflight.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.preflight.template[0].template[0].containers[0].image == var.release_image_handoff.image_digest_uri &&
      google_cloud_run_v2_job.preflight.template[0].template[0].containers[0].args == tolist(["sandbox-preflight"]) &&
      google_cloud_run_v2_job.preflight.template[0].template[0].containers[0].env[2].value_source[0].secret_key_ref[0].secret == "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url" &&
      google_cloud_run_v2_job.preflight.template[0].template[0].containers[0].env[2].value_source[0].secret_key_ref[0].version == "1" &&
      google_cloud_run_v2_job.preflight.template[0].template[0].vpc_access[0].egress == "ALL_TRAFFIC" &&
      google_cloud_run_v2_job.preflight.template[0].template[0].vpc_access[0].network_interfaces[0].network == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc" &&
      google_cloud_run_v2_job.preflight.template[0].template[0].vpc_access[0].network_interfaces[0].subnetwork == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3" &&
      google_cloud_run_v2_job.preflight.template[0].template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"])
    )
    error_message = "The preflight identity, IAM, secret selector, image, and Job shape must remain exact."
  }
}

run "reject_mutable_latest_image" {
  command = plan
  variables {
    release_image_handoff = merge(var.release_image_handoff, {
      image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker:latest"
    })
  }
  expect_failures = [check.release_image_handoff, google_service_account.preflight]
}

run "reject_privileged_bootstrap_image" {
  command = plan
  variables {
    release_image_handoff = merge(var.release_image_handoff, {
      image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    })
  }
  expect_failures = [check.release_image_handoff, google_service_account.preflight]
}

run "reject_local_proof_as_release_authority" {
  command = plan
  variables {
    release_image_handoff = merge(var.release_image_handoff, {
      local_reproducibility_digest_used = true
    })
  }
  expect_failures = [check.release_image_handoff, google_service_account.preflight]
}

run "reject_wrong_foundation_project" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, { project_id = "another-project" })
  }
  expect_failures = [check.foundation_handoff, google_service_account.preflight]
}

run "reject_unknown_foundation_field" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, { unexpected = "not-admitted" })
  }
  expect_failures = [check.foundation_handoff, google_service_account.preflight]
}

run "reject_crossed_preflight_secret" {
  command = plan
  variables {
    preflight_database_secret_version_reference = {
      secret_resource_name = var.foundation_handoff.canary_database_secret_resource_name
      version              = "1"
    }
  }
  expect_failures = [check.preflight_database_secret_version_reference, google_service_account.preflight]
}

run "reject_non_exact_preflight_version" {
  command = plan
  variables {
    preflight_database_secret_version_reference = merge(
      var.preflight_database_secret_version_reference,
      { version = "2" },
    )
  }
  expect_failures = [check.preflight_database_secret_version_reference, google_service_account.preflight]
}

run "reject_secret_version_alias" {
  command = plan
  variables {
    preflight_database_secret_version_reference = merge(
      var.preflight_database_secret_version_reference,
      { version = "latest" },
    )
  }
  expect_failures = [check.preflight_database_secret_version_reference, google_service_account.preflight]
}
