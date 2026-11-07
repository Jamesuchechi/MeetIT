-- Migration 0005: Recordings table and storage bucket for LiveKit Egress recordings

-- 1. Create recordings table
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete set null,
  room_code text not null,
  egress_id text unique,
  started_by uuid references public.profiles(id) on delete set null,
  status text not null default 'recording'
    check (status in ('recording', 'processing', 'ready', 'failed')),
  layout text not null default 'grid'
    check (layout in ('grid', 'speaker')),
  storage_path text not null,
  storage_bucket text not null default 'recordings',
  file_size_bytes bigint,
  duration_seconds integer,
  download_url text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recordings_room_code_idx on public.recordings (room_code);
create index if not exists recordings_started_by_idx on public.recordings (started_by);
create index if not exists recordings_created_at_idx on public.recordings (created_at desc);

-- 2. Enable RLS
alter table public.recordings enable row level security;

-- 3. Policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recordings'
      and policyname = 'Room owners and creators can manage recordings'
  ) then
    create policy "Room owners and creators can manage recordings"
      on public.recordings for all
      to authenticated
      using (
        started_by = auth.uid() or
        exists (
          select 1 from public.rooms
          where rooms.id = recordings.room_id and rooms.owner_id = auth.uid()
        )
      )
      with check (
        started_by = auth.uid() or
        exists (
          select 1 from public.rooms
          where rooms.id = recordings.room_id and rooms.owner_id = auth.uid()
        )
      );
  end if;
end $$;

-- 4. Create recordings storage bucket if not existing
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  524288000, -- 500 MB per file limit
  array['video/mp4', 'audio/mp4', 'video/webm', 'audio/webm']
)
on conflict (id) do nothing;

-- 5. Storage RLS: allow authenticated users to read and download their room recordings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can access their room recordings'
  ) then
    create policy "Authenticated users can access their room recordings"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'recordings' and (
          -- Path convention: recordings/<room_code>/...
          auth.uid() is not null
        )
      );
  end if;
end $$;

