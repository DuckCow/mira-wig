resource "google_storage_bucket" "state" {
  project                     = var.project_id
  name                        = var.bucket_name
  location                    = var.location
  storage_class               = "STANDARD"
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = var.recovery_configuration.versioning_enabled
  }

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "state_runner" {
  for_each = toset(var.state_runner_members)

  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = each.value
}

resource "google_storage_bucket_iam_member" "state_administrator" {
  for_each = toset(var.state_administrator_members)

  bucket = google_storage_bucket.state.name
  role   = "roles/storage.admin"
  member = each.value
}

resource "google_storage_bucket_iam_member" "break_glass_state_administrator" {
  for_each = toset(var.break_glass_state_administrator_members)

  bucket = google_storage_bucket.state.name
  role   = "roles/storage.admin"
  member = each.value
}
