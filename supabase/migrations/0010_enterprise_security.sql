-- Migration: 0010_enterprise_security.sql
-- Enterprise SSO, SCIM 2.0, Domain Capture, Retention Policies, DLP Hooks & Bug Bounty

-- 1. Enterprise SSO & IdP Configuration
create table if not exists public.enterprise_sso_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  provider_type text not null check (provider_type in ('saml', 'oidc')),
  idp_entity_id text not null,
  idp_sso_url text not null,
  idp_certificate text,
  metadata_url text,
  enforced_domains text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.enterprise_sso_configs enable row level security;

create policy "Admins can view enterprise SSO configs"
  on public.enterprise_sso_configs
  for select
  using (auth.uid() is not null);

create policy "Admins can manage enterprise SSO configs"
  on public.enterprise_sso_configs
  for all
  using (auth.uid() is not null);

-- 2. SCIM 2.0 Tokens & Provisioning Logs
create table if not exists public.scim_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  token_hash text not null,
  label text not null default 'Default SCIM Token',
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scim_tokens enable row level security;

create policy "Admins can manage SCIM tokens"
  on public.scim_tokens
  for all
  using (auth.uid() is not null);

-- 3. Enterprise Controls (Domain Capture, Waiting Room, Retention, DLP)
create table if not exists public.enterprise_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null unique,
  captured_domains text[] not null default '{}',
  domain_verification_records jsonb not null default '{}'::jsonb,
  forced_waiting_room boolean not null default false,
  require_host_present boolean not null default false,
  prevent_guest_screenshare boolean not null default false,
  watermark_video boolean not null default false,
  retention_days_recordings integer default 90,
  retention_days_chat integer default 90,
  retention_days_transcripts integer default 90,
  dlp_enabled boolean not null default false,
  dlp_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.enterprise_controls enable row level security;

create policy "Admins can view enterprise controls"
  on public.enterprise_controls
  for select
  using (auth.uid() is not null);

create policy "Admins can update enterprise controls"
  on public.enterprise_controls
  for all
  using (auth.uid() is not null);

-- 4. Vulnerability Disclosure & Bug Bounty Submissions
create table if not exists public.vulnerability_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_email text not null,
  reporter_name text,
  pgp_key_fingerprint text,
  target_component text not null check (target_component in ('signaling', 'e2ee', 'media', 'auth', 'api', 'web', 'other')),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  title text not null,
  vulnerability_description text not null,
  steps_to_reproduce text not null,
  impact_assessment text,
  status text not null default 'new' check (status in ('new', 'triaged', 'bounty_awarded', 'resolved', 'closed')),
  bounty_amount_usd integer default 0,
  created_at timestamptz not null default now()
);

alter table public.vulnerability_reports enable row level security;

create policy "Anyone can submit vulnerability reports"
  on public.vulnerability_reports
  for insert
  with check (true);

create policy "Admins can view vulnerability reports"
  on public.vulnerability_reports
  for select
  using (auth.uid() is not null);

