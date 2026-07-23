output "provider_free_repository_status" {
  description = "Static B1 status. This output is not cloud execution or approval evidence."
  value       = "P3E_B1_PROVIDER_FREE_DEFINITIONS_ONLY"
}

output "preflight_job_name" {
  description = "Future provider-free job name; no execution authority is granted."
  value       = google_cloud_run_v2_job.preflight.name
}

output "dormant_canary_job_name" {
  description = "Future dormant job name; master and every route remain disabled."
  value       = google_cloud_run_v2_job.canary.name
}
