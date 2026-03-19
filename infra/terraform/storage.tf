# ─────────────────────────────────────────────────────────────────────────────
# GCS Bucket for Assets
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "assets" {
  name          = "collabspace-assets-${var.project_id}-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = var.environment != "production"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  cors {
    origin          = ["https://${var.domain_name}"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["Content-Type", "Content-Disposition", "Cache-Control"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age                = 730
      with_state         = "ANY"
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  labels = merge(var.labels, {
    environment = var.environment
    purpose     = "assets"
  })
}

# ─────────────────────────── CDN Backend Bucket ───────────────────────────────

resource "google_compute_backend_bucket" "assets_cdn" {
  name        = "collabspace-assets-cdn"
  project     = var.project_id
  bucket_name = google_storage_bucket.assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600
    max_ttl           = 86400
    client_ttl        = 3600
    negative_caching  = true

    negative_caching_policy {
      code = 404
      ttl  = 60
    }

    serve_while_stale = 86400

    cache_key_policy {
      include_http_headers = []
    }
  }
}

# ─────────────────────────── Bucket IAM ───────────────────────────────────────

resource "google_storage_bucket_iam_member" "assets_public_read" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "assets_gke_write" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# ─────────────────────────── Uploads Bucket (Private) ─────────────────────────

resource "google_storage_bucket" "uploads" {
  name          = "collabspace-uploads-${var.project_id}-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = var.environment != "production"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
      matches_prefix = ["tmp/"]
    }
    action {
      type = "Delete"
    }
  }

  labels = merge(var.labels, {
    environment = var.environment
    purpose     = "uploads"
  })
}

resource "google_storage_bucket_iam_member" "uploads_gke_admin" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.gke_nodes.email}"
}
