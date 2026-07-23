mock_provider "google" {}

variables {
  project_id = "mira-refund-sbx-example"
}

run "exact_unbound_nonexecuting_custom_role" {
  command = plan

  assert {
    condition = (
      google_project_iam_custom_role.foundation_deployer.role_id ==
      "refundP3eB2FoundationDeployer" &&
      google_project_iam_custom_role.foundation_deployer.stage == "GA" &&
      google_project_iam_custom_role.foundation_deployer.deletion_policy == "PREVENT"
    )
    error_message = "Foundation deployer custom-role identity or lifecycle drifted."
  }

  assert {
    condition = (
      length(google_project_iam_custom_role.foundation_deployer.permissions) == 50 &&
      length(distinct(google_project_iam_custom_role.foundation_deployer.permissions)) == 50 &&
      sha256(join("\n", google_project_iam_custom_role.foundation_deployer.permissions)) ==
      "13f34b23381d8cc4303a33a4aa7d10e1f203b3ea9e8be56da80a6c0dde49b944" &&
      contains(google_project_iam_custom_role.foundation_deployer.permissions, "compute.networks.updatePolicy")
    )
    error_message = "Foundation deployer exact permission set drifted."
  }

  assert {
    condition = alltrue([
      for permission in google_project_iam_custom_role.foundation_deployer.permissions :
      !startswith(permission, "run.") &&
      !startswith(permission, "billing.") &&
      !startswith(permission, "iam.") &&
      !endswith(permission, ".setIamPolicy") &&
      !endswith(permission, ".delete") &&
      !strcontains(permission, "*")
    ])
    error_message = "Foundation deployer acquired execution, escalation, IAM mutation, wildcard, or delete authority."
  }

  assert {
    condition = (
      output.role_manifest.binding_status == "ABSENT" &&
      output.role_manifest.identity_status == "NOT_SELECTED"
    )
    error_message = "R1B must define no role binding or deployer identity."
  }
}

run "reject_production_project" {
  command = plan
  variables {
    project_id = "mira-production"
  }
  expect_failures = [var.project_id]
}
