# ─────────────────────────────────────────────────────────────────────────────
# GKE Cluster
# ─────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "gke_nodes" {
  account_id   = "${var.cluster_name}-nodes"
  display_name = "GKE Node Service Account for ${var.cluster_name}"
  project      = var.project_id
}

resource "google_project_iam_member" "gke_node_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/artifactregistry.reader",
    "roles/storage.objectViewer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_container_cluster" "primary" {
  provider = google-beta

  name     = var.cluster_name
  location = var.region
  project  = var.project_id

  # We separately manage node pools
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.self_link
  subnetwork = google_compute_subnetwork.primary.self_link

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }

  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Master authorized networks
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Cluster addons
  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
    dns_cache_config {
      enabled = true
    }
  }

  # Network policy
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  # Maintenance window: Sundays 2-6 AM UTC
  maintenance_policy {
    recurring_window {
      start_time = "2024-01-01T02:00:00Z"
      end_time   = "2024-01-01T06:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SU"
    }
  }

  # Binary authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Logging and monitoring
  logging_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
      "WORKLOADS",
    ]
  }

  monitoring_config {
    enable_components = [
      "SYSTEM_COMPONENTS",
    ]
    managed_prometheus {
      enabled = true
    }
  }

  # Release channel
  release_channel {
    channel = "REGULAR"
  }

  # Cluster security
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  resource_labels = merge(var.labels, {
    environment = var.environment
  })

  depends_on = [
    google_project_service.apis,
    google_compute_subnetwork.primary,
  ]
}

# ─────────────────────────── Default Node Pool ────────────────────────────────

resource "google_container_node_pool" "default" {
  name     = "default-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  initial_node_count = var.default_node_count

  autoscaling {
    min_node_count = var.default_node_min
    max_node_count = var.default_node_max
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
    strategy        = "SURGE"
  }

  node_config {
    machine_type    = var.default_machine_type
    disk_size_gb    = 100
    disk_type       = "pd-ssd"
    image_type      = "COS_CONTAINERD"
    service_account = google_service_account.gke_nodes.email

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }

    labels = merge(var.labels, {
      node_pool = "default"
    })

    tags = ["gke-node", "${var.cluster_name}-node"]
  }
}

# ─────────────────────────── Compute Node Pool (AI/Heavy Workloads) ───────────

resource "google_container_node_pool" "compute" {
  name     = "compute-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  initial_node_count = 1

  autoscaling {
    min_node_count = 1
    max_node_count = 10
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
    strategy        = "SURGE"
  }

  node_config {
    machine_type    = var.compute_machine_type
    disk_size_gb    = 200
    disk_type       = "pd-ssd"
    image_type      = "COS_CONTAINERD"
    service_account = google_service_account.gke_nodes.email

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }

    labels = merge(var.labels, {
      node_pool = "compute"
    })

    taint {
      key    = "compute-intensive"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    tags = ["gke-node", "${var.cluster_name}-compute"]
  }
}

# ─────────────────────────── Preemptible Node Pool ────────────────────────────

resource "google_container_node_pool" "preemptible" {
  name     = "preemptible-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  project  = var.project_id

  initial_node_count = 0

  autoscaling {
    min_node_count = 0
    max_node_count = 10
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type    = var.default_machine_type
    disk_size_gb    = 100
    disk_type       = "pd-standard"
    image_type      = "COS_CONTAINERD"
    preemptible     = true
    service_account = google_service_account.gke_nodes.email

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }

    labels = merge(var.labels, {
      node_pool   = "preemptible"
      preemptible = "true"
    })

    taint {
      key    = "cloud.google.com/gke-preemptible"
      value  = "true"
      effect = "NO_SCHEDULE"
    }

    tags = ["gke-node", "${var.cluster_name}-preemptible"]
  }
}
