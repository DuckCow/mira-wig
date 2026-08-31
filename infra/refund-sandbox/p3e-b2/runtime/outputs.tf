output "status" {
  description = "Non-authorizing repository definition status."
  value       = "PREFLIGHT_RUNTIME_RELEASE_AUTHORIZED_NOT_YET_APPLIED"
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
    preflight_job_name       = google_cloud_run_v2_job.preflight.name
    release_image_digest     = local.release_image_digest_uri
    runtime_apply_authorized = local.runtime_apply_authorized
    canary_materialized      = false
    canary_executable        = false
    cloud_authentication     = "NOT_PERFORMED"
  }
}
