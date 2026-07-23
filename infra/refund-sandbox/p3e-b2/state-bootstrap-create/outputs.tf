output "status" {
  description = "Non-authorizing root status."
  value       = "ONE_TIME_LOCAL_BOOTSTRAP_ONLY"
}

output "bucket_name" {
  description = "Nonsecret handoff manifest field."
  value       = module.state_bucket.bucket_name
}

output "bucket_location" {
  description = "Nonsecret handoff manifest field."
  value       = module.state_bucket.bucket_location
}
