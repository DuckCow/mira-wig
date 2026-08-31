check "temporary_lifecycle" {
  assert {
    condition = (
      google_cloud_run_v2_service.sale.deletion_protection == false &&
      google_cloud_run_v2_service_iam_member.public_invoker.member == "allUsers"
    )
    error_message = "The Service must remain explicitly temporary and publicly callback-capable."
  }
}

check "backend_authority" {
  assert {
    condition = (
      local.backend_type_contract == "gcs" &&
      local.backend_bucket_contract == "mira-refund-sandbox-0001-tfstate-925882331349" &&
      local.backend_prefix_contract == "p3e-b2/synthetic-sale-service" &&
      local.backend_state_runner_contract == "mira-refund-state-runner@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      local.backend_authentication_contract == "IMPERSONATE_EXACT_STATE_RUNNER_ONLY" &&
      local.backend_persistent_local_state_policy == "FORBIDDEN" &&
      local.backend_workspace_multiplexing_policy == "FORBIDDEN" &&
      local.backend_normal_migration_import_policy == "NOT_PART_OF_NORMAL_RELEASE" &&
      local.backend_expected_initial_resources == 0
    )
    error_message = "Synthetic-sale remote-state authority must remain exact and isolated."
  }
}
