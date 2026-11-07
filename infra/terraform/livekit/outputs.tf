output "instance_id" {
  description = "The ID of the LiveKit compute instance"
  value       = aws_instance.livekit_node.id
}

output "public_ip" {
  description = "Elastic Public IP allocated to the LiveKit node"
  value       = aws_eip.livekit_eip.public_ip
}

output "livekit_url" {
  description = "WebSocket URL for connecting to this LiveKit node"
  value       = "wss://${var.domain_name}"
}

output "health_check_url" {
  description = "HTTP health check endpoint for latency probing and monitoring"
  value       = "https://${var.domain_name}/health"
}

