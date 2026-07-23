resource "google_secret_manager_secret" "preflight_database_url" {
  project   = var.project_id
  secret_id = local.names.preflight_db_secret

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "canary_database_url" {
  project   = var.project_id
  secret_id = local.names.canary_db_secret

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret_iam_member" "preflight_database_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.preflight_database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.preflight.email}"
}

resource "google_secret_manager_secret_iam_member" "canary_database_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.canary_database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.canary.email}"
}
