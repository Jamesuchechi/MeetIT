# Runbook: Signaling Partition & Split-Brain Mitigation

> **Service:** Signaling Gateway (`@meetit/signaling`) & Redis State Store  
> **Severity Tier:** SEV-0 / SEV-1  
> **Alerts:** `SignalingClusterPartition`, `RedisPubSubLag`, `HighWebSocketDropRate`

---

## 1. Alert Summary & Symptoms

- **Alert Condition:** Disconnect rate > 15% of active WebSockets in 60 seconds, or Redis replica replication lag > 5 seconds, or split-brain state detected between multi-zone signaling pods.
- **Customer Impact:** Participants unable to see roster changes, chat messages delayed or dropped, duplicate peer join messages, or "Reconnecting to signaling..." banners.

---

## 2. Immediate Triage & Diagnostics

### Step 1: Check Signaling Cluster Health & Metrics

Scrape the Prometheus `/metrics/prometheus` endpoint:

```bash
# Check signaling up, active connections, and invalid frame counters
curl -s http://localhost:8787/metrics/prometheus | grep -E "meetit_signaling_up|connections_active|rooms_active"

# Check Kubernetes Pod status and HPA replicas
kubectl get hpa signaling-hpa -n meetit
kubectl get pods -n meetit -l app=signaling -o wide
```

### Step 2: Check Redis State Store & Pub/Sub

```bash
# Inspect Redis replication status
redis-cli -h redis-primary.meetit info replication

# Check Redis connection pool and memory
redis-cli -h redis-primary.meetit info memory
```

---

## 3. Mitigation Procedure

### Step 1: Isolate Degraded Signaling Pods

If a subset of signaling pods in an availability zone have partitioned:

```bash
# Identify pods with failing readiness probes (/readyz)
kubectl get pods -n meetit -l app=signaling --field-selector status.phase!=Running

# Restart the partitioned pods safely with rolling update
kubectl rollout restart deployment/signaling -n meetit
```

### Step 2: Graceful Slot Detachment & Reclaim Grace

The MeetIT signaling server features built-in slot reclamation:

- When a WebSocket disconnects without an explicit leave frame, `detachSocket()` retains the peer's participant slot for `reclaimSlotMs` (default 30 seconds).
- Clients reconnecting within this grace period reclaim their slot immediately without triggering a flurry of `peer.left` / `peer.joined` re-announcements.
- If the disconnect persists beyond 30 seconds, `leavePeer(peerId, 'timeout')` reaps the slot and cleanly broadcasts `peer.left`.

### Step 3: Trigger Client Exponential Backoff with Jitter

During network partition events, client reconnection storms are mitigated via `@meetit/protocol` exponential backoff (`computeBackoffDelay(attempt, baseMs, maxMs, jitter = true)`).
Ensure upstream reverse proxies (e.g. Cloudflare / NGINX) return HTTP 503 with `Retry-After: 5` header during maintenance windows.

---

## 4. Verification & Recovery

1. Confirm `/healthz` and `/readyz` return HTTP 200 on all signaling pods.
2. Verify Prometheus `connections_active` matches expected active user count.
3. Verify chat messages, reactions, and whiteboard broadcast latencies drop below 50ms.
4. Log incident timeline and open postmortem using `INCIDENT_POSTMORTEM_TEMPLATE.md`.
