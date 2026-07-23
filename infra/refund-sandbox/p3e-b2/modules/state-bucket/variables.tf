variable "project_id" {
  description = "Dedicated non-production project that owns only the reviewed P3E-B2 authorities."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.project_id))
    )
    error_message = "project_id must be a bounded dedicated non-production project identifier."
  }
}

variable "bucket_name" {
  description = "Globally unique state bucket name supplied by a separately authorized operator."
  type        = string

  validation {
    condition = (
      can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.bucket_name)) &&
      !can(regex("(^|-)(prod|production|live|default)(-|$)", lower(var.bucket_name))) &&
      !startswith(lower(var.bucket_name), "goog")
    )
    error_message = "bucket_name must use the reviewed non-production GCS-compatible subset."
  }
}

variable "location" {
  description = "Fixed state authority location."
  type        = string

  validation {
    condition     = var.location == "asia-northeast3"
    error_message = "location must be exactly asia-northeast3."
  }
}

variable "state_runner_members" {
  description = "Exact principals that may read and mutate backend objects."
  type        = list(string)

  validation {
    condition = (
      length(var.state_runner_members) > 0 &&
      length(distinct(var.state_runner_members)) == length(var.state_runner_members) &&
      alltrue([
        for member in var.state_runner_members :
        can(regex("^(user|group|serviceAccount):[A-Za-z0-9][A-Za-z0-9._%+/-]*@[A-Za-z0-9][A-Za-z0-9.-]*\\.[A-Za-z]{2,}$", member)) &&
        !contains(["allUsers", "allAuthenticatedUsers"], member) &&
        !strcontains(member, "*") &&
        !can(regex("^serviceAccount:[0-9]+-compute@developer\\.gserviceaccount\\.com$", member))
      ])
    )
    error_message = "state_runner_members must be a nonempty unique list of exact user, group, or non-default service-account principals."
  }
}

variable "state_administrator_members" {
  description = "Exact principals that administer bucket configuration, IAM, versions, and recovery."
  type        = list(string)

  validation {
    condition = (
      length(var.state_administrator_members) > 0 &&
      length(distinct(var.state_administrator_members)) == length(var.state_administrator_members) &&
      alltrue([
        for member in var.state_administrator_members :
        can(regex("^(user|group|serviceAccount):[A-Za-z0-9][A-Za-z0-9._%+/-]*@[A-Za-z0-9][A-Za-z0-9.-]*\\.[A-Za-z]{2,}$", member)) &&
        !contains(["allUsers", "allAuthenticatedUsers"], member) &&
        !strcontains(member, "*") &&
        !can(regex("^serviceAccount:[0-9]+-compute@developer\\.gserviceaccount\\.com$", member))
      ])
    )
    error_message = "state_administrator_members must be a nonempty unique list of exact user, group, or non-default service-account principals."
  }
}

variable "break_glass_state_administrator_members" {
  description = "Optional exact break-glass principals; an empty list means no break-glass authority."
  type        = list(string)

  validation {
    condition = (
      length(distinct(var.break_glass_state_administrator_members)) == length(var.break_glass_state_administrator_members) &&
      alltrue([
        for member in var.break_glass_state_administrator_members :
        can(regex("^(user|group|serviceAccount):[A-Za-z0-9][A-Za-z0-9._%+/-]*@[A-Za-z0-9][A-Za-z0-9.-]*\\.[A-Za-z]{2,}$", member)) &&
        !contains(["allUsers", "allAuthenticatedUsers"], member) &&
        !strcontains(member, "*") &&
        !can(regex("^serviceAccount:[0-9]+-compute@developer\\.gserviceaccount\\.com$", member))
      ])
    )
    error_message = "break-glass members must be unique exact user, group, or non-default service-account principals."
  }
}

variable "recovery_configuration" {
  description = "Exact R1A recovery selection; versioning is authoritative while unproven soft delete and automatic deletion remain off."
  type = object({
    versioning_enabled         = bool
    soft_delete_enabled        = bool
    automatic_deletion_enabled = bool
    retention_policy_enabled   = bool
  })

  validation {
    condition = (
      var.recovery_configuration.versioning_enabled &&
      !var.recovery_configuration.soft_delete_enabled &&
      !var.recovery_configuration.automatic_deletion_enabled &&
      !var.recovery_configuration.retention_policy_enabled
    )
    error_message = "R1A requires versioning and forbids unproven soft delete, automatic deletion, and bucket retention."
  }
}
