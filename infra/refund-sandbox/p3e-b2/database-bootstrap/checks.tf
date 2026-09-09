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
    condition = var.refund_authorization_installation || (
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
      local.contract.image.configDigest == "sha256:04ee9e2a981086d904a1c318fcf30cb7ad8523029c78ff1670e0c1f17254645e" &&
      local.contract.image.sourceCommit == var.source_commit &&
      local.contract.image.sourceTree == "c18fb7426f1ddbfc7bb2d25d4202c933a0bd5637" &&
      local.contract.image.contextSha256 == "25c6abf4fb695cfb17577bd1907f9a072f614047678f22ae9da15348712c44cf" &&
      local.contract.image.contextFiles == 68 &&
      local.contract.image.refundAuthority.runtimeContractVersion == "mira-refund-p3e-b2-eximbay-canary-runtime/v2" &&
      local.contract.image.refundAuthority.runtimeContractSha256 == "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41" &&
      local.contract.image.refundAuthority.imagePolicyVersion == "mira-refund-eximbay-canary-image-policy/v9" &&
      local.contract.image.refundAuthority.imagePolicySha256 == "ab131ce60eb1d3643a7323402d84694d0d62a6d3c68653440f0cca8422002bdf" &&
      local.contract.image.refundAuthority.workerManifestDigest == "sha256:f3bbc000423588905c19507fcabb52e475923c1fcf1d0d03ffe5ac6b1d9fa691" &&
      local.contract.image.refundAuthority.workerConfigDigest == "sha256:1bfa5a67f9219a62f717056f1edb2fafaa0ca1c2dabb58c854eb655a435d1e27" &&
      local.contract.image.authority == "CURRENT_REVIEWED_EXACT_IMMUTABLE" &&
      local.contract.image.modeSelection == "INDEPENDENT_OF_BOOTSTRAP_MODE" &&
      local.contract.image.producerResultBoundary.field == "validatedProducerResult" &&
      local.contract.image.producerResultBoundary.stdoutByteLimit == 16384 &&
      local.contract.image.producerResultBoundary.stdout == "BOUNDED_PIPE" &&
      local.contract.image.producerResultBoundary.stderr == "DISCARDED" &&
      local.contract.image.producerResultBoundary.singleCanonicalJson == true &&
      local.contract.image.producerResultBoundary.exactModeSchemas == [
        "EXIMBAY_CANARY_TARGET_MATERIALIZED",
        "EXIMBAY_CANARY_APPROVAL_ISSUED",
      ] &&
      local.contract.image.producerResultBoundary.paymentCorrespondence == "EXACT" &&
      local.contract.image.producerResultBoundary.approvalTargetBindingCorrespondence == "EXACT" &&
      local.contract.image.producerResultBoundary.topLevelTargetMatchesRuntimeBindings == true &&
      local.contract.image.producerResultBoundary.topLevelProvenanceMatchesRuntimeBindings == true &&
      local.contract.image.producerResultBoundary.cleanupFailurePreservation == "VALIDATED_RESULT_PRESERVED_OVERALL_FAILURE" &&
      local.contract.image.producerResultBoundary.missingOrMalformed == "RUNTIME_LOCAL_FAILED_NO_BINDING_EVIDENCE" &&
      local.contract.image.producerResultBoundary.automaticProducerRetry == 0 &&
      local.contract.image.producerResultBoundary.providerEffectAuthority == "NONE" &&
      local.contract.image.predecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bd8137d52a1040986e793646b92e73d11eab6a6742448948997225e59d47b8ba" &&
      local.contract.image.predecessor.configDigest == "sha256:99785c2f52c6dc4f58983354354efa6f9c8905fbe107f80dc79034c2ab9fa254" &&
      local.contract.image.predecessor.sourceCommit == "1bd9b7f9c37f2d66bb7e615a0d9e1c335190fc4d" &&
      local.contract.image.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.image.historicalPredecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      local.contract.image.historicalPredecessor.configDigest == "sha256:9b3482a74b764b5ea0e56c23c53457a448091d9163466967831daf6334b52c8a" &&
      local.contract.image.historicalPredecessor.sourceCommit == "81e785448f834f4176cd5153eb3cbdf6d79d936c" &&
      local.contract.image.historicalPredecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.image.verifierDefectivePredecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3" &&
      local.contract.image.verifierDefectivePredecessor.configDigest == "sha256:9f76a76badc546af43ab6e04006262d12579ba1953d1ff287f65ba7aa9b53de6" &&
      local.contract.image.verifierDefectivePredecessor.sourceCommit == "d908d71b5de5dc4223db77268719ed9e97277253" &&
      local.contract.image.verifierDefectivePredecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.image.earliestPredecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:cc1d0e7e82cb8674b0b5da47e04a3a7b72b41aa9035ad4144e15747bcaa5f086" &&
      local.contract.image.earliestPredecessor.configDigest == "sha256:10cac1ead90cfdf9ec718e22dab7dfac42206df2d4c1e9db7e05f021be1eab72" &&
      local.contract.image.earliestPredecessor.sourceCommit == "4a6f2967be6de4526fa7b47d414d1cbaec600783" &&
      local.contract.image.earliestPredecessor.status == "HISTORICAL_PROVENANCE_ONLY" &&
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
      local.contract.job.producerInputForwarding.owner == "EXISTING_BOOTSTRAP_PARSER" &&
      local.contract.job.producerInputForwarding.materializeTarget == [
        "MIRA_DB_BOOTSTRAP_PAYMENT_ID",
        "MIRA_DB_BOOTSTRAP_ATTESTATION_JSON",
      ] &&
      local.contract.job.producerInputForwarding.issueApproval == [
        "MIRA_DB_BOOTSTRAP_PAYMENT_ID",
        "MIRA_DB_BOOTSTRAP_ATTESTATION_JSON",
        "MIRA_DB_BOOTSTRAP_RUNTIME_READBACK_JSON",
        "MIRA_DB_BOOTSTRAP_ISSUER_PRINCIPAL_ID",
      ] &&
      local.contract.job.producerInputForwarding.otherModes == "ABSENT" &&
      local.contract.job.producerInputForwarding.bindingCalculation == "NONE" &&
      local.contract.job.producerInputForwarding.executionOverrideSurface == "ABSENT" &&
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

check "producer_input_forwarding" {
  assert {
    condition = local.materialize_target_mode ? (
      var.bootstrap_payment_id != null &&
      var.bootstrap_attestation_json != null &&
      var.bootstrap_runtime_readback_json == null &&
      var.bootstrap_issuer_principal_id == null
      ) : local.issue_approval_mode ? (
      var.bootstrap_payment_id != null &&
      var.bootstrap_attestation_json != null &&
      var.bootstrap_runtime_readback_json != null &&
      var.bootstrap_issuer_principal_id != null
      ) : (
      var.bootstrap_payment_id == null &&
      var.bootstrap_attestation_json == null &&
      var.bootstrap_runtime_readback_json == null &&
      var.bootstrap_issuer_principal_id == null
    )
    error_message = "Existing producer inputs must be complete for the selected producer mode and absent from every other mode."
  }
}

check "exact_refund_authorization_installation" {
  assert {
    condition = var.refund_authorization_installation ? (
      var.source_commit == "8dc0233557615ca95a649d40ee83c13c83b6a435" &&
      var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:f5c316cdac0dd4f6f64c2d129cf7f9eea57265861683334fa3e078b4ddb827c6" &&
      filesha256("${path.module}/../contracts/database-bootstrap-runtime-v2.json") == "96970db5cb05de5a979ad8ca240f86d354922759f04a1498edcf2bf247fc455a" &&
      local.migration_count == 42 &&
      local.migration_sha256 == "7eea189bc4bfe165ab699113952c22493895692a2377fcdfc00e7ba956abb370" &&
      contains(["check", "apply-refund-authorization-cutover", "restore-canary-refund-role-grants"], var.bootstrap_mode) &&
      (var.bootstrap_mode == "check" || var.temporary_cloud_sql_access_authorized)
    ) : var.bootstrap_mode != "apply-refund-authorization-cutover"
    error_message = "Only the retained v2 artifact, exact application role, 42 inventory and bounded attended cutover/restoration are allowed."
  }
}
