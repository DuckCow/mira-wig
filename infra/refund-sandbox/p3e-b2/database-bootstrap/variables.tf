variable "project_id" {
  description = "Exact dedicated non-production project."
  type        = string

  validation {
    condition     = var.project_id == "mira-refund-sandbox-0001"
    error_message = "Only the reviewed refund sandbox project is admitted."
  }
}

variable "resource_prefix" {
  description = "Exact installed P3E sandbox resource prefix."
  type        = string

  validation {
    condition     = var.resource_prefix == "mira-p3e-sbx"
    error_message = "Only the reviewed P3E sandbox resource prefix is admitted."
  }
}

variable "temporary_cloud_sql_access_authorized" {
  description = "Explicit temporary admission for the exact two conditioned bootstrap Cloud SQL IAM bindings."
  type        = bool
  default     = false
}

variable "source_commit" {
  description = "Exact reviewed source commit embedded in the published bootstrap image."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_commit))
    error_message = "source_commit must be one lowercase full Git SHA."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Exact immutable published bootstrap image digest URI."
  type        = string

  validation {
    condition = can(regex(
      "^asia-northeast3-docker\\.pkg\\.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:[0-9a-f]{64}$",
      var.bootstrap_image_digest_uri,
    ))
    error_message = "bootstrap_image_digest_uri must be the exact bootstrap repository digest URI."
  }
}

variable "foundation_handoff" {
  description = "Exact applied foundation identity consumed without owning foundation resources."
  type = object({
    contract_version                 = string
    project_id                       = string
    region                           = string
    network_resource_name            = string
    subnetwork_resource_name         = string
    cloud_sql_instance_name          = string
    cloud_sql_instance_resource_name = string
    cloud_sql_connection_name        = string
    database_name                    = string
    cloud_sql_iam_authentication     = string
    foundation_resource_graph_sha256 = string
    source_state_prefix              = string
    apply_status                     = string
    operator_review_status           = string
  })
}
