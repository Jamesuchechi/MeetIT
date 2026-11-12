# Runbook: TURN Relay Saturation & Bandwidth Optimization

> **Service:** CoTURN Relay Cluster / STUN Services  
> **Severity Tier:** SEV-1 / SEV-2  
> **Alerts:** `TURNRelayRatioExceeded`, `CoTURNPortExhaustion`, `HighRelayBandwidthCost`

---

## 1. Alert Summary & Symptoms

- **Alert Condition:** Global TURN relay ratio exceeds 35% of total media bandwidth (normal baseline: 8–15%), or CoTURN CPU > 85%, or UDP allocation port exhaustion (< 1,000 available ports).
- **Customer Impact:** Elevated packet loss, media stream clipping, high latency, or sudden escalation in cloud egress costs.

---

## 2. Immediate Triage & Diagnostics

### Step 1: Check Current Relay Ratio & Cost Impact

Open the In-Meeting Cost Telemetry Modal or check Prometheus metrics:

```promql
# Query global relay ratio percentage
meetit_webrtc_relay_ratio_percentage > 30

# CoTURN active allocation sessions
sum(coturn_allocated_sockets) by (region)
```

### Step 2: Identify High-Relay Traffic Sources

Check whether the traffic spike originates from:

1. Specific corporate enterprise domains behind restrictive symmetric NATs or proxies.
2. A regional STUN outage causing clients to mistakenly fail over to TURN relay.
3. UDP port 3478 blocking by an ISP or intermediate network.

---

## 3. Mitigation Procedure

### Step 1: Scale Out CoTURN Pods & Floating IPs

Immediately scale up the CoTURN fleet in the affected region:

```bash
# Scale CoTURN deployment in Kubernetes
kubectl scale deployment/coturn -n meetit-media --replicas=12

# Check that UDP ephemeral ports (49152 - 65535) are allocated without collision
kubectl get pods -n meetit-media -l app=coturn
```

### Step 2: Prioritize Direct UDP Candidates (Client-Side)

Confirm clients are utilizing `prioritizeIceCandidates()`:

- Host candidates (UDP local) $\rightarrow$ Priority 10
- SRFLX candidates (STUN UDP) $\rightarrow$ Priority 8
- PRFLX candidates (Reflexive UDP) $\rightarrow$ Priority 6
- Relay candidates $\rightarrow$ Priority 2 (Only used when direct UDP fails)

### Step 3: Enable TCP/TLS 443 Fallback for Enterprise Firewalls

If enterprise firewalls are dropping UDP entirely, steer those specific sessions to TLS port 443 TURN instead of flooding UDP relay retries:

```yaml
# In coturn configuration (turnserver.conf)
tls-listening-port: 443
alt-tls-listening-port: 5349
```

### Step 4: Promote 2-Person Calls to 1:1 Direct P2P Bypass

For rooms with exactly 2 participants, ensure `isP2PBypassEligible` is active. This eliminates SFU hop costs entirely and allows direct host-to-host or STUN direct routing.

---

## 4. Verification & Recovery

1. Confirm relay ratio falls back into the target optimal range (< 15–20%).
2. Verify CoTURN socket usage stabilizes below 70% capacity.
3. Check Cost Dashboard ($/participant-minute) returns to budgeted target.
