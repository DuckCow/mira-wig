output "readback_manifest" {
  description = "Nonsecret source authority; never execution evidence or materialization authority."
  value = {
    contract_version              = local.contract.contractVersion
    backend_bucket                = local.contract.terraform.backendBucket
    backend_prefix                = local.contract.terraform.backendPrefix
    runtime_owner                 = local.contract.runtime.owner
    materialized                  = var.runtime_materialized
    refund_readiness_materialized = var.refund_readiness_runtime_materialized
    materialization_status        = var.runtime_materialized ? "READY" : var.refund_readiness_runtime_materialized ? "REFUND_READINESS_READY" : "DISABLED"
    managed_resource_count        = var.runtime_materialized ? local.contract.resourceGraph.materializedResourceCount : var.refund_readiness_runtime_materialized ? local.readiness_contract.resourceGraph.materializedResourceCount : 0
    managed_addresses = var.runtime_materialized ? local.contract.resourceGraph.materializedAddresses : var.refund_readiness_runtime_materialized ? concat(
      [local.readiness_contract.resourceGraph.jobAddress],
      local.readiness_contract.resourceGraph.sharedAddresses,
    ) : []
    default_materialized       = false
    retirement                 = local.contract.materialization.retirement
    run_id                     = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID
    checkout_session_id        = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID
    historical_execution       = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION
    historical_uid             = local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION_UID
    service_account_email      = local.service_account_email
    database_user              = local.iam_database_username
    job_name                   = local.job_name
    command                    = local.command
    source_commit              = local.source_commit
    image_digest_uri           = local.bootstrap_image_digest_uri
    task_count                 = local.task_count
    parallelism                = local.parallelism
    max_retries                = local.max_retries
    provider_secret_access     = "ABSENT"
    execution_on_apply         = false
    automatic_execution        = "NONE"
    readiness_job_name         = local.readiness_job_name
    readiness_command          = local.readiness_command
    readiness_source_commit    = local.readiness_contract.runtime.sourceCommit
    readiness_source_tree      = local.readiness_contract.runtime.sourceTree
    readiness_image_digest_uri = local.readiness_contract.runtime.imageDigestUri
  }
}
