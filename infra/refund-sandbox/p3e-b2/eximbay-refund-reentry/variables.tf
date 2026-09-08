variable "release_authority" {
  description = "Exact human-reviewed authority for dormant refund re-entry successor materialization only."
  type = object({
    human_authorized            = bool
    release_scope               = string
    provider_contact_authorized = bool
  })
  validation {
    condition = (
      var.release_authority.human_authorized == true &&
      var.release_authority.release_scope == "DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_MATERIALIZATION" &&
      var.release_authority.provider_contact_authorized == false
    )
    error_message = "Exact dormant refund re-entry successor materialization authority is required; provider contact remains unauthorized."
  }
}

variable "project_id" {
  type = string
  validation {
    condition     = var.project_id == "mira-refund-sandbox-0001"
    error_message = "Only the dedicated refund sandbox project is admitted."
  }
}

variable "cloud_sql_instance_connection_name" {
  type = string
  validation {
    condition     = var.cloud_sql_instance_connection_name == "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
    error_message = "The exact refund sandbox Cloud SQL instance is required."
  }
}

variable "network_resource_name" {
  type = string
  validation {
    condition     = var.network_resource_name == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
    error_message = "The exact refund sandbox VPC is required."
  }
}

variable "subnetwork_resource_name" {
  type = string
  validation {
    condition     = var.subnetwork_resource_name == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    error_message = "The exact refund sandbox subnet is required."
  }
}

variable "database_url_secret_id" {
  type = string
  validation {
    condition     = var.database_url_secret_id == "mira-p3e-sbx-canary-database-url"
    error_message = "The exact existing canary database secret is required."
  }
}

variable "database_url_secret_version" {
  type = string
  validation {
    condition     = var.database_url_secret_version == "1"
    error_message = "Existing canary database secret version 1 is required."
  }
}

variable "eximbay_api_key_secret_id" {
  type = string
  validation {
    condition     = var.eximbay_api_key_secret_id == "mira-p3e-sbx-eximbay-api-key"
    error_message = "The exact existing Eximbay SANDBOX credential secret is required."
  }
}

variable "eximbay_api_key_secret_version" {
  type = string
  validation {
    condition     = var.eximbay_api_key_secret_version == "1"
    error_message = "Existing Eximbay SANDBOX credential secret version 1 is required."
  }
}
