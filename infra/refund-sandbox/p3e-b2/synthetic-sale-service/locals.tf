locals {
  region                         = "asia-northeast3"
  service_name                   = "mira-p3e-sbx-synthetic-sale"
  service_account_id             = "mira-p3e-sbx-synthetic-sale"
  cloud_sql_condition_expression = "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'"
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
