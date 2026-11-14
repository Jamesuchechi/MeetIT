# Spike: AI Proxy Attendee (Phase 13)

- **Tier:** 1 (High leverage on existing stack)
- **Status:** Proposed `[R]` Spike (1 week)
- **Existing Touchpoints:** `apps/signaling/src/app.ts`, `packages/protocol/src/index.ts` (`peerInfoSchema`, `caption.send`), `apps/signaling/src/mediaProviders.ts` (LiveKit token issuance)

## Problem

When someone has a double-booked calendar or is out of office, they either miss key questions directed at them or force the meeting to be rescheduled.

## Architecture Sketch

1. **Virtual Peer Identity:** User spawns a scoped **AI Proxy** for a specific meeting with a pre-approved context bundle (e.g., selected docs/notes + explicit boundaries: _"You may answer schedule & API status questions; do NOT commit to deadlines"_).
2. **Signaling & Media Connection:**
   - Proxy joins the room via `apps/signaling` with `verified: true` and a clear **`AI Proxy for <Name>`** badge on its tile (never impersonates a human).
   - Subscribes to `caption.cue` (or LiveKit audio -> streaming ASR) and only speaks/posts in chat when directly addressed by name or asked a question matching its allowed topics.
3. **Post-Meeting Debrief:** Sends the delegating user a structured report: questions asked, answers given, and escalations it declined to answer.

## Cost, Latency & Privacy

- **Latency:** < 2s from end-of-question caption to proxy response.
- **Cost:** ~$0.03–$0.10 per 30-min call (ASR + LLM + optional TTS).
- **Privacy & Trust:** Mandatory visual **"AI Proxy"** badge; strict topic allowlist; host can mute/remove the proxy anytime via standard `host.action`.

## Success Metric

- **>= 75%** of proxy answers are rated accurate and within bounds by the delegating user.
- **0%** unauthorized commitments or context leaks in red-team tests.

## Kill Criterion

- Participants find the proxy disruptive or untrustworthy (**> 25%** host removal rate), OR hallucination/out-of-scope answer rate exceeds **10%**.
