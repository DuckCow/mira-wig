locals {
  contract = jsondecode(file("${path.module}/../contracts/business-state-readback-runtime-v1.json"))

  project_id                         = "mira-refund-sandbox-0001"
  region                             = "asia-northeast3"
  service_account_id                 = "mira-p3e-sbx-readback"
  service_account_email              = "${local.service_account_id}@${local.project_id}.iam.gserviceaccount.com"
  iam_database_username              = "${local.service_account_id}@${local.project_id}.iam"
  job_name                           = "mira-p3e-sbx-contacted-readback"
  command                            = "contacted-reconciliation-business-state-readback"
  cloud_sql_instance_name            = "mira-p3e-sbx-refund-pg18"
  cloud_sql_instance_resource_name   = "projects/${local.project_id}/instances/${local.cloud_sql_instance_name}"
  cloud_sql_instance_connection_name = "${local.project_id}:${local.region}:${local.cloud_sql_instance_name}"
  network_resource_name              = "projects/${local.project_id}/global/networks/mira-p3e-sbx-refund-vpc"
  subnetwork_resource_name           = "projects/${local.project_id}/regions/${local.region}/subnetworks/mira-p3e-sbx-refund-ane3"
  database_name                      = "refund_sandbox"
  network_tags                       = ["refund-provider-free"]
  task_count                         = 1
  parallelism                        = 1
  max_retries                        = 0
  task_timeout_seconds               = 180
  cpu                                = "1"
  memory                             = "512Mi"
  runtime_instances                  = var.runtime_materialized ? { runtime = true } : {}
  source_commit                      = var.source_commit != null ? var.source_commit : "SOURCE_ONLY_NOT_MATERIALIZED"
  bootstrap_image_digest_uri         = var.bootstrap_image_digest_uri != null ? var.bootstrap_image_digest_uri : "SOURCE_ONLY_NOT_MATERIALIZED"
  cloud_sql_condition_expression     = "resource.name == '${local.cloud_sql_instance_resource_name}' && resource.service == 'sqladmin.googleapis.com'"
  fixed_environment = {
    MIRA_DB_BOOTSTRAP_PROJECT_ID                               = local.project_id
    MIRA_DB_BOOTSTRAP_REGION                                   = local.region
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
    MIRA_DB_BOOTSTRAP_DATABASE_NAME                            = local.database_name
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME                    = local.iam_database_username
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT                            = local.source_commit
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI                         = local.bootstrap_image_digest_uri
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT                          = "41"
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256                         = "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c"
    MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID              = "a764f61f4e4ba799ab16b318a676db65"
    MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID = "cmthg2mzu000001s6iuvx7u5x"
    MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION           = "mira-p3e-sbx-contacted-reconciliation-vnnsq"
    MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION_UID       = "87d659b0-a6a3-4353-9678-c18f629df434"
  }
}
