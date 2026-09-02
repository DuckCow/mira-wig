locals {
  current_image_policy                   = jsondecode(file("${path.module}/../synthetic-sale/image-policy-v3.json"))
  current_image_policy_path              = "infra/refund-sandbox/p3e-b2/synthetic-sale/image-policy-v3.json"
  current_image_policy_version           = "V3"
  current_image_policy_sha256            = "af088e5f870d45de3d7a53e35ccaca7e46fa7bcaf2a896a5eaa22aaf14cb49c8"
  current_parent_image_policy_sha256     = "727106ce002e3e69599704813040c5ebf865716dd7ece987877f1a323f9fb11a"
  current_source_commit                  = "e1dd7fd2bbc01bd21e858f7148d0f12c6ec8335b"
  current_source_tree                    = "ee3f7c1c98986ba402966f5dd2e05ecd15803f82"
  current_context_manifest_sha256        = "5dc4dbe8746e0ab15237ae28a8adb08517f5b873bb726c6f9dbfff770bdf53b8"
  current_manifest_digest                = "sha256:60a80d5ce9a03ab061f86a27241630e269ecbf0e184085e5152e35639bf83880"
  current_manifest_raw_byte_length       = 3251
  current_config_digest                  = "sha256:d519553275ced514bf7243f474ee3495dee1bf56a6d08dce43d2e6add9f84132"
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
