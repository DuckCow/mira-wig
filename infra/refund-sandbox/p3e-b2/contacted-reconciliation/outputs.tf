output "runtime_manifest" {
  description = "Nonsecret source-authority manifest; never execution authority or live evidence."
  value = {
    contract_version             = local.contract.contractVersion
    backend_prefix               = local.backend_prefix_contract
    project_id                   = local.project_id
    region                       = local.region
    materialized                 = var.runtime_materialized
    default_materialized         = local.runtime_default_materialized
    retirement                   = "SET_RUNTIME_MATERIALIZED_FALSE_AND_APPLY_UNDER_SEPARATE_AUTHORITY"
    service_account_id           = local.service_account_id
    service_account_email        = local.service_account_email
    job_name                     = local.job_name
    image_digest_uri             = local.worker_image_digest_uri
    command                      = local.command
    task_count                   = local.task_count
    parallelism                  = local.parallelism
    max_retries                  = local.max_retries
    timeout_seconds              = local.task_timeout_seconds
    cpu                          = local.cpu
    memory                       = local.memory
    database_secret_version      = local.database_url_secret_version
    provider_secret_version      = local.eximbay_api_key_secret_version
    cloud_sql_instance           = local.cloud_sql_instance_connection_name
    egress                       = "PRIVATE_RANGES_ONLY"
    automatic_execution          = "NONE"
    execution_on_apply           = false
    operator_execution_overrides = "PROHIBITED_BY_AUTHORITY"
  }
}
