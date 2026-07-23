variable "project_id" {
  description = "Explicit dedicated non-production project ID supplied only by a future attended operator."
  type        = string

  validation {
    condition = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id)) && !can(
      regex("(^|-)(prod|production|live|default|dev|development|acceptance)(-|$)", lower(var.project_id))
    )
    error_message = "project_id must be a bounded dedicated non-production project identifier."
  }
}
