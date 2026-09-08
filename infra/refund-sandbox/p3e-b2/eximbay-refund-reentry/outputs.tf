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
    contract_version             = local.contract.contractVersion
    resource_count               = 5
    new_resource_count           = 0
    provider_contact_authorized  = false
    automatic_trigger            = false
    image_digest_uri             = local.release_image_digest_uri
    image_config_digest          = local.contract.image.configDigest
    image_policy_version         = local.contract.image.imagePolicyVersion
    image_policy_sha256          = local.contract.image.imagePolicySha256
    command                      = local.command
    task_count                   = local.task_count
    parallelism                  = local.parallelism
    max_retries                  = local.max_retries
    timeout_seconds              = local.task_timeout_seconds
    predecessor_lease_generation = local.contract.exactTarget.predecessorLeaseGeneration
    future_takeover_generation   = local.contract.exactTarget.futureTakeoverGeneration
    historical_approval_mutation = local.contract.historicalApproval.mutation
    execution_on_apply           = false
  }
}
