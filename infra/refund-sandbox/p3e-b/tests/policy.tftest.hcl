mock_provider "google" {}

variables {
  project_id                        = "example-refund-sbx"
  project_number                    = "123456789012"
  resource_prefix                   = "mira-p3e-sbx"
  container_image_digest_uri        = "asia-northeast3-docker.pkg.dev/example-refund-sbx/mira-p3e-sbx-refund-images/refund-worker@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  database_major_version            = 18
  database_tier                     = "db-custom-1-3840"
  preflight_database_secret_version = 1
  canary_database_secret_version    = 1
}

run "provider_free_shape" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_job.preflight.location == "asia-northeast3"
    error_message = "Preflight region drifted."
  }

  assert {
    condition     = google_cloud_run_v2_job.preflight.name != google_cloud_run_v2_job.canary.name
    error_message = "Jobs must remain distinct."
  }

  assert {
    condition     = google_cloud_run_v2_job.preflight.template[0].task_count == 1 && google_cloud_run_v2_job.canary.template[0].task_count == 1
    error_message = "Each job must have one task."
  }

  assert {
    condition     = google_cloud_run_v2_job.preflight.template[0].parallelism == 1 && google_cloud_run_v2_job.canary.template[0].parallelism == 1
    error_message = "Each job must have parallelism one."
  }

  assert {
    condition     = google_cloud_run_v2_job.preflight.template[0].template[0].max_retries == 0 && google_cloud_run_v2_job.canary.template[0].template[0].max_retries == 0
    error_message = "Retries must remain zero."
  }

  assert {
    condition     = google_cloud_run_v2_job.preflight.template[0].template[0].timeout == "150s" && google_cloud_run_v2_job.canary.template[0].template[0].timeout == "150s"
    error_message = "Task timeouts must remain 150 seconds."
  }

  assert {
    condition     = google_sql_database_instance.refund.settings[0].ip_configuration[0].ipv4_enabled == false
    error_message = "Cloud SQL public IPv4 must remain disabled."
  }
}

run "reject_mutable_image" {
  command = plan

  variables {
    container_image_digest_uri = "asia-northeast3-docker.pkg.dev/example-refund-sbx/repository/refund-worker:latest"
  }

  expect_failures = [var.container_image_digest_uri]
}

run "reject_wrong_region_image" {
  command = plan

  variables {
    container_image_digest_uri = "us-central1-docker.pkg.dev/example-refund-sbx/repository/refund-worker@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  }

  expect_failures = [var.container_image_digest_uri]
}

run "reject_noninteger_secret_version" {
  command = plan

  variables {
    preflight_database_secret_version = 1.5
  }

  expect_failures = [var.preflight_database_secret_version]
}

run "reject_zero_secret_version" {
  command = plan

  variables {
    canary_database_secret_version = 0
  }

  expect_failures = [var.canary_database_secret_version]
}

run "reject_production_prefix" {
  command = plan

  variables {
    resource_prefix = "mira-production"
  }

  expect_failures = [var.resource_prefix]
}

run "reject_empty_project" {
  command = plan

  variables {
    project_id = ""
  }

  expect_failures = [var.project_id]
}

run "reject_production_project" {
  command = plan

  variables {
    project_id = "mira-production"
  }

  expect_failures = [var.project_id]
}

run "reject_noncanonical_project_number" {
  command = plan

  variables {
    project_number = "012345"
  }

  expect_failures = [var.project_number]
}

run "reject_short_prefix" {
  command = plan

  variables {
    resource_prefix = "ab"
  }

  expect_failures = [var.resource_prefix]
}

run "reject_uppercase_digest" {
  command = plan

  variables {
    container_image_digest_uri = "asia-northeast3-docker.pkg.dev/example-refund-sbx/repository/refund-worker@sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  }

  expect_failures = [var.container_image_digest_uri]
}

run "reject_database_major_drift" {
  command = plan

  variables {
    database_major_version = 17
  }

  expect_failures = [var.database_major_version]
}

run "reject_unreviewed_database_tier" {
  command = plan

  variables {
    database_tier = "db-custom-8-30720"
  }

  expect_failures = [var.database_tier]
}

run "reject_negative_preflight_secret_version" {
  command = plan

  variables {
    preflight_database_secret_version = -1
  }

  expect_failures = [var.preflight_database_secret_version]
}

run "reject_fractional_canary_secret_version" {
  command = plan

  variables {
    canary_database_secret_version = 1.5
  }

  expect_failures = [var.canary_database_secret_version]
}

run "reject_enabled_alert_delivery" {
  command = plan

  variables {
    alert_policies_enabled = true
  }

  expect_failures = [var.alert_policies_enabled]
}

run "reject_notification_channel" {
  command = plan

  variables {
    notification_channel_names = ["projects/example-refund-sbx/notificationChannels/1"]
  }

  expect_failures = [var.notification_channel_names]
}

run "reject_executor_member" {
  command = plan

  variables {
    future_preflight_invoker_members = ["allUsers"]
  }

  expect_failures = [var.future_preflight_invoker_members]
}

run "reject_even_exact_preflight_invoker_in_b1" {
  command = plan

  variables {
    future_preflight_invoker_members = ["serviceAccount:future-preflight@example-refund-sbx.iam.gserviceaccount.com"]
  }

  expect_failures = [check.no_preflight_invoker_in_b1]
}
