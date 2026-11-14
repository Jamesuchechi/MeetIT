# Spike: Meeting-to-Code / Doc (Phase 13)

- **Tier:** 1 (High leverage on existing stack)
- **Status:** Proposed `[R]` Spike (1 week)
- **Existing Touchpoints:** `apps/signaling/src/room.ts` (`notesDoc`, `whiteboardHistory`), `supabase/migrations/0007_transcripts.sql`, `0008_ai_meeting_notes.sql`

## Problem

Engineering and product teams finish a 45-minute architecture or sprint-planning call and then spend another 30–60 minutes manually writing the spec, Jira/Linear ticket tree, or starter PR description.

## Architecture Sketch

1. **Unified Context Bundle:** Combine meeting `transcript` + `notesDoc` + serialized `whiteboardHistory` (text labels/shapes) into a single structured prompt.
2. **Output Modes (Selectable Post-Meeting):**
   - **Technical Spec / RFC (Markdown):** Context, Decisions, Open Questions, Acceptance Criteria.
   - **Ticket Tree (JSON / Markdown):** Epic + child tasks with owners inferred from speaker names.
   - **PR Draft / Patch Outline:** Target files/modules mentioned in the discussion + checklist.
3. **Export Targets:** Copy Markdown, download `.md`, or push via webhook/GitHub/Linear integration (reusing Phase 9 webhook/API patterns).

## Cost, Latency & Privacy

- **Latency:** Async post-meeting generation (5–15s).
- **Cost:** ~$0.02–$0.05 per meeting using a reasoning/coding model on full transcript + notes.
- **Privacy:** Explicit user trigger ("Generate Spec / Tickets"); nothing pushed to external repos without user confirmation.

## Success Metric

- **>= 60%** of generated specs/ticket trees are copied or exported with minimal editing (<20% manual rewrite).

## Kill Criterion

- Output is too generic to use in real repos/trackers (**< 15%** export rate after 30 days), OR hallucinated file/ticket details exceed **20%** in user feedback.
