output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "GKE cluster CA certificate (base64 encoded)"
  value       = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "kubeconfig_command" {
  description = "Command to configure kubectl"
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
}

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "vpc_self_link" {
  description = "VPC network self link"
  value       = google_compute_network.vpc.self_link
}

output "subnet_id" {
  description = "Primary subnet ID"
  value       = google_compute_subnetwork.primary.id
}

output "database_connection_name" {
  description = "Cloud SQL connection name for proxy"
  value       = google_sql_database_instance.primary.connection_name
}

output "database_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.primary.private_ip_address
  sensitive   = true
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.collabspace.name
}

output "read_replica_connection_name" {
  description = "Cloud SQL read replica connection name"
  value       = google_sql_database_instance.read_replica.connection_name
}

output "read_replica_private_ip" {
  description = "Cloud SQL read replica private IP"
  value       = google_sql_database_instance.read_replica.private_ip_address
  sensitive   = true
}

output "redis_host" {
  description = "Redis instance host"
  value       = google_redis_instance.primary.host
  sensitive   = true
}

output "redis_port" {
  description = "Redis instance port"
  value       = google_redis_instance.primary.port
}

output "static_ip" {
  description = "Global static IP address for ingress"
  value       = google_compute_global_address.ingress.address
}

output "assets_bucket_name" {
  description = "GCS bucket name for assets"
  value       = google_storage_bucket.assets.name
}

output "assets_bucket_url" {
  description = "GCS bucket URL for assets"
  value       = google_storage_bucket.assets.url
}

output "cdn_ip" {
  description = "CDN backend IP"
  value       = google_compute_global_address.ingress.address
}
