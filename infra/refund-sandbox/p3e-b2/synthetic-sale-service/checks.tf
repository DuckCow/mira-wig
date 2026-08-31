check "temporary_lifecycle" {
  assert {
    condition = (
      google_cloud_run_v2_service.sale.deletion_protection == false &&
      google_cloud_run_v2_service_iam_member.public_invoker.member == "allUsers"
    )
    error_message = "The Service must remain explicitly temporary and publicly callback-capable."
  }
}
