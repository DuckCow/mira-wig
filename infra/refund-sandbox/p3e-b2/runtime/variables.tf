variable "project_id" {
  description = "Exact dedicated non-production project admitted by the reviewed foundation handoff."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.project_id))
    )
    error_message = "project_id must be a bounded dedicated non-production project identifier."
  }
}

variable "resource_prefix" {
  description = "Exact bounded prefix shared with the admitted foundation resources."
  type        = string

  validation {
    condition = (
      can(regex("^[a-z][a-z0-9-]{2,16}[a-z0-9]$", var.resource_prefix)) &&
      !can(regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.resource_prefix)))
    )
    error_message = "resource_prefix must be bounded and non-production."
  }
}

variable "foundation_handoff" {
  description = "Exact nonsecret operator-reviewed foundation handoff; never complete Terraform state."
  type        = any
}

variable "execution_deny_handoff" {
  description = "Exact nonsecret operator-attested execution-deny handoff with no exception."
  type        = any
}

variable "release_image_handoff" {
  description = "Exact separately reviewed immutable release-image reference; never the R2A local proof digest."
  type        = any
}

variable "preflight_database_secret_version_reference" {
  description = "Exact existing preflight database-secret resource and canonical numeric version reference."
  type        = any
}

variable "canary_database_secret_version_reference" {
  description = "Exact existing canary database-secret resource and canonical numeric version reference."
  type        = any
}
