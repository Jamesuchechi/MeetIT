-- Migration 0008: AI Meeting Intelligence, Key Decisions, and Chapters

alter table public.meeting_notes
  add column if not exists chapters jsonb default '[]'::jsonb,
  add column if not exists key_decisions text[] default '{}',
  add column if not exists ai_model text;
