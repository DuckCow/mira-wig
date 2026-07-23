variable "project_id" {
  description = "Dedicated non-production project ID used by the Google provider."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.project_id))
    )
    error_message = "project_id must be a bounded dedicated non-production project identifier."
  }
}

variable "project_number" {
  description = "Separately evidenced canonical decimal project number used only for IAM deny attachment."
  type        = string

  validation {
    condition = (
      length(var.project_number) <= 64 &&
      can(regex("^[1-9][0-9]*$", var.project_number))
    )
    error_message = "project_number must be a nonempty bounded canonical ASCII decimal string without normalization."
  }
}

variable "attachment_scope" {
  description = "Explicit authority scope discriminator."
  type        = string

  validation {
    condition     = var.attachment_scope == "PROJECT"
    error_message = "The R1A deny policy may attach only to the dedicated project."
  }
}

variable "policy_id" {
  description = "Bounded IAM deny policy identifier."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}[a-z0-9]$", var.policy_id))
    error_message = "policy_id must be a bounded lowercase identifier."
  }
}

variable "policy_display_name" {
  description = "Bounded nonsecret display name."
  type        = string

  validation {
    condition = (
      length(var.policy_display_name) >= 3 &&
      length(var.policy_display_name) <= 63 &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9 -]*[A-Za-z0-9]$", var.policy_display_name))
    )
    error_message = "policy_display_name must be a bounded plain-text name."
  }
}

variable "denied_principals" {
  description = "Exact universal denied principal set."
  type        = list(string)

  validation {
    condition = (
      length(var.denied_principals) == 1 &&
      alltrue([
        for principal in var.denied_principals :
        principal == "principalSet://goog/public:all"
      ])
    )
    error_message = "R1A must deny exactly principalSet://goog/public:all."
  }
}

variable "denied_permissions" {
  description = "Exact Cloud Run Job execution permissions denied by R1A."
  type        = list(string)

  validation {
    condition = (
      length(var.denied_permissions) == 2 &&
      contains(var.denied_permissions, "run.googleapis.com/jobs.run") &&
      contains(var.denied_permissions, "run.googleapis.com/jobs.runWithOverrides") &&
      length(distinct(var.denied_permissions)) == 2
    )
    error_message = "R1A must deny exactly jobs.run and jobs.runWithOverrides."
  }
}

variable "exception_principals" {
  description = "R1A exception principals; must remain empty."
  type        = list(string)

  validation {
    condition     = length(var.exception_principals) == 0
    error_message = "R1A creates no deny-policy exception principal."
  }
}

variable "exception_permissions" {
  description = "R1A exception permissions; must remain empty."
  type        = list(string)

  validation {
    condition     = length(var.exception_permissions) == 0
    error_message = "R1A creates no deny-policy exception permission."
  }
}
