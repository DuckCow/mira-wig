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
      length(google_project_iam_custom_role.foundation_deployer.permissions) == 60 &&
      length(distinct(google_project_iam_custom_role.foundation_deployer.permissions)) == 60 &&
      sha256(join("\n", google_project_iam_custom_role.foundation_deployer.permissions)) ==
      "7460121269bcfd3a129ae36c9b24c0e49d17ae67b70624d288cf5796ba3ce8b7" &&
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
