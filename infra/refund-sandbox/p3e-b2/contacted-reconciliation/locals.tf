locals {
  contract = jsondecode(file("${path.module}/../contracts/contacted-reconciliation-runtime-v1.json"))

  project_id                           = "mira-refund-sandbox-0001"
  project_number                       = "925882331349"
  region                               = "asia-northeast3"
  backend_bucket_contract              = "mira-refund-sandbox-0001-tfstate-925882331349"
  backend_prefix_contract              = "p3e-b2/contacted-reconciliation"
  backend_state_runner_contract        = "mira-refund-state-runner@mira-refund-sandbox-0001.iam.gserviceaccount.com"
  service_account_id                   = "mira-p3e-sbx-contacted-recon"
  service_account_email                = "${local.service_account_id}@${local.project_id}.iam.gserviceaccount.com"
  job_name                             = "mira-p3e-sbx-contacted-reconciliation"
  worker_image_digest_uri              = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:4d28f12574708ed8e14857eee7dc07d92ab52ff9bc4e56e0c2ce89d8d390fccc"
  worker_image_config_digest           = "sha256:6daaa4e85e62f3ad7b171ed958ff83b05f5e0f44c9a565f35da4ca0088abb9a9"
  worker_image_source_commit           = "7958fb0b228266d502f5e55a14929e8d5510e913"
  worker_image_source_context_sha256   = "9bbf7398224f0d669954748a8b34b7a8ce7d81b33281f9b249a579a28ca4f0ac"
  worker_image_policy_path             = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json"
  worker_image_policy_version          = "V3"
  worker_image_policy_sha256           = "9094297f20d5c2db8e12088d5bb7769da690d9fec29f9309426ff6e6ade56062"
  worker_supervisor_source_sha256      = "0d9fd396e5afb2d48d087472aa5f4a1d9dfcd4fe0353347e9c7c42e347ae277a"
  command                              = "eximbay-contacted-reconciliation-once"
  cloud_sql_instance_connection_name   = "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18"
  cloud_sql_instance_resource_name     = "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18"
  network_resource_name                = "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc"
  subnetwork_resource_name             = "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
  database_url_secret_id               = "mira-p3e-sbx-canary-database-url"
  database_url_secret_resource_name    = "projects/mira-refund-sandbox-0001/secrets/${local.database_url_secret_id}"
  database_url_secret_version          = "1"
  eximbay_api_key_secret_id            = "mira-p3e-sbx-eximbay-api-key"
  eximbay_api_key_secret_resource_name = "projects/mira-refund-sandbox-0001/secrets/${local.eximbay_api_key_secret_id}"
  eximbay_api_key_secret_version       = "1"
  cloud_sql_condition_expression       = "resource.name == '${local.cloud_sql_instance_resource_name}' && resource.service == 'sqladmin.googleapis.com'"
  network_tags                         = ["refund-provider-free"]
  task_count                           = 1
  parallelism                          = 1
  max_retries                          = 0
  task_timeout_seconds                 = 180
  task_timeout                         = "${local.task_timeout_seconds}s"
  cpu                                  = "1"
  memory                               = "512Mi"
  runtime_default_materialized         = false
  runtime_instances                    = var.runtime_materialized ? { runtime = true } : {}
  runtime_secret_access = var.runtime_materialized ? {
    database_url    = local.database_url_secret_id
    eximbay_api_key = local.eximbay_api_key_secret_id
  } : {}
  fixed_environment = {
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID              = "a764f61f4e4ba799ab16b318a676db65"
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID = "cmthg2mzu000001s6iuvx7u5x"
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED                 = "ENABLED"
    EXIMBAY_SANDBOX_MID                                       = "1849705C64"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                = local.eximbay_api_key_secret_resource_name
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                 = local.eximbay_api_key_secret_version
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
  }
}
