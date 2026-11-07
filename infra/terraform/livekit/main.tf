terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    template = {
      source  = "hashicorp/template"
      version = "~> 2.2"
    }
  }
}

# Network Security Group for WebRTC, TURN, and Signaling
resource "aws_security_group" "livekit" {
  name        = "meetit-livekit-${var.environment}"
  description = "Ingress rules for MeetIT self-hosted LiveKit SFU instance"

  # Signaling HTTP / WebSocket
  ingress {
    description = "LiveKit Signaling HTTP/WS"
    from_port   = 7880
    to_port     = 7880
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # WebRTC fallback over TCP
  ingress {
    description = "WebRTC RTC TCP"
    from_port   = 7881
    to_port     = 7881
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # WebRTC UDP
  ingress {
    description = "WebRTC RTC UDP"
    from_port   = 7882
    to_port     = 7882
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Embedded STUN/TURN UDP
  ingress {
    description = "Embedded STUN/TURN UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Embedded TURN TLS
  ingress {
    description = "Embedded TURN TLS"
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # WebRTC Media UDP Port Range (Audio / Video / Screen Simulcast)
  ingress {
    description = "WebRTC Media UDP Port Range"
    from_port   = 50000
    to_port     = 60000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Standard HTTPS for TLS / Certbot
  ingress {
    description = "HTTPS for Let's Encrypt and Reverse Proxy"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound internet access
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project     = "MeetIT"
    Environment = var.environment
    Service     = "LiveKit-SFU"
  }
}

# User data cloud-init script configuring systemd, Docker, and LiveKit configuration
locals {
  livekit_config = templatefile("${path.module}/livekit.yaml.tpl", {
    domain_name    = var.domain_name
    api_key        = var.api_key
    api_secret     = var.api_secret
    redis_address  = var.redis_address
    redis_password = var.redis_password
  })

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # Install Docker and dependencies
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release certbot

    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Configure LiveKit files
    mkdir -p /etc/livekit /etc/livekit/certs /var/log/livekit

    cat <<'CONFIG_EOF' > /etc/livekit/livekit.yaml
    ${local.livekit_config}
    CONFIG_EOF

    # Configure Systemd Service Unit for LiveKit
    cat <<'SERVICE_EOF' > /etc/systemd/system/livekit.service
    [Unit]
    Description=LiveKit SFU Server Container
    After=docker.service
    Requires=docker.service

    [Service]
    TimeoutStartSec=0
    Restart=always
    RestartSec=5s
    ExecStartPre=-/usr/bin/docker stop livekit-server
    ExecStartPre=-/usr/bin/docker rm livekit-server
    ExecStart=/usr/bin/docker run --name livekit-server \
      --network host \
      -v /etc/livekit/livekit.yaml:/etc/livekit.yaml:ro \
      -v /etc/livekit/certs:/etc/livekit/certs:ro \
      livekit/livekit-server:${var.livekit_version} \
      --config /etc/livekit.yaml

    ExecStop=/usr/bin/docker stop livekit-server

    [Install]
    WantedBy=multi-user.target
    SERVICE_EOF

    systemctl daemon-reload
    systemctl enable livekit.service
    systemctl start livekit.service
  EOF
}

# Ubuntu AMI lookup
data "aws_ami" "ubuntu" {
  most_recent = true
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  owners = ["099720109477"] # Canonical
}

# Dedicated EC2 compute node for LiveKit SFU
resource "aws_instance" "livekit_node" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  vpc_security_group_ids      = [aws_security_group.livekit.id]
  associate_public_ip_address = true
  user_data                   = local.user_data

  root_block_device {
    volume_size           = 50
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name        = "meetit-livekit-${var.environment}"
    Project     = "MeetIT"
    Environment = var.environment
    Service     = "LiveKit-SFU"
  }
}

# Elastic IP allocation for consistent DNS and WebRTC ICE routing
resource "aws_eip" "livekit_eip" {
  instance = aws_instance.livekit_node.id
  domain   = "vpc"

  tags = {
    Name        = "meetit-livekit-eip-${var.environment}"
    Project     = "MeetIT"
    Environment = var.environment
  }
}

