-- Migration 0009: Security, Privacy, Audit Logs, and Compliance

-- 1. Create audit_logs table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- 2. Create security_settings table
create table if not exists public.security_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  two_factor_enabled boolean not null default false,
  two_factor_secret text,
  backup_codes text[] default '{}',
  passkeys jsonb default '[]'::jsonb,
  relay_privacy_enabled boolean not null default false,
  data_residency_region text not null default 'eu-central-1'
    check (data_residency_region in ('eu-central-1', 'af-south-1', 'us-east-1')),
  e2ee_default_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 3. Create abuse_reports table
create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_peer_id text not null,
  room_code text not null,
  category text not null check (category in ('harassment', 'hate_speech', 'inappropriate_video', 'spam_impersonation', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists abuse_reports_room_code_idx on public.abuse_reports (room_code);
create index if not exists abuse_reports_reporter_id_idx on public.abuse_reports (reporter_id);

-- 4. Enable RLS
alter table public.audit_logs enable row level security;
alter table public.security_settings enable row level security;
alter table public.abuse_reports enable row level security;

-- 5. Policies
do $$
begin
  -- Audit logs policies
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'Users can view their own audit logs') then
    create policy "Users can view their own audit logs"
      on public.audit_logs for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'Users can insert audit logs') then
    create policy "Users can insert audit logs"
      on public.audit_logs for insert
      to authenticated
      with check (user_id = auth.uid() or user_id is null);
  end if;

  -- Security settings policies
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'security_settings' and policyname = 'Users can manage their own security settings') then
    create policy "Users can manage their own security settings"
      on public.security_settings for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  -- Abuse reports policies
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'abuse_reports' and policyname = 'Users can submit abuse reports') then
    create policy "Users can submit abuse reports"
      on public.abuse_reports for insert
      to authenticated
      with check (reporter_id = auth.uid() or reporter_id is null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'abuse_reports' and policyname = 'Users can read their own submitted abuse reports') then
    create policy "Users can read their own submitted abuse reports"
      on public.abuse_reports for select
      to authenticated
      using (reporter_id = auth.uid());
  end if;
end $$;
