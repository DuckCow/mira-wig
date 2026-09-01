output "readback_manifest" {
  description = "Nonsecret source authority; never execution evidence or materialization authority."
  value = {
    contract_version       = local.contract.contractVersion
    runtime_owner          = local.contract.runtime.owner
    materialized           = var.runtime_materialized
    default_materialized   = false
    retirement             = local.contract.materialization.retirement
    run_id                 = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID
    checkout_session_id    = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID
    historical_execution   = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION
    historical_uid         = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION_UID
    service_account_email  = local.service_account_email
    database_user          = local.iam_database_username
    job_name               = local.job_name
    command                = local.command
    task_count             = local.task_count
    parallelism            = local.parallelism
    max_retries            = local.max_retries
    provider_secret_access = "ABSENT"
    execution_on_apply     = false
    automatic_execution    = "NONE"
  }
}
