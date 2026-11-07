-- Migration 0007: Meeting Transcripts, Cues, and Custom Vocabulary

-- 1. Create transcripts table
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete set null,
  room_code text not null,
  room_title text not null default 'Meeting Session',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transcripts_room_code_idx on public.transcripts (room_code);
create index if not exists transcripts_created_by_idx on public.transcripts (created_by);
create index if not exists transcripts_created_at_idx on public.transcripts (created_at desc);

-- 2. Create transcript_cues table
create table if not exists public.transcript_cues (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  speaker_id text,
  speaker_name text not null,
  text text not null,
  start_ms integer not null default 0,
  end_ms integer,
  cue_order integer not null default 0,
  language text default 'en-US',
  created_at timestamptz not null default now()
);

create index if not exists transcript_cues_transcript_id_idx on public.transcript_cues (transcript_id);
create index if not exists transcript_cues_cue_order_idx on public.transcript_cues (transcript_id, cue_order asc);

-- 3. Create custom_vocabulary table for technical jargon, acronyms, and names
create table if not exists public.custom_vocabulary (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  term text not null,
  sounds_like text,
  category text not null default 'general',
  created_at timestamptz not null default now()
);

create index if not exists custom_vocabulary_owner_idx on public.custom_vocabulary (owner_id);

-- 4. Enable RLS
alter table public.transcripts enable row level security;
alter table public.transcript_cues enable row level security;
alter table public.custom_vocabulary enable row level security;

-- 5. Policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transcripts'
      and policyname = 'Authenticated users can manage their transcripts'
  ) then
    create policy "Authenticated users can manage their transcripts"
      on public.transcripts for all
      to authenticated
      using (
        created_by = auth.uid() or
        exists (
          select 1 from public.rooms
          where rooms.id = transcripts.room_id and rooms.owner_id = auth.uid()
        )
      )
      with check (
        created_by = auth.uid() or
        exists (
          select 1 from public.rooms
          where rooms.id = transcripts.room_id and rooms.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transcript_cues'
      and policyname = 'Authenticated users can manage cues for accessible transcripts'
  ) then
    create policy "Authenticated users can manage cues for accessible transcripts"
      on public.transcript_cues for all
      to authenticated
      using (
        exists (
          select 1 from public.transcripts
          where transcripts.id = transcript_cues.transcript_id
            and (
              transcripts.created_by = auth.uid() or
              exists (
                select 1 from public.rooms
                where rooms.id = transcripts.room_id and rooms.owner_id = auth.uid()
              )
            )
        )
      )
      with check (
        exists (
          select 1 from public.transcripts
          where transcripts.id = transcript_cues.transcript_id
            and (
              transcripts.created_by = auth.uid() or
              exists (
                select 1 from public.rooms
                where rooms.id = transcripts.room_id and rooms.owner_id = auth.uid()
              )
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_vocabulary'
      and policyname = 'Users can manage their custom vocabulary'
  ) then
    create policy "Users can manage their custom vocabulary"
      on public.custom_vocabulary for all
      to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end $$;
