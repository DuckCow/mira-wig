locals {
  runtime_apply_authorized = (
    var.release_authority.human_authorized == true &&
    var.release_authority.release_scope == "DORMANT_EXIMBAY_SANDBOX_CANARY_MATERIALIZATION" &&
    var.release_authority.provider_contact_authorized == false
  )
  runtime_root_apply_policy      = "EXPLICIT_DORMANT_EXIMBAY_SANDBOX_CANARY_RELEASE"
  backend_bucket_contract        = "mira-refund-sandbox-0001-tfstate-925882331349"
  backend_prefix_contract        = "p3e-b2/eximbay-canary"
  region                         = "asia-northeast3"
  service_account_id             = "mira-eximbay-canary"
  job_name                       = "mira-eximbay-refund-canary"
  cloud_sql_instance_resource    = "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18"
  api_key_secret_resource        = "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key"
  cloud_sql_condition_expression = "resource.name == '${local.cloud_sql_instance_resource}' && resource.service == 'sqladmin.googleapis.com'"
  required_activation = {
    REFUND_EXECUTION_WORKER_ENABLED                  = "ENABLED"
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED         = "ENABLED"
    REFUND_EXECUTION_LEASE_ENABLED                   = "ENABLED"
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED    = "ENABLED"
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED  = "ENABLED"
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED = "ENABLED"
  }
  authority_environment = {
    MIRA_REFUND_EXIMBAY_CANARY_LANE                             = "EXIMBAY_SANDBOX_V1"
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST           = var.release_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST               = var.canary_job_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST     = var.preflight_job_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST             = var.image_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST = var.secret_generation_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST            = var.target_binding_digest
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST      = var.synthetic_provenance_digest
    MIRA_REFUND_EXIMBAY_CANARY_NO_CUSTOMER_PII_ATTESTED         = "TRUE"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                  = local.api_key_secret_resource
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                   = var.eximbay_api_key_secret_version
    EXIMBAY_SANDBOX_MID                                         = var.eximbay_mid
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING             = var.merchant_account_binding_id
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING        = var.credential_generation_binding_id
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                   = var.cloud_sql_instance_connection_name
  }
}
