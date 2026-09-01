check "machine_contract_alignment" {
  assert {
    condition = (
      local.contract.contractVersion == "mira-refund-p3e-b2-contacted-reconciliation-runtime/v1" &&
      local.contract.status == "SOURCE_DEFINED_DEFAULT_DISABLED" &&
      local.contract.terraform.backendPrefix == local.backend_prefix_contract &&
      local.contract.resourceGraph.defaultResourceCount == 0 &&
      local.contract.resourceGraph.materializedResourceCount == 5 &&
      local.contract.resourceGraph.materializedSortedAddressSha256 ==
      "4d469c179f981c4d534a1ee83c6cdafbc295cdb4a67e76cf6c1e3f4bcb76f6ad" &&
      local.contract.materialization.default == false &&
      local.contract.materialization.variable == "runtime_materialized"
    )
    error_message = "The CONTACTED reconciliation machine contract and Terraform owner must remain exact."
  }
}

check "exact_runtime_authority" {
  assert {
    condition = (
      local.project_id == "mira-refund-sandbox-0001" &&
      local.region == "asia-northeast3" &&
      local.service_account_id == "mira-p3e-sbx-contacted-recon" &&
      local.job_name == "mira-p3e-sbx-contacted-reconciliation" &&
      local.worker_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:4137f0b63724f637f19b139ada7de7d589e2508dd1a5afb805428033b803db2d" &&
      local.command == "eximbay-contacted-reconciliation-once"
    )
    error_message = "The reconciliation identity, Job, image, and command must remain fixed."
  }
}

check "one_shot_runtime_shape" {
  assert {
    condition = (
      local.task_count == 1 &&
      local.parallelism == 1 &&
      local.max_retries == 0 &&
      local.task_timeout_seconds == 180 &&
      local.cpu == "1" &&
      local.memory == "512Mi" &&
      local.task_timeout_seconds > 120 + 15 + 2 + 1
    )
    error_message = "The reconciliation Job must remain one-task, zero-retry, 180-second and minimally provisioned."
  }
}

check "exact_runtime_dependencies" {
  assert {
    condition = (
      local.cloud_sql_instance_connection_name == "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18" &&
      local.cloud_sql_condition_expression == "resource.name == 'projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18' && resource.service == 'sqladmin.googleapis.com'" &&
      local.database_url_secret_resource_name == "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-canary-database-url" &&
      local.database_url_secret_version == "1" &&
      local.eximbay_api_key_secret_resource_name == "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-eximbay-api-key" &&
      local.eximbay_api_key_secret_version == "1" &&
      local.network_resource_name == "projects/mira-refund-sandbox-0001/global/networks/mira-p3e-sbx-refund-vpc" &&
      local.subnetwork_resource_name == "projects/mira-refund-sandbox-0001/regions/asia-northeast3/subnetworks/mira-p3e-sbx-refund-ane3"
    )
    error_message = "The exact Cloud SQL, secret, VPC, and subnet dependencies are required."
  }
}
