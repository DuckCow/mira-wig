mock_provider "google" {}

variables {
  project_id      = "mira-refund-sbx-example"
  resource_prefix = "mira-p3e-sbx"

  foundation_handoff = {
    contract_version                        = "mira-refund-p3e-b2-foundation-authority/v1"
    project_id                              = "mira-refund-sbx-example"
    project_number                          = "123456789012"
    region                                  = "asia-northeast3"
    network_resource_name                   = "projects/mira-refund-sbx-example/global/networks/mira-p3e-sbx-refund-vpc"
    subnetwork_resource_name                = "projects/mira-refund-sbx-example/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    cloud_sql_instance_connection_name      = "mira-refund-sbx-example:asia-northeast3:mira-p3e-sbx-refund-pg18"
    cloud_sql_instance_resource_name        = "projects/mira-refund-sbx-example/instances/mira-p3e-sbx-refund-pg18"
    preflight_database_secret_resource_name = "projects/mira-refund-sbx-example/secrets/mira-p3e-sbx-preflight-database-url"
    canary_database_secret_resource_name    = "projects/mira-refund-sbx-example/secrets/mira-p3e-sbx-canary-database-url"
    artifact_repository_resource_name       = "projects/mira-refund-sbx-example/locations/asia-northeast3/repositories/mira-p3e-sbx-refund-images"
    googleapis_private_zone_name            = "mira-p3e-sbx-googleapis"
    restricted_googleapis_ipv4_range        = "199.36.153.4/30"
    foundation_resource_graph_sha256        = "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f"
    source_state_prefix                     = "p3e-b2/foundation"
    activation_apply_status                 = "APPLIED"
    activation_operator_review_status       = "OPERATOR_REVIEWED"
    foundation_apply_status                 = "APPLIED"
    foundation_operator_review_status       = "OPERATOR_REVIEWED"
    evidence_type                           = "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
    provider_source                         = "hashicorp/google"
    provider_version                        = "7.40.0"
  }

  release_image_handoff = {
    contract_version                  = "mira-refund-worker-release-image-handoff/v1"
    image_digest_uri                  = "asia-northeast3-docker.pkg.dev/mira-refund-sbx-example/mira-p3e-sbx-refund-images/refund-worker@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    image_contract_version            = "mira-refund-worker-runtime-image-connection/v1"
    platform                          = "linux/amd64"
    release_authority_status          = "SEPARATELY_REVIEWED_RELEASE_DIGEST"
    operator_review_status            = "OPERATOR_REVIEWED"
    evidence_type                     = "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
    local_reproducibility_digest_used = false
  }

  preflight_database_secret_version_reference = {
    secret_resource_name = "projects/mira-refund-sbx-example/secrets/mira-p3e-sbx-preflight-database-url"
    version              = "7"
  }

  canary_database_secret_version_reference = {
    secret_resource_name = "projects/mira-refund-sbx-example/secrets/mira-p3e-sbx-canary-database-url"
    version              = "11"
  }
}

run "reject_plan_under_valid_handoffs" {
  command = plan

  assert {
    condition = (
      output.status == "RUNTIME_JOB_DEFINITIONS_DEFINED_DORMANT_NOT_PROVISIONED" &&
      output.runtime_root_apply_policy == "UNCONDITIONALLY_BLOCKED_IN_R2B1"
    )
    error_message = "The production runtime root must report unconditional R2B1 blocking."
  }

  expect_failures = [
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_operator_attested_non_cloud_evidence_before_apply" {
  command = plan

  assert {
    condition     = output.runtime_root_apply_policy == "UNCONDITIONALLY_BLOCKED_IN_R2B1"
    error_message = "Operator-attested non-cloud evidence must not authorize the R2B1 runtime root."
  }

  expect_failures = [
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_mutable_latest_image" {
  command = plan
  variables {
    release_image_handoff = merge(var.release_image_handoff, {
      image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sbx-example/mira-p3e-sbx-refund-images/refund-worker:latest"
    })
  }
  expect_failures = [
    check.release_image_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_local_r2a_digest_as_release_authority" {
  command = plan
  variables {
    release_image_handoff = merge(var.release_image_handoff, {
      local_reproducibility_digest_used = true
    })
  }
  expect_failures = [
    check.release_image_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_unknown_foundation_field" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      unexpected = "not-admitted"
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_stale_foundation_contract" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      contract_version = "mira-refund-p3e-b2-foundation-authority/v0"
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_empty_foundation_contract_version" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      contract_version = ""
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_unreviewed_foundation" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      foundation_operator_review_status = "REVIEW_REQUIRED"
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_wrong_foundation_project" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      project_id = "another-refund-sbx-example"
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_crossed_preflight_secret" {
  command = plan
  variables {
    preflight_database_secret_version_reference = {
      secret_resource_name = var.foundation_handoff.canary_database_secret_resource_name
      version              = "7"
    }
  }
  expect_failures = [
    check.preflight_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_crossed_canary_secret" {
  command = plan
  variables {
    canary_database_secret_version_reference = {
      secret_resource_name = var.foundation_handoff.preflight_database_secret_resource_name
      version              = "11"
    }
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_noncanonical_preflight_versions" {
  command = plan
  variables {
    preflight_database_secret_version_reference = merge(
      var.preflight_database_secret_version_reference,
      { version = "latest" },
    )
  }
  expect_failures = [
    check.preflight_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_secret_version_alias" {
  command = plan
  variables {
    preflight_database_secret_version_reference = merge(
      var.preflight_database_secret_version_reference,
      { version = "enabled" },
    )
  }
  expect_failures = [
    check.preflight_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_zero_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "0" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_padded_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "01" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_signed_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "+1" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_negative_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "-1" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_fractional_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "1.0" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_hexadecimal_canary_version" {
  command = plan
  variables {
    canary_database_secret_version_reference = merge(
      var.canary_database_secret_version_reference,
      { version = "0x1" },
    )
  }
  expect_failures = [
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_null_foundation_handoff" {
  command = plan
  variables {
    foundation_handoff = null
  }
  expect_failures = [
    check.foundation_handoff,
    check.preflight_database_secret_version_reference,
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_absent_foundation_fields" {
  command = plan
  variables {
    foundation_handoff = {}
  }
  expect_failures = [
    check.foundation_handoff,
    check.preflight_database_secret_version_reference,
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_malformed_foundation_handoff" {
  command = plan
  variables {
    foundation_handoff = "malformed"
  }
  expect_failures = [
    check.foundation_handoff,
    check.preflight_database_secret_version_reference,
    check.canary_database_secret_version_reference,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}

run "reject_actual_unknown_foundation_project" {
  command = plan
  variables {
    foundation_handoff = merge(var.foundation_handoff, {
      project_id = timestamp()
    })
  }
  expect_failures = [
    check.foundation_handoff,
    google_service_account.dormant_canary,
    google_service_account.preflight,
  ]
}
