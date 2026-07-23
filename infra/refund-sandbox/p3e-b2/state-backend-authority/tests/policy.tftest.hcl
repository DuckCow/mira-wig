mock_provider "google" {}

variables {
  project_id  = "example-refund-sbx"
  bucket_name = "example-refund-sbx-tfstate-replace-unique"
  location    = "asia-northeast3"

  state_runner_members                    = ["serviceAccount:state-runner@example.invalid"]
  state_administrator_members             = ["group:state-admins@example.invalid"]
  break_glass_state_administrator_members = []

  recovery_configuration = {
    versioning_enabled         = true
    soft_delete_enabled        = false
    automatic_deletion_enabled = false
    retention_policy_enabled   = false
  }
}

run "remote_bucket_authority_shape" {
  command = plan

  override_resource {
    target = module.state_bucket.google_storage_bucket.state
    values = {
      name                        = "example-refund-sbx-tfstate-replace-unique"
      location                    = "asia-northeast3"
      storage_class               = "STANDARD"
      uniform_bucket_level_access = true
      public_access_prevention    = "enforced"
      versioning = [{
        enabled = true
      }]
    }
  }

  override_resource {
    target = module.state_bucket.google_storage_bucket_iam_member.state_runner["serviceAccount:state-runner@example.invalid"]
    values = {
      bucket = "example-refund-sbx-tfstate-replace-unique"
      role   = "roles/storage.objectAdmin"
      member = "serviceAccount:state-runner@example.invalid"
    }
  }

  override_resource {
    target = module.state_bucket.google_storage_bucket_iam_member.state_administrator["group:state-admins@example.invalid"]
    values = {
      bucket = "example-refund-sbx-tfstate-replace-unique"
      role   = "roles/storage.admin"
      member = "group:state-admins@example.invalid"
    }
  }

  assert {
    condition     = output.bucket_location == "asia-northeast3"
    error_message = "Remote authority location drifted."
  }

  assert {
    condition     = output.status == "STATE_BACKEND_AUTHORITY_DEFINED_NOT_PROVISIONED"
    error_message = "Remote authority status drifted."
  }
}
