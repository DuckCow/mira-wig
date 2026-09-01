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

variable "bootstrap_mode" {
  description = "Terraform-owned exact database-bootstrap Job mode."
  type        = string
  default     = "check"

  validation {
    condition = contains([
      "check",
      "apply-contacted-reconciliation-role-grants",
      "apply-business-state-readback-role-grants",
      "revoke-business-state-readback-role-grants",
      "restore-canary-refund-role-grants",
    ], var.bootstrap_mode)
    error_message = "bootstrap_mode must be check or one exact admitted role-grant lifecycle mode."
  }
}

variable "readback_source_commit" {
  description = "Reviewed readback-capable bootstrap source commit, used only by the exact readback role-grant mode."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.readback_source_commit == null || can(regex("^[0-9a-f]{40}$", var.readback_source_commit))
    error_message = "readback_source_commit must be null or one lowercase 40-character Git commit."
  }
}

variable "readback_bootstrap_image_digest_uri" {
  description = "Reviewed immutable readback-capable bootstrap image, used only by the exact readback role-grant mode."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = var.readback_bootstrap_image_digest_uri == null || can(regex(
      "^asia-northeast3-docker\\.pkg\\.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:[0-9a-f]{64}$",
      var.readback_bootstrap_image_digest_uri,
    ))
    error_message = "readback_bootstrap_image_digest_uri must be null or the immutable bootstrap repository digest URI."
  }
}

variable "source_commit" {
  description = "Exact reviewed source commit embedded in the published bootstrap image."
  type        = string
  default     = "4a6f2967be6de4526fa7b47d414d1cbaec600783"

  validation {
    condition     = var.source_commit == "4a6f2967be6de4526fa7b47d414d1cbaec600783"
    error_message = "source_commit must be the exact reviewed mode-capable bootstrap source commit."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Exact immutable published bootstrap image digest URI."
  type        = string
  default     = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086"

  validation {
    condition     = var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086"
    error_message = "bootstrap_image_digest_uri must be the exact published mode-capable bootstrap digest."
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
