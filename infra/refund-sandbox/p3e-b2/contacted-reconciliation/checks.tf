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
      local.worker_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:67f6f128c398fa9872fb5734f1c5cdf7223cc3f80e3a8e352599d1e7a1d1127c" &&
      local.worker_image_config_digest == "sha256:5e4379b5886203a04924b556d9e636706e05ff99c32206d9ec0a51bb04af9105" &&
      local.worker_image_source_commit == "8a9bc9e6b45814829cdda3e69b69dae887fee2b0" &&
      local.worker_image_source_context_sha256 == "3f7fe5b119233a2250553b4f1dd35363ab5dbb638af18c6002d7a488899974d9" &&
      local.worker_image_policy_path == "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v11.json" &&
      local.worker_image_policy_version == "V11" &&
      local.worker_image_policy_sha256 == "80c15e7f247991e466ae3b04f736be8b8e96ccc9aec9a161a9df57d8733a0d54" &&
      local.worker_supervisor_source_sha256 == "68d443ac70fb8de1863287d320626c3558ac4b92cfb8ab9cf735a3555b540711" &&
      local.contract.image.digestUri == local.worker_image_digest_uri &&
      local.contract.image.configDigest == local.worker_image_config_digest &&
      local.contract.image.sourceCheckpoint == local.worker_image_source_commit &&
      local.contract.image.sourceContextSha256 == local.worker_image_source_context_sha256 &&
      local.contract.image.imagePolicyPath == local.worker_image_policy_path &&
      local.contract.image.imagePolicyVersion == local.worker_image_policy_version &&
      local.contract.image.imagePolicySha256 == local.worker_image_policy_sha256 &&
      local.contract.image.supervisorSourceSha256 == local.worker_supervisor_source_sha256 &&
      local.contract.image.predecessor.digestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-worker@sha256:95b1d7fb170e7af503aab8ad8c6758fa43b5f63afad510c4004b58275dff5662" &&
      local.contract.image.predecessor.configDigest == "sha256:40a4b24105208ceab415ad6d198ac0b4a2dd655ed3737f21c7d7f4a47b1a0d97" &&
      local.contract.image.predecessor.sourceCheckpoint == "5ff10b135efdc4e8efcc0599c9f74a738be7cc35" &&
      local.contract.image.predecessor.sourceContextSha256 == "5e3261cc4882b39faadfca628b096c536d4afa40ec8257d16f2c22d888772075" &&
      local.contract.image.predecessor.imagePolicyPath == "infra/refund-sandbox/p3e-b2/eximbay-canary/image-policy-v8.json" &&
      local.contract.image.predecessor.imagePolicyVersion == "V8" &&
      local.contract.image.predecessor.imagePolicySha256 == "edd02390a033d26d239ce1f0bf13e19d983228e2a80aaaea665afb6bdffbfe5a" &&
      local.contract.image.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.target.runId == "e03b436e666b4b188ec65c0ee4139790" &&
      local.contract.target.checkoutSessionId == "cmtktx8rx000001s6lfbjivo1" &&
      local.contract.target.predecessor.runId == "4c5c9b039f18037c6f3356c903df1372" &&
      local.contract.target.predecessor.checkoutSessionId == "cmtk62h80000001s626b90f9y" &&
      local.contract.target.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.target.predecessor.predecessor.runId == "89682c544f42d4debb260f5e3186087a" &&
      local.contract.target.predecessor.predecessor.checkoutSessionId == "cmtjsiiqw000001s6uimkjhj5" &&
      local.contract.target.predecessor.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.target.predecessor.predecessor.predecessor.runId == "da7783b013d20713d6db207c7657b559" &&
      local.contract.target.predecessor.predecessor.predecessor.checkoutSessionId == "cmtjnvso1000001s60xfg0tyu" &&
      local.contract.target.predecessor.predecessor.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.contract.target.predecessor.predecessor.predecessor.predecessor.runId == "a764f61f4e4ba799ab16b318a676db65" &&
      local.contract.target.predecessor.predecessor.predecessor.predecessor.checkoutSessionId == "cmthg2mzu000001s6iuvx7u5x" &&
      local.contract.target.predecessor.predecessor.predecessor.predecessor.status == "SUPERSEDED_HISTORICAL_ONLY" &&
      local.fixed_environment.MIRA_EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID == local.contract.target.runId &&
      local.fixed_environment.MIRA_EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID == local.contract.target.checkoutSessionId &&
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
