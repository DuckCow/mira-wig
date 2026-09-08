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
  worker_image_digest_uri              = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:0b3798de394041bd5869389d67668add04c66018ac8f890582c07860ca3a9dac"
  worker_image_config_digest           = "sha256:0af1f7b7c6836e4bd15c177b0a757c627f0cb59e812c2196ad831aa375ca0476"
  worker_image_source_commit           = "ec661b16bc0930394bebfd1c4ca5256a1c21869f"
  worker_image_source_context_sha256   = "a5a41521bd32c2ef46c4caf101fe53e744741cc7d5406bb00eefc0ea41dea5cf"
  worker_image_policy_path             = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v17.json"
  worker_image_policy_version          = "V17"
  worker_image_policy_sha256           = "48452e46f0d56bb0f305bca36d2537fc19db0e22538f5099aa507fe2a8b7cc86"
  worker_supervisor_source_sha256      = "f31ad5019ce4823e40a2d2589599e20d9fe5b9a2e6b126f6d56975064efaba15"
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
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID              = "6a44959c5335c547b9519761168dbe1a"
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID = "cmts5d5oz000001s6mfq4g6bc"
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED                 = "ENABLED"
    EXIMBAY_SANDBOX_MID                                       = "1849705C64"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                = local.eximbay_api_key_secret_resource_name
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                 = local.eximbay_api_key_secret_version
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
  }
}
