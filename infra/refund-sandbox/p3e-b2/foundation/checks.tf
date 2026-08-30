check "applied_and_reviewed_service_activation_handoff" {
  assert {
    condition = (
      var.service_activation_handoff.contract_version ==
      local.authority_contract.contractVersion &&
      var.service_activation_handoff.project_id == var.project_id &&
      var.service_activation_handoff.managed_api_names ==
      tolist(local.authority_contract.serviceActivationApis) &&
      var.service_activation_handoff.managed_api_set_sha256 ==
      local.authority_contract.serviceActivationApiSetSha256 &&
      sha256(join("\n", var.service_activation_handoff.managed_api_names)) ==
      var.service_activation_handoff.managed_api_set_sha256 &&
      var.service_activation_handoff.bootstrap_preenabled_api_names ==
      tolist(local.authority_contract.serviceActivationBootstrap.preenabledApiNames) &&
      var.service_activation_handoff.bootstrap_preenabled_api_set_sha256 ==
      local.authority_contract.serviceActivationBootstrap.preenabledApiSetSha256 &&
      sha256(join("\n", var.service_activation_handoff.bootstrap_preenabled_api_names)) ==
      var.service_activation_handoff.bootstrap_preenabled_api_set_sha256 &&
      var.service_activation_handoff.source_state_prefix == "p3e-b2/service-activation" &&
      var.service_activation_handoff.provider_source == "hashicorp/google" &&
      var.service_activation_handoff.provider_version == "7.40.0" &&
      var.service_activation_handoff.resource_type == "google_project_service" &&
      var.service_activation_handoff.activation_apply_status == "APPLIED" &&
      var.service_activation_handoff.operator_review_status == "OPERATOR_REVIEWED" &&
      var.service_activation_handoff.evidence_type == "OPERATOR_ATTESTED_NOT_CLOUD_AUTHENTICATED"
    )
    error_message = "Foundation requires the exact applied-and-operator-reviewed non-cloud-authenticated service-activation handoff."
  }
}

check "exact_foundation_graph_contract" {
  assert {
    condition = (
      local.authority_contract.foundationResourceGraphSha256 ==
      "7a36736f234056929bf747f3c9c0174569545c83506db8fcbe04ff55a015296f"
    )
    error_message = "Foundation resource-graph authority drifted."
  }
}
