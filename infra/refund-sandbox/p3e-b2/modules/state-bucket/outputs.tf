output "bucket_name" {
  description = "Nonsecret bucket name for an explicitly reviewed backend input manifest."
  value       = google_storage_bucket.state.name
}

output "bucket_location" {
  description = "Fixed nonsecret bucket location."
  value       = google_storage_bucket.state.location
}
