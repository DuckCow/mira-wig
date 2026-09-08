check "immutable_successor_alignment" {
  assert {
    condition = (
      filesha256("${path.module}/../contracts/eximbay-canary-runtime-v3.json") == "642c09ca61d31576728d6cd07d117a973c40e89a630f6596ad840f02f856c6d2" &&
      filesha256("${path.module}/../contracts/eximbay-canary-runtime-v2.json") == "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41" &&
      filesha256("${path.module}/../eximbay-canary/image-policy-v19.json") == "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143" &&
      filesha256("${path.module}/../eximbay-canary/image-policy-v18.json") == "8744198014a3327b569420afad356d090186a118a7057758ea4ad8783a7d7822" &&
      local.contract.contractVersion == "mira-refund-p3e-b2-eximbay-canary-runtime/v3" &&
      local.contract.parentAuthority.sha256 == "45d04facf3c1fdc02ccffcbdf6f32e3274ebaf38c218462cba3d279897ab0d41" &&
      local.image_policy.contractVersion == "mira-refund-eximbay-canary-image-policy/v19" &&
      local.image_policy.parentAuthoritySha256 == "8744198014a3327b569420afad356d090186a118a7057758ea4ad8783a7d7822"
    )
    error_message = "The append-only runtime v3 and image-policy v19 successor chain must remain exact."
  }
}

check "exact_reentry_runtime" {
  assert {
    condition = (
      local.release_image_digest_uri == local.contract.image.digestUri &&
      local.contract.image.imagePolicySha256 == "438901986b24d2872712ce4f130bc1f70f2fd27daf6d9ee855ca5a455936c143" &&
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
