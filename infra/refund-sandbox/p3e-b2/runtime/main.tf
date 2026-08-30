resource "google_service_account" "preflight" {
  project      = local.project_id
  account_id   = local.preflight_service_account_id
  display_name = "Refund sandbox preflight runtime"
  description  = "Provider-free dormant preflight Cloud Run Job identity."
  disabled     = false

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }

    precondition {
      condition     = local.foundation_handoff_valid
      error_message = "The exact applied-and-reviewed foundation handoff is required before runtime admission."
    }

    precondition {
      condition     = local.release_image_handoff_valid
      error_message = "A separately reviewed immutable release image digest is required before runtime admission."
    }

    precondition {
      condition     = local.preflight_database_secret_version_reference_valid
      error_message = "The exact existing preflight database secret version reference is required before runtime admission."
    }

    precondition {
      condition     = local.canary_database_secret_version_reference_valid
      error_message = "The exact existing canary database secret version reference is required before runtime admission."
    }
  }
}

resource "google_service_account" "dormant_canary" {
  project      = local.project_id
  account_id   = local.canary_service_account_id
  display_name = "Refund sandbox dormant canary runtime"
  description  = "Provider-free dormant canary Cloud Run Job identity."
  disabled     = false

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }

    precondition {
      condition     = local.foundation_handoff_valid
      error_message = "The exact applied-and-reviewed foundation handoff is required before runtime admission."
    }

    precondition {
      condition     = local.release_image_handoff_valid
      error_message = "A separately reviewed immutable release image digest is required before runtime admission."
    }

    precondition {
      condition     = local.preflight_database_secret_version_reference_valid
      error_message = "The exact existing preflight database secret version reference is required before runtime admission."
    }

    precondition {
      condition     = local.canary_database_secret_version_reference_valid
      error_message = "The exact existing canary database secret version reference is required before runtime admission."
    }
  }
}

resource "google_project_iam_member" "cloud_sql_client" {
  for_each = local.runtime_identities

  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${each.value}"

  condition {
    title       = "refund-${each.key}-single-instance"
    description = "Restrict Cloud SQL Client to the exact admitted refund instance."
    expression  = local.cloud_sql_condition_expression
  }

  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_secret_manager_secret_iam_member" "preflight_database_access" {
  project   = local.project_id
  secret_id = local.foundation_preflight_database_secret_resource_name
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.preflight.email}"

  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_secret_manager_secret_iam_member" "canary_database_access" {
  project   = local.project_id
  secret_id = local.foundation_canary_database_secret_resource_name
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.dormant_canary.email}"

  lifecycle {
    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_cloud_run_v2_job" "preflight" {
  project             = local.project_id
  location            = local.region
  name                = local.preflight_job_name
  deletion_protection = true

  template {
    task_count  = local.task_count
    parallelism = local.parallelism

    template {
      service_account       = google_service_account.preflight.email
      timeout               = local.task_timeout
      max_retries           = local.max_retries
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "refund-worker"
        image = local.release_image_digest_uri
        args  = ["sandbox-preflight"]

        resources {
          limits = {
            cpu    = local.cpu
            memory = local.memory
          }
        }

        env {
          name  = "MIRA_REFUND_P3E_PREFLIGHT_MODE"
          value = "P3E_PROVIDER_FREE_PREFLIGHT"
        }

        env {
          name  = "REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME"
          value = local.foundation_cloud_sql_instance_connection_name
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = local.preflight_database_secret_version_resource_name
              version = local.preflight_database_secret_version
            }
          }
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = local.foundation_network_resource_name
          subnetwork = local.foundation_subnetwork_resource_name
          tags       = local.network_tags
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}

resource "google_cloud_run_v2_job" "dormant_canary" {
  project             = local.project_id
  location            = local.region
  name                = local.canary_job_name
  deletion_protection = true

  template {
    task_count  = local.task_count
    parallelism = local.parallelism

    template {
      service_account       = google_service_account.dormant_canary.email
      timeout               = local.task_timeout
      max_retries           = local.max_retries
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "refund-worker"
        image = local.release_image_digest_uri
        args  = ["worker-once"]

        resources {
          limits = {
            cpu    = local.cpu
            memory = local.memory
          }
        }

        env {
          name  = "REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME"
          value = local.foundation_cloud_sql_instance_connection_name
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = local.canary_database_secret_version_resource_name
              version = local.canary_database_secret_version
            }
          }
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = local.foundation_network_resource_name
          subnetwork = local.foundation_subnetwork_resource_name
          tags       = local.network_tags
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = local.runtime_apply_authorized
      error_message = "R2B1_RUNTIME_ROOT_UNCONDITIONALLY_BLOCKED"
    }
  }
}
