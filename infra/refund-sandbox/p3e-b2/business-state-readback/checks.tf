check "materialization_gate" {
  assert {
    condition = !var.runtime_materialized || (
      var.source_commit == "81e785448f834f4176cd5153eb3cbdf6d79d936c" &&
      var.bootstrap_image_digest_uri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2"
    )
    error_message = "Materialization requires the source-owned current successor identity."
  }
}

check "runtime_gates_mutually_exclusive" {
  assert {
    condition     = !(var.runtime_materialized && var.refund_readiness_runtime_materialized)
    error_message = "The historical CONTACTED and refund-readiness readback runtimes are mutually exclusive."
  }
}

check "machine_contract_alignment" {
  assert {
    condition = (
      local.contract.contractVersion == "mira-refund-p3e-b2-business-state-readback-runtime/v1" &&
      local.contract.status == "SOURCE_DEFINED_DEFAULT_DISABLED" &&
      local.contract.terraform.root == "infra/refund-sandbox/p3e-b2/business-state-readback" &&
      local.contract.terraform.backendConfig == "business-state-readback.gcs.tfbackend" &&
      local.contract.terraform.backendBucket == "mira-refund-sandbox-0001-tfstate-925882331349" &&
      local.contract.terraform.backendPrefix == "p3e-b2/business-state-readback" &&
      local.contract.terraform.backendOverride == "ABSENT_EXACT_COMMITTED_CONFIG_ONLY" &&
      local.contract.target.runId == local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID &&
      local.contract.target.checkoutSessionId == local.fixed_environment.MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID &&
      local.contract.runtime.owner == "DATABASE_BOOTSTRAP_BOUNDED_READBACK" &&
      local.contract.runtime.job == local.job_name &&
      local.contract.runtime.command == local.command &&
      local.contract.runtime.imageDigestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:42d84d38a0edd5bf4b0e5931521a250add24e17e72446e15799babaf8b35a0d2" &&
      local.contract.runtime.imageConfigDigest == "sha256:9b3482a74b764b5ea0e56c23c53457a448091d9163466967831daf6334b52c8a" &&
      local.contract.runtime.sourceCommit == "81e785448f834f4176cd5153eb3cbdf6d79d936c" &&
      local.contract.runtime.databaseUser == local.iam_database_username &&
      local.contract.runtime.providerSecretAccess == false &&
      local.contract.runtime.executionOnApply == false &&
      local.contract.resourceGraph.defaultResourceCount == 0 &&
      local.contract.resourceGraph.materializedResourceCount == 5 &&
      local.contract.resourceGraph.materializedAddresses == [
        "google_cloud_run_v2_job.readback[\"runtime\"]",
        "google_project_iam_member.cloud_sql_client[\"runtime\"]",
        "google_project_iam_member.cloud_sql_instance_user[\"runtime\"]",
        "google_service_account.readback[\"runtime\"]",
        "google_sql_user.readback[\"runtime\"]",
      ] &&
      local.contract.resourceGraph.materializedSortedAddressSha256 == "d96557af0ee0024f51fc0317df774594ea39d858c49f03d26d449c5f68a07285" &&
      local.contract.materialization.default == false &&
      local.contract.materialization.enabled == "EXACT_CURRENT_SUCCESSOR_FIVE_RESOURCE_RUNTIME_WITHOUT_EXECUTION" &&
      local.contract.materialization.artifactOverrideRequired == false &&
      local.contract.materialization.roleGrantMode == "apply-business-state-readback-role-grants" &&
      local.contract.materialization.roleRevokeMode == "revoke-business-state-readback-role-grants"
    )
    error_message = "The exact business-state readback machine contract must remain aligned."
  }
}

check "strict_runtime_shape" {
  assert {
    condition = (
      local.task_count == 1 &&
      local.parallelism == 1 &&
      local.max_retries == 0 &&
      local.task_timeout_seconds == 180 &&
      local.network_tags == ["refund-provider-free"]
    )
    error_message = "The readback must remain one-task, zero-retry, bounded, and provider-free."
  }
}

check "historical_contract_unchanged" {
  assert {
    condition     = filesha256("${path.module}/../contracts/business-state-readback-runtime-v1.json") == "c4422516e08f7bc19dc8a803f4cbb08b8e0cf13797cf7c6164d8ee6f9e722b70"
    error_message = "The historical CONTACTED readback machine contract must remain byte-exact."
  }
}

check "refund_readiness_machine_contract_alignment" {
  assert {
    condition = (
      local.readiness_contract.contractVersion == "mira-refund-p3e-b2-refund-readiness-readback-runtime/v1" &&
      local.readiness_contract.status == "SOURCE_DEFINED_DEFAULT_DISABLED" &&
      local.readiness_contract.terraform.root == "infra/refund-sandbox/p3e-b2/business-state-readback" &&
      local.readiness_contract.terraform.backendConfig == "business-state-readback.gcs.tfbackend" &&
      local.readiness_contract.terraform.backendBucket == local.contract.terraform.backendBucket &&
      local.readiness_contract.terraform.backendPrefix == local.contract.terraform.backendPrefix &&
      local.readiness_contract.materialization.variable == "refund_readiness_runtime_materialized" &&
      local.readiness_contract.materialization.default == false &&
      local.readiness_contract.materialization.mutuallyExclusiveWith == "runtime_materialized" &&
      local.readiness_contract.materialization.executionOnApply == false &&
      local.readiness_contract.runtime.job == "mira-p3e-sbx-refund-readiness-readback" &&
      local.readiness_contract.runtime.command == "refund-readiness-business-state-readback" &&
      local.readiness_contract.runtime.imageDigestUri == "asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:aa4cc4e3ef1497769c726ad8187c9806f69bbca6e09f9ae8f010c5c313343892" &&
      local.readiness_contract.runtime.imageManifestDigest == "sha256:aa4cc4e3ef1497769c726ad8187c9806f69bbca6e09f9ae8f010c5c313343892" &&
      local.readiness_contract.runtime.imageConfigDigest == "sha256:32b248d06e0ed1faf9325a58c006033ba9e2d987a3bc5fee4b66b1b07c2ef10c" &&
      local.readiness_contract.runtime.sourceCommit == "d9b51dce0e0e16eb273aeb19caff802fe99f4b3f" &&
      local.readiness_contract.runtime.sourceTree == "b385135a18b4af09970d9b52cfe7a950e322bb46" &&
      local.readiness_contract.runtime.serviceAccount == local.service_account_email &&
      local.readiness_contract.runtime.databaseUser == local.iam_database_username &&
      local.readiness_contract.runtime.taskCount == local.task_count &&
      local.readiness_contract.runtime.parallelism == local.parallelism &&
      local.readiness_contract.runtime.maxRetries == local.max_retries &&
      local.readiness_contract.runtime.timeoutSeconds == local.task_timeout_seconds &&
      local.readiness_contract.runtime.network == local.network_resource_name &&
      local.readiness_contract.runtime.subnetwork == local.subnetwork_resource_name &&
      local.readiness_contract.runtime.networkTags == local.network_tags &&
      local.readiness_contract.runtime.egress == "ALL_TRAFFIC" &&
      local.readiness_contract.authority.fixedTargetOwner == "COMPILED_RUNTIME" &&
      local.readiness_contract.authority.operatorSelectableTarget == false &&
      local.readiness_contract.authority.genericQuery == false &&
      local.readiness_contract.authority.arbitrarySql == false &&
      local.readiness_contract.authority.providerSecretAccess == false &&
      local.readiness_contract.resourceGraph.sharedAddresses == [
        "google_project_iam_member.cloud_sql_client[\"runtime\"]",
        "google_project_iam_member.cloud_sql_instance_user[\"runtime\"]",
        "google_service_account.readback[\"runtime\"]",
        "google_sql_user.readback[\"runtime\"]",
      ] &&
      local.readiness_contract.resourceGraph.jobAddress == "google_cloud_run_v2_job.refund_readiness[\"runtime\"]" &&
      local.readiness_contract.resourceGraph.materializedResourceCount == 5 &&
      local.readiness_contract.resourceGraph.materializedSortedAddressSha256 == "18b376c8d28e22f1bd06166f2db9f231d4f22e14c27c00149f6f47f0a9a1dcd0"
    )
    error_message = "The refund-readiness readback machine contract must remain exact and execution-free."
  }
}
