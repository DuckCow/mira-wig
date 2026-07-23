output "status" {
  description = "Non-authorizing repository status."
  value       = "FOUNDATION_ROOT_DEFINED_NOT_PROVISIONED"
}

output "foundation_manifest" {
  description = "Bounded nonsecret attended handoff artifact; never full remote state."
  value = {
    contract_version                  = local.authority_contract.contractVersion
    project_id                        = local.project_id
    region                            = local.region
    network_name                      = google_compute_network.refund.name
    network_self_link                 = google_compute_network.refund.self_link
    subnetwork_name                   = google_compute_subnetwork.refund.name
    subnetwork_self_link              = google_compute_subnetwork.refund.self_link
    private_service_access_range_name = google_compute_global_address.private_service_access.name
    artifact_repository_id            = google_artifact_registry_repository.refund_images.repository_id
    artifact_repository_name          = google_artifact_registry_repository.refund_images.name
    cloud_sql_connection_name         = google_sql_database_instance.refund.connection_name
    database_name                     = google_sql_database.refund.name
    preflight_secret_resource_name    = google_secret_manager_secret.preflight_database_url.name
    canary_secret_resource_name       = google_secret_manager_secret.canary_database_url.name
    resource_graph_sha256             = local.authority_contract.foundationResourceGraphSha256
    activation_handoff_status         = "OPERATOR_ATTESTED_APPLIED_AND_REVIEWED"
    cloud_authentication              = "NOT_PERFORMED"
  }
}
