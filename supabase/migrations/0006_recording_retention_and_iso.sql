-- Migration 0006: Recording Retention Policies and Per-Participant ISO Tracks

-- 1. Add retention and ISO tracks columns to public.recordings
alter table public.recordings
  add column if not exists expires_at timestamptz,
  add column if not exists retention_days integer default 30,
  add column if not exists iso_tracks boolean default false;

-- 2. Create index on expires_at for efficient cleanup queries
create index if not exists recordings_expires_at_idx
  on public.recordings (expires_at)
  where expires_at is not null;

-- 3. Stored procedure to prune expired recordings from database
create or replace function public.delete_expired_recordings()
returns table (
  deleted_count integer,
  deleted_paths text[]
)
language plpgsql
security definer
as $$
declare
  paths text[];
  total integer;
begin
  -- Collect storage paths of recordings that have exceeded their retention policy
  select coalesce(array_agg(storage_path), array[]::text[])
  into paths
  from public.recordings
  where expires_at is not null
    and expires_at <= now();

  total := coalesce(array_length(paths, 1), 0);

  if total > 0 then
    -- Delete from public.recordings
    delete from public.recordings
    where expires_at is not null
      and expires_at <= now();
  end if;

  return query select total, paths;
end;
$$;

