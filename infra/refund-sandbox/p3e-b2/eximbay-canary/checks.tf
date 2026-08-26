check "permanent_apply_block" {
  assert {
    condition = (
      local.runtime_apply_authorized == false &&
      local.runtime_root_apply_policy == "UNCONDITIONALLY_BLOCKED_IN_R2B1"
    )
    error_message = "R2B1_EXIMBAY_CANARY_ROOT_UNCONDITIONALLY_BLOCKED"
  }
}

check "numeric_secret_versions" {
  assert {
    condition = (
      can(regex("^[1-9][0-9]*$", var.database_url_secret_version)) &&
      can(regex("^[1-9][0-9]*$", var.eximbay_api_key_secret_version))
    )
    error_message = "Secret versions must be exact positive numeric versions."
  }
}
