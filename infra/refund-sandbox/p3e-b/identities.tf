resource "google_service_account" "preflight" {
  project      = var.project_id
  account_id   = local.names.preflight_sa
  display_name = "Refund provider-free preflight runtime"
}

resource "google_service_account" "canary" {
  project      = var.project_id
  account_id   = local.names.canary_sa
  display_name = "Dormant refund sandbox canary runtime"
}

locals {
  runtime_project_roles = {
    preflight_cloud_sql = {
      member = "serviceAccount:${google_service_account.preflight.email}"
      role   = "roles/cloudsql.client"
    }
    preflight_logging = {
      member = "serviceAccount:${google_service_account.preflight.email}"
      role   = "roles/logging.logWriter"
    }
    canary_cloud_sql = {
      member = "serviceAccount:${google_service_account.canary.email}"
      role   = "roles/cloudsql.client"
    }
    canary_logging = {
      member = "serviceAccount:${google_service_account.canary.email}"
      role   = "roles/logging.logWriter"
    }
  }
}

resource "google_project_iam_member" "runtime" {
  for_each = local.runtime_project_roles

  project = var.project_id
  member  = each.value.member
  role    = each.value.role
}
