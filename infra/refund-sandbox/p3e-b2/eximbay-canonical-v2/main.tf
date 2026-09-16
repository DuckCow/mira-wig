resource "google_service_account" "canary" {
  project      = var.project_id
  account_id   = local.service_account_id
  display_name = "Dormant Eximbay refund sandbox canary"

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.canary.email}"
  condition {
    title      = "exact-refund-cloud-sql-instance"
    expression = "resource.name == 'projects/${var.project_id}/instances/${element(split(":", var.cloud_sql_instance_connection_name), 2)}'"
  }
  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_secret_manager_secret_iam_member" "database_url" {
  project   = var.project_id
  secret_id = var.database_url_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.canary.email}"
  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_secret_manager_secret_iam_member" "eximbay_api_key" {
  project   = var.project_id
  secret_id = var.eximbay_api_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.canary.email}"
  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_cloud_run_v2_job" "canary" {
  project             = var.project_id
  location            = local.region
  name                = local.job_name
  deletion_protection = true

  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account       = google_service_account.canary.email
      timeout               = "300s"
      max_retries           = 0
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      containers {
        image = var.release_image_digest_uri
        args  = ["eximbay-canary-once"]
        dynamic "env" {
          for_each = merge(local.required_activation, local.authority_environment)
          content {
            name  = env.key
            value = env.value
          }
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = var.database_url_secret_id
              version = var.database_url_secret_version
            }
          }
        }
      }
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.network_resource_name
          subnetwork = var.subnetwork_resource_name
          tags       = ["refund-sandbox"]
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}
