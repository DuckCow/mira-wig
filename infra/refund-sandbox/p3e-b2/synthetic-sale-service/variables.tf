variable "release_authority" {
  type = object({
    human_authorized                      = bool
    release_scope                         = string
    provider_contact_execution_authorized = bool
  })
  validation {
    condition = (
      var.release_authority.human_authorized == true &&
      var.release_authority.release_scope == "TEMPORARY_SYNTHETIC_EXIMBAY_SALE_SERVICE_MATERIALIZATION" &&
      var.release_authority.provider_contact_execution_authorized == false
    )
    error_message = "Exact temporary Service materialization authority without execution authority is required."
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
  type    = string
  default = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale@sha256:60a80d5ce9a03ab061f86a27241630e269ecbf0e184085e5152e35639bf83880"
  validation {
    condition     = var.release_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale@sha256:60a80d5ce9a03ab061f86a27241630e269ecbf0e184085e5152e35639bf83880"
    error_message = "The exact current synthetic-sale image-policy digest is required."
  }
}

variable "public_origin" {
  type = string
  validation {
    condition     = var.public_origin == "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app"
    error_message = "The exact generated Cloud Run HTTPS origin for project 925882331349 is required."
  }
}

variable "run_capability" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.run_capability))
    error_message = "One high-entropy lowercase hexadecimal run capability is required."
  }
}

variable "database_url_secret_id" {
  type    = string
  default = "mira-p3e-sbx-canary-database-url"
  validation {
    condition     = var.database_url_secret_id == "mira-p3e-sbx-canary-database-url"
    error_message = "The exact canary database secret is required."
  }
}

variable "eximbay_api_key_secret_id" {
  type    = string
  default = "mira-p3e-sbx-eximbay-api-key"
  validation {
    condition     = var.eximbay_api_key_secret_id == "mira-p3e-sbx-eximbay-api-key"
    error_message = "The exact Eximbay credential secret is required."
  }
}

variable "network_resource_name" {
  type    = string
  default = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
  validation {
    condition     = var.network_resource_name == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
    error_message = "The exact refund VPC is required."
  }
}

variable "subnetwork_resource_name" {
  type    = string
  default = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
  validation {
    condition     = var.subnetwork_resource_name == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    error_message = "The exact refund subnet is required."
  }
}
