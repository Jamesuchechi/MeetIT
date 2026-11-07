variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "region" {
  description = "Cloud region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Compute instance size optimized for network and compute (recommended c6i.xlarge or c6g.xlarge)"
  type        = string
  default     = "c6i.xlarge"
}

variable "domain_name" {
  description = "Fully qualified domain name for the LiveKit SFU node (e.g. sfu-us-east.meetit.app)"
  type        = string
}

variable "api_key" {
  description = "LiveKit API Key"
  type        = string
  sensitive   = true
}

variable "api_secret" {
  description = "LiveKit API Secret (minimum 32 characters)"
  type        = string
  sensitive   = true
}

variable "redis_address" {
  description = "Redis host:port address for distributed clustering"
  type        = string
  default     = "127.0.0.1:6379"
}

variable "redis_password" {
  description = "Redis authentication password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "livekit_version" {
  description = "LiveKit Docker container release tag"
  type        = string
  default     = "v1.8.3"
}

variable "ssh_public_key" {
  description = "Public SSH key for administrator access"
  type        = string
  default     = ""
}
