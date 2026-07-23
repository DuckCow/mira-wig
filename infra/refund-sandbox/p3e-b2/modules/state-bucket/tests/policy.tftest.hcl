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

run "shared_bucket_contract" {
  command = plan

  assert {
    condition = (
      google_storage_bucket.state.location == "asia-northeast3" &&
      google_storage_bucket.state.storage_class == "STANDARD" &&
      google_storage_bucket.state.uniform_bucket_level_access &&
      google_storage_bucket.state.public_access_prevention == "enforced" &&
      google_storage_bucket.state.versioning[0].enabled &&
      google_storage_bucket.state.soft_delete_policy[0].retention_duration_seconds == 0
    )
    error_message = "Shared state bucket protections drifted."
  }

  assert {
    condition = (
      google_storage_bucket_iam_member.state_runner["serviceAccount:state-runner@example.invalid"].role == "roles/storage.objectAdmin" &&
      google_storage_bucket_iam_member.state_administrator["group:state-admins@example.invalid"].role == "roles/storage.admin"
    )
    error_message = "Bucket-scoped state IAM drifted."
  }
}

run "reject_alternate_region" {
  command = plan
  variables {
    location = "us-central1"
  }
  expect_failures = [var.location]
}

run "reject_production_like_project" {
  command = plan
  variables {
    project_id = "example-production"
  }
  expect_failures = [var.project_id]
}

run "reject_invalid_bucket" {
  command = plan
  variables {
    bucket_name = "Invalid_Bucket"
  }
  expect_failures = [var.bucket_name]
}

run "reject_public_member" {
  command = plan
  variables {
    state_runner_members = ["allUsers"]
  }
  expect_failures = [var.state_runner_members]
}

run "reject_wildcard_member" {
  command = plan
  variables {
    state_runner_members = ["serviceAccount:*@example.invalid"]
  }
  expect_failures = [var.state_runner_members]
}

run "reject_empty_runner_authority" {
  command = plan
  variables {
    state_runner_members = []
  }
  expect_failures = [var.state_runner_members]
}

run "reject_empty_administrator_authority" {
  command = plan
  variables {
    state_administrator_members = []
  }
  expect_failures = [var.state_administrator_members]
}

run "reject_inferred_overlapping_authority" {
  command = plan
  variables {
    state_administrator_members = ["serviceAccount:state-runner@example.invalid"]
  }
  expect_failures = [check.state_authorities_are_pairwise_distinct]
}

run "reject_default_compute_identity" {
  command = plan
  variables {
    state_runner_members = ["serviceAccount:123456789012-compute@developer.gserviceaccount.com"]
  }
  expect_failures = [var.state_runner_members]
}

run "reject_unreviewed_soft_delete" {
  command = plan
  variables {
    recovery_configuration = {
      versioning_enabled         = true
      soft_delete_enabled        = true
      automatic_deletion_enabled = false
      retention_policy_enabled   = false
    }
  }
  expect_failures = [var.recovery_configuration]
}
