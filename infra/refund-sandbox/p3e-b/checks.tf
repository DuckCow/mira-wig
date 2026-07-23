check "frozen_region" {
  assert {
    condition     = local.region == "asia-northeast3"
    error_message = "P3E is frozen to asia-northeast3."
  }
}

check "distinct_runtime_identities" {
  assert {
    condition     = google_service_account.preflight.account_id != google_service_account.canary.account_id
    error_message = "Preflight and canary runtime identities must remain distinct."
  }
}

check "same_immutable_image" {
  assert {
    condition = (
      google_cloud_run_v2_job.preflight.template[0].template[0].containers[0].image ==
      google_cloud_run_v2_job.canary.template[0].template[0].containers[0].image
    )
    error_message = "Both jobs must use the same supplied immutable digest URI."
  }
}

check "dormant_canary_budget_contract" {
  assert {
    condition     = local.canary_internal_budget_seconds == 120
    error_message = "The repository worker cooperative budget remains 120 seconds."
  }
}

check "no_preflight_invoker_in_b1" {
  assert {
    condition     = length(var.future_preflight_invoker_members) == 0
    error_message = "P3E-B1 must not grant even preflight invocation authority."
  }
}

check "observability_delivery_blocked" {
  assert {
    condition = (
      var.alert_policies_enabled == false &&
      length(var.notification_channel_names) == 0
    )
    error_message = "P3E-B1 alert delivery must remain disabled and unclaimed."
  }
}
