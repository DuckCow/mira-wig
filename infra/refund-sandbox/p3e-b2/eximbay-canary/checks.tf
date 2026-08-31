check "exact_release_authority" {
  assert {
    condition     = local.runtime_apply_authorized
    error_message = "EXIMBAY_CANARY_RELEASE_AUTHORITY_MISSING"
  }
}

check "exact_release_handoffs" {
  assert {
    condition = (
      var.project_id == "mira-refund-sandbox-0001" &&
      var.cloud_sql_instance_connection_name == "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18" &&
      var.network_resource_name == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc" &&
      var.subnetwork_resource_name == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3" &&
      var.database_url_secret_id == "mira-p3e-sbx-canary-database-url" &&
      var.database_url_secret_version == "1" &&
      var.eximbay_api_key_secret_id == "mira-p3e-sbx-eximbay-api-key" &&
      var.eximbay_api_key_secret_version == "1"
    )
    error_message = "The exact reviewed canary project, network, database, and secret handoffs are required."
  }
}
