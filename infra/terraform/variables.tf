variable "project_id" {
  description = "GCP project ID where all resources will be created"
  type        = string
}

variable "region" {
  description = "GCP region for resource deployment"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for zonal resources"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Deployment environment (production, staging, development)"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development."
  }
}

variable "cluster_name" {
  description = "Name of the GKE cluster"
  type        = string
  default     = "collabspace-cluster"
}

variable "vpc_name" {
  description = "Name of the VPC network"
  type        = string
  default     = "collabspace-vpc"
}

variable "subnet_cidr" {
  description = "CIDR range for the primary subnet"
  type        = string
  default     = "10.0.0.0/20"
}

variable "pods_cidr" {
  description = "CIDR range for Kubernetes pods"
  type        = string
  default     = "10.4.0.0/14"
}

variable "services_cidr" {
  description = "CIDR range for Kubernetes services"
  type        = string
  default     = "10.8.0.0/20"
}

variable "master_cidr" {
  description = "CIDR range for GKE master nodes"
  type        = string
  default     = "172.16.0.0/28"
}

variable "authorized_networks" {
  description = "List of CIDR blocks authorized to access the GKE master"
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = [
    {
      cidr_block   = "0.0.0.0/0"
      display_name = "All networks (restrict in production)"
    }
  ]
}

variable "default_node_count" {
  description = "Initial number of nodes in the default node pool"
  type        = number
  default     = 3
}

variable "default_node_min" {
  description = "Minimum number of nodes in the default node pool"
  type        = number
  default     = 3
}

variable "default_node_max" {
  description = "Maximum number of nodes in the default node pool"
  type        = number
  default     = 20
}

variable "default_machine_type" {
  description = "Machine type for default node pool"
  type        = string
  default     = "e2-standard-4"
}

variable "compute_machine_type" {
  description = "Machine type for compute-intensive node pool (AI service)"
  type        = string
  default     = "e2-standard-8"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-4-16384"
}

variable "db_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "collabspace"
}

variable "db_user" {
  description = "PostgreSQL database user"
  type        = string
  default     = "collabspace"
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "redis_memory_size_gb" {
  description = "Redis instance memory size in GB"
  type        = number
  default     = 5
}

variable "redis_version" {
  description = "Redis version for Memorystore"
  type        = string
  default     = "REDIS_7_0"
}

variable "domain_name" {
  description = "Primary domain name for the application"
  type        = string
  default     = "collabspace.io"
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = "alerts@collabspace.io"
}

variable "labels" {
  description = "Common labels applied to all resources"
  type        = map(string)
  default = {
    project     = "collabspace"
    managed_by  = "terraform"
    team        = "platform"
  }
}
