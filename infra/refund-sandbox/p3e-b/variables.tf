variable "project_id" {
  description = "Separately created and billing-enabled dedicated P3E sandbox project."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|[-_])(prod|production|live|default)([-_]|$)", lower(var.project_id))
    )
    error_message = "project_id must be a dedicated non-production project identifier."
  }
}

variable "project_number" {
  description = "Numeric project number for exact service-agent bindings when later required."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]{5,19}$", var.project_number))
    error_message = "project_number must be a positive canonical decimal string."
  }
}

variable "resource_prefix" {
  description = "Approved non-production resource-name prefix."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{2,20}[a-z0-9]$", var.resource_prefix)) && !can(
      regex("(^|[-_])(prod|production|live|default)([-_]|$)", lower(var.resource_prefix))
    )
    error_message = "resource_prefix must be bounded and non-production."
  }
}

variable "container_image_digest_uri" {
  description = "Immutable Artifact Registry image URI supplied only after a separately audited build."
  type        = string

  validation {
    condition = can(regex(
      "^asia-northeast3-docker\\.pkg\\.dev/[a-z][a-z0-9-]{4,28}[a-z0-9]/[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$",
      var.container_image_digest_uri
    )) && !can(regex("(^|[:/@])latest($|[:/@])", lower(var.container_image_digest_uri)))
    error_message = "container_image_digest_uri must be an asia-northeast3 Artifact Registry sha256 digest URI, never a tag."
  }
}

variable "database_major_version" {
  description = "PostgreSQL major matching the audited local version and current Cloud SQL regular support."
  type        = number

  validation {
    condition     = var.database_major_version == 18
    error_message = "P3E-B1 is frozen to PostgreSQL major 18."
  }
}

variable "database_tier" {
  description = "Explicit bounded Enterprise tier; no production-sized default exists."
  type        = string

  validation {
    condition = contains([
      "db-custom-1-3840",
      "db-custom-2-7680",
      "db-custom-4-15360",
    ], var.database_tier)
    error_message = "database_tier must be one of the reviewed bounded custom tiers."
  }
}

variable "preflight_database_secret_version" {
  description = "Future positive numeric preflight database-secret version; Terraform creates no version."
  type        = number

  validation {
    condition = (
      floor(var.preflight_database_secret_version) == var.preflight_database_secret_version &&
      var.preflight_database_secret_version > 0
    )
    error_message = "preflight_database_secret_version must be a positive integer; latest is forbidden."
  }
}

variable "canary_database_secret_version" {
  description = "Future positive numeric dormant-canary database-secret version; Terraform creates no version."
  type        = number

  validation {
    condition = (
      floor(var.canary_database_secret_version) == var.canary_database_secret_version &&
      var.canary_database_secret_version > 0
    )
    error_message = "canary_database_secret_version must be a positive integer; latest is forbidden."
  }
}

variable "future_preflight_invoker_members" {
  description = "Reserved B2 input. B1 creates no invocation binding and defaults to no members."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for member in var.future_preflight_invoker_members :
      can(regex("^(user|group|serviceAccount):[^*[:space:]]+$", member)) &&
      !contains(["allUsers", "allAuthenticatedUsers"], member)
    ])
    error_message = "Future invokers must be exact non-wildcard principals."
  }
}

variable "alert_policies_enabled" {
  description = "Must remain false in B1; delivery is unproven."
  type        = bool
  default     = false

  validation {
    condition     = var.alert_policies_enabled == false
    error_message = "P3E-B1 alert policies must remain disabled."
  }
}

variable "notification_channel_names" {
  description = "Must remain empty in B1; no contact data is provisioned."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.notification_channel_names) == 0
    error_message = "P3E-B1 notification channels must remain empty."
  }
}
