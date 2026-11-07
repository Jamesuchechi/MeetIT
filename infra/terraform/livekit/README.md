# MeetIT Self-Hosted LiveKit SFU Terraform Module

This Terraform module provisions dedicated compute nodes for running a production-grade, self-hosted LiveKit SFU instance with systemd supervision, container auto-recovery, and proper firewall egress/ingress port allocations.

---

## Architecture & Ports Matrix

The LiveKit SFU requires specific ports to be open for WebRTC media routing, signaling, and fallback:

| Port            | Protocol | Purpose                                 | Scope  |
| :-------------- | :------- | :-------------------------------------- | :----- |
| `7880`          | TCP      | LiveKit Signaling (HTTP & WebSocket)    | Public |
| `7881`          | TCP      | WebRTC over TCP fallback                | Public |
| `7882`          | UDP      | WebRTC over UDP signaling               | Public |
| `3478`          | UDP      | Embedded STUN/TURN UDP                  | Public |
| `5349`          | TCP      | Embedded TURN TLS                       | Public |
| `50000 - 60000` | UDP      | RTC Media Ports (Simulcast Video/Audio) | Public |
| `443`           | TCP      | HTTPS Reverse Proxy / Let's Encrypt     | Public |

---

## Usage

```hcl
module "livekit_us_east" {
  source = "./infra/terraform/livekit"

  environment     = "production"
  region          = "us-east-1"
  instance_type   = "c6i.xlarge"
  domain_name     = "sfu-us-east.meetit.app"
  api_key         = var.livekit_api_key
  api_secret      = var.livekit_api_secret
  redis_address   = "redis.internal:6379"
  redis_password  = var.redis_password
  livekit_version = "v1.8.3"
}
```

---

## Verifying the Deployment

Once deployed, the node's health and telemetry endpoints can be probed:

```bash
# Health check endpoint
curl -i https://sfu-us-east.meetit.app/health

# WebRTC signaling probe via wscat
wscat -c "wss://sfu-us-east.meetit.app"
```
