output "status" {
  description = "Non-authorizing repository status."
  value       = "SERVICE_ACTIVATION_AUTHORITY_DEFINED_NOT_PROVISIONED"
}

output "service_activation_manifest" {
  description = "Bounded nonsecret attended handoff artifact; it is not cloud-authenticated evidence."
  value = {
    contract_version                                      = local.authority_contract.contractVersion
    project_id                                            = var.project_id
    api_names                                             = sort(tolist(local.required_services))
    api_set_sha256                                        = local.authority_contract.serviceActivationApiSetSha256
    bootstrap_preenabled_api_names                        = local.bootstrap_preenabled_services
    bootstrap_preenabled_api_set_sha256                   = local.service_activation_bootstrap.preenabledApiSetSha256
    source_state_prefix                                   = "p3e-b2/service-activation"
    provider_source                                       = local.service_activation_operator.provider.source
    provider_version                                      = local.service_activation_operator.provider.version
    resource_type                                         = local.service_activation_operator.provider.resourceType
    methods                                               = local.activation_methods
    method_set_sha256                                     = local.service_activation_operator.methodSetSha256
    permissions                                           = local.activation_permissions
    permission_set_sha256                                 = local.service_activation_operator.permissionSetSha256
    shared_read_permissions                               = local.shared_read_permissions
    shared_read_permission_set_sha256                     = local.service_activation_operator.sharedReadPermissionSetSha256
    activation_exclusive_permissions                      = local.activation_exclusive_permissions
    activation_exclusive_permission_set_sha256            = local.service_activation_operator.activationExclusivePermissionSetSha256
    activation_foundation_permission_intersection         = local.activation_foundation_intersection
    activation_exclusive_foundation_intersection          = local.exclusive_foundation_intersection
    foundation_deployer_permission_count                  = length(local.foundation_deployer_permissions)
    foundation_deployer_permission_set_sha256             = local.authority_contract.foundationDeployerPermissionSetSha256
    foundation_deployer_can_complete_activation_lifecycle = local.service_activation_operator.foundationDeployerCanCompleteActivationLifecycle
    user_project_override                                 = local.service_activation_operator.provider.userProjectOverride
    billing_project_override                              = local.service_activation_operator.provider.billingProjectOverride
    quota_project_override                                = local.service_activation_operator.provider.quotaProjectOverride
    operator_status                                       = local.service_activation_operator.status
    grant_authority                                       = local.service_activation_operator.grantAuthority
    role                                                  = local.service_activation_operator.role
    identity                                              = local.service_activation_operator.identity
    binding                                               = local.service_activation_operator.binding
    activation_apply_status                               = "APPLIED"
    operator_review_status                                = "REVIEW_REQUIRED"
    evidence_type                                         = "TERRAFORM_APPLY_OUTPUT_NOT_CLOUD_AUTHENTICATED"
  }
}
