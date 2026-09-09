output "status" {
  value = "DORMANT_EXIMBAY_SANDBOX_REFUND_REENTRY_SUCCESSOR_RELEASE_CAPABLE_NOT_APPLIED"
}

output "runtime_root_apply_policy" {
  value = local.runtime_root_apply_policy
}

output "backend_contract" {
  value = {
    bucket = local.backend_bucket_contract
    prefix = local.backend_prefix_contract
  }
}

output "runtime_manifest" {
  description = "Nonsecret immutable successor manifest; not live execution authority."
  value = {
    contract_version             = var.authorization_installation ? null : local.contract.contractVersion
    resource_count               = 5
    new_resource_count           = 0
    provider_contact_authorized  = false
    automatic_trigger            = false
    image_digest_uri             = local.release_image_digest_uri
    image_config_digest          = var.authorization_installation ? "sha256:053566a61a106257d48fe96e26d5875b0a3b7d2f4173f66f0087c10062747a23" : local.contract.image.configDigest
    image_policy_version         = var.authorization_installation ? "mira-refund-eximbay-canary-image-policy/v21" : local.contract.image.imagePolicyVersion
    image_policy_sha256          = var.authorization_installation ? "cf3ddeb02aca04f6240bc0a72827581a648c48359746b17ffbcb98d308b2c2d3" : local.contract.image.imagePolicySha256
    command                      = local.command
    task_count                   = local.task_count
    parallelism                  = local.parallelism
    max_retries                  = local.max_retries
    timeout_seconds              = local.task_timeout_seconds
    predecessor_lease_generation = var.authorization_installation ? null : local.contract.exactTarget.predecessorLeaseGeneration
    future_takeover_generation   = var.authorization_installation ? null : local.contract.exactTarget.futureTakeoverGeneration
    historical_approval_mutation = local.contract.historicalApproval.mutation
    execution_on_apply           = false
    authorization_installation   = var.authorization_installation
    admission_url                = var.authorization_admission_url
    grant_selector               = "ABSENT"
  }
}
