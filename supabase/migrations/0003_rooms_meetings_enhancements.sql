-- Migration 0003: Rooms & Meetings Phase 3 enhancements
-- 1. Add description to public.rooms and title/description to public.scheduled_meetings
alter table public.rooms
  add column if not exists description text;

alter table public.scheduled_meetings
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists created_at timestamptz not null default now();

-- 2. Allow pre-join lobby to inspect room metadata by code
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rooms'
      and policyname = 'Anyone can inspect rooms by code'
  ) then
    create policy "Anyone can inspect rooms by code"
      on public.rooms for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- 3. Service role writes only for meetings and participants (service_role bypasses RLS;
--    also allow authenticated users to insert/update their own hosted meetings & participant records)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'meetings'
      and policyname = 'Room owners can record meetings'
  ) then
    create policy "Room owners can record meetings"
      on public.meetings for all
      to authenticated
      using (exists (
        select 1 from public.rooms
        where rooms.id = meetings.room_id and rooms.owner_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.rooms
        where rooms.id = meetings.room_id and rooms.owner_id = auth.uid()
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'participants'
      and policyname = 'Authenticated users can record participation'
  ) then
    create policy "Authenticated users can record participation"
      on public.participants for insert
      to authenticated
      with check (
        user_id = auth.uid() or exists (
          select 1 from public.meetings
          join public.rooms on rooms.id = meetings.room_id
          where meetings.id = participants.meeting_id and rooms.owner_id = auth.uid()
        )
      );
  end if;
end $$;

