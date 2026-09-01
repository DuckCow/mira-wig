variable "runtime_materialized" {
  description = "Explicit attended materialization gate for the fixed business-state readback runtime."
  type        = bool
  default     = false
}

variable "source_commit" {
  description = "Source-owned current reviewed commit embedded in the immutable bootstrap image."
  type        = string
  default     = "d908d71b5de5dc4223db77268719ed9e97277253"
  nullable    = false

  validation {
    condition     = var.source_commit == "d908d71b5de5dc4223db77268719ed9e97277253"
    error_message = "source_commit must be the exact current reviewed bootstrap source commit."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Source-owned current reviewed immutable refund-db-bootstrap image."
  type        = string
  default     = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3"
  nullable    = false

  validation {
    condition     = var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3"
    error_message = "bootstrap_image_digest_uri must be the exact current reviewed bootstrap digest."
  }
}
