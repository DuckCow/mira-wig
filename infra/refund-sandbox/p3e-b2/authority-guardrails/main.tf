resource "google_iam_deny_policy" "cloud_run_job_execution" {
  parent       = "cloudresourcemanager.googleapis.com/projects/${var.project_number}"
  name         = var.policy_id
  display_name = var.policy_display_name

  rules {
    deny_rule {
      denied_principals     = var.denied_principals
      denied_permissions    = var.denied_permissions
      exception_principals  = var.exception_principals
      exception_permissions = var.exception_permissions
    }
  }

  deletion_policy = "PREVENT"
}
