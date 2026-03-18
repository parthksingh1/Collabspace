# ─────────────────────────────────────────────────────────────────────────────
# Cloud Monitoring & Alerting
# ─────────────────────────────────────────────────────────────────────────────

# Notification channel for alerts
resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "CollabSpace Alerts Email"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# ─────────────────────────── Uptime Checks ────────────────────────────────────

resource "google_monitoring_uptime_check_config" "web" {
  project      = var.project_id
  display_name = "CollabSpace Web - HTTPS"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain_name
    }
  }

  content_matchers {
    content = "collabspace"
    matcher = "CONTAINS_STRING"
  }
}

resource "google_monitoring_uptime_check_config" "api" {
  project      = var.project_id
  display_name = "CollabSpace API - Health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain_name
    }
  }
}

# ─────────────────────────── Alert Policies ───────────────────────────────────

resource "google_monitoring_alert_policy" "high_latency" {
  project      = var.project_id
  display_name = "CollabSpace - High API Latency"
  combiner     = "OR"

  conditions {
    display_name = "API Gateway P95 latency > 500ms"

    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND metric.type = \"custom.googleapis.com/http/request_duration_seconds\" AND resource.label.\"container_name\" = \"api-gateway\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.5

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "API Gateway P95 latency has exceeded 500ms for 5 minutes. Investigate API Gateway pods and upstream service health."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "high_error_rate" {
  project      = var.project_id
  display_name = "CollabSpace - High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "5xx error rate > 5%"

    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND metric.type = \"custom.googleapis.com/http/requests_total\" AND metric.label.\"status\" = monitoring.regex.full_match(\"5..\")"
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.container_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
    notification_rate_limit {
      period = "300s"
    }
  }

  documentation {
    content   = "The 5xx error rate has exceeded 5% for 5 minutes. Check service logs and recent deployments."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "uptime_failure" {
  project      = var.project_id
  display_name = "CollabSpace - Uptime Check Failure"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      duration        = "120s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "1800s"
    notification_rate_limit {
      period = "60s"
    }
  }

  documentation {
    content   = "One or more uptime checks have failed. The application may be unreachable."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "resource_exhaustion" {
  project      = var.project_id
  display_name = "CollabSpace - Resource Exhaustion Warning"
  combiner     = "OR"

  conditions {
    display_name = "Container CPU > 85%"

    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND resource.label.\"namespace_name\" = \"collabspace\" AND metric.type = \"kubernetes.io/container/cpu/limit_utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "Container Memory > 90%"

    condition_threshold {
      filter          = "resource.type = \"k8s_container\" AND resource.label.\"namespace_name\" = \"collabspace\" AND metric.type = \"kubernetes.io/container/memory/limit_utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.90

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "Cloud SQL CPU > 80%"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.80

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "3600s"
    notification_rate_limit {
      period = "600s"
    }
  }

  documentation {
    content   = "Resource usage is approaching limits. Consider scaling up or optimizing the affected services."
    mime_type = "text/markdown"
  }
}

# ─────────────────────────── Dashboard ────────────────────────────────────────

resource "google_monitoring_dashboard" "collabspace" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "CollabSpace Overview"
    gridLayout = {
      columns = 3
      widgets = [
        {
          title = "API Request Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"k8s_container\" AND resource.label.\"namespace_name\" = \"collabspace\" AND metric.type = \"custom.googleapis.com/http/requests_total\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.container_name"]
                  }
                }
              }
            }]
          }
        },
        {
          title = "P95 Latency"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"k8s_container\" AND resource.label.\"namespace_name\" = \"collabspace\" AND metric.type = \"custom.googleapis.com/http/request_duration_seconds\""
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_PERCENTILE_95"
                    crossSeriesReducer = "REDUCE_MEAN"
                    groupByFields      = ["resource.label.container_name"]
                  }
                }
              }
            }]
          }
        },
        {
          title = "Error Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type = \"k8s_container\" AND resource.label.\"namespace_name\" = \"collabspace\" AND metric.type = \"custom.googleapis.com/http/requests_total\" AND metric.label.\"status\" = monitoring.regex.full_match(\"5..\")"
                  aggregation = {
                    alignmentPeriod    = "60s"
                    perSeriesAligner   = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields      = ["resource.label.container_name"]
                  }
                }
              }
            }]
          }
        },
      ]
    }
  })
}
