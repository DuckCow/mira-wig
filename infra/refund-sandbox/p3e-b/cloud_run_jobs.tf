resource "google_cloud_run_v2_job" "preflight" {
  project  = var.project_id
  name     = local.names.preflight_job
  location = local.region

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.preflight.email
      max_retries     = 0
      timeout         = "150s"

      containers {
        image   = var.container_image_digest_uri
        command = ["node"]
        args = [
          "--import",
          "tsx",
          "scripts/refund-sandbox-provider-free-preflight.ts",
        ]

        env {
          name  = "MIRA_REFUND_P3E_PREFLIGHT_MODE"
          value = "P3E_PROVIDER_FREE_PREFLIGHT"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.preflight_database_url.secret_id
              version = tostring(var.preflight_database_secret_version)
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.refund.connection_name]
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = google_compute_network.refund.id
          subnetwork = google_compute_subnetwork.refund.id
          tags       = ["refund-provider-free"]
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_job" "canary" {
  project  = var.project_id
  name     = local.names.canary_job
  location = local.region

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.canary.email
      max_retries     = 0
      timeout         = "150s"

      containers {
        image   = var.container_image_digest_uri
        command = ["node"]
        args = [
          "--import",
          "tsx",
          "scripts/refund-execution-worker.ts",
          "run-once",
          "--service",
          "refund-sandbox-canary",
          "--revision",
          "p3e-b-dormant",
          "--slot",
          "disabled",
        ]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.canary_database_url.secret_id
              version = tostring(var.canary_database_secret_version)
            }
          }
        }

        dynamic "env" {
          for_each = local.disabled_activation_environment
          content {
            name  = env.key
            value = env.value
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.refund.connection_name]
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = google_compute_network.refund.id
          subnetwork = google_compute_subnetwork.refund.id
          tags       = ["refund-provider-free"]
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}
