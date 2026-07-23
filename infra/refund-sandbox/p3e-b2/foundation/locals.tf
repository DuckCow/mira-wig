locals {
  authority_contract = jsondecode(file("${path.module}/../contracts/foundation-authority-v1.json"))
  region             = "asia-northeast3"
  project_id         = var.service_activation_handoff.project_id
  names = {
    artifact_repository = "${var.resource_prefix}-refund-images"
    network             = "${var.resource_prefix}-refund-vpc"
    subnet              = "${var.resource_prefix}-refund-ane3"
    sql_instance        = "${var.resource_prefix}-refund-pg18"
    database            = "refund_sandbox"
    preflight_db_secret = "${var.resource_prefix}-preflight-database-url"
    canary_db_secret    = "${var.resource_prefix}-canary-database-url"
  }
}
