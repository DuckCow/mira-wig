resource "google_sql_database_instance" "refund" {
  project             = var.project_id
  name                = local.names.sql_instance
  region              = local.region
  database_version    = "POSTGRES_${var.database_major_version}"
  deletion_protection = true

  settings {
    tier                        = var.database_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 20
    disk_autoresize             = true
    deletion_protection_enabled = true
    data_api_access             = "DISALLOW_DATA_API"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.refund.id
      allocated_ip_range                            = google_compute_global_address.private_service_access.name
      enable_private_path_for_google_cloud_services = true
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_service_networking_connection.private_service_access]
}

resource "google_sql_database" "refund" {
  project  = var.project_id
  name     = local.names.database
  instance = google_sql_database_instance.refund.name
}
