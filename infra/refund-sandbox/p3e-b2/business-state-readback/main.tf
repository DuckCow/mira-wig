resource "google_service_account" "readback" {
  for_each = local.runtime_instances

  project      = local.project_id
  account_id   = local.service_account_id
  display_name = "CONTACTED reconciliation business-state readback"
  description  = "Temporary exact-target, provider-free, read-only diagnostic identity."
  disabled     = false
}

resource "google_project_iam_member" "cloud_sql_client" {
  for_each = local.runtime_instances

  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.readback[each.key].email}"

  condition {
    title       = "refund-business-readback-client-single-instance"
    description = "Restrict Cloud SQL Client to the exact refund sandbox instance."
    expression  = local.cloud_sql_condition_expression
  }
}

resource "google_project_iam_member" "cloud_sql_instance_user" {
  for_each = local.runtime_instances

  project = local.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.readback[each.key].email}"

  condition {
    title       = "refund-business-readback-login-single-instance"
    description = "Restrict Cloud SQL IAM database login to the exact refund sandbox instance."
    expression  = local.cloud_sql_condition_expression
  }
}

resource "google_sql_user" "readback" {
  for_each = local.runtime_instances

  project         = local.project_id
  instance        = local.cloud_sql_instance_name
  name            = local.iam_database_username
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "DELETE"

  depends_on = [google_project_iam_member.cloud_sql_instance_user]
}

resource "google_cloud_run_v2_job" "readback" {
  for_each = local.historical_runtime_instances

  project             = local.project_id
  location            = local.region
  name                = local.job_name
  deletion_protection = false

  template {
    task_count  = local.task_count
    parallelism = local.parallelism

    template {
      service_account       = google_service_account.readback[each.key].email
      timeout               = "${local.task_timeout_seconds}s"
      max_retries           = local.max_retries
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "business-state-readback"
        image = local.bootstrap_image_digest_uri
        args  = [local.command]

        resources {
          limits = {
            cpu    = local.cpu
            memory = local.memory
          }
        }

        dynamic "env" {
          for_each = local.fixed_environment
          content {
            name  = env.key
            value = env.value
          }
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = local.network_resource_name
          subnetwork = local.subnetwork_resource_name
          tags       = local.network_tags
        }
      }
    }
  }

  depends_on = [
    google_project_iam_member.cloud_sql_client,
    google_project_iam_member.cloud_sql_instance_user,
    google_sql_user.readback,
  ]
}

resource "google_cloud_run_v2_job" "refund_readiness" {
  for_each = local.readiness_runtime_instances

  project             = local.project_id
  location            = local.region
  name                = local.readiness_job_name
  deletion_protection = false

  template {
    task_count  = local.task_count
    parallelism = local.parallelism

    template {
      service_account       = google_service_account.readback[each.key].email
      timeout               = "${local.task_timeout_seconds}s"
      max_retries           = local.max_retries
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "refund-readiness-readback"
        image = local.readiness_contract.runtime.imageDigestUri
        args  = [local.readiness_command]

        resources {
          limits = {
            cpu    = local.cpu
            memory = local.memory
          }
        }

        dynamic "env" {
          for_each = local.readiness_fixed_environment
          content {
            name  = env.key
            value = env.value
          }
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = local.network_resource_name
          subnetwork = local.subnetwork_resource_name
          tags       = local.network_tags
        }
      }
    }
  }

  depends_on = [
    google_project_iam_member.cloud_sql_client,
    google_project_iam_member.cloud_sql_instance_user,
    google_sql_user.readback,
  ]
}
