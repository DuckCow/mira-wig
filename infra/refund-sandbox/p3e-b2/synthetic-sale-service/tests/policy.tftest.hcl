mock_provider "google" {}

variables {
  release_authority = {
    human_authorized                      = true
    release_scope                         = "TEMPORARY_SYNTHETIC_EXIMBAY_SALE_SERVICE_MATERIALIZATION"
    provider_contact_execution_authorized = false
  }
  project_id               = "mira-refund-sandbox-0001"
  release_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  public_origin            = "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app"
  run_capability           = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}

run "exact_temporary_service_graph" {
  command = plan
  assert {
    condition = (
      output.backend_contract.type == "gcs" &&
      output.backend_contract.bucket == "mira-refund-sandbox-0001-tfstate-925882331349" &&
      output.backend_contract.prefix == "p3e-b2/synthetic-sale-service" &&
      output.backend_contract.impersonate_service_account == "mira-refund-state-runner@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      output.backend_contract.authentication == "IMPERSONATE_EXACT_STATE_RUNNER_ONLY" &&
      output.backend_contract.persistent_local_state == "FORBIDDEN" &&
      output.backend_contract.workspace_multiplexing == "FORBIDDEN" &&
      output.backend_contract.normal_release_migration_or_import == "NOT_PART_OF_NORMAL_RELEASE" &&
      output.backend_contract.expected_initial_resource_count == 0 &&
      output.resource_manifest.resource_count == 6 &&
      google_project_iam_member.cloud_sql_client.role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_client.condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      google_secret_manager_secret_iam_member.database_url.secret_id == "mira-p3e-sbx-canary-database-url" &&
      google_secret_manager_secret_iam_member.eximbay_api_key.secret_id == "mira-p3e-sbx-eximbay-api-key" &&
      google_cloud_run_v2_service.sale.template[0].max_instance_request_concurrency == 1 &&
      google_cloud_run_v2_service.sale.template[0].scaling[0].max_instance_count == 1 &&
      google_cloud_run_v2_service.sale.template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY" &&
      google_cloud_run_v2_service.sale.template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"]) &&
      google_cloud_run_v2_service_iam_member.public_invoker.member == "allUsers"
    )
    error_message = "Synthetic-sale graph or authority widened."
  }
}

run "reject_execution_authority" {
  command = plan
  variables {
    release_authority = merge(var.release_authority, { provider_contact_execution_authorized = true })
  }
  expect_failures = [var.release_authority]
}

run "reject_latest_image" {
  command = plan
  variables { release_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale:latest" }
  expect_failures = [var.release_image_digest_uri]
}
