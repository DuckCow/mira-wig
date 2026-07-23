locals {
  authority_contract   = jsondecode(file("${path.module}/../contracts/foundation-authority-v1.json"))
  deployer_permissions = local.authority_contract.foundationDeployerPermissions
}

resource "google_project_iam_custom_role" "foundation_deployer" {
  project     = var.project_id
  role_id     = "refundP3eB2FoundationDeployer"
  title       = "Refund P3E-B2 Foundation Deployer"
  description = "Unbound non-executing least-privilege role for the reviewed provider-free foundation graph."
  permissions = local.deployer_permissions
  stage       = "GA"

  deletion_policy = "PREVENT"
}
