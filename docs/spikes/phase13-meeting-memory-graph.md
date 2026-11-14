# Spike: Meeting Memory Graph (Phase 13)

- **Tier:** 1 (High leverage on existing stack)
- **Status:** Proposed `[R]` Spike (1 week)
- **Existing Touchpoints:** `supabase/migrations/0007_transcripts.sql`, `supabase/migrations/0008_ai_meeting_notes.sql`, `apps/web/src/components/MeetingRoomView.tsx`

## Problem

Decisions, owners, and context are trapped inside individual meeting transcripts. Users cannot ask _"What did we decide about pricing across the last 12 meetings?"_ without manually opening old meetings.

## Architecture Sketch

1. **Post-Meeting Extraction Pipeline:** When a meeting ends and transcript/AI notes are saved, extract structured nodes and edges:
   - **Nodes:** `Topic`, `Decision`, `ActionItem`, `Person`, `Meeting`
   - **Edges:** `DECIDED_IN`, `ASSIGNED_TO`, `SUPERSEDES`, `RELATES_TO`
2. **Storage (`Supabase Postgres + pgvector`):**
   - Add `memory_nodes` and `memory_edges` tables scoped by `workspace_id` / `owner_id` with RLS enforcing participant-level access (users only query meetings they attended or have workspace access to).
   - Store embeddings on `Decision` / `Topic` summaries for hybrid vector + graph retrieval.
3. **Query UI:** Natural-language search bar on the dashboard returning an answer with clickable citations (`Meeting Title + Timestamp`).

## Cost, Latency & Privacy

- **Latency:** Extraction runs async post-meeting; query latency < 800ms.
- **Cost:** One extraction pass per meeting (~$0.01–$0.03) + negligible pgvector storage.
- **Privacy:** Strict RLS — a user's memory graph never leaks decisions from private meetings they were not invited to.

## Success Metric

- **>= 85%** answer accuracy with valid meeting/timestamp citations on a 20-question multi-meeting eval set.
- **>= 25%** weekly active users run at least one cross-meeting query.

## Kill Criterion

- Retrieval hallucinates citations or misses > 25% of known decisions in the eval set, OR weekly query adoption stays **< 5%** after 60 days.
