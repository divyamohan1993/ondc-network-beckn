# =============================================================================
# ONDC Platform — Terraform Deployment
# =============================================================================
# Single terraform apply: creates VM, installs everything, deploys the platform.
#
# Usage:
#   cd infra
#   terraform init
#   terraform apply -var="domain=ondc.dmj.one" -var="datagovin_key=YOUR_KEY"
#
# Destroy:
#   terraform destroy
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "project" {
  description = "GCP project ID"
  type        = string
  default     = "lmsforshantithakur"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-south1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "asia-south1-b"
}

variable "machine_type" {
  description = "VM machine type (4 vCPU, 16GB RAM minimum)"
  type        = string
  default     = "e2-standard-4"
}

variable "domain" {
  description = "Domain name for the platform (e.g., ondc.dmj.one)"
  type        = string
}

variable "datagovin_key" {
  description = "data.gov.in API key for India pincode seeding (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "disk_size" {
  description = "Boot disk size in GB"
  type        = number
  default     = 50
}

variable "repo_url" {
  description = "Git repository URL"
  type        = string
  default     = "https://github.com/divyamohan1993/ondc-network-beckn.git"
}

# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

provider "google" {
  project = var.project
  region  = var.region
  zone    = var.zone
}

# ---------------------------------------------------------------------------
# Network — Firewall
# ---------------------------------------------------------------------------

resource "google_compute_firewall" "ondc_http" {
  name    = "ondc-allow-http"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ondc-server"]
}

# ---------------------------------------------------------------------------
# Compute — VM Instance
# ---------------------------------------------------------------------------

resource "google_compute_instance" "ondc" {
  name         = "ondc-platform"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["ondc-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.disk_size
    }
  }

  network_interface {
    network = "default"
    access_config {} # Public IP
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh", {
    domain        = var.domain
    datagovin_key = var.datagovin_key
    repo_url      = var.repo_url
  })

  metadata = {
    "enable-osconfig" = "true"
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "vm_ip" {
  description = "Public IP of the ONDC platform VM"
  value       = google_compute_instance.ondc.network_interface[0].access_config[0].nat_ip
}

output "urls" {
  description = "Platform URLs (set DNS A record to vm_ip first)"
  value = {
    buyer_app = "https://${var.domain}/"
    seller    = "https://${var.domain}/seller/"
    admin     = "https://${var.domain}/admin/"
    onboard   = "https://${var.domain}/admin/onboard"
    pitch     = "https://${var.domain}/pitch"
    registry  = "https://${var.domain}/registry/health"
    gateway   = "https://${var.domain}/gateway/health"
  }
}

output "ssh_command" {
  description = "SSH into the VM"
  value       = "gcloud compute ssh ondc-platform --zone=${var.zone} --project=${var.project}"
}

output "dns_instructions" {
  description = "DNS setup"
  value       = "Set A record for ${var.domain} -> ${google_compute_instance.ondc.network_interface[0].access_config[0].nat_ip}"
}
