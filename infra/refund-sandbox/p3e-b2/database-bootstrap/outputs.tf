output "bootstrap_manifest" {
  description = "Nonsecret exact dormant bootstrap runtime handoff."
  value = {
    contract_version                = local.contract.contractVersion
    source_commit                   = var.source_commit
    backend_prefix                  = local.backend_prefix
    project_id                      = var.project_id
    region                          = local.region
    service_account_email           = google_service_account.bootstrap.email
    iam_database_username           = google_sql_user.bootstrap.name
    cloud_sql_instance_name         = local.cloud_sql_instance_name
    database_name                   = local.database_name
    image_digest_uri                = var.bootstrap_image_digest_uri
    job_name                        = google_cloud_run_v2_job.bootstrap.name
    default_mode                    = "check"
    explicit_mutating_mode          = "apply"
    credential_materialization_mode = "materialize-application-credentials"
    credential_recovery_mode        = "recover-canary-application-credential"
    task_count                      = 1
    parallelism                     = 1
    max_retries                     = 0
    automatic_trigger               = "NONE"
    network_tags                    = local.network_tags
    egress                          = "ALL_TRAFFIC"
    migration_count                 = local.migration_count
    migration_sha256                = local.migration_sha256
    provider_credentials            = "NONE"
    secret_manager_dependencies     = "EXACT_SECRET_METADATA_AND_VERSION_ADD_ONLY"
    execution_status                = "DORMANT_NOT_EXECUTED"
  }
}
