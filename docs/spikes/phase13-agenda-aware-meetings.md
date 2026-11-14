# Spike: Agenda-Aware Meetings (Phase 13)

- **Tier:** 1 (High leverage on existing stack)
- **Status:** Proposed `[R]` Spike (1 week)
- **Existing Touchpoints:** `apps/signaling/src/room.ts` (`meetingTimer.agenda`), `packages/protocol/src/index.ts` (`caption.send`, `timer.updated`), `apps/web/src/components/MeetingRoomView.tsx`

## Problem

Meetings with agendas routinely run over on early items, drift into tangents, and end without a clear next-meeting agenda. MeetIT already has a synced `meetingTimer` with `agenda` items and live `caption.cue` streaming, but the timer is passive.

## Architecture Sketch

1. **Transcript Windowing (`apps/signaling`):** Buffer the last 60–90 seconds of finalized `caption.cue` text per room alongside the active `agenda` item title and remaining time.
2. **Periodic Evaluator (every 30–45s or on item overrun):** Call a fast LLM/classifier with `(currentAgendaItem, remainingSeconds, recentCaptions)` to output:
   - `onTrack | drifting | overrun`
   - `suggestedParkingLotItem?: string`
   - `followUpAgendaDraft?: string[]`
3. **Host-Only & Shared Signals:**
   - Emit private host nudges (`"Item 2 is 3m over; park tangent?"`).
   - One-click **"Park to Notes"** appends the tangent to `notesDoc` (`notes.updated`).
   - At meeting end, pre-populate a follow-up agenda from unresolved items.

## Cost, Latency & Privacy

- **Latency:** Non-blocking background evaluation every 30–45s (<1.5s response).
- **Cost:** ~$0.002–$0.01 per 30-min meeting using a small/flash model on short rolling caption windows.
- **Privacy:** Opt-in per room; only runs when captions are active and host enables Agenda Assistant.

## Success Metric

- **>= 40%** of meetings with an agenda keep time within 10% of planned duration or use **"Park to Notes"** at least once.
- **>= 65%** of hosts rate end-of-meeting follow-up agenda drafts useful.

## Kill Criterion

- False-positive "off-topic drift" nudges exceed **20%** (hosts dismiss/disable within first 10 minutes), OR host opt-in stays **< 10%** after 60 days.
