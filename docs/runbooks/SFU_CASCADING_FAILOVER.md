# Runbook: SFU Cascading & Regional Failover

> **Service:** Media SFU (LiveKit / Mediasoup cluster)  
> **Severity Tier:** SEV-1 / SEV-2  
> **Alerts:** `SFUHighPacketLossRate`, `SFUNodeDown`, `SFURegionDegraded`

---

## 1. Alert Summary & Symptoms

- **Alert Condition:** > 5% packet loss or > 300ms RTT sustained over 2 consecutive minutes for a specific geographic region.
- **Customer Impact:** Frozen video, choppy audio, delayed screen share, or automatic reconnection toasts appearing for participants in the affected region.

---

## 2. Immediate Triage & Diagnostics

### Step 1: Verify Regional Health & Prometheus Metrics

Scrape or view Prometheus Grafana dashboard `MeetIT / Media SFU Overview`:

```bash
# Check regional packet loss and participant distribution
curl -s http://localhost:8787/metrics/prometheus | grep -E "meetit_signaling_up|participants_active|rooms_active"

# Check LiveKit node health in target region
kubectl get nodes -l topology.kubernetes.io/region=us-east
kubectl get pods -n meetit-media -l app=livekit-sfu -o wide
```

### Step 2: Confirm Cascading Interconnect Status

Check whether the interconnect cascading bridge between the degraded region and its designated target (e.g. `us-east` -> `eu-west` or `us-west`) is healthy:

```bash
# Verify inter-region ping / RTT
kubectl exec -n meetit-media deploy/livekit-sfu -- ping -c 5 sfu.eu-west.meetit.live
```

---

## 3. Mitigation Procedure

### Option A: Automated Client Cascading (Preferred)

MeetIT web clients automatically probe candidate regions via `probeRegionLatency()` and calculate smoothed RTT (`smoothLatency`). If an edge fails:

1. In the MeetIT Admin Console / Feature Flag toggle, mark the degraded region as disabled:
   ```bash
   # Set region unhealthy in DNS / Edge routing
   curl -X POST https://api.meetit.live/v1/internal/regions/us-east/drain \
     -H "Authorization: Bearer $INTERNAL_OPS_KEY"
   ```
2. The `/regions` signaling endpoint will immediately omit or deprioritize the degraded region.
3. Active clients will invoke `getFailoverRegion(currentRegionId, regions, latencies)`, transparently reconnecting their WebRTC transport to the cascaded destination.

### Option B: Manual Node Drain & Kubernetes Rollout

If a single node within an SFU cluster has gone rogue (e.g. OOM, bad NIC):

```bash
# Cordon and drain the degraded SFU pod
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --force

# LiveKit graceful shutdown: allows active rooms 90 seconds to migrate before terminating
kubectl scale deployment/livekit-sfu -n meetit-media --replicas=<desired_count>
```

---

## 4. Verification & Recovery

1. Scrape `GET /metrics/prometheus` to confirm `connections_active` and `participants_active` recover on the cascaded region.
2. Confirm client RTT in browser diagnostics drops below 100ms.
3. Verify video bitrates recover to normal target (1.5 Mbps for 1:1, 800 kbps for 4-way calls).
4. Update Status Page: "Regional media routing in US-East restored. All services operational."
