resource "google_service_account" "reconciliation" {
  for_each = local.runtime_instances

  project      = local.project_id
  account_id   = local.service_account_id
  display_name = "Eximbay CONTACTED reconciliation"
  description  = "Purpose-specific one-shot Eximbay CONTACTED reconciliation Job identity."
  disabled     = false
}

resource "google_project_iam_member" "cloud_sql_client" {
  for_each = local.runtime_instances

  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.reconciliation[each.key].email}"

  condition {
    title       = "refund-contacted-reconciliation-single-instance"
    description = "Restrict Cloud SQL Client to the exact refund sandbox instance."
    expression  = local.cloud_sql_condition_expression
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_secret_access" {
  for_each = local.runtime_secret_access

  project   = local.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.reconciliation["runtime"].email}"
}

resource "google_cloud_run_v2_job" "reconciliation" {
  for_each = local.runtime_instances

  project             = local.project_id
  location            = local.region
  name                = local.job_name
  deletion_protection = false

  template {
    task_count  = local.task_count
    parallelism = local.parallelism

    template {
      service_account       = google_service_account.reconciliation[each.key].email
      timeout               = local.task_timeout
      max_retries           = local.max_retries
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "refund-worker"
        image = local.worker_image_digest_uri
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

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = local.database_url_secret_id
              version = local.database_url_secret_version
            }
          }
        }
      }

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"

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
    google_secret_manager_secret_iam_member.runtime_secret_access,
  ]
}
