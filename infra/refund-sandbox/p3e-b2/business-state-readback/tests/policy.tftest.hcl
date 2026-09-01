mock_provider "google" {}

run "default_is_fully_unmaterialized" {
  command = plan

  assert {
    condition = (
      output.readback_manifest.materialized == false &&
      output.readback_manifest.default_materialized == false &&
      output.readback_manifest.provider_secret_access == "ABSENT" &&
      output.readback_manifest.execution_on_apply == false &&
      output.readback_manifest.automatic_execution == "NONE"
    )
    error_message = "The source default must create no readback runtime or execution authority."
  }
}

run "materialized_shape_is_exact_and_one_shot" {
  command = plan

  variables {
    runtime_materialized       = true
    source_commit              = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    bootstrap_image_digest_uri = "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
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
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].containers[0].args == tolist(["contacted-reconciliation-business-state-readback"]) &&
      google_cloud_run_v2_job.readback["runtime"].template[0].template[0].vpc_access[0].network_interfaces[0].tags == tolist(["refund-provider-free"])
    )
    error_message = "The materialized readback identity, IAM DB user, and Job must remain exact."
  }
}

run "reject_materialization_without_reviewed_image" {
  command = plan

  variables {
    runtime_materialized = true
  }

  expect_failures = [check.materialization_gate]
}
