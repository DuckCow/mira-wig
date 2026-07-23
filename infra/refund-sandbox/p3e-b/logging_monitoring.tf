# P3E-B1 deliberately creates no alert policy or notification channel. These exact low-cardinality
# event definitions are the B2 ownership inventory; delivery remains unproven and P3E-A
# OBSERVABILITY_VERIFIED / ALERT_DELIVERY_VERIFIED remain blocked.
output "deferred_observability_event_names" {
  description = "Non-sensitive policy inventory only; not delivery evidence."
  value       = sort(keys(local.deferred_observability_definitions))
}
