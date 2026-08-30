resource "google_service_account" "bootstrap" {
  project      = var.project_id
  account_id   = local.service_account_id
  display_name = "Refund sandbox database bootstrap"
  description  = "Passwordless attended database bootstrap Job identity."
  disabled     = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_iam_member" "cloud_sql_access" {
  for_each = local.cloud_sql_roles

  project = var.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.bootstrap.email}"

  condition {
    title       = each.value.title
    description = "Restrict the bootstrap identity to the exact refund Cloud SQL instance."
    expression  = local.cloud_sql_condition
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_user" "bootstrap" {
  project         = var.project_id
  instance        = local.cloud_sql_instance_name
  name            = local.iam_database_username
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  database_roles  = ["cloudsqlsuperuser"]
  deletion_policy = "PREVENT"

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_iam_member.cloud_sql_access]
}

resource "google_secret_manager_secret_iam_member" "credential_materialization" {
  for_each = local.credential_secret_iam

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = each.value.role
  member    = "serviceAccount:${google_service_account.bootstrap.email}"
}

resource "google_cloud_run_v2_job" "bootstrap" {
  project             = var.project_id
  location            = local.region
  name                = local.job_name
  deletion_protection = true

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account       = google_service_account.bootstrap.email
      timeout               = "1800s"
      max_retries           = 0
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      containers {
        name  = "database-bootstrap"
        image = var.bootstrap_image_digest_uri
        args  = ["check"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        dynamic "env" {
          for_each = local.job_environment
          content {
            name  = env.key
            value = env.value
          }
        }
      }

      vpc_access {
        egress = "ALL_TRAFFIC"

        network_interfaces {
          network    = var.foundation_handoff.network_resource_name
          subnetwork = var.foundation_handoff.subnetwork_resource_name
          tags       = local.network_tags
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [
    google_project_iam_member.cloud_sql_access,
    google_secret_manager_secret_iam_member.credential_materialization,
    google_sql_user.bootstrap,
  ]
}
