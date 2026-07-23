locals {
  region = "asia-northeast3"

  required_services = toset([
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
  ])

  names = {
    artifact_repository = "${var.resource_prefix}-refund-images"
    network             = "${var.resource_prefix}-refund-vpc"
    subnet              = "${var.resource_prefix}-refund-ane3"
    sql_instance        = "${var.resource_prefix}-refund-pg18"
    database            = "refund_sandbox"
    preflight_job       = "refund-sandbox-preflight"
    canary_job          = "refund-sandbox-canary"
    preflight_sa        = "${var.resource_prefix}-preflight"
    canary_sa           = "${var.resource_prefix}-canary"
    preflight_db_secret = "${var.resource_prefix}-preflight-database-url"
    canary_db_secret    = "${var.resource_prefix}-canary-database-url"
  }

  disabled_activation_environment = {
    REFUND_EXECUTION_CLAIM_ENABLED                   = ""
    REFUND_EXECUTION_LEASE_ENABLED                   = ""
    REFUND_EXECUTION_LEASE_RELEASE_ENABLED           = ""
    REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED    = ""
    REFUND_EXECUTION_WORKER_ENABLED                  = ""
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED  = ""
    REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED      = ""
    REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED = ""
    REFUND_EXECUTION_TOSS_CONTACT_ENABLED            = ""
    REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED    = ""
    REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED = ""
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED = ""
  }

  canary_internal_budget_seconds = 120

  deferred_observability_definitions = {
    cloud_run_execution_failure = "run.googleapis.com/job/completed with failed execution"
    task_timeout                = "Cloud Run task terminated at the fixed 150-second deadline"
    missing_final_result        = "no canonical worker process result before execution completion"
    overlap_skipped             = "worker code OVERLAP_SKIPPED"
    preflight_failure           = "preflight result other than PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE"
    configuration_failure       = "CONFIG_INVALID or MIGRATIONS_NOT_READY"
  }
}
