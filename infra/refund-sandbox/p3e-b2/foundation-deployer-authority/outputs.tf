output "status" {
  description = "Non-authorizing repository status."
  value       = "FOUNDATION_DEPLOYER_ROLE_DEFINED_NOT_CREATED"
}

output "role_manifest" {
  description = "Bounded nonsecret definition manifest; no identity is selected or bound."
  value = {
    contract_version      = local.authority_contract.contractVersion
    role_id               = google_project_iam_custom_role.foundation_deployer.role_id
    permission_set_sha256 = local.authority_contract.foundationDeployerPermissionSetSha256
    binding_status        = "ABSENT"
    identity_status       = "NOT_SELECTED"
  }
}
