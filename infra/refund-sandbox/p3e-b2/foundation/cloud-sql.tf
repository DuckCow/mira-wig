resource "google_sql_database_instance" "refund" {
  project             = local.project_id
  name                = local.names.sql_instance
  region              = local.region
  database_version    = "POSTGRES_${var.database_major_version}"
  deletion_protection = var.database_deletion_protection

  settings {
    tier                        = var.database_tier
    edition                     = "ENTERPRISE"
    availability_type           = var.database_availability_mode
    disk_type                   = "PD_SSD"
    disk_size                   = var.database_initial_disk_size_gb
    disk_autoresize             = true
    disk_autoresize_limit       = var.database_disk_autoresize_limit_gb
    deletion_protection_enabled = var.database_deletion_protection
    data_api_access             = "DISALLOW_DATA_API"
    retain_backups_on_delete    = var.database_retain_backups_on_delete

    final_backup_config {
      enabled        = var.database_final_backup_enabled
      retention_days = var.database_final_backup_retention_days
    }

    backup_configuration {
      enabled                        = true
      start_time                     = var.backup_start_time_utc
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.backup_retention_count
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = var.maintenance_window.day
      hour         = var.maintenance_window.hour
      update_track = var.maintenance_window.update_track
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
    ignore_changes  = [settings[0].disk_size]
  }

  depends_on = [google_service_networking_connection.private_service_access]
}

resource "google_sql_database" "refund" {
  project  = local.project_id
  name     = local.names.database
  instance = google_sql_database_instance.refund.name

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_sql_database_instance.refund]
}
