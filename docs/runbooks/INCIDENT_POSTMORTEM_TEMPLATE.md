# Incident Postmortem Template

> Standard operational postmortem document for MeetIT platform incidents (SEV-0 through SEV-3).
> Must be completed and reviewed within 48 hours of incident mitigation.

---

## 1. Incident Metadata

| Field                   | Value                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Incident Title**      | `[SEV-X] <Short summary of failure, e.g., US-East SFU Regional Outage>`                                    |
| **Date & Time (UTC)**   | `YYYY-MM-DD HH:MM UTC`                                                                                     |
| **Severity Level**      | `SEV-0` (Critical Outage) \| `SEV-1` (High Degradation) \| `SEV-2` (Partial Impairment) \| `SEV-3` (Minor) |
| **Incident Commander**  | `@handle`                                                                                                  |
| **Communications Lead** | `@handle`                                                                                                  |
| **Status**              | `Mitigated` \| `Resolved` \| `Under Review`                                                                |

---

## 2. Executive Summary

Brief 2–3 paragraph summary describing what failed, what the customer experienced (e.g. video freezes, dropped calls, waiting room loops), and what resolved the issue.

---

## 3. Impact & SLAs

- **Service Availability Impact:** `X.XX%`
- **Total Duration:** `XX minutes`
- **Time to Detect (TTD):** `X minutes` (Target: < 2 min)
- **Time to Acknowledge (TTA):** `X minutes`
- **Time to Mitigate (TTM):** `X minutes`
- **Affected Meeting Rooms:** `~X,XXX rooms`
- **Affected Participants:** `~XX,XXX streams`
- **Data Loss / Security Impact:** `None`

---

## 4. Incident Timeline (All times in UTC)

- `HH:MM` - Monitoring alert `MeetItHighPacketLoss` fires for region `us-east`.
- `HH:MM` - Incident Commander paged via PagerDuty.
- `HH:MM` - Status page updated to "Investigating regional latency in US East".
- `HH:MM` - Traffic drained from degraded node `sfu-us-east-4`.
- `HH:MM` - Client automated cascading kicked in, migrating active rooms to `eu-west`.
- `HH:MM` - Packet loss stabilized below 0.5%.
- `HH:MM` - Post-incident monitoring window verified clean; incident resolved.

---

## 5. Root Cause Analysis (5 Whys)

1. **Why did meetings freeze in US-East?**
   The SFU nodes experienced 45% packet loss on outbound RTP streams.
2. **Why was there packet loss?**
   Underlying cloud provider hypervisor network interface exceeded UDP packet buffers.
3. **Why did packet buffers exceed?**
   Sudden spike in high-bitrate screen sharing without spatial simulcast downscaling.
4. **Why did spatial simulcast fail to downscale?**
   Client congestion control probe was rate-limited by upstream firewall.
5. **Why was it rate-limited?**
   Firewall rule lacked an exception for UDP STUN/SRFLX port ranges.

---

## 6. What Went Well / What Went Poorly

### What Went Well

- Automated Prometheus alert alerted on-call in 75 seconds (< 2 min SLA).
- Client-side RTT probing and `getFailoverRegion` automatically cascaded healthy sessions without crashing client browsers.
- No customer credentials, E2EE keys, or meeting recordings were exposed.

### What Went Poorly

- Status page update was delayed by 6 minutes due to missing API token rotation.
- Secondary CoTURN node autoscale took 4 minutes to warm up.

### Where We Got Lucky

- Cascading route `us-east` -> `eu-west` had ample spare capacity during off-peak European hours.

---

## 7. Action Items & Remediation

| Action Item                                      | Type     | Priority | Owner       | Due Date   | Status |
| ------------------------------------------------ | -------- | -------- | ----------- | ---------- | ------ |
| Add firewall exception for UDP SRFLX probe ports | Prevent  | P0       | @infra-lead | YYYY-MM-DD | Open   |
| Pre-warm CoTURN standby instances in US-East     | Mitigate | P1       | @sfu-team   | YYYY-MM-DD | Open   |
| Automate status page webhook on SEV-1 alert      | Process  | P2       | @oncall     | YYYY-MM-DD | Open   |
