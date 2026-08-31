output "status" {
  value = "DORMANT_EXIMBAY_SANDBOX_CANARY_RELEASE_CAPABLE_NOT_APPLIED"
}

output "runtime_root_apply_policy" {
  value = local.runtime_root_apply_policy
}

output "backend_contract" {
  value = {
    bucket = local.backend_bucket_contract
    prefix = local.backend_prefix_contract
  }
}

output "runtime_manifest" {
  value = {
    resource_count              = 5
    provider_contact_authorized = false
    automatic_trigger           = false
    database_secret_version     = var.database_url_secret_version
    provider_secret_version     = var.eximbay_api_key_secret_version
  }
}
