output "status" {
  description = "Non-authorizing repository definition status."
  value       = "RUNTIME_JOB_DEFINITIONS_DEFINED_DORMANT_NOT_PROVISIONED"
}

output "runtime_root_apply_policy" {
  description = "Production enforcement policy; no caller input can change this value."
  value       = local.runtime_root_apply_policy
}

output "runtime_manifest" {
  description = "Bounded nonsecret future review manifest; not trusted cloud evidence."
  value = {
    contract_version         = local.authority_contract.contractVersion
    resource_graph_sha256    = local.authority_contract.resourceGraph.sortedAddressSha256
    state_prefix             = "p3e-b2/runtime"
    preflight_identity       = google_service_account.preflight.email
    dormant_canary_identity  = google_service_account.dormant_canary.email
    preflight_job_name       = google_cloud_run_v2_job.preflight.name
    dormant_canary_job_name  = google_cloud_run_v2_job.dormant_canary.name
    release_image_digest     = "ABSENT_IN_CURRENT_REAL_CLOUD"
    runtime_apply_authorized = local.runtime_apply_authorized
    canary_executable        = false
    cloud_authentication     = "NOT_PERFORMED"
  }
}
