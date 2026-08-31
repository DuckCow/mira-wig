variable "project_id" {
  description = "Exact dedicated non-production project authorized for the first preflight release."
  type        = string

  validation {
    condition     = var.project_id == "mira-refund-sandbox-0001"
    error_message = "project_id must be the exact authorized refund sandbox project."
  }
}

variable "resource_prefix" {
  description = "Exact bounded prefix shared with the admitted foundation resources."
  type        = string

  validation {
    condition     = var.resource_prefix == "mira-p3e-sbx"
    error_message = "resource_prefix must be the exact authorized refund sandbox prefix."
  }
}

variable "foundation_handoff" {
  description = "Exact nonsecret operator-reviewed foundation handoff; never complete Terraform state."
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
