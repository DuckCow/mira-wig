resource "google_artifact_registry_repository" "refund_images" {
  project       = local.project_id
  location      = local.region
  repository_id = local.names.artifact_repository
  description   = "P3E provider-free immutable refund worker images"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  lifecycle {
    prevent_destroy = true
  }
}
