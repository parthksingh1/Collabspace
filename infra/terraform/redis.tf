# ─────────────────────────────────────────────────────────────────────────────
# Memorystore for Redis (HA)
# ─────────────────────────────────────────────────────────────────────────────

resource "google_redis_instance" "primary" {
  name           = "collabspace-redis-${var.environment}"
  project        = var.project_id
  region         = var.region
  display_name   = "CollabSpace Redis - ${var.environment}"
  tier           = "STANDARD_HA"
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = var.redis_version

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    "maxmemory-policy"  = "allkeys-lru"
    "notify-keyspace-events" = "Ex"
    "activedefrag"      = "yes"
    "lfu-log-factor"    = "10"
    "lfu-decay-time"    = "1"
    "stream-node-max-bytes" = "4096"
    "stream-node-max-entries" = "100"
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  transit_encryption_mode = "SERVER_AUTHENTICATION"

  labels = merge(var.labels, {
    environment = var.environment
    service     = "redis"
  })

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
  ]
}
