# MeetIT On-Call Rotation & Incident Escalation Policy

> Defines roles, responsibilities, SLA targets, and escalation procedures for 24/7/365 production engineering on-call.

---

## 1. On-Call Roles & Rotation Cadence

| Role                        | Responsibility                                                                                      | Shift Duration                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Primary On-Call**         | First responder for all high-priority alerts; acknowledges pages within SLA, initiates triage.      | 7 days (Tuesday 10:00 UTC handoff)         |
| **Secondary On-Call**       | Backup responder if Primary is unreachable or engaged in active SEV-0/1 incident triage.            | 7 days (Concurrent with Primary)           |
| **Escalation Manager (EM)** | Manages stakeholder communication, status page, customer support alignment, and postmortem reviews. | 14 days (Rotated across Engineering Leads) |

---

## 2. Incident Severity Levels & Response SLAs

| Severity  | Definition & Impact                                                                                  | Response SLA          | Target MTTR  | Escalation Trigger                                       |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------- | ------------ | -------------------------------------------------------- |
| **SEV-0** | Complete service outage or severe security compromise affecting > 25% of users.                      | **< 5 minutes**       | < 30 minutes | Page Primary + Secondary + EM + CTO immediately          |
| **SEV-1** | Regional outage, media SFU cascading failure, or critical feature down (e.g. video streams failing). | **< 15 minutes**      | < 60 minutes | Page Primary; escalate to Secondary if unack'd in 10 min |
| **SEV-2** | Impaired non-critical feature (e.g., chat attachments, whiteboard sync delay, recording export lag). | **< 1 hour**          | < 4 hours    | Alert in `#eng-alerts` Slack/Discord channel             |
| **SEV-3** | Minor defect or cosmetic bug with zero availability impact.                                          | **Next business day** | Next sprint  | Jira ticket logged                                       |

---

## 3. Incident Escalation Ladder

```
[Prometheus Alert / PagerDuty Trigger]
                   │
                   ▼ (< 5 min ack)
        [Primary On-Call] ────────────► No Acknowledgment in 10 min
                   │                                  │
                   ├──────── (Requires Backup)        ▼
                   │                           [Secondary On-Call]
                   ▼                                  │
      [Open Incident War Room]                        ▼
      [Page Incident Commander] ◄──────── No Acknowledgment in 15 min
                   │                                  │
                   ▼                                  ▼
      [Escalation Manager / VP Eng] ◄─────────────────┘
```

---

## 4. Communication & Status Page Updates

1. **Internal War Room:**
   - Immediately spin up a dedicated incident room on MeetIT: `https://meetit.live/m/incident-sev-<id>`
   - Join Slack `#incident-war-room`
2. **Public Status Page (`https://status.meetit.live`):**
   - Post initial acknowledgment within **15 minutes** of SEV-0 or SEV-1 incident declaration.
   - Post status updates every **30 minutes** until mitigated.
   - Use standardized status page phrasing:
     - _Investigating:_ "We are investigating elevated packet loss in the US East media edge."
     - _Identified:_ "The issue has been identified as a network interface saturation on upstream provider. Cascading routing is active."
     - _Monitoring:_ "Cascading failover has migrated active rooms. We are monitoring stream stability."
     - _Resolved:_ "All regional SFU edges are operating normally. Incident is resolved."
