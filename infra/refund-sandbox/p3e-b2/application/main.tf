terraform {
  required_version = ">= 1.7.0, < 2.0.0"
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 7.40.0"
    }
  }
}
provider "google" {
  project = local.project
  region  = local.region
}
locals {
  project = "mira-refund-sandbox-0001"
  region  = "asia-northeast3"
  name    = "mira-p3e-sbx-application"
  secrets = toset([
    "mira-p3e-sbx-application-database-url", "mira-p3e-sbx-nextauth-secret",
    "mira-p3e-sbx-google-client-secret", "mira-p3e-sbx-refund-reentry-release",
  ])
}
resource "google_service_account" "application" {
  project      = local.project
  account_id   = local.name
  display_name = "Private Mira SANDBOX application"
}
resource "google_secret_manager_secret" "application" {
  for_each  = local.secrets
  project   = local.project
  secret_id = each.value
  replication {
    auto {}
  }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "application" {
  for_each  = local.secrets
  project   = local.project
  secret_id = google_secret_manager_secret.application[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application.email}"
}
resource "google_project_iam_member" "cloud_sql_client" {
  project = local.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.application.email}"
  condition {
    title      = "mira-application-single-instance"
    expression = "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'"
  }
}
resource "google_project_iam_custom_role" "execution_reader" {
  project     = local.project
  role_id     = "miraRefundExecutionReader"
  title       = "Mira refund Execution reader"
  permissions = ["run.executions.get", "run.tasks.list"]
}
variable "auth_configuration" {
  description = "Actual OAuth client ID and explicit secret versions; null leaves application deployment pending. No secret payloads."
  type = object({
    google_client_id        = string
    google_secret_version   = string
    nextauth_secret_version = string
    database_secret_version = string
  })
  default = null
}
variable "admission_url" {
  description = "Actual service URL plus the reviewed admission path, from creation readback."
  type        = string
  default     = null
}
variable "release_configuration" {
  description = "Actual reviewed manifest version and byte SHA-256, supplied after worker template readback."
  type        = object({ version = string, sha256 = string })
  default     = null
}
variable "worker_installed" {
  description = "Enable exact resource IAM only after the existing worker owner has installed its SA and Job."
  type        = bool
  default     = false
}
resource "google_cloud_run_v2_service" "application" {
  count                = var.auth_configuration == null ? 0 : 1
  project              = local.project
  location             = local.region
  name                 = local.name
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = false
  custom_audiences     = var.admission_url == null ? [] : [var.admission_url]
  template {
    service_account       = google_service_account.application.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      name       = "application"
      image      = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/mira-application@sha256:fcb14ae7e75aa1577434512192e44fa0ebe8b2f2b082b86fec49d66c4a83168a"
      depends_on = ["cloud-sql-proxy"]
      ports { container_port = 8080 }
      resources { limits = { cpu = "1", memory = "1Gi" } }
      dynamic "env" {
        for_each = merge({
          NEXTAUTH_URL                      = "http://localhost:8085"
          GOOGLE_CLIENT_ID                  = var.auth_configuration.google_client_id
          MIRA_REFUND_AUTHORIZATION_ENABLED = "DISABLED"
          PAYMENT_MODE                      = "SANDBOX"
          STORAGE_PROVIDER                  = "mock"
          AI_PROVIDER                       = "mock"
          CHECKPOINT_DISABLE                = "1"
          }, var.release_configuration == null ? {} : {
          MIRA_REFUND_REENTRY_RELEASE_FILE   = "/etc/mira/refund/release.json"
          MIRA_REFUND_REENTRY_RELEASE_SHA256 = var.release_configuration.sha256
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = {
          DATABASE_URL         = { secret = "mira-p3e-sbx-application-database-url", version = var.auth_configuration.database_secret_version }
          NEXTAUTH_SECRET      = { secret = "mira-p3e-sbx-nextauth-secret", version = var.auth_configuration.nextauth_secret_version }
          GOOGLE_CLIENT_SECRET = { secret = "mira-p3e-sbx-google-client-secret", version = var.auth_configuration.google_secret_version }
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }
      dynamic "volume_mounts" {
        for_each = var.release_configuration == null ? [] : [1]
        content {
          name       = "refund-release"
          mount_path = "/etc/mira/refund"
        }
      }
    }
    containers {
      name  = "cloud-sql-proxy"
      image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:b239a84edd20cfcf1fef20a8d297ac578a73e5cb0ba0eaaf5498782de4f9f861"
      args  = ["--private-ip", "--address=127.0.0.1", "--port=5432", "--health-check", "--http-address=0.0.0.0", "--http-port=9801", "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"]
      resources { limits = { cpu = "1", memory = "256Mi" } }
      startup_probe {
        http_get {
          path = "/startup"
          port = 9801
        }
        period_seconds    = 2
        failure_threshold = 60
      }
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
        subnetwork = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
        tags       = ["refund-provider-free"]
      }
    }
    dynamic "volumes" {
      for_each = var.release_configuration == null ? [] : [1]
      content {
        name = "refund-release"
        secret {
          secret = "mira-p3e-sbx-refund-reentry-release"
          items {
            version = var.release_configuration.version
            path    = "release.json"
            mode    = 292
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.application, google_project_iam_member.cloud_sql_client]
}
resource "google_cloud_run_v2_service_iam_member" "worker_invocation" {
  count    = var.worker_installed && var.auth_configuration != null ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.application[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:mira-eximbay-canary@mira-refund-sandbox-0001.iam.gserviceaccount.com"
}
resource "google_cloud_run_v2_job_iam_member" "execution_read" {
  count    = var.worker_installed ? 1 : 0
  project  = local.project
  location = local.region
  name     = "mira-eximbay-refund-canary"
  role     = google_project_iam_custom_role.execution_reader.name
  member   = "serviceAccount:${google_service_account.application.email}"
}
output "application_identity" { value = google_service_account.application.email }
output "application_url" { value = var.auth_configuration == null ? null : google_cloud_run_v2_service.application[0].uri }

variable "credential_materialization" {
  description = "Temporary exact-secret metadata/version-add access for attended application credential creation; remove during cleanup."
  type        = bool
  default     = false
}
resource "google_secret_manager_secret_iam_member" "credential_materialization" {
  for_each  = var.credential_materialization ? toset(["roles/secretmanager.viewer", "roles/secretmanager.secretVersionAdder"]) : toset([])
  project   = local.project
  secret_id = google_secret_manager_secret.application["mira-p3e-sbx-application-database-url"].secret_id
  role      = each.value
  member    = "serviceAccount:mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam.gserviceaccount.com"
}
check "explicit_runtime_bindings" {
  assert {
    condition = var.auth_configuration == null ? true : (
      can(regex("^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$", var.auth_configuration.google_client_id)) &&
      alltrue([for version in [var.auth_configuration.google_secret_version, var.auth_configuration.nextauth_secret_version, var.auth_configuration.database_secret_version] : can(regex("^[1-9][0-9]*$", version))])
    )
    error_message = "Actual Google web client ID and explicit numeric secret versions are required."
  }
}
check "exact_release_delivery" {
  assert {
    condition = var.release_configuration == null ? true : (
      can(regex("^[1-9][0-9]*$", var.release_configuration.version)) &&
      can(regex("^[0-9a-f]{64}$", var.release_configuration.sha256)) && var.admission_url != null
    )
    error_message = "Release delivery requires the actual audience, numeric version and exact byte digest."
  }
}
