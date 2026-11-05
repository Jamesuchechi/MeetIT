-- Migration 0004: Meeting Notes & Action Items Hub (Phase 3)

create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id text,
  room_code text not null,
  meeting_title text not null,
  meeting_date timestamptz not null default now(),
  summary text not null default '',
  content text not null default '',
  attendees text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meeting_notes_owner_date
  on public.meeting_notes(owner_id, meeting_date desc);

create index if not exists idx_meeting_notes_room_code
  on public.meeting_notes(room_code);

create table if not exists public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  note_id uuid references public.meeting_notes(id) on delete set null,
  room_code text not null default '',
  meeting_title text not null default '',
  text text not null,
  assignee text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_meeting_action_items_owner_done
  on public.meeting_action_items(owner_id, done, created_at desc);

alter table public.meeting_notes enable row level security;
alter table public.meeting_action_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'meeting_notes'
      and policyname = 'Users manage own meeting notes'
  ) then
    create policy "Users manage own meeting notes"
      on public.meeting_notes for all
      to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'meeting_action_items'
      and policyname = 'Users manage own action items'
  ) then
    create policy "Users manage own action items"
      on public.meeting_action_items for all
      to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end $$;

