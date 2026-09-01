variable "runtime_materialized" {
  description = "Explicit attended materialization gate for the fixed business-state readback runtime."
  type        = bool
  default     = false
}

variable "source_commit" {
  description = "Source-owned current reviewed commit embedded in the immutable bootstrap image."
  type        = string
  default     = "81e785448f834f4176cd5153eb3cbdf6d79d936c"
  nullable    = false

  validation {
    condition     = var.source_commit == "81e785448f834f4176cd5153eb3cbdf6d79d936c"
    error_message = "source_commit must be the exact current reviewed bootstrap source commit."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Source-owned current reviewed immutable refund-db-bootstrap image."
  type        = string
  default     = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2"
  nullable    = false

  validation {
    condition     = var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2"
    error_message = "bootstrap_image_digest_uri must be the exact current reviewed bootstrap digest."
  }
}
