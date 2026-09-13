mock_provider "google" {}

run "default_is_fully_unmaterialized" {
  command = plan

  assert {
    condition = (
      output.readback_manifest.materialized == false &&
      output.readback_manifest.materialization_status == "DISABLED" &&
      output.readback_manifest.managed_resource_count == 0 &&
      length(output.readback_manifest.managed_addresses) == 0 &&
      length(google_service_account.readback) == 0 &&
      length(google_project_iam_member.cloud_sql_client) == 0 &&
      length(google_project_iam_member.cloud_sql_instance_user) == 0 &&
      length(google_sql_user.readback) == 0 &&
      length(google_cloud_run_v2_job.readback) == 0 &&
      length(google_cloud_run_v2_job.refund_readiness) == 0 &&
      output.readback_manifest.default_materialized == false &&
      output.readback_manifest.provider_secret_access == "ABSENT" &&
      output.readback_manifest.execution_on_apply == false &&
      output.readback_manifest.automatic_execution == "NONE"
    )
    error_message = "The source default must create no readback runtime or execution authority."
  }
}

run "historical_only_graph_is_exact_and_unchanged" {
  command = plan

  variables {
    runtime_materialized = true
  }

  override_resource {
    target          = google_service_account.readback
    override_during = plan
    values = {
      email = "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam.gserviceaccount.com"
    }
  }

  assert {
    condition = (
      google_service_account.readback["runtime"].account_id == "mira-p3e-sbx-readback" &&
      google_project_iam_member.cloud_sql_client["runtime"].role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_instance_user["runtime"].role == "roles/cloudsql.instanceUser" &&
      google_project_iam_member.cloud_sql_client["runtime"].condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      google_sql_user.readback["runtime"].name == "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam" &&
      google_sql_user.readback["runtime"].type == "CLOUD_IAM_SERVICE_ACCOUNT" &&
      google_sql_user.readback["runtime"].deletion_policy == "DELETE" &&
      google_cloud_run_v2_job.readback["runtime"].name == "mira-p3e-sbx-contacted-readback" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].task_count == 1 &&
      google_cloud_run_v2_job.readback["runtime"].template[0].parallelism == 1 &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].service_account == "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].image ==
      "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].args == tolist(["contacted-reconciliation-business-state-readback"]) &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].name == "business-state-readback" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].resources[0].limits == tomap({ cpu = "1", memory = "512Mi" }) &&
      {
        for item in google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].env :
        item.name => item.value
      } == local.fixed_environment &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].timeout == "180s" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].execution_environment == "EXECUTION_ENVIRONMENT_GEN2" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].vpc_access[0].egress == "ALL_TRAFFIC" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].network == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].subnetwork == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3" &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"]) &&
      output.readback_manifest.materialization_status == "READY" &&
      output.readback_manifest.source_commit == "81e785448f834f4176cd5153eb3cbdf6d79d936c" &&
      output.readback_manifest.image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      output.readback_manifest.managed_resource_count == 5 &&
      length(output.readback_manifest.managed_addresses) == 5 &&
      length(google_service_account.readback) +
      length(google_project_iam_member.cloud_sql_client) +
      length(google_project_iam_member.cloud_sql_instance_user) +
      length(google_sql_user.readback) +
      length(google_cloud_run_v2_job.readback) == 5 &&
      length(google_cloud_run_v2_job.refund_readiness) == 0
    )
    error_message = "The materialized readback identity, IAM DB user, and Job must remain exact."
  }
}

run "refund_readiness_only_graph_is_exact_and_fixed" {
  command = plan

  variables {
    refund_readiness_runtime_materialized = true
  }

  override_resource {
    target          = google_service_account.readback
    override_during = plan
    values = {
      email = "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam.gserviceaccount.com"
    }
  }

  assert {
    condition = (
      length(google_service_account.readback) == 1 &&
      length(google_project_iam_member.cloud_sql_client) == 1 &&
      length(google_project_iam_member.cloud_sql_instance_user) == 1 &&
      length(google_sql_user.readback) == 1 &&
      length(google_cloud_run_v2_job.readback) == 0 &&
      length(google_cloud_run_v2_job.refund_readiness) == 1 &&
      google_service_account.readback["runtime"].account_id == "mira-p3e-sbx-readback" &&
      google_project_iam_member.cloud_sql_client["runtime"].role == "roles/cloudsql.client" &&
      google_project_iam_member.cloud_sql_instance_user["runtime"].role == "roles/cloudsql.instanceUser" &&
      google_project_iam_member.cloud_sql_client["runtime"].condition[0].expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      google_sql_user.readback["runtime"].name == "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam" &&
      google_sql_user.readback["runtime"].type == "CLOUD_IAM_SERVICE_ACCOUNT" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].name == "mira-p3e-sbx-refund-readiness-readback" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].task_count == 1 &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].parallelism == 1 &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].max_retries == 0 &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].timeout == "180s" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].service_account == "mira-p3e-sbx-readback@mira-refund-sandbox-0001.iam.gserviceaccount.com" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].containers[0].image == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:0bbb1c65c3626b25cf00d685a9844bd28ccddf237f7342dab11d6b37edb9a855" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].containers[0].args == tolist(["refund-readiness-business-state-readback"]) &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].containers[0].name == "refund-readiness-readback" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].containers[0].resources[0].limits == tomap({ cpu = "1", memory = "512Mi" }) &&
      {
        for item in google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].containers[0].env :
        item.name => item.value
      } == local.readiness_fixed_environment &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].execution_environment == "EXECUTION_ENVIRONMENT_GEN2" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].vpc_access[0].egress == "ALL_TRAFFIC" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].network == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].subnetwork == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3" &&
      google_cloud_run_v2_job.refund_readiness["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"]) &&
      output.readback_manifest.refund_readiness_materialized == true &&
      output.readback_manifest.materialization_status == "REFUND_READINESS_READY" &&
      output.readback_manifest.managed_resource_count == 5 &&
      output.readback_manifest.managed_addresses == tolist([
        "google_cloud_run_v2_job.refund_readiness[\"runtime\"]",
        "google_project_iam_member.cloud_sql_client[\"runtime\"]",
        "google_project_iam_member.cloud_sql_instance_user[\"runtime\"]",
        "google_service_account.readback[\"runtime\"]",
        "google_sql_user.readback[\"runtime\"]",
      ]) &&
      output.readback_manifest.readiness_source_commit == "4299288d2ca7bdfffde6d6edc455f44c68d00ec0" &&
      output.readback_manifest.readiness_source_tree == "b864dc0491b7e5395f1d6d47fb40faebbe27e3fb" &&
      output.readback_manifest.execution_on_apply == false
    )
    error_message = "The refund-readiness gate must own only the shared four-address identity plus its exact fixed Job."
  }

  assert {
    condition = (
      !contains(keys(local.readiness_fixed_environment), "MIRA_REFUND_READBACK_PAYMENT_ID") &&
      !contains(keys(local.readiness_fixed_environment), "MIRA_REFUND_READBACK_ORDER_ID") &&
      !contains(keys(local.readiness_fixed_environment), "MIRA_REFUND_READBACK_REFUND_ATTEMPT_ID") &&
      !contains(keys(local.readiness_fixed_environment), "MIRA_REFUND_READBACK_COMMAND_ID") &&
      !contains(keys(local.readiness_fixed_environment), "MIRA_REFUND_READBACK_SQL")
    )
    error_message = "The readiness Job must expose no operator-selectable target or SQL input."
  }
}

run "reject_both_runtime_gates" {
  command = plan

  variables {
    runtime_materialized                  = true
    refund_readiness_runtime_materialized = true
  }

  expect_failures = [check.runtime_gates_mutually_exclusive]
}

run "exact_backend_contract_is_frozen" {
  command = plan

  assert {
    condition = (
      output.readback_manifest.backend_bucket == "mira-refund-sandbox-0001-tfstate-925882331349" &&
      output.readback_manifest.backend_prefix == "p3e-b2/business-state-readback"
    )
    error_message = "The business-state readback backend identity must remain exact."
  }
}

run "reject_arbitrary_source_commit" {
  command = plan

  variables {
    runtime_materialized = true
    source_commit        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }

  expect_failures = [var.source_commit]
}

run "reject_superseded_verifier_defective_image_as_current" {
  command = plan

  variables {
    runtime_materialized       = true
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:89bae2d93d3fc2594dff9eeddee25577223fd91524c1b0beed43ab84584fc2c3"
  }

  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_arbitrary_materialization_image" {
  command = plan

  variables {
    runtime_materialized       = true
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.bootstrap_image_digest_uri]
}

run "reject_mutable_materialization_image" {
  command = plan

  variables {
    runtime_materialized       = true
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap:latest"
  }

  expect_failures = [var.bootstrap_image_digest_uri]
}
