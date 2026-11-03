create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create type public.room_kind as enum ('instant', 'scheduled', 'personal');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  owner_id uuid references public.profiles(id) on delete set null,
  kind public.room_kind not null default 'instant',
  title text,
  settings jsonb not null default '{
    "waiting_room": false,
    "locked": false,
    "allow_guests": true,
    "chat_enabled": true,
    "screen_share": "everyone",
    "max_participants": 50
  }'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index rooms_owner_id_idx on public.rooms (owner_id);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  peak_participants integer not null default 0 check (peak_participants >= 0),
  transport text not null default 'mesh' check (transport in ('mesh', 'sfu'))
);
create index meetings_room_started_idx on public.meetings (room_id, started_at desc);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  role text not null default 'attendee'
    check (role in ('host', 'cohost', 'attendee', 'guest')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create index participants_meeting_id_idx on public.participants (meeting_id);

create table public.scheduled_meetings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  rrule text,
  invitees jsonb not null default '[]'::jsonb
);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.meetings enable row level security;
alter table public.participants enable row level security;
alter table public.scheduled_meetings enable row level security;

create policy "Profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users manage their own profile"
  on public.profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Room owners can read their rooms"
  on public.rooms for select to authenticated using (auth.uid() = owner_id);
create policy "Room owners can create rooms"
  on public.rooms for insert to authenticated with check (auth.uid() = owner_id);
create policy "Room owners can update their rooms"
  on public.rooms for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Meeting owners can read meetings"
  on public.meetings for select to authenticated
  using (exists (
    select 1 from public.rooms
    where rooms.id = meetings.room_id and rooms.owner_id = auth.uid()
  ));
create policy "Participants can read their own records"
  on public.participants for select to authenticated
  using (user_id = auth.uid());
create policy "Room owners can read participants"
  on public.participants for select to authenticated
  using (exists (
    select 1 from public.meetings
    join public.rooms on rooms.id = meetings.room_id
    where meetings.id = participants.meeting_id and rooms.owner_id = auth.uid()
  ));
create policy "Room owners can manage scheduled meetings"
  on public.scheduled_meetings for all to authenticated
  using (exists (
    select 1 from public.rooms
    where rooms.id = scheduled_meetings.room_id and rooms.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.rooms
    where rooms.id = scheduled_meetings.room_id and rooms.owner_id = auth.uid()
  ));
