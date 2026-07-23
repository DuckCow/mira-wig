mock_provider "google" {}

variables {
  project_id          = "mira-refund-sbx-example"
  project_number      = "123456789012"
  attachment_scope    = "PROJECT"
  policy_id           = "refund-job-execution-deny"
  policy_display_name = "Refund Job Execution Deny"
  denied_principals   = ["principalSet://goog/public:all"]
  denied_permissions = [
    "run.googleapis.com/jobs.run",
    "run.googleapis.com/jobs.runWithOverrides",
  ]
  exception_principals  = []
  exception_permissions = []
}

run "universal_job_execution_deny_shape" {
  command = plan

  assert {
    condition = (
      google_iam_deny_policy.cloud_run_job_execution.parent ==
      "cloudresourcemanager.googleapis.com/projects/123456789012"
    )
    error_message = "The deny policy must attach through the separately evidenced numeric project number."
  }

  assert {
    condition = !strcontains(
      google_iam_deny_policy.cloud_run_job_execution.parent,
      var.project_id,
    )
    error_message = "The alphanumeric project ID must not enter the deny attachment."
  }

  assert {
    condition = toset(
      google_iam_deny_policy.cloud_run_job_execution.rules[0].deny_rule[0].denied_permissions
      ) == toset([
        "run.googleapis.com/jobs.run",
        "run.googleapis.com/jobs.runWithOverrides",
    ])
    error_message = "Denied permissions drifted."
  }

  assert {
    condition = toset(
      google_iam_deny_policy.cloud_run_job_execution.rules[0].deny_rule[0].denied_principals
    ) == toset(["principalSet://goog/public:all"])
    error_message = "Denied principals drifted."
  }

  assert {
    condition = (
      length(google_iam_deny_policy.cloud_run_job_execution.rules[0].deny_rule[0].exception_principals) == 0 &&
      length(google_iam_deny_policy.cloud_run_job_execution.rules[0].deny_rule[0].exception_permissions) == 0
    )
    error_message = "R1A must contain no deny exceptions."
  }

  assert {
    condition     = google_iam_deny_policy.cloud_run_job_execution.deletion_policy == "PREVENT"
    error_message = "Deny deletion policy must remain PREVENT."
  }
}

run "reject_production_like_project" {
  command = plan
  variables {
    project_id = "example-prod-project"
  }
  expect_failures = [var.project_id]
}

run "reject_empty_project_number" {
  command = plan
  variables {
    project_number = ""
  }
  expect_failures = [var.project_number]
}

run "reject_project_id_as_project_number" {
  command = plan
  variables {
    project_number = "mira-refund-sbx-example"
  }
  expect_failures = [var.project_number]
}

run "reject_hyphenated_project_number" {
  command = plan
  variables {
    project_number = "123-456"
  }
  expect_failures = [var.project_number]
}

run "reject_positive_signed_project_number" {
  command = plan
  variables {
    project_number = "+123456"
  }
  expect_failures = [var.project_number]
}

run "reject_negative_signed_project_number" {
  command = plan
  variables {
    project_number = "-123456"
  }
  expect_failures = [var.project_number]
}

run "reject_decimal_project_number" {
  command = plan
  variables {
    project_number = "123.456"
  }
  expect_failures = [var.project_number]
}

run "reject_exponent_project_number" {
  command = plan
  variables {
    project_number = "1e12"
  }
  expect_failures = [var.project_number]
}

run "reject_leading_whitespace_project_number" {
  command = plan
  variables {
    project_number = " 123456"
  }
  expect_failures = [var.project_number]
}

run "reject_trailing_whitespace_project_number" {
  command = plan
  variables {
    project_number = "123456 "
  }
  expect_failures = [var.project_number]
}

run "reject_prefixed_project_number" {
  command = plan
  variables {
    project_number = "projects/123456"
  }
  expect_failures = [var.project_number]
}

run "reject_leading_zero_project_number" {
  command = plan
  variables {
    project_number = "0123456"
  }
  expect_failures = [var.project_number]
}

run "reject_extra_denied_permission" {
  command = plan
  variables {
    denied_permissions = [
      "run.googleapis.com/jobs.run",
      "run.googleapis.com/jobs.runWithOverrides",
      "run.googleapis.com/jobs.update",
    ]
  }
  expect_failures = [var.denied_permissions]
}

run "reject_missing_run_permission" {
  command = plan
  variables {
    denied_permissions = ["run.googleapis.com/jobs.runWithOverrides"]
  }
  expect_failures = [var.denied_permissions]
}

run "reject_missing_override_permission" {
  command = plan
  variables {
    denied_permissions = ["run.googleapis.com/jobs.run"]
  }
  expect_failures = [var.denied_permissions]
}

run "reject_exception_principal" {
  command = plan
  variables {
    exception_principals = ["principal://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/example/subject/preflight"]
  }
  expect_failures = [var.exception_principals]
}

run "reject_exception_permission" {
  command = plan
  variables {
    exception_permissions = ["run.googleapis.com/jobs.run"]
  }
  expect_failures = [var.exception_permissions]
}

run "reject_folder_attachment" {
  command = plan
  variables {
    attachment_scope = "FOLDER"
  }
  expect_failures = [var.attachment_scope]
}

run "reject_organization_attachment" {
  command = plan
  variables {
    attachment_scope = "ORGANIZATION"
  }
  expect_failures = [var.attachment_scope]
}
