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
  worker_image_digest_uri              = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:44bf4d246a5a23b02d09dadc8be14f21f3d8a5a5f00bac6a68dfcc78a96e1d08"
  worker_image_config_digest           = "sha256:8db81d36d6354f183bf28cdaee645dfae414afbe87913a1e721708a6838a2d06"
  worker_image_source_commit           = "6e1aaa32b66876252dcce40296970ea23d592d64"
  worker_image_source_context_sha256   = "15134b546f11bc265260d384ef6ef1f6b9372a9ee0d9d635459625e89cb6a6ed"
  worker_image_policy_path             = "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v10.json"
  worker_image_policy_version          = "V10"
  worker_image_policy_sha256           = "5139f86b0cfa8321dd14caf8e5083a765ddccc33e82c5dbf03844c3e0106a851"
  worker_supervisor_source_sha256      = "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711"
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
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID              = "4c5c9b039f18037c6f3356c903df1372"
    MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID = "cmtk62h80000001s626b90f9y"
    EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED                 = "ENABLED"
    EXIMBAY_SANDBOX_MID                                       = "1849705C64"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                = local.eximbay_api_key_secret_resource_name
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                 = local.eximbay_api_key_secret_version
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                 = local.cloud_sql_instance_connection_name
  }
}
