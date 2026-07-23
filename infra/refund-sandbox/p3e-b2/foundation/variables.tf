variable "project_id" {
  description = "Explicit dedicated non-production project ID; it must equal the reviewed activation manifest."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.project_id))
    )
    error_message = "project_id must be a bounded dedicated non-production project identifier."
  }
}

variable "service_activation_handoff" {
  description = "Operator-attested applied-and-reviewed activation handoff; nonsecret and not cloud-authenticated."
  type = object({
    contract_version = string
    project_id       = string

    managed_api_names      = list(string)
    managed_api_set_sha256 = string

    bootstrap_preenabled_api_names      = list(string)
    bootstrap_preenabled_api_set_sha256 = string

    source_state_prefix = string
    provider_source     = string
    provider_version    = string
    resource_type       = string

    activation_apply_status = string
    operator_review_status  = string
    evidence_type           = string
  })
}

variable "resource_prefix" {
  description = "Explicit bounded non-production resource prefix."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{2,20}[a-z0-9]$", var.resource_prefix)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.resource_prefix))
    )
    error_message = "resource_prefix must be bounded and non-production."
  }
}

variable "database_major_version" {
  description = "Explicit PostgreSQL major accepted for the reviewed foundation."
  type        = number

  validation {
    condition     = var.database_major_version == 18
    error_message = "The R1B foundation is frozen to PostgreSQL 18."
  }
}

variable "database_tier" {
  description = "Explicit reviewed non-production Enterprise tier."
  type        = string

  validation {
    condition = contains([
      "db-custom-1-3840",
      "db-custom-2-7680",
      "db-custom-4-15360",
    ], var.database_tier)
    error_message = "database_tier must be one of the reviewed bounded tiers."
  }
}

variable "database_availability_mode" {
  description = "Explicit cost/availability decision."
  type        = string

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.database_availability_mode)
    error_message = "database_availability_mode must be ZONAL or REGIONAL."
  }
}

variable "database_initial_disk_size_gb" {
  description = "Explicit initial SSD size in GiB."
  type        = number

  validation {
    condition = (
      floor(var.database_initial_disk_size_gb) == var.database_initial_disk_size_gb &&
      var.database_initial_disk_size_gb >= 20 &&
      var.database_initial_disk_size_gb <= 100
    )
    error_message = "database_initial_disk_size_gb must be an integer from 20 through 100."
  }
}

variable "database_disk_autoresize_limit_gb" {
  description = "Explicit finite upper disk-autoresize bound in GiB."
  type        = number

  validation {
    condition = (
      floor(var.database_disk_autoresize_limit_gb) == var.database_disk_autoresize_limit_gb &&
      var.database_disk_autoresize_limit_gb > var.database_initial_disk_size_gb &&
      var.database_disk_autoresize_limit_gb <= 500
    )
    error_message = "database_disk_autoresize_limit_gb must be a finite integer above the initial size and at most 500."
  }
}

variable "backup_start_time_utc" {
  description = "Explicit UTC backup start time in HH:MM form."
  type        = string

  validation {
    condition     = can(regex("^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", var.backup_start_time_utc))
    error_message = "backup_start_time_utc must be canonical 24-hour HH:MM."
  }
}

variable "backup_retention_count" {
  description = "Explicit retained automated-backup count."
  type        = number

  validation {
    condition = (
      floor(var.backup_retention_count) == var.backup_retention_count &&
      var.backup_retention_count >= 7 &&
      var.backup_retention_count <= 35
    )
    error_message = "backup_retention_count must be an integer from 7 through 35."
  }
}

variable "transaction_log_retention_days" {
  description = "Explicit PostgreSQL PITR transaction-log retention."
  type        = number

  validation {
    condition = (
      floor(var.transaction_log_retention_days) == var.transaction_log_retention_days &&
      var.transaction_log_retention_days >= 1 &&
      var.transaction_log_retention_days <= 7
    )
    error_message = "transaction_log_retention_days must be an integer from 1 through 7."
  }
}

variable "maintenance_window" {
  description = "Explicit weekly UTC maintenance window."
  type = object({
    day          = number
    hour         = number
    update_track = string
  })

  validation {
    condition = (
      floor(var.maintenance_window.day) == var.maintenance_window.day &&
      var.maintenance_window.day >= 1 &&
      var.maintenance_window.day <= 7 &&
      floor(var.maintenance_window.hour) == var.maintenance_window.hour &&
      var.maintenance_window.hour >= 0 &&
      var.maintenance_window.hour <= 23 &&
      contains(["stable", "canary"], var.maintenance_window.update_track)
    )
    error_message = "maintenance_window must contain a valid UTC day/hour and stable or canary track."
  }
}

variable "database_deletion_protection" {
  description = "Explicit ordinary-operation deletion decision."
  type        = bool

  validation {
    condition     = var.database_deletion_protection
    error_message = "database_deletion_protection must remain true."
  }
}

variable "database_retain_backups_on_delete" {
  description = "Explicit backup-retention decision for separately authorized deletion."
  type        = bool

  validation {
    condition     = var.database_retain_backups_on_delete
    error_message = "database_retain_backups_on_delete must remain true."
  }
}

variable "database_final_backup_enabled" {
  description = "Explicit final-backup decision for separately authorized deletion."
  type        = bool

  validation {
    condition     = var.database_final_backup_enabled
    error_message = "database_final_backup_enabled must remain true."
  }
}

variable "database_final_backup_retention_days" {
  description = "Explicit final-backup retention for separately authorized deletion."
  type        = number

  validation {
    condition = (
      floor(var.database_final_backup_retention_days) == var.database_final_backup_retention_days &&
      var.database_final_backup_retention_days >= 7 &&
      var.database_final_backup_retention_days <= 30
    )
    error_message = "database_final_backup_retention_days must be an integer from 7 through 30."
  }
}
