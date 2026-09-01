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
      local.worker_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:4d28f12574708ed8e14857eee7dc07d92ab52ff9bc4e56e0c2ce89d8d390fccc" &&
      local.worker_image_config_digest == "sha256:6daaa4e85e62f3ad7b171ed958ff83b05f5e0f44c9a565f35da4ca0088abb9a9" &&
      local.worker_image_source_commit == "7958fb0b228266d502f5e55a14929e8d5510e913" &&
      local.worker_image_source_context_sha256 == "9bbf7398224f0d669954748a8b34b7a8ce7d81b33281f9b249a579a28ca4f0ac" &&
      local.worker_image_policy_path == "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v3.json" &&
      local.worker_image_policy_version == "V3" &&
      local.worker_image_policy_sha256 == "9094297f20d5c2db8e12088d5bb7769da690d9fec29f9309426ff6e6ade56062" &&
      local.worker_supervisor_source_sha256 == "0d9fd396e5afb2d48d087472aa5f4a1d9dfcd4fe0353347e9c7c42e347ae277a" &&
      local.contract.image.digestUri == local.worker_image_digest_uri &&
      local.contract.image.configDigest == local.worker_image_config_digest &&
      local.contract.image.sourceCheckpoint == local.worker_image_source_commit &&
      local.contract.image.sourceContextSha256 == local.worker_image_source_context_sha256 &&
      local.contract.image.imagePolicyPath == local.worker_image_policy_path &&
      local.contract.image.imagePolicyVersion == local.worker_image_policy_version &&
      local.contract.image.imagePolicySha256 == local.worker_image_policy_sha256 &&
      local.contract.image.supervisorSourceSha256 == local.worker_supervisor_source_sha256 &&
      local.contract.image.predecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:4137f0b63724f637f19b139ada7de7d589e2508dd1a5afb805428033b803db2d" &&
      local.contract.image.predecessor.configDigest == "sha256:9d9f9e58ef3d345329ea2bb3a26701f7df4fee19671ba46eabcfd4702ffbbdcc" &&
      local.contract.image.predecessor.sourceCheckpoint == "e5758c2ce812beae6306becad48a2ebc10f2cf4b" &&
      local.contract.image.predecessor.sourceContextSha256 == "877fc659e02b66a7d99068bbd68f0f8bb5692d18f970e2ef0e5f8295bb3cec86" &&
      local.contract.image.predecessor.imagePolicyPath == "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v2.json" &&
      local.contract.image.predecessor.imagePolicyVersion == "V2" &&
      local.contract.image.predecessor.imagePolicySha256 == "82cfa63b1c58bf6c289722ba5a56460a1bd1cefb672f8c2fbb8d26b453fbf287" &&
      local.contract.image.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
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
