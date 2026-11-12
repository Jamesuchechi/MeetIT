# ADR 0004: Edge-Hosted Lightweight Signaling (Cloudflare Durable Objects Evaluation)

- **Status:** Evaluated & Approved for Edge Signaling PoC
- **Date:** 2026-11-12
- **Author:** MeetIT Infrastructure & Architecture Team
- **Deciders:** MeetIT Core Contributors

---

## 1. Context and Problem Statement

Currently, MeetIT's signaling service (`@meetit/signaling`) is deployed as a stateful Node.js + Fastify service orchestrated on Kubernetes with Horizontal Pod Autoscaler (HPA) and Redis Pub/Sub backplane.
While this architecture easily handles up to 50,000 concurrent participants across regional clusters, it introduces two challenges as we scale globally:

1. **Cross-Continental Round-Trip Latency:** A user in Sydney connecting to a room hosted in Frankfurt experiences 280ms+ WebSocket RTT for ephemeral signaling events (hand raises, chat, reactions, mouse cursors).
2. **Infrastructure Overhead:** Maintaining multi-zone Kubernetes signaling pods and cross-region Redis replication clusters requires dedicated infrastructure management and compute cost.

We evaluate deploying lightweight edge signaling using **Cloudflare Workers with Durable Objects (DO)** as an alternative or complementary tier.

---

## 2. Evaluation Criteria & Comparison

| Architecture Dimension      | Current Architecture (K8s + Redis)                      | Edge Signaling (Cloudflare Durable Objects)                |
| --------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| **Global Latency**          | Centralized per cluster (50–300ms RTT)                  | Ultra-low edge RTT (< 15–30ms to nearest edge PoP)         |
| **State Consistency**       | Strong consistency within Redis; cross-region eventual  | Strongly consistent single-writer model per room ID        |
| **WebSocket Hibernation**   | Pod holds memory (~15KB per idle socket)                | Worker Hibernation API (zero cost while sockets are idle)  |
| **Scaling Characteristics** | HPA based on CPU, RAM, and active WebSocket connections | Automatic instant horizontal scale across 300+ edge cities |
| **Cold Starts**             | Zero (persistent containers)                            | < 5ms for cached Durable Objects                           |
| **Egress Bandwidth Cost**   | Standard cloud egress ($0.05–$0.09/GB)                  | Zero egress fee within Cloudflare network                  |
| **SFU Coupling**            | Tight coupling to self-hosted LiveKit / Mediasoup       | Decoupled: DO handles JSON signaling; SFU handles media    |

---

## 3. Decision

1. **Retain K8s + Redis for Core Backend Services:** Retain Node.js signaling service for enterprise SSO, SCIM provisioning, compliance archiving, and deep database integrations.
2. **Edge Signaling Adapter for Ephemeral Rooms:** Author a Cloudflare Durable Object adapter implementing the `@meetit/protocol` schema for ad-hoc meeting rooms.
3. **Hybrid Edge Gateway:**
   - Durable Objects handle ephemeral room routing: WebRTC SDP offers/answers, ICE candidate exchange, collaborative whiteboards, reactions, and chat messages.
   - Heavy operations (recordings, transcripts, enterprise audit logs) are asynchronously piped to Supabase / Google Cloud Storage via background fetch workers.

---

## 4. Consequences

- **Positive:**
  - Dramatically reduced signaling latency for global participants.
  - Substantial operational cost reduction (Cloudflare WebSocket Hibernation only bills for active CPU execution time, dropping idle room signaling costs to nearly $0).
  - Eliminates Redis Pub/Sub split-brain risks for isolated meeting rooms.
- **Negative:**
  - Vendor lock-in to Cloudflare Workers runtime (mitigated by protocol isolation in `@meetit/protocol`).
  - Durable Objects require WebSocket migration if a room outgrows single-thread processing (handled by cascading or room sharding).
