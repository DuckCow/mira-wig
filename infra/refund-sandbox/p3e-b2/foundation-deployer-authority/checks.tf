check "exact_supported_nonexecuting_permissions" {
  assert {
    condition = (
      length(local.deployer_permissions) == 60 &&
      length(distinct(local.deployer_permissions)) == 60 &&
      tolist(local.deployer_permissions) == sort(local.deployer_permissions) &&
      sha256(join("\n", local.deployer_permissions)) ==
      local.authority_contract.foundationDeployerPermissionSetSha256 &&
      alltrue([
        for permission in local.deployer_permissions :
        !endswith(permission, ".delete") &&
        !endswith(permission, ".setIamPolicy") &&
        !startswith(permission, "run.") &&
        !startswith(permission, "billing.") &&
        !startswith(permission, "iam.") &&
        !strcontains(permission, "*")
      ])
    )
    error_message = "Foundation deployer permissions must remain exact, unique, sorted, non-executing, non-escalating, and delete-free."
  }
}
