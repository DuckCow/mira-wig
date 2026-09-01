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
      local.contract.status == "SOURCE_DEFINED_AUTHORITY_RETIREMENT_TARGET" &&
      local.contract.resourceGraph.resourceCount == 3 &&
      local.contract.resourceGraph.sortedAddressSha256 ==
      "ae5f085000d7a0d7e50380eb3c5451ae473f24c63ab0fce5a7ef1ee21adb9c22" &&
      local.contract.resourceGraph.temporaryAuthorizedResourceCount == 5 &&
      local.contract.resourceGraph.temporaryAuthorizedSortedAddressSha256 ==
      "c25d113c45d1bdbf96e30eda1f73914c2291946e0d012cf13d4345aad335a472" &&
      local.contract.iam.temporaryCloudSqlAccessDefault == false &&
      local.contract.iam.temporaryAuthorizedRoles == [
        "roles/cloudsql.client",
        "roles/cloudsql.instanceUser",
      ] &&
      length(local.contract.iam.roles) == 0 &&
      length(local.contract.iam.credentialSecretScope) == 0 &&
      length(local.contract.iam.credentialSecretRoles) == 0 &&
      local.contract.identity.databaseRoles == ["cloudsqlsuperuser"] &&
      local.contract.migrations.count == local.migration_count &&
      local.contract.migrations.sha256 == local.migration_sha256 &&
      local.contract.image.digestUri == var.bootstrap_image_digest_uri &&
      local.contract.image.configDigest == "sha256:10cac1ead90cfdf9ec718e22dab7dfac42206df2d4c1e9db7e05f021be1eab72" &&
      local.contract.image.sourceCommit == var.source_commit &&
      contains(local.contract.image.mutatingModes, "apply-contacted-reconciliation-role-grants") &&
      contains(local.contract.image.mutatingModes, "restore-canary-refund-role-grants") &&
      local.contract.job.terraformModeSelector.input == "bootstrap_mode" &&
      local.contract.job.terraformModeSelector.owner == "TERRAFORM" &&
      local.contract.job.terraformModeSelector.allowedModes == [
        "check",
        "apply-contacted-reconciliation-role-grants",
        "restore-canary-refund-role-grants",
      ] &&
      local.contract.job.terraformModeSelector.defaultMode == "check" &&
      local.contract.job.terraformModeSelector.jobArgumentsBinding == ["var.bootstrap_mode"] &&
      local.contract.job.terraformModeSelector.executionOverrideSurface == "ABSENT" &&
      local.contract.job.contactedReconciliationArguments == [
        "apply-contacted-reconciliation-role-grants",
        "restore-canary-refund-role-grants",
      ]
    )
    error_message = "The database-bootstrap machine contract drifted."
  }
}

check "business_state_readback_role_grant_reentry" {
  assert {
    condition = !local.readback_role_grant_mode || (
      var.temporary_cloud_sql_access_authorized &&
      var.readback_source_commit != null &&
      var.readback_bootstrap_image_digest_uri != null
    )
    error_message = "The readback role-grant mode requires explicit temporary Cloud SQL admission and the reviewed readback-capable source/image."
  }
}
