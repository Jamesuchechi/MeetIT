# LiveKit Server Configuration Template for Self-Hosted Nodes
port: 7880
bind_addresses:
  - ""

rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  enable_loopback_candidate: false

turn:
  enabled: true
  domain: "${domain_name}"
  cert_file: "/etc/livekit/certs/fullchain.pem"
  key_file: "/etc/livekit/certs/privkey.pem"
  tls_port: 5349
  udp_port: 3478

redis:
  address: "${redis_address}"
  password: "${redis_password}"
  db: 0

keys:
  ${api_key}: "${api_secret}"

logging:
  json: true
  level: "info"

room:
  auto_create: true
  empty_timeout: 300 # 5 minutes
  max_participants: 100
  enable_dynacast: true
  enable_simulcast: true
  adaptive_stream: true

node_selector:
  kind: "sysload"
  sysload_limit: 0.85

