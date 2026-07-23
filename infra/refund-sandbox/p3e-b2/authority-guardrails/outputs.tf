output "status" {
  description = "Non-authorizing root status."
  value       = "JOB_EXECUTION_DENY_DEFINED_NOT_APPLIED"
}

output "policy_name" {
  description = "Nonsecret future evidence manifest field."
  value       = google_iam_deny_policy.cloud_run_job_execution.name
}
