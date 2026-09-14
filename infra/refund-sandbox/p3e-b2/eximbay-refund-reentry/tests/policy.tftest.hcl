mock_provider "google" {}

variables {
  release_authority = {
    human_authorized            = true
    release_scope               = "DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_MATERIALIZATION"
    provider_contact_authorized = false
  }
  project_id                         = "mira-refund-sandbox-0001"
  cloud_sql_instance_connection_name = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
  network_resource_name              = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
  subnetwork_resource_name           = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
  database_url_secret_id             = "mira-p3e-sbx-canary-database-url"
  database_url_secret_version        = "1"
  eximbay_api_key_secret_id          = "mira-p3e-sbx-eximbay-api-key"
  eximbay_api_key_secret_version     = "1"
}

run "admit_exact_dormant_refund_reentry_successor" {
  command = plan

  assert {
    condition = (
      output.status == "DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_RELEASE_CAPABLE_NOT_APPLIED" &&
      output.runtime_manifest.contract_version == "mira-refund-p3e-b2-eximbay-canary-runtime/v4" &&
      output.runtime_manifest.resource_count == 5 &&
      output.runtime_manifest.new_resource_count == 0 &&
      output.runtime_manifest.provider_contact_authorized == false &&
      output.runtime_manifest.automatic_trigger == false &&
      output.runtime_manifest.command == "eximbay-refund-reentry-once" &&
      output.runtime_manifest.max_retries == 0 &&
      output.runtime_manifest.predecessor_lease_generation == 1 &&
      output.runtime_manifest.future_takeover_generation == 2 &&
      output.runtime_manifest.historical_approval_mutation == "FORBIDDEN" &&
      output.runtime_manifest.execution_on_apply == false
    )
    error_message = "Only the exact dormant, non-executing refund re-entry successor may be admitted."
  }

  assert {
    condition = (
      google_service_account.canary.account_id == "mira-eximbay-canary" &&
      google_cloud_run_v2_job.canary.name == "mira-eximbay-refund-canary" &&
      google_cloud_run_v2_job.canary.template[0].task_count == 1 &&
      google_cloud_run_v2_job.canary.template[0].parallelism == 1 &&
      google_cloud_run_v2_job.canary.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.canary.template[0].template[0].timeout == "180s" &&
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].image == output.runtime_manifest.image_digest_uri &&
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].args == tolist(["eximbay-refund-reentry-once"]) &&
      google_cloud_run_v2_job.canary.template[0].template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY"
    )
    error_message = "The existing five-resource identity and exact successor image/command must remain fixed."
  }
}

run "admit_authorization_ready_worker_template" {
  command = plan
  variables {
    authorization_installation = true
  }

  assert {
    condition = (
      google_cloud_run_v2_job.canary.name == "mira-eximbay-refund-canary" &&
      google_cloud_run_v2_job.canary.template[0].task_count == 1 &&
      google_cloud_run_v2_job.canary.template[0].parallelism == 1 &&
      google_cloud_run_v2_job.canary.template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.canary.template[0].template[0].timeout == "180s" &&
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].image == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:e39658c510ac8a8b6b17e719141925e20a98466b82107501715f36b0bc45d8c4" &&
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].args == tolist(["eximbay-refund-reentry-once"]) &&
      one([for env in google_cloud_run_v2_job.canary.template[0].template[0].containers[0].env : env.value if env.name == "MIRA_REFUND_AUTHORIZATION_ENABLED"]) == "ENABLED" &&
      length([for env in google_cloud_run_v2_job.canary.template[0].template[0].containers[0].env : env if env.name == "MIRA_REFUND_AUTHORIZATION_ID"]) == 0
    )
    error_message = "The authorization-ready worker must enable its gate while retaining a grant-free template."
  }
}

run "reject_provider_contact_authority" {
  command = plan
  variables {
    release_authority = merge(var.release_authority, { provider_contact_authorized = true })
  }
  expect_failures = [var.release_authority]
}

run "reject_old_canary_scope" {
  command = plan
  variables {
    release_authority = merge(var.release_authority, {
      release_scope = "DORMANT_EXIMBAY_SANDBOX_CANARY_MATERIALIZATION"
    })
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
