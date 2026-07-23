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

run "one_time_bucket_authority_shape" {
  command = plan

  assert {
    condition     = output.bucket_location == "asia-northeast3"
    error_message = "State location drifted."
  }

  assert {
    condition     = output.status == "ONE_TIME_LOCAL_BOOTSTRAP_ONLY"
    error_message = "Local bootstrap status drifted."
  }
}
