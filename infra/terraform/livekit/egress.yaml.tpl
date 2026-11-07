# LiveKit Egress Configuration Template for Headless Composite Recording
api_key: "${api_key}"
api_secret: "${api_secret}"
ws_url: "ws://127.0.0.1:7880"

redis:
  address: "${redis_address}"
  password: "${redis_password}"
  db: 0

# Storage destination for recorded video composites
s3:
  access_key: "${s3_access_key}"
  secret: "${s3_secret}"
  region: "${s3_region}"
  bucket: "${s3_bucket}"
  endpoint: "${s3_endpoint}"
  force_path_style: ${s3_force_path_style}

# Template and layout rendering
template:
  layout: "grid"

logging:
  json: true
  level: "info"

