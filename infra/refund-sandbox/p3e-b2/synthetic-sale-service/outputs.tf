output "status" {
  value = "TEMPORARY_SYNTHETIC_SALE_SERVICE_CAPABLE_NOT_APPLIED"
}

output "resource_manifest" {
  value = {
    resource_count                        = 6
    region                                = local.region
    service_name                          = local.service_name
    mandatory_retire_before_phase_b       = true
    provider_contact_execution_authorized = false
  }
}
