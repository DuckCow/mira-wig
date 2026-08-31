resource "google_service_account" "sale" {
  project      = var.project_id
  account_id   = local.service_account_id
  display_name = "Temporary synthetic Eximbay SALE"
  lifecycle {
    precondition {
      condition     = local.release_admitted
      error_message = "SYNTHETIC_SALE_RELEASE_AUTHORITY_MISSING"
    }
  }
}

resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.sale.email}"
  condition {
    title      = "exact-synthetic-sale-cloud-sql-instance"
    expression = local.cloud_sql_condition_expression
  }
}

resource "google_secret_manager_secret_iam_member" "database_url" {
  project   = var.project_id
  secret_id = var.database_url_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sale.email}"
}

resource "google_secret_manager_secret_iam_member" "eximbay_api_key" {
  project   = var.project_id
  secret_id = var.eximbay_api_key_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sale.email}"
}

resource "google_cloud_run_v2_service" "sale" {
  project             = var.project_id
  location            = local.region
  name                = local.service_name
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account                  = google_service_account.sale.email
    timeout                          = "300s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.release_image_digest_uri
      ports { container_port = 8080 }
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
            secret  = var.database_url_secret_id
            version = "1"
          }
        }
      }
      env {
        name = "EXIMBAY_SANDBOX_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.eximbay_api_key_secret_id
            version = "1"
          }
        }
      }
      startup_probe {
        failure_threshold     = 24
        initial_delay_seconds = 0
        period_seconds        = 5
        timeout_seconds       = 5
        tcp_socket { port = 8080 }
      }
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = var.network_resource_name
        subnetwork = var.subnetwork_resource_name
        tags       = ["refund-provider-free"]
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = local.region
  name     = google_cloud_run_v2_service.sale.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
