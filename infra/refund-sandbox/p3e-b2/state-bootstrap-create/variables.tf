variable "project_id" {
  description = "Explicit dedicated non-production project ID."
  type        = string
}

variable "bucket_name" {
  description = "Explicit globally unique state bucket name."
  type        = string
}

variable "location" {
  description = "Explicit fixed state bucket location."
  type        = string
}

variable "state_runner_members" {
  description = "Explicit state runner principals."
  type        = list(string)
}

variable "state_administrator_members" {
  description = "Explicit state administrator principals."
  type        = list(string)
}

variable "break_glass_state_administrator_members" {
  description = "Explicit optional break-glass state administrators."
  type        = list(string)
}

variable "recovery_configuration" {
  description = "Explicit recovery configuration."
  type = object({
    versioning_enabled         = bool
    soft_delete_enabled        = bool
    automatic_deletion_enabled = bool
    retention_policy_enabled   = bool
  })
}
