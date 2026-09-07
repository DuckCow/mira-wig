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
  worker_image_digest_uri              = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:f0e4d8a9f71febb8a6716e015b9b75eda8094150bb389eb7722e22916c58d786"
  worker_image_config_digest           = "sha256:7055be950521c545ed3121aa2f8106d3da0b3c9224f8a139bdbcad7c999515d2"
  worker_image_source_commit           = "b19b8e679be1d42e36f223fd4eb724d777023072"
  worker_image_source_context_sha256   = "0556dde8ef8453cf18b5613064d42515905486e5e2ce9ff2de6f3f87dc279d2e"
  worker_image_policy_path             = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v14.json"
  worker_image_policy_version          = "V14"
  worker_image_policy_sha256           = "7c2561ec1c53b1cd1f69ba7ffec271e1a5b16ce4427abd45ea5c4055a4d653a8"
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
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID              = "248a30b8004082b8fca92f2c1a1fb066"
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID = "cmtr2fobw000001s6ovszlemp"
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED                 = "ENABLED"
    EXIMBAY_SANDBOX_MID                                       = "1849705C64"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                = local.eximbay_api_key_secret_resource_name
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                 = local.eximbay_api_key_secret_version
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
  }
}
