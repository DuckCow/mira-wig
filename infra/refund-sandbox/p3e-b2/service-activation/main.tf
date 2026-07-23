locals {
  authority_contract                 = jsondecode(file("${path.module}/../contracts/foundation-authority-v1.json"))
  service_activation_operator        = local.authority_contract.serviceActivationOperator
  service_activation_bootstrap       = local.authority_contract.serviceActivationBootstrap
  required_services                  = toset(local.authority_contract.serviceActivationApis)
  bootstrap_preenabled_services      = tolist(local.service_activation_bootstrap.preenabledApiNames)
  activation_methods                 = tolist(local.service_activation_operator.methods)
  activation_permissions             = tolist(local.service_activation_operator.permissions)
  shared_read_permissions            = tolist(local.service_activation_operator.sharedReadPermissionsWithFoundationDeployer)
  activation_exclusive_permissions   = tolist(local.service_activation_operator.activationExclusivePermissions)
  foundation_deployer_permissions    = tolist(local.authority_contract.foundationDeployerPermissions)
  activation_foundation_intersection = sort(tolist(setintersection(toset(local.activation_permissions), toset(local.foundation_deployer_permissions))))
  exclusive_foundation_intersection  = sort(tolist(setintersection(toset(local.activation_exclusive_permissions), toset(local.foundation_deployer_permissions))))
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}
