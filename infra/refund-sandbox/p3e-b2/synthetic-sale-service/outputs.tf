output "status" {
  value = "TEMPORARY_SYNTHETIC_SALE_SERVICE_CAPABLE_NOT_APPLIED"
}

output "backend_contract" {
  value = {
    type                               = local.backend_type_contract
    bucket                             = local.backend_bucket_contract
    prefix                             = local.backend_prefix_contract
    impersonate_service_account        = local.backend_state_runner_contract
    authentication                     = local.backend_authentication_contract
    persistent_local_state             = local.backend_persistent_local_state_policy
    workspace_multiplexing             = local.backend_workspace_multiplexing_policy
    normal_release_migration_or_import = local.backend_normal_migration_import_policy
    expected_initial_resource_count    = local.backend_expected_initial_resources
  }
}

output "resource_manifest" {
  value = {
    resource_count                        = 6
    region                                = local.region
    service_name                          = local.service_name
    mandatory_retire_before_phase_b       = true
    provider_contact_execution_authorized = false
  }
}

output "image_authority" {
  value = {
    policy_path        = local.current_image_policy_path
    policy_version     = local.current_image_policy_version
    policy_sha256      = local.current_image_policy_sha256
    source_commit      = local.current_source_commit
    source_tree        = local.current_source_tree
    context_sha256     = local.current_context_manifest_sha256
    manifest_digest    = local.current_manifest_digest
    manifest_raw_bytes = local.current_manifest_raw_byte_length
    config_digest      = local.current_config_digest
    release_image      = local.current_release_image_digest_uri
    status_readback    = "EXACT_PROVIDER_FREE_REFUND_TARGET"
    arbitrary_db_query = false
    business_mutations = 0
    provider_calls     = 0
  }
}
