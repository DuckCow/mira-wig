variable "project_id" { type = string }
variable "release_image_digest_uri" { type = string }
variable "cloud_sql_instance_connection_name" { type = string }
variable "network_resource_name" { type = string }
variable "subnetwork_resource_name" { type = string }
variable "database_url_secret_id" { type = string }
variable "database_url_secret_version" { type = string }
variable "eximbay_api_key_secret_id" { type = string }
variable "eximbay_api_key_secret_version" { type = string }
variable "eximbay_mid" { type = string }
variable "merchant_account_binding_id" { type = string }
variable "credential_generation_binding_id" { type = string }
variable "release_binding_digest" { type = string }
variable "canary_job_binding_digest" { type = string }
variable "preflight_job_binding_digest" { type = string }
variable "image_binding_digest" { type = string }
variable "secret_generation_binding_digest" { type = string }
variable "target_binding_digest" { type = string }
variable "synthetic_provenance_digest" { type = string }

variable "custody_artifact_sha256" {
  type = string
  validation {
    condition = can(regex("^[0-9a-f]{64}$", var.custody_artifact_sha256))
    error_message = "The exact custody/v3 byte SHA-256 is required."
  }
}
