check "exact_service_activation_contract" {
  assert {
    condition = (
      local.authority_contract.contractVersion == "mira-refund-p3e-b2-foundation-authority/v1" &&
      sha256(join("\n", sort(tolist(local.required_services)))) ==
      local.authority_contract.serviceActivationApiSetSha256 &&
      local.service_activation_operator.provider.source == "hashicorp/google" &&
      local.service_activation_operator.provider.version == "7.40.0" &&
      local.service_activation_operator.provider.resourceType == "google_project_service" &&
      local.service_activation_operator.provider.userProjectOverride == false &&
      local.service_activation_operator.provider.billingProjectOverride == false &&
      local.service_activation_operator.provider.quotaProjectOverride == false &&
      length(local.activation_methods) == 5 &&
      length(distinct(local.activation_methods)) == 5 &&
      local.activation_methods == sort(local.activation_methods) &&
      sha256(join("\n", local.activation_methods)) ==
      local.service_activation_operator.methodSetSha256 &&
      length(local.activation_permissions) == 5 &&
      length(distinct(local.activation_permissions)) == 5 &&
      local.activation_permissions == sort(local.activation_permissions) &&
      sha256(join("\n", local.activation_permissions)) ==
      local.service_activation_operator.permissionSetSha256 &&
      length(local.shared_read_permissions) == 1 &&
      local.shared_read_permissions == tolist(["resourcemanager.projects.get"]) &&
      sha256(join("\n", local.shared_read_permissions)) ==
      local.service_activation_operator.sharedReadPermissionSetSha256 &&
      length(local.activation_exclusive_permissions) == 4 &&
      length(distinct(local.activation_exclusive_permissions)) == 4 &&
      local.activation_exclusive_permissions == sort(local.activation_exclusive_permissions) &&
      sha256(join("\n", local.activation_exclusive_permissions)) ==
      local.service_activation_operator.activationExclusivePermissionSetSha256 &&
      sort(tolist(setunion(toset(local.shared_read_permissions), toset(local.activation_exclusive_permissions)))) ==
      local.activation_permissions &&
      local.activation_foundation_intersection == tolist(["resourcemanager.projects.get"]) &&
      length(local.exclusive_foundation_intersection) == 0 &&
      length(local.foundation_deployer_permissions) == 50 &&
      sha256(join("\n", local.foundation_deployer_permissions)) ==
      local.authority_contract.foundationDeployerPermissionSetSha256 &&
      length(local.bootstrap_preenabled_services) == 3 &&
      length(distinct(local.bootstrap_preenabled_services)) == 3 &&
      local.bootstrap_preenabled_services == sort(local.bootstrap_preenabled_services) &&
      sha256(join("\n", local.bootstrap_preenabled_services)) ==
      local.service_activation_bootstrap.preenabledApiSetSha256 &&
      length(setsubtract(toset(local.bootstrap_preenabled_services), local.required_services)) == 0 &&
      local.service_activation_bootstrap.status == "EXTERNAL_PRE_ENABLED_AND_REVIEWED_REQUIRED" &&
      local.service_activation_bootstrap.managedByActivationRootAfterBootstrap == true &&
      local.service_activation_bootstrap.identity == "NOT_SELECTED" &&
      local.service_activation_bootstrap.role == "NOT_DEFINED" &&
      local.service_activation_bootstrap.binding == "ABSENT" &&
      local.service_activation_bootstrap.cloudVerification == "NOT_PERFORMED" &&
      local.service_activation_operator.foundationDeployerCanCompleteActivationLifecycle == false
    )
    error_message = "The reviewed service-activation contract is invalid."
  }
}
