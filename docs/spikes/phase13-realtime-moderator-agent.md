# Spike: Real-Time Moderator Agent (Phase 13)

- **Tier:** 1 (High leverage on existing stack)
- **Status:** Proposed `[R]` Spike (1 week)
- **Existing Touchpoints:** `apps/signaling/src/room.ts`, `packages/protocol/src/index.ts` (`caption.send`, `host.action`), `packages/media` (`activeSpeakersChanged`)

## Problem

Hosts often miss when one person dominates 70% of talk time, someone is repeatedly interrupted, or a conversation turns hostile/off-topic until the meeting has already derailed.

## Architecture Sketch

1. **Deterministic Talk-Time & Interruption Tracker (`apps/signaling`):**
   - Track per-peer speaking seconds from `activeSpeakersChanged` / `caption.cue` intervals (zero LLM cost).
   - Compute Gini/share-of-voice ratios over a rolling 5-minute window.
2. **Lightweight Safety & Drift Classifier:**
   - Run moderation/toxicity & severe off-topic checks on finalized `caption.cue` batches.
3. **Private Host Nudges:**
   - Send ephemeral host-only events (e.g., _"Alice has spoken 72% of the last 5m; Bob hasn't spoken yet"_ or _"Potential policy/harassment flag"_ with quick-action buttons: **Mute**, **Ask to Unmute**, **Dismiss**).

## Cost, Latency & Privacy

- **Latency:** Talk-time stats are real-time (<50ms); text moderation < 500ms.
- **Cost:** Talk-time tracking is free; moderation API/small classifier is ~$0.001/meeting.
- **Privacy:** Nudges are visible **only** to `host`/`cohost`; no permanent "speaker score" is stored on user profiles.

## Success Metric

- **>= 90%** precision on harassment/toxicity flags in test transcripts.
- **>= 50%** of host nudges result in a positive action (inviting quiet speaker, muting, or acknowledging) rather than immediate dismissal.

## Kill Criterion

- Hosts feel surveilled or annoyed: **> 30%** disable the moderator agent mid-call, OR false-positive rate on normal banter exceeds **15%**.
