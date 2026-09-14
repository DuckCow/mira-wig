check "immutable_successor_alignment" {
  assert {
    condition = (
      filesha256("${path.module}/../contracts/eximbay-canary-runtime-v4.json") == "5d77b4f86121beab6d6892331bdaeb9feda6ef79a500d32fdd6f5b3087e6a7b0" &&
      filesha256("${path.module}/../contracts/eximbay-canary-runtime-v3.json") == "642c09ca61d31576728d6cd07d117a973c40e89a630f6596ad840f02f856c6d2" &&
      filesha256("${path.module}/../eximbay-canary/image-policy-v20.json") == "2bf2887cc6bead7336dea8a36dc25fba695434674a272623f57299be42ad4cd8" &&
      filesha256("${path.module}/../eximbay-canary/image-policy-v19.json") == "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143" &&
      local.contract.contractVersion == "mira-refund-p3e-b2-eximbay-canary-runtime/v4" &&
      local.contract.parentAuthority.sha256 == "642c09ca61d31576728d6cd07d117a973c40e89a630f6596ad840f02f856c6d2" &&
      local.image_policy.contractVersion == "mira-refund-eximbay-canary-image-policy/v20" &&
      local.image_policy.parentAuthoritySha256 == "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143"
    )
    error_message = "The append-only runtime v4 and image-policy v20 successor chain must remain exact."
  }
}

check "exact_reentry_runtime" {
  assert {
    condition = var.authorization_installation || (
      local.release_image_digest_uri == local.contract.image.digestUri &&
      local.contract.image.imagePolicySha256 == "2bf2887cc6bead7336dea8a36dc25fba695434674a272623f57299be42ad4cd8" &&
      local.contract.exactTarget.commandId == "cmtsdrrxk00010ss6we7g8qe7" &&
      local.contract.exactTarget.refundAttemptId == "eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8" &&
      local.contract.exactTarget.predecessorLeaseGeneration == 1 &&
      local.contract.exactTarget.futureTakeoverGeneration == 2 &&
      local.contract.historicalApproval.status == "CONSUMED_HISTORICAL_TARGET_SEAL_ONLY" &&
      local.contract.historicalApproval.reset == 0 &&
      local.contract.historicalApproval.reconsume == 0 &&
      local.command == "eximbay-refund-reentry-once" &&
      local.task_count == 1 &&
      local.parallelism == 1 &&
      local.max_retries == 0 &&
      local.task_timeout_seconds == 180
    )
    error_message = "The exact target, immutable approval treatment, fenced takeover and one-shot runtime must remain fixed."
  }
}

check "zero_automatic_provider_effects" {
  assert {
    condition = (
      local.contract.providerContact.default == "DENIED" &&
      local.contract.providerContact.effectCaps.preRefundRetrieve == 1 &&
      local.contract.providerContact.effectCaps.refundRequestR1 == 1 &&
      local.contract.providerContact.effectCaps.reconciliationLookup == 0 &&
      local.contract.providerContact.effectCaps.r2 == 0 &&
      local.contract.providerContact.effectCaps.secondRefundRequest == 0 &&
      local.contract.providerContact.effectCaps.automaticRetry == 0 &&
      local.contract.executionAuthority.liveExecution == "ABSENT" &&
      local.contract.executionAuthority.terraformApply == "ABSENT" &&
      local.contract.executionAuthority.providerContact == "ABSENT"
    )
    error_message = "This successor may be materialized or executed only under later separate human authority."
  }
}

check "exact_authorization_installation" {
  assert {
    condition = !var.authorization_installation || (
      filesha256("${path.module}/../eximbay-canary/image-policy-v22.json") == "32f0ecb5f18727b6c85d65861633093b91098c7d32b4162cd76c8ab73a5e2a51" &&
      local.release_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:d40c5a2bb750a816019807c390c9f9d55dfb7ce31224964bb55d362074a69aeb" &&
      local.command == "eximbay-refund-reentry-once" && local.task_count == 1 && local.parallelism == 1 && local.max_retries == 0 && local.task_timeout_seconds == 180 &&
      lookup(local.authority_environment, "MIRA_REFUND_AUTHORIZATION_ENABLED", "") == "ENABLED" &&
      !contains(keys(local.authority_environment), "MIRA_REFUND_AUTHORIZATION_ID")
    )
    error_message = "The exact retained B worker must keep its authorization gate configured while grant selection remains absent."
  }
}
