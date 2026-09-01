check "materialization_gate" {
  assert {
    condition = !var.runtime_materialized || (
      var.source_commit != null &&
      var.bootstrap_image_digest_uri != null
    )
    error_message = "Materialization requires the reviewed source commit and immutable bootstrap digest."
  }
}

check "machine_contract_alignment" {
  assert {
    condition = (
      local.contract.contractVersion == "mira-refund-p3e-b2-business-state-readback-runtime/v1" &&
      local.contract.status == "SOURCE_DEFINED_DEFAULT_DISABLED" &&
      local.contract.target.runId == local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID &&
      local.contract.target.checkoutSessionId == local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID &&
      local.contract.runtime.owner == "DATABASE_BOOTSTRAP_BOUNDED_READBACK" &&
      local.contract.runtime.job == local.job_name &&
      local.contract.runtime.command == local.command &&
      local.contract.runtime.imageDigestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3" &&
      local.contract.runtime.imageConfigDigest == "sha256:9f76a76badc546af43ab6e04006262d12579ba1953d1ff287f65ba7aa9b53de6" &&
      local.contract.runtime.sourceCommit == "d908d71b5de5dc4223db77268719ed9e97277253" &&
      local.contract.runtime.databaseUser == local.iam_database_username &&
      local.contract.runtime.providerSecretAccess == false &&
      local.contract.runtime.executionOnApply == false &&
      local.contract.resourceGraph.defaultResourceCount == 0 &&
      local.contract.resourceGraph.materializedResourceCount == 5 &&
      local.contract.resourceGraph.materializedSortedAddressSha256 == "d96557af0ee0024f51fc0317df774594ea39d858c49f03d26d449c5f68a07285" &&
      local.contract.materialization.default == false &&
      local.contract.materialization.roleGrantMode == "apply-business-state-readback-role-grants" &&
      local.contract.materialization.roleRevokeMode == "revoke-business-state-readback-role-grants"
    )
    error_message = "The exact business-state readback machine contract must remain aligned."
  }
}

check "strict_runtime_shape" {
  assert {
    condition = (
      local.task_count == 1 &&
      local.parallelism == 1 &&
      local.max_retries == 0 &&
      local.task_timeout_seconds == 180 &&
      local.network_tags == ["refund-provider-free"]
    )
    error_message = "The readback must remain one-task, zero-retry, bounded, and provider-free."
  }
}
