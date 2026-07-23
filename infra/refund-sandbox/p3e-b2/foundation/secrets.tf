resource "google_secret_manager_secret" "preflight_database_url" {
  project   = local.project_id
  secret_id = local.names.preflight_db_secret

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_secret_manager_secret" "canary_database_url" {
  project   = local.project_id
  secret_id = local.names.canary_db_secret

  replication {
    auto {}
  }

  lifecycle {
    prevent_destroy = true
  }
}
