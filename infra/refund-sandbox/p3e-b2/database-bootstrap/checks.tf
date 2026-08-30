check "exact_foundation_handoff" {
  assert {
    condition = (
      var.foundation_handoff.contract_version == "mira-refund-p3e-b2-foundation-authority/v1" &&
      var.foundation_handoff.project_id == var.project_id &&
      var.foundation_handoff.region == local.region &&
      var.foundation_handoff.network_resource_name ==
      "projects/${var.project_id}/global/networks/${var.resource_prefix}-refund-vpc" &&
      var.foundation_handoff.subnetwork_resource_name ==
      "projects/${var.project_id}/regions/${local.region}/subnetworks/${var.resource_prefix}-refund-ane3" &&
      var.foundation_handoff.cloud_sql_instance_name == local.cloud_sql_instance_name &&
      var.foundation_handoff.cloud_sql_instance_resource_name == local.cloud_sql_resource_name &&
      var.foundation_handoff.cloud_sql_connection_name == local.cloud_sql_connection_name &&
      var.foundation_handoff.database_name == local.database_name &&
      var.foundation_handoff.cloud_sql_iam_authentication == "on" &&
      var.foundation_handoff.foundation_resource_graph_sha256 ==
      "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f" &&
      var.foundation_handoff.source_state_prefix == "p3e-b2/foundation" &&
      var.foundation_handoff.apply_status == "APPLIED" &&
      var.foundation_handoff.operator_review_status == "OPERATOR_REVIEWED"
    )
    error_message = "The exact applied and reviewed foundation handoff is required."
  }
}

check "exact_machine_contract" {
  assert {
    condition = (
      local.contract.contractVersion == "mira-refund-p3e-b2-db-bootstrap-runtime/v1" &&
      local.contract.resourceGraph.resourceCount == 5 &&
      local.contract.resourceGraph.sortedAddressSha256 ==
      "c25d113c45d1bdbf96e30eda1f73914c2291946e0d012cf13d4345aad335a472" &&
      local.contract.migrations.count == local.migration_count &&
      local.contract.migrations.sha256 == local.migration_sha256
    )
    error_message = "The database-bootstrap machine contract drifted."
  }
}
