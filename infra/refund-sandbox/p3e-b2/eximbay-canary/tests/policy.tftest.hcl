mock_provider "google" {}

variables {
  release_authority = {
    human_authorized            = true
    release_scope               = "DORMANT_EXIMBAY_SANDBOX_CANARY_MATERIALIZATION"
    provider_contact_authorized = false
  }
  project_id                         = "mira-refund-sandbox-0001"
  release_image_digest_uri           = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:8e167a2a9eeeabe82feef0488c69f3b527a00cb0b8497d2d3c20289c72633baf"
  cloud_sql_instance_connection_name = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
  network_resource_name              = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
  subnetwork_resource_name           = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
  database_url_secret_id             = "mira-p3e-sbx-canary-database-url"
  database_url_secret_version        = "1"
  eximbay_api_key_secret_id          = "mira-p3e-sbx-eximbay-api-key"
  eximbay_api_key_secret_version     = "1"
  eximbay_mid                        = "MIRA-SBX"
  merchant_account_binding_id        = "merchant-v1"
  credential_generation_binding_id   = "credential-v1"
  release_binding_digest             = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  canary_job_binding_digest          = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  preflight_job_binding_digest       = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  image_binding_digest               = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  secret_generation_binding_digest   = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  target_binding_digest              = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  synthetic_provenance_digest        = "1111111111111111111111111111111111111111111111111111111111111111"
}

run "admit_exact_dormant_canary_release" {
  command = plan

  assert {
    condition = (
      output.status == "DORMANT_EXIMBAY_SANDBOX_CANARY_RELEASE_CAPABLE_NOT_APPLIED" &&
      output.runtime_root_apply_policy == "EXPLICIT_DORMANT_EXIMBAY_SANDBOX_CANARY_RELEASE" &&
      output.runtime_manifest.resource_count == 5 &&
      output.runtime_manifest.provider_contact_authorized == false
    )
    error_message = "Only exact dormant Eximbay SANDBOX materialization may be admitted."
  }

  assert {
    condition = (
      google_service_account.canary.account_id == "mira-eximbay-canary" &&
      google_project_iam_member.cloud_sql_client.role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_client.condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      google_secret_manager_secret_iam_member.database_url.secret_id == "mira-p3e-sbx-canary-database-url" &&
      google_secret_manager_secret_iam_member.eximbay_api_key.secret_id == "mira-p3e-sbx-eximbay-api-key" &&
      google_cloud_run_v2_job.canary.deletion_protection == false &&
      google_cloud_run_v2_job.canary.template[0].task_count == 1 &&
      google_cloud_run_v2_job.canary.template[0].parallelism == 1 &&
      google_cloud_run_v2_job.canary.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.canary.template[0].template[0].timeout == "150s" &&
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].args == tolist(["eximbay-canary-once"]) &&
      [for env in google_cloud_run_v2_job.canary.template[0].template[0].containers[0].env : env if env.name == "DATABASE_URL"][0].value_source[0].secret_key_ref[0].version == "1" &&
      google_cloud_run_v2_job.canary.template[0].template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY" &&
      google_cloud_run_v2_job.canary.template[0].template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"])
    )
    error_message = "The canary identity, IAM, secrets, network, and Job must remain exact."
  }
}

run "reject_provider_contact_authority" {
  command = plan
  variables {
    release_authority = merge(var.release_authority, { provider_contact_authorized = true })
  }
  expect_failures = [var.release_authority]
}

run "reject_latest_provider_secret" {
  command = plan
  variables {
    eximbay_api_key_secret_version = "latest"
  }
  expect_failures = [var.eximbay_api_key_secret_version]
}

run "reject_wrong_network" {
  command = plan
  variables {
    network_resource_name = "projects/mira-refund-sandbox-0001/global/networks/other"
  }
  expect_failures = [var.network_resource_name]
}
