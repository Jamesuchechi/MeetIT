# ADR-0003: SFU Migration via LiveKit with Mesh-to-SFU Hybrid Fallback

- Status: Accepted
- Date: 2026-11-07
- Decision owners: MeetIT maintainers

## Context

MeetIT's Phase 1-3 implementation established a fully functional WebRTC mesh transport for 1:1 and small calls (up to 4 participants). In mesh mode, each participant establishes $N-1$ peer connections, requiring $(N-1)$ uplink encodings. When calls exceed 4 participants, browser uplink saturation and CPU usage increase quadratically, causing packet loss and tile freezes.

To scale meetings to 50+ participants, support webinar mode, high-fidelity screen sharing, and server-side egress/recording, MeetIT requires a Selective Forwarding Unit (SFU).

### Spike: LiveKit Cloud vs. Self-Hosted Cost Modeling

We evaluated LiveKit Cloud against self-hosted LiveKit instances across three representative daily usage tiers:

| Tier                            | Daily Minutes   | Monthly Minutes | LiveKit Cloud (Est. @ \$0.004/min)        | Self-Hosted (Fly.io / Hetzner / Dedicated VPS) | Strategy                          |
| ------------------------------- | --------------- | --------------- | ----------------------------------------- | ---------------------------------------------- | --------------------------------- |
| **Tier 1 (Alpha / Early Beta)** | 1,000 min/day   | 30,000 min      | **Free** (within 50,000 min/mo free tier) | \$20 / mo (Node + egress)                      | **LiveKit Cloud Free Tier**       |
| **Tier 2 (Growth)**             | 10,000 min/day  | 300,000 min     | ~\$1,000 / mo                             | ~\$95 / mo (2x 4-vCPU nodes + egress)          | **Self-Hosted / Hybrid**          |
| **Tier 3 (Production Scale)**   | 100,000 min/day | 3,000,000 min   | ~\$10,000 / mo                            | ~\$500 / mo (Auto-scaling cluster)             | **Dedicated Self-Hosted Cluster** |

## Decision

1. **Adopt LiveKit as the primary SFU**:
   - LiveKit provides battle-tested WebRTC infrastructure, native simulcast (3-layer high/medium/low), dynacast (pausing streams not displayed on screen), adaptive streaming, and server-side active speaker detection.
   - LiveKit Cloud will be used for staging and early public beta (0-50k mins/mo free), with straightforward migration to self-hosted LiveKit nodes via identical environment variable contracts (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

2. **Preserve the `MediaTransport` interface**:
   - Implement `LiveKitTransport` in `@meetit/media` satisfying the identical `MediaTransport` contract used by `MeshTransport`.
   - The UI views (`MeetingRoomView`, `RemoteVideoTile`, `CallPreview`) remain decoupled from specific transport mechanics.

3. **Room-Level Transport Control**:
   - Rooms support an explicit `transport: 'mesh' | 'sfu'` property.
   - Default: `mesh` for 2 to 4 participants (zero server media egress costs); `sfu` for rooms configured for larger meetings or when promoted beyond mesh capacity.
   - The signaling server generates role-scoped LiveKit access tokens on join when a room operates in `sfu` mode.

## Consequences

- The signaling server gains a LiveKit token generation capability (`livekit-server-sdk` or standard HMAC JWT signing with video grants).
- The web client dynamically loads `LiveKitTransport` without increasing the initial bundle for mesh-only routes.
- Advanced features like 3-layer simulcast, dynacast, server-side active speaker events, and grid virtualization become natively available for 50+ person calls.
