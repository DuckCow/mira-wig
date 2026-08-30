mock_provider "google" {}

variables {
  project_id      = "mira-refund-sbx-example"
  resource_prefix = "mira-p3e-sbx"

  service_activation_handoff = {
    contract_version = "mira-refund-p3e-b2-foundation-authority/v1"
    project_id       = "mira-refund-sbx-example"
    managed_api_names = [
      "artifactregistry.googleapis.com",
      "cloudresourcemanager.googleapis.com",
      "compute.googleapis.com",
      "dns.googleapis.com",
      "iam.googleapis.com",
      "secretmanager.googleapis.com",
      "servicenetworking.googleapis.com",
      "serviceusage.googleapis.com",
      "sqladmin.googleapis.com",
      "storage.googleapis.com",
    ]
    managed_api_set_sha256 = "a281c1c9cd5adcb27aeb15e93256ccebf7b49a4e5e4d812f1199bce0c0d2d7d5"
    bootstrap_preenabled_api_names = [
      "cloudresourcemanager.googleapis.com",
      "serviceusage.googleapis.com",
      "storage.googleapis.com",
    ]
    bootstrap_preenabled_api_set_sha256 = "2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7"
    source_state_prefix                 = "p3e-b2/service-activation"
    provider_source                     = "hashicorp/google"
    provider_version                    = "7.40.0"
    resource_type                       = "google_project_service"
    activation_apply_status             = "APPLIED"
    operator_review_status              = "OPERATOR_REVIEWED"
    evidence_type                       = "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
  }

  database_major_version               = 18
  database_tier                        = "db-custom-1-3840"
  database_availability_mode           = "ZONAL"
  database_initial_disk_size_gb        = 20
  database_disk_autoresize_limit_gb    = 100
  backup_start_time_utc                = "18:00"
  backup_retention_count               = 7
  transaction_log_retention_days       = 7
  database_deletion_protection         = true
  database_retain_backups_on_delete    = true
  database_final_backup_enabled        = true
  database_final_backup_retention_days = 7

  maintenance_window = {
    day          = 7
    hour         = 18
    update_track = "stable"
  }
}

run "exact_provider_free_foundation_shape" {
  command = plan

  assert {
    condition = (
      google_compute_network.refund.auto_create_subnetworks == false &&
      google_compute_network.refund.routing_mode == "REGIONAL" &&
      google_compute_subnetwork.refund.region == "asia-northeast3" &&
      google_compute_subnetwork.refund.private_ip_google_access
    )
    error_message = "Custom VPC or Seoul subnet contract drifted."
  }

  assert {
    condition = (
      google_compute_global_address.private_service_access.purpose == "VPC_PEERING" &&
      google_compute_global_address.private_service_access.address_type == "INTERNAL" &&
      google_compute_global_address.private_service_access.prefix_length == 16 &&
      google_service_networking_connection.private_service_access.deletion_policy == "ABANDON"
    )
    error_message = "Private service access or safe deletion contract drifted."
  }

  assert {
    condition = (
      google_compute_firewall.allow_private_sql.direction == "EGRESS" &&
      google_compute_firewall.allow_private_sql.priority == 900 &&
      google_compute_firewall.allow_private_sql.target_tags == toset(["refund-provider-free"]) &&
      one(google_compute_firewall.allow_private_sql.allow).protocol == "tcp" &&
      toset(one(google_compute_firewall.allow_private_sql.allow).ports) == toset(["3307"]) &&
      google_compute_firewall.allow_restricted_google_apis.direction == "EGRESS" &&
      google_compute_firewall.allow_restricted_google_apis.priority == 910 &&
      google_compute_firewall.allow_restricted_google_apis.target_tags == toset(["refund-provider-free"]) &&
      google_compute_firewall.allow_restricted_google_apis.destination_ranges == toset(["199.36.153.4/30"]) &&
      one(google_compute_firewall.allow_restricted_google_apis.allow).protocol == "tcp" &&
      toset(one(google_compute_firewall.allow_restricted_google_apis.allow).ports) == toset(["443"]) &&
      google_compute_firewall.deny_other_egress.direction == "EGRESS" &&
      google_compute_firewall.deny_other_egress.priority == 1000 &&
      google_compute_firewall.deny_other_egress.target_tags == toset(["refund-provider-free"]) &&
      google_compute_firewall.deny_other_egress.destination_ranges == toset(["0.0.0.0/0"]) &&
      one(google_compute_firewall.deny_other_egress.deny).protocol == "all"
    )
    error_message = "Provider-free firewall policy drifted."
  }

  assert {
    condition = (
      google_dns_managed_zone.googleapis.dns_name == "googleapis.com." &&
      google_dns_managed_zone.googleapis.visibility == "private" &&
      one(google_dns_managed_zone.googleapis.private_visibility_config).networks[0].network_url ==
      google_compute_network.refund.id &&
      google_dns_record_set.restricted_googleapis_a.name == "restricted.googleapis.com." &&
      google_dns_record_set.restricted_googleapis_a.type == "A" &&
      toset(google_dns_record_set.restricted_googleapis_a.rrdatas) == toset([
        "199.36.153.4",
        "199.36.153.5",
        "199.36.153.6",
        "199.36.153.7",
      ]) &&
      google_dns_record_set.wildcard_googleapis_cname.name == "*.googleapis.com." &&
      google_dns_record_set.wildcard_googleapis_cname.type == "CNAME" &&
      google_dns_record_set.wildcard_googleapis_cname.rrdatas == tolist(["restricted.googleapis.com."])
    )
    error_message = "Provider-free private restricted Google API DNS policy drifted."
  }

  assert {
    condition = (
      google_artifact_registry_repository.refund_images.location == "asia-northeast3" &&
      google_artifact_registry_repository.refund_images.format == "DOCKER" &&
      google_artifact_registry_repository.refund_images.docker_config[0].immutable_tags
    )
    error_message = "Artifact Registry immutable repository drifted."
  }

  assert {
    condition = (
      google_sql_database_instance.refund.region == "asia-northeast3" &&
      google_sql_database_instance.refund.database_version == "POSTGRES_18" &&
      google_sql_database_instance.refund.deletion_protection &&
      google_sql_database_instance.refund.settings[0].retain_backups_on_delete &&
      google_sql_database_instance.refund.settings[0].final_backup_config[0].enabled &&
      google_sql_database_instance.refund.settings[0].final_backup_config[0].retention_days == 7
    )
    error_message = "Cloud SQL version or deletion/final-backup contract drifted."
  }

  assert {
    condition = (
      google_sql_database_instance.refund.settings[0].availability_type == "ZONAL" &&
      google_sql_database_instance.refund.settings[0].disk_size == 20 &&
      google_sql_database_instance.refund.settings[0].disk_autoresize &&
      google_sql_database_instance.refund.settings[0].disk_autoresize_limit == 100 &&
      google_sql_database_instance.refund.settings[0].deletion_protection_enabled &&
      google_sql_database_instance.refund.settings[0].data_api_access == "DISALLOW_DATA_API"
    )
    error_message = "Cloud SQL bounded cost and API protections drifted."
  }

  assert {
    condition = (
      length(google_sql_database_instance.refund.settings[0].database_flags) == 1 &&
      one(google_sql_database_instance.refund.settings[0].database_flags).name ==
      "cloudsql.iam_authentication" &&
      one(google_sql_database_instance.refund.settings[0].database_flags).value == "on"
    )
    error_message = "Cloud SQL must enable only the exact IAM database-authentication flag."
  }

  assert {
    condition = (
      google_sql_database_instance.refund.settings[0].backup_configuration[0].enabled &&
      google_sql_database_instance.refund.settings[0].backup_configuration[0].point_in_time_recovery_enabled &&
      google_sql_database_instance.refund.settings[0].backup_configuration[0].transaction_log_retention_days == 7 &&
      google_sql_database_instance.refund.settings[0].backup_configuration[0].backup_retention_settings[0].retained_backups == 7
    )
    error_message = "Cloud SQL backup and PITR contract drifted."
  }

  assert {
    condition = (
      google_sql_database_instance.refund.settings[0].ip_configuration[0].ipv4_enabled == false &&
      google_sql_database_instance.refund.settings[0].ip_configuration[0].enable_private_path_for_google_cloud_services
    )
    error_message = "Cloud SQL must remain private-only."
  }

  assert {
    condition = (
      google_secret_manager_secret.preflight_database_url.secret_id !=
      google_secret_manager_secret.canary_database_url.secret_id
    )
    error_message = "Foundation must retain two distinct empty database credential containers."
  }

  assert {
    condition = (
      output.foundation_manifest.contract_version ==
      "mira-refund-p3e-b2-foundation-authority/v1" &&
      length(local.authority_contract.foundationResourceAddresses) == 15 &&
      output.foundation_manifest.resource_graph_sha256 ==
      "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f" &&
      output.foundation_manifest.googleapis_private_zone_name ==
      "mira-p3e-sbx-googleapis" &&
      output.foundation_manifest.restricted_googleapis_ipv4_range ==
      "199.36.153.4/30" &&
      output.foundation_manifest.activation_handoff_status ==
      "OPERATOR_ATTESTED_APPLIED_AND_REVIEWED" &&
      output.foundation_manifest.cloud_authentication == "NOT_PERFORMED"
    )
    error_message = "Foundation handoff manifest drifted."
  }
}

run "reject_unreviewed_activation_manifest" {
  command = plan
  variables {
    service_activation_handoff = {
      contract_version = "mira-refund-p3e-b2-foundation-authority/v1"
      project_id       = "mira-refund-sbx-example"
      managed_api_names = [
        "artifactregistry.googleapis.com",
        "cloudresourcemanager.googleapis.com",
        "compute.googleapis.com",
        "dns.googleapis.com",
        "iam.googleapis.com",
        "secretmanager.googleapis.com",
        "servicenetworking.googleapis.com",
        "serviceusage.googleapis.com",
        "sqladmin.googleapis.com",
        "storage.googleapis.com",
      ]
      managed_api_set_sha256 = "a281c1c9cd5adcb27aeb15e93256ccebf7b49a4e5e4d812f1199bce0c0d2d7d5"
      bootstrap_preenabled_api_names = [
        "cloudresourcemanager.googleapis.com",
        "serviceusage.googleapis.com",
        "storage.googleapis.com",
      ]
      bootstrap_preenabled_api_set_sha256 = "2b5b1961dd67cc23e748d7b6a80df83aac85e475b74403469ac99ef3ac3f0bc7"
      source_state_prefix                 = "p3e-b2/service-activation"
      provider_source                     = "hashicorp/google"
      provider_version                    = "7.40.0"
      resource_type                       = "google_project_service"
      activation_apply_status             = "APPLIED"
      operator_review_status              = "REVIEW_REQUIRED"
      evidence_type                       = "TERRAFORM_APPLY_OUTPUT_NOT_CLOUD_AUTHENTICATED"
    }
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_old_nine_api_handoff" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      managed_api_names = [
        "artifactregistry.googleapis.com",
        "cloudresourcemanager.googleapis.com",
        "compute.googleapis.com",
        "iam.googleapis.com",
        "secretmanager.googleapis.com",
        "servicenetworking.googleapis.com",
        "serviceusage.googleapis.com",
        "sqladmin.googleapis.com",
        "storage.googleapis.com",
      ]
      managed_api_set_sha256 = "61c64454752499de36658856988c5f93f402e35cc003ff2ceb59c56e45b923d3"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_missing_cloud_resource_manager" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      managed_api_names = [
        "artifactregistry.googleapis.com",
        "compute.googleapis.com",
        "dns.googleapis.com",
        "iam.googleapis.com",
        "secretmanager.googleapis.com",
        "servicenetworking.googleapis.com",
        "serviceusage.googleapis.com",
        "sqladmin.googleapis.com",
        "storage.googleapis.com",
      ]
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_missing_bootstrap_prerequisite" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      bootstrap_preenabled_api_names = [
        "cloudresourcemanager.googleapis.com",
        "serviceusage.googleapis.com",
      ]
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_wrong_bootstrap_hash" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      bootstrap_preenabled_api_set_sha256 = "wrong"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_definition_only_activation" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      activation_apply_status = "DEFINED_NOT_PROVISIONED"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_not_applied_activation" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      activation_apply_status = "NOT_APPLIED"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_failed_activation" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      activation_apply_status = "APPLY_FAILED"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_not_reviewed_activation" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      operator_review_status = "NOT_REVIEWED"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_wrong_evidence_type" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      evidence_type = "CLOUD_AUTHENTICATED"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_wrong_handoff_project" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      project_id = "mira-refund-sbx-other"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_wrong_provider_version" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      provider_version = "7.41.0"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_wrong_source_prefix" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      source_state_prefix = "p3e-b2/foundation"
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_extra_managed_api" {
  command = plan
  variables {
    service_activation_handoff = merge(var.service_activation_handoff, {
      managed_api_names = concat(
        var.service_activation_handoff.managed_api_names,
        ["run.googleapis.com"],
      )
    })
  }
  expect_failures = [check.applied_and_reviewed_service_activation_handoff]
}

run "reject_unbounded_disk_autoresize" {
  command = plan
  variables {
    database_disk_autoresize_limit_gb = 0
  }
  expect_failures = [var.database_disk_autoresize_limit_gb]
}

run "reject_disabled_deletion_protection" {
  command = plan
  variables {
    database_deletion_protection = false
  }
  expect_failures = [var.database_deletion_protection]
}

run "reject_production_prefix" {
  command = plan
  variables {
    resource_prefix = "mira-production"
  }
  expect_failures = [var.resource_prefix]
}
