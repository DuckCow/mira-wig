locals {
  contract     = jsondecode(file("${path.module}/../contracts/eximbay-canary-runtime-v4.json"))
  image_policy = jsondecode(file("${path.module}/../eximbay-canary/image-policy-v20.json"))

  runtime_apply_authorized = (
    var.release_authority.human_authorized == true &&
    var.release_authority.release_scope == "DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_MATERIALIZATION" &&
    var.release_authority.provider_contact_authorized == false
  )
  runtime_root_apply_policy      = "EXPLICIT_DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_RELEASE"
  backend_bucket_contract        = "mira-refund-sandbox-0001-tfstate-925882331349"
  backend_prefix_contract        = "p3e-b2/eximbay-canary"
  region                         = "asia-northeast3"
  service_account_id             = "mira-eximbay-canary"
  job_name                       = "mira-eximbay-refund-canary"
  command                        = "eximbay-refund-reentry-once"
  release_image_digest_uri       = var.authorization_installation ? "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:1a680f7fa7417d999b477459ab64bb181270265acc411bd27554112960a15904" : "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:e7d3cf8599c49a73e0199f3cea9e7a3b57efd9403fef9191b4b6f3be2f045ff0"
  cloud_sql_instance_resource    = "projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18"
  api_key_secret_resource        = "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key"
  cloud_sql_condition_expression = "resource.name == '${local.cloud_sql_instance_resource}' && resource.service == 'sqladmin.googleapis.com'"
  task_count                     = 1
  parallelism                    = 1
  max_retries                    = 0
  task_timeout_seconds           = 180
  required_activation = {
    REFUND_EXECUTION_WORKER_ENABLED                  = "ENABLED"
    REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED         = "ENABLED"
    REFUND_EXECUTION_LEASE_ENABLED                   = "ENABLED"
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED    = "ENABLED"
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED  = "ENABLED"
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED = "ENABLED"
  }
  authority_environment = var.authorization_installation ? merge({
    MIRA_REFUND_AUTHORIZATION_ENABLED         = "ENABLED"
    MIRA_REFUND_REENTRY_JOB_NAME              = "projects/${var.project_id}/locations/${local.region}/jobs/${local.job_name}"
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME = var.cloud_sql_instance_connection_name
    CHECKPOINT_DISABLE                        = "1"
    }, var.authorization_admission_url == null ? {} : {
    MIRA_REFUND_REENTRY_ADMISSION_URL = var.authorization_admission_url
    }) : {
    MIRA_REFUND_EXIMBAY_CANARY_LANE                             = "EXIMBAY_SANDBOX_V1"
    MIRA_REFUND_EXIMBAY_CANARY_RELEASE_BINDING_DIGEST           = "0944e3e6fd1d0f85a0b5196adf4fe724e27eff64992e1fe711bfdf3f77637433"
    MIRA_REFUND_EXIMBAY_CANARY_JOB_BINDING_DIGEST               = "204c8cd805e7cb66f66e7a7590f070117bc2f2312c30d46ac64b7cd574b42c07"
    MIRA_REFUND_EXIMBAY_CANARY_PREFLIGHT_JOB_BINDING_DIGEST     = "97e3aeb0fc4c1bec9ae316d915158ffb647ced886fd8166f1929d2f9dc925ffd"
    MIRA_REFUND_EXIMBAY_CANARY_IMAGE_BINDING_DIGEST             = "5c5718b3e697f5bb72491f5347e172eddb7026aac1fb87aa7b8da4bae875852e"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_GENERATION_BINDING_DIGEST = "cc778c3c5d0a533371ef31c119b521510f0b7eb2a1515cc7e6f04a4c304129d7"
    MIRA_REFUND_EXIMBAY_CANARY_TARGET_BINDING_DIGEST            = "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c"
    MIRA_REFUND_EXIMBAY_CANARY_SYNTHETIC_PROVENANCE_DIGEST      = "710a63bda4810d0f1f974a82b33b476dedaa20cc14df6746eb3bb478790a4d75"
    MIRA_REFUND_EXIMBAY_CANARY_NO_CUSTOMER_PII_ATTESTED         = "TRUE"
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_RESOURCE                  = local.api_key_secret_resource
    MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION                   = var.eximbay_api_key_secret_version
    EXIMBAY_SANDBOX_MID                                         = "1849705C64"
    EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING             = "783244bb25ed5c7506bd3589e8b252e683c65f265068673dbe4d18e415477893"
    EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING        = "2c03724ab5f9746b50815e888ef1619719b5ab1590ac69873487d337ffd50c73"
    REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME                   = var.cloud_sql_instance_connection_name
  }
}
