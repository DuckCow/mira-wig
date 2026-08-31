variable "release_authority" {
  description = "Exact human-reviewed authority for dormant SANDBOX canary materialization."
  type = object({
    human_authorized            = bool
    release_scope               = string
    provider_contact_authorized = bool
  })
  validation {
    condition = (
      var.release_authority.human_authorized == true &&
      var.release_authority.release_scope == "DORMANT_EXIMBAY_SANDBOX_CANARY_MATERIALIZATION" &&
      var.release_authority.provider_contact_authorized == false
    )
    error_message = "Exact reviewed dormant-canary release authority is required; provider contact is not authorized by this root."
  }
}

variable "project_id" {
  type = string
  validation {
    condition     = var.project_id == "mira-refund-sandbox-0001"
    error_message = "Only the dedicated refund sandbox project is admitted."
  }
}

variable "release_image_digest_uri" {
  type = string
  validation {
    condition     = var.release_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:8e167a2a9eeeabe82feef0488c69f3b527a00cb0b8497d2d3c20289c72633baf"
    error_message = "The exact reviewed refund-worker image digest is required."
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
    error_message = "The exact canary database secret is required."
  }
}

variable "database_url_secret_version" {
  type = string
  validation {
    condition     = var.database_url_secret_version == "1"
    error_message = "Canary database secret version 1 is required."
  }
}

variable "eximbay_api_key_secret_id" {
  type = string
  validation {
    condition     = var.eximbay_api_key_secret_id == "mira-p3e-sbx-eximbay-api-key"
    error_message = "The exact Eximbay SANDBOX credential secret is required."
  }
}

variable "eximbay_api_key_secret_version" {
  type = string
  validation {
    condition     = var.eximbay_api_key_secret_version == "1"
    error_message = "Eximbay SANDBOX credential secret version 1 is required."
  }
}

variable "eximbay_mid" {
  type = string
  validation {
    condition = (
      length(var.eximbay_mid) >= 1 &&
      length(var.eximbay_mid) <= 128 &&
      trimspace(var.eximbay_mid) == var.eximbay_mid &&
      !can(regex("(?i)(live|prod|production)", var.eximbay_mid))
    )
    error_message = "A bounded non-production Eximbay SANDBOX MID handoff is required."
  }
}

variable "merchant_account_binding_id" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$", var.merchant_account_binding_id))
    error_message = "An exact bounded merchant-account binding is required."
  }
}

variable "credential_generation_binding_id" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$", var.credential_generation_binding_id))
    error_message = "An exact bounded credential-generation binding is required."
  }
}

variable "release_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.release_binding_digest))
    error_message = "An exact lowercase SHA-256 release binding is required."
  }
}

variable "canary_job_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.canary_job_binding_digest))
    error_message = "An exact lowercase SHA-256 canary Job binding is required."
  }
}

variable "preflight_job_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.preflight_job_binding_digest))
    error_message = "An exact lowercase SHA-256 preflight evidence binding is required."
  }
}

variable "image_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.image_binding_digest))
    error_message = "An exact lowercase SHA-256 image binding is required."
  }
}

variable "secret_generation_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.secret_generation_binding_digest))
    error_message = "An exact lowercase SHA-256 credential-generation binding is required."
  }
}

variable "target_binding_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.target_binding_digest))
    error_message = "An exact lowercase SHA-256 sealed-target binding is required."
  }
}

variable "synthetic_provenance_digest" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.synthetic_provenance_digest))
    error_message = "An exact lowercase SHA-256 synthetic-provenance binding is required."
  }
}
