locals {
  contract                  = jsondecode(file("${path.module}/../contracts/database-bootstrap-runtime-v1.json"))
  readiness_contract        = jsondecode(file("${path.module}/../contracts/database-bootstrap-runtime-v3.json"))
  region                    = "asia-northeast3"
  service_account_id        = "${var.resource_prefix}-db-bootstrap"
  service_account_email     = "${local.service_account_id}@${var.project_id}.iam.gserviceaccount.com"
  iam_database_username     = trimsuffix(local.service_account_email, ".gserviceaccount.com")
  cloud_sql_instance_name   = "${var.resource_prefix}-refund-pg18"
  cloud_sql_resource_name   = "projects/${var.project_id}/instances/${local.cloud_sql_instance_name}"
  cloud_sql_connection_name = "${var.project_id}:${local.region}:${local.cloud_sql_instance_name}"
  database_name             = "refund_sandbox"
  job_name                  = "${var.resource_prefix}-refund-db-bootstrap"
  network_tags              = ["refund-provider-free"]
  backend_prefix            = "p3e-b2/database-bootstrap"
  successor_installation    = var.refund_authorization_installation || var.refund_readiness_installation
  migration_count           = local.successor_installation ? 42 : 41
  migration_sha256          = local.successor_installation ? "7eea189bc4bfe165ab699113952c22493895692a2377fcdfc00e7ba956abb370" : "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c"
  cloud_sql_condition       = "resource.name == '${local.cloud_sql_resource_name}' && resource.service == 'sqladmin.googleapis.com'"
  cloud_sql_roles = var.temporary_cloud_sql_access_authorized ? {
    client = {
      role  = "roles/cloudsql.client"
      title = "refund-db-bootstrap-client-single-instance"
    }
    instance_user = {
      role  = "roles/cloudsql.instanceUser"
      title = "refund-db-bootstrap-login-single-instance"
    }
  } : {}
  credential_secret_iam = {}
  readback_role_lifecycle_mode = contains([
    "apply-business-state-readback-role-grants",
    "revoke-business-state-readback-role-grants",
    "apply-refund-readiness-readback-role-grants",
    "revoke-refund-readiness-readback-role-grants",
  ], var.bootstrap_mode)
  materialize_target_mode = var.bootstrap_mode == "materialize-eximbay-canary-target"
  issue_approval_mode     = var.bootstrap_mode == "issue-eximbay-canary-approval"
  producer_mode           = local.materialize_target_mode || local.issue_approval_mode
  job_source_commit       = var.source_commit
  job_image_digest_uri    = var.bootstrap_image_digest_uri
  base_job_environment = {
    MIRA_DB_BOOTSTRAP_PROJECT_ID               = var.project_id
    MIRA_DB_BOOTSTRAP_REGION                   = local.region
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME = local.cloud_sql_connection_name
    MIRA_DB_BOOTSTRAP_DATABASE_NAME            = local.database_name
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME    = local.iam_database_username
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT            = local.job_source_commit
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI         = local.job_image_digest_uri
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT          = tostring(local.migration_count)
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256         = local.migration_sha256
  }
  target_producer_environment = local.producer_mode ? {
    MIRA_DB_BOOTSTRAP_PAYMENT_ID       = var.bootstrap_payment_id
    MIRA_DB_BOOTSTRAP_ATTESTATION_JSON = var.bootstrap_attestation_json
  } : {}
  approval_producer_environment = local.issue_approval_mode ? {
    MIRA_DB_BOOTSTRAP_RUNTIME_READBACK_JSON = var.bootstrap_runtime_readback_json
    MIRA_DB_BOOTSTRAP_ISSUER_PRINCIPAL_ID   = var.bootstrap_issuer_principal_id
  } : {}
  job_environment = merge(
    local.base_job_environment,
    var.refund_authorization_installation ? { MIRA_DB_BOOTSTRAP_APPLICATION_ROLE = "mira_application" } : {},
    local.target_producer_environment,
    local.approval_producer_environment,
  )
}
