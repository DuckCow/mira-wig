locals {
  current_image_policy                   = jsondecode(file("${path.module}/../synthetic-sale/image-policy-v1.json"))
  current_image_policy_path              = "infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v1.json"
  current_image_policy_version           = "V1"
  current_image_policy_sha256            = "78b3bcdc0cc63b2af2f6f242cdd0405b68ef3e40c71b31aa7de9d4b6c90e130f"
  current_source_commit                  = "061b04b4969533a0f28a27dba75102842462d848"
  current_source_tree                    = "f24a70c9432c2d0c9db37ddbcb676ffcd5a13ea9"
  current_context_manifest_sha256        = "99aaf88cd93dd42686db216f3990135f0fb331d9586b1a6dcd2ec122a3d7eaf3"
  current_manifest_digest                = "sha256:b83bfc2af27c4440d8b09602d01c7bf668025106129cef23658756ca6a88642e"
  current_config_digest                  = "sha256:26ffb63bde180a20e9028a257897ad3d3fc731d961e13c77f5c066a0ede3d8c7"
  current_release_image_digest_uri       = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/synthetic-sale@${local.current_manifest_digest}"
  backend_type_contract                  = "gcs"
  backend_bucket_contract                = "mira-refund-sandbox-0001-tfstate-925882331349"
  backend_prefix_contract                = "p3e-b2/synthetic-sale-service"
  backend_state_runner_contract          = "mira-refund-state-runner@mira-refund-sandbox-0001.iam.gserviceaccount.com"
  backend_authentication_contract        = "IMPERSONATE_EXACT_STATE_RUNNER_ONLY"
  backend_persistent_local_state_policy  = "FORBIDDEN"
  backend_workspace_multiplexing_policy  = "FORBIDDEN"
  backend_normal_migration_import_policy = "NOT_PART_OF_NORMAL_RELEASE"
  backend_expected_initial_resources     = 0
  region                                 = "asia-northeast3"
  service_name                           = "mira-p3e-sbx-synthetic-sale"
  service_account_id                     = "mira-p3e-sbx-synthetic-sale"
  cloud_sql_condition_expression         = "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'"
  release_admitted = (
    var.release_authority.human_authorized &&
    var.release_authority.release_scope == "TEMPORARY_SYNTHETIC_EXIMBAY_SALE_SERVICE_MATERIALIZATION" &&
    !var.release_authority.provider_contact_execution_authorized
  )
  fixed_environment = {
    MIRA_SYNTHETIC_SALE_PROJECT_ID     = "mira-refund-sandbox-0001"
    MIRA_SYNTHETIC_SALE_PROVIDER       = "EXIMBAY"
    MIRA_SYNTHETIC_SALE_MARKET         = "US"
    MIRA_SYNTHETIC_SALE_CURRENCY       = "USD"
    PAYMENT_MODE                       = "SANDBOX"
    EXIMBAY_CHECKOUT_SANDBOX_ENABLED   = "ENABLED"
    EXIMBAY_SANDBOX_MID                = "1849705C64"
    MIRA_SYNTHETIC_SALE_RUN_CAPABILITY = var.run_capability
    MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN  = var.public_origin
  }
}
