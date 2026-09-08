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
      "apply",
      "apply-canary-role-grants",
      "apply-synthetic-sale-role-grants",
      "apply-contacted-reconciliation-role-grants",
      "apply-business-state-readback-role-grants",
      "revoke-business-state-readback-role-grants",
      "contacted-reconciliation-business-state-readback",
      "materialize-synthetic-sale-market-precondition",
      "restore-canary-refund-role-grants",
      "materialize-eximbay-canary-target",
      "issue-eximbay-canary-approval",
      "materialize-application-credentials",
      "recover-canary-application-credential",
    ], var.bootstrap_mode)
    error_message = "bootstrap_mode must be one exact mode admitted by the current immutable bootstrap artifact."
  }
}

variable "bootstrap_payment_id" {
  description = "Existing target Payment identity forwarded only to an attended producer mode."
  type        = string
  default     = null
  nullable    = true
}

variable "bootstrap_attestation_json" {
  description = "Existing attended Eximbay canary attestation forwarded only to a producer mode."
  type        = string
  default     = null
  nullable    = true
}

variable "bootstrap_runtime_readback_json" {
  description = "Existing runtime readback forwarded only to approval issuance."
  type        = string
  default     = null
  nullable    = true
}

variable "bootstrap_issuer_principal_id" {
  description = "Existing issuer principal identity forwarded only to approval issuance."
  type        = string
  default     = null
  nullable    = true
}

variable "source_commit" {
  description = "Exact reviewed source commit embedded in the published bootstrap image."
  type        = string
  default     = "1bd9b7f9c37f2d66bb7e615a0d9e1c335190fc4d"

  validation {
    condition     = var.source_commit == "1bd9b7f9c37f2d66bb7e615a0d9e1c335190fc4d"
    error_message = "source_commit must be the exact current reviewed bootstrap source commit."
  }
}

variable "bootstrap_image_digest_uri" {
  description = "Exact immutable published bootstrap image digest URI."
  type        = string
  default     = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bd8137d52a1040986e793646b92e73d11eab6a6742448948997225e59d47b8ba"

  validation {
    condition     = var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bd8137d52a1040986e793646b92e73d11eab6a6742448948997225e59d47b8ba"
    error_message = "bootstrap_image_digest_uri must be the exact current reviewed bootstrap digest."
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
