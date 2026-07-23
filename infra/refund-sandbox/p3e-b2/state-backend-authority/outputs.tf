output "status" {
  description = "Non-authorizing root status."
  value       = "STATE_BACKEND_AUTHORITY_DEFINED_NOT_PROVISIONED"
}

output "bucket_name" {
  description = "Nonsecret authority manifest field."
  value       = module.state_bucket.bucket_name
}

output "bucket_location" {
  description = "Nonsecret authority manifest field."
  value       = module.state_bucket.bucket_location
}
