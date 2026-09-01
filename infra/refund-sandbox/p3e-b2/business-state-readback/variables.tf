variable "runtime_materialized" {
  description = "Explicit attended materialization gate for the fixed business-state readback runtime."
  type        = bool
  default     = false
}

variable "source_commit" {
  description = "Reviewed source commit embedded in the immutable bootstrap image; required only for materialization."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.source_commit == null || can(regex("^[0-9a-f]{40}$", var.source_commit))
    error_message = "source_commit must be null or one lowercase 40-character Git commit."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Reviewed immutable refund-db-bootstrap image; required only for materialization."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = var.bootstrap_image_digest_uri == null || can(regex(
      "^asia-northeast3-docker\\.pkg\\.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:[0-9a-f]{64}$",
      var.bootstrap_image_digest_uri,
    ))
    error_message = "bootstrap_image_digest_uri must be null or the exact immutable bootstrap repository digest URI."
  }
}
