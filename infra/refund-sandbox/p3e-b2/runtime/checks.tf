check "machine_contract_alignment" {
  assert {
    condition = (
      local.authority_contract.contractVersion ==
      "mira-refund-p3e-b2-dormant-runtime-authority/v1" &&
      local.authority_contract.resourceGraph.resourceCount == 8 &&
      local.authority_contract.state.prefix == "p3e-b2/runtime" &&
      local.authority_contract.jobs.taskTimeout.seconds == local.task_timeout_seconds &&
      local.authority_contract.jobs.resources.cpu == local.cpu &&
      local.authority_contract.jobs.resources.memory == local.memory &&
      local.authority_contract.status.RUNTIME_ROOT_APPLY_POLICY ==
      local.runtime_root_apply_policy &&
      local.authority_contract.network.tags == local.network_tags
    )
    error_message = "Runtime Terraform and the machine authority contract must remain exact."
  }
}

check "runtime_root_apply_policy" {
  assert {
    condition = (
      local.runtime_apply_authorized == false &&
      local.runtime_root_apply_policy == "UNCONDITIONALLY_BLOCKED_IN_R2B1"
    )
    error_message = "R2B1 runtime apply must remain unconditionally blocked."
  }
}

check "foundation_handoff" {
  assert {
    condition     = local.foundation_handoff_valid
    error_message = "foundation_handoff must be the exact applied-and-reviewed bounded R1B manifest."
  }
}

check "execution_deny_handoff" {
  assert {
    condition     = local.execution_deny_handoff_valid
    error_message = "execution_deny_handoff must attest the exact applied universal deny without exceptions."
  }
}

check "release_image_handoff" {
  assert {
    condition     = local.release_image_handoff_valid
    error_message = "release_image_handoff must contain one reviewed repository-qualified lowercase sha256 URI."
  }
}

check "preflight_database_secret_version_reference" {
  assert {
    condition     = local.preflight_database_secret_version_reference_valid
    error_message = "preflight database reference must match its exact admitted secret and positive canonical numeric version."
  }
}

check "canary_database_secret_version_reference" {
  assert {
    condition     = local.canary_database_secret_version_reference_valid
    error_message = "canary database reference must match its exact admitted secret and positive canonical numeric version."
  }
}

check "runtime_identity_separation" {
  assert {
    condition = (
      local.preflight_service_account_id != local.canary_service_account_id &&
      length(local.preflight_service_account_id) <= 30 &&
      length(local.canary_service_account_id) <= 30
    )
    error_message = "Preflight and canary runtime identities must remain distinct and bounded."
  }
}

check "timeout_derivation" {
  assert {
    condition = local.task_timeout_seconds == (
      local.authority_contract.jobs.taskTimeout.proxyReadinessSeconds +
      local.authority_contract.jobs.taskTimeout.workerExternalDeadlineSeconds +
      local.authority_contract.jobs.taskTimeout.proxyShutdownSeconds +
      local.authority_contract.jobs.taskTimeout.serializationAndProcessMarginSeconds
    )
    error_message = "Job timeout must remain the exact reviewed supervisor-lifecycle sum."
  }
}
