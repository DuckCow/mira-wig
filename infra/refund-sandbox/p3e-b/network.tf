resource "google_compute_network" "refund" {
  project                 = var.project_id
  name                    = local.names.network
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "refund" {
  project                  = var.project_id
  name                     = local.names.subnet
  region                   = local.region
  network                  = google_compute_network.refund.id
  ip_cidr_range            = "10.74.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_service_access" {
  project       = var.project_id
  name          = "${var.resource_prefix}-refund-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.refund.id
}

resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.refund.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_access.name]
}

resource "google_compute_firewall" "allow_private_sql" {
  project            = var.project_id
  name               = "${var.resource_prefix}-allow-private-sql"
  network            = google_compute_network.refund.name
  direction          = "EGRESS"
  priority           = 900
  target_tags        = ["refund-provider-free"]
  destination_ranges = ["${google_compute_global_address.private_service_access.address}/16"]

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }
}

resource "google_compute_firewall" "deny_other_egress" {
  project            = var.project_id
  name               = "${var.resource_prefix}-deny-other-egress"
  network            = google_compute_network.refund.name
  direction          = "EGRESS"
  priority           = 1000
  target_tags        = ["refund-provider-free"]
  destination_ranges = ["0.0.0.0/0"]

  deny {
    protocol = "all"
  }
}
