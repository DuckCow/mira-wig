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
  worker_image_digest_uri              = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:fb842afe02400f430e5c4de230ad527cad8e6d9b6954307c67bbafa7446177d1"
  worker_image_config_digest           = "sha256:17b0345bef092295894ef81c531b31e080243ca0c3b989cab3808c257bad89fa"
  worker_image_source_commit           = "5ed4407412996d195577766c04ba3d73430fa791"
  worker_image_source_context_sha256   = "dbde499a5ccf3506d1a557cb516c20967af966efcd0ba6e9f18bc78f7a6ad915"
  worker_image_policy_path             = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v18.json"
  worker_image_policy_version          = "V18"
  worker_image_policy_sha256           = "8744198014a3327b569420afad356d090186a118a7057758ea4ad8783a7d7822"
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
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID              = "eea19da85caa9d370c0be2f20dcd68da"
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID = "cmtsa2gt7000001s6vpz7vepd"
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED                 = "ENABLED"
    EXIMBAY_SANDBOX_MID                                       = "1849705C64"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                = local.eximbay_api_key_secret_resource_name
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                 = local.eximbay_api_key_secret_version
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
  }
}
