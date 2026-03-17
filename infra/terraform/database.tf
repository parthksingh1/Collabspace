# ─────────────────────────────────────────────────────────────────────────────
# Cloud SQL for PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────

resource "google_sql_database_instance" "primary" {
  name                = "collabspace-db-${var.environment}"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.environment == "production" ? true : false

  settings {
    tier              = var.db_tier
    availability_type = "REGIONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    disk_autoresize_limit = 500

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      require_ssl     = true

      authorized_networks {
        name  = "deny-all"
        value = "0.0.0.0/0"
      }
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      location                       = var.region
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 4 AM UTC
      update_track = "stable"
    }

    database_flags {
      name  = "max_connections"
      value = "500"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    database_flags {
      name  = "log_temp_files"
      value = "0"
    }

    database_flags {
      name  = "shared_preload_libraries"
      value = "pg_stat_statements"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = var.labels
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
  ]
}

# ─────────────────────────── Database ─────────────────────────────────────────

resource "google_sql_database" "collabspace" {
  name     = var.db_name
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
}

# ─────────────────────────── Database User ────────────────────────────────────

resource "google_sql_user" "collabspace" {
  name     = var.db_user
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
  password = var.db_password
}

# ─────────────────────────── Read Replica ─────────────────────────────────────

resource "google_sql_database_instance" "read_replica" {
  name                 = "collabspace-db-replica-${var.environment}"
  project              = var.project_id
  region               = var.region
  database_version     = "POSTGRES_16"
  master_instance_name = google_sql_database_instance.primary.name
  deletion_protection  = var.environment == "production" ? true : false

  replica_configuration {
    failover_target = false
  }

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = var.db_disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      require_ssl     = true
    }

    database_flags {
      name  = "max_connections"
      value = "500"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = merge(var.labels, {
      role = "read-replica"
    })
  }

  depends_on = [
    google_sql_database_instance.primary,
  ]
}
