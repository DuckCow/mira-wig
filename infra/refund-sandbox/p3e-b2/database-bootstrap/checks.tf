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
      local.contract.image.configDigest == "sha256:9b3482a74b764b5ea0e56c23c53457a448091d9163466967831daf6334b52c8a" &&
      local.contract.image.sourceCommit == var.source_commit &&
      local.contract.image.authority == "CURRENT_REVIEWED_EXACT_IMMUTABLE" &&
      local.contract.image.modeSelection == "INDEPENDENT_OF_BOOTSTRAP_MODE" &&
      local.contract.image.predecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3" &&
      local.contract.image.predecessor.configDigest == "sha256:9f76a76badc546af43ab6e04006262d12579ba1953d1ff287f65ba7aa9b53de6" &&
      local.contract.image.predecessor.sourceCommit == "d908d71b5de5dc4223db77268719ed9e97277253" &&
      local.contract.image.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.image.historicalPredecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086" &&
      local.contract.image.historicalPredecessor.configDigest == "sha256:10cac1ead90cfdf9ec718e22dab7dfac42206df2d4c1e9db7e05f021be1eab72" &&
      local.contract.image.historicalPredecessor.sourceCommit == "4a6f2967be6de4526fa7b47d414d1cbaec600783" &&
      local.contract.image.historicalPredecessor.status == "HISTORICAL_PROVENANCE_ONLY" &&
      local.contract.image.mutatingModes == [
        "apply",
        "apply-canary-role-grants",
        "apply-synthetic-sale-role-grants",
        "apply-contacted-reconciliation-role-grants",
        "apply-business-state-readback-role-grants",
        "revoke-business-state-readback-role-grants",
        "materialize-synthetic-sale-market-precondition",
        "restore-canary-refund-role-grants",
        "materialize-eximbay-canary-target",
        "issue-eximbay-canary-approval",
        "materialize-application-credentials",
        "recover-canary-application-credential",
      ] &&
      local.contract.job.terraformModeSelector.input == "bootstrap_mode" &&
      local.contract.job.terraformModeSelector.owner == "TERRAFORM" &&
      local.contract.job.terraformModeSelector.allowedModes == [
        "check",
        "apply",
        "apply-canary-role-grants",
        "apply-synthetic-sale-role-grants",
        "apply-contacted-reconciliation-role-grants",
        "apply-business-state-readback-role-grants",
        "revoke-business-state-readback-role-grants",
        "contacted-reconciliation-business-state-readback",
        "materialize-synthetic-sale-market-precondition",
        "restore-canary-refund-role-grants",
        "materialize-eximbay-canary-target",
        "issue-eximbay-canary-approval",
        "materialize-application-credentials",
        "recover-canary-application-credential",
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

check "business_state_readback_role_lifecycle_reentry" {
  assert {
    condition     = !local.readback_role_lifecycle_mode || var.temporary_cloud_sql_access_authorized
    error_message = "The readback role lifecycle requires explicit temporary Cloud SQL admission; the current exact image/source remain mode-independent."
  }
}
