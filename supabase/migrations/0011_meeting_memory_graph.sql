-- Phase 13: Meeting Memory Graph (cross-meeting knowledge base)

create table if not exists public.memory_nodes (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  meeting_title text,
  owner_id uuid references auth.users(id) on delete cascade,
  participant_ids uuid[] not null default '{}',
  kind text not null check (kind in ('topic', 'decision', 'action_item', 'person')),
  label text not null,
  summary text not null,
  source_ts bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.memory_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.memory_nodes(id) on delete cascade,
  to_node_id uuid not null references public.memory_nodes(id) on delete cascade,
  relation text not null check (relation in ('decided_in', 'assigned_to', 'supersedes', 'relates_to')),
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_nodes_room_code on public.memory_nodes (room_code);
create index if not exists idx_memory_nodes_kind on public.memory_nodes (kind);

alter table public.memory_nodes enable row level security;
alter table public.memory_edges enable row level security;

create policy "memory_nodes_participant_read"
  on public.memory_nodes
  for select
  using (auth.uid() = owner_id or auth.uid() = any(participant_ids));

create policy "memory_nodes_owner_write"
  on public.memory_nodes
  for insert
  with check (auth.uid() = owner_id);

create policy "memory_edges_participant_read"
  on public.memory_edges
  for select
  using (
    exists (
      select 1 from public.memory_nodes n
      where n.id = memory_edges.from_node_id
        and (auth.uid() = n.owner_id or auth.uid() = any(n.participant_ids))
    )
  );
