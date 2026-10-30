-- ============================================================================
-- Fuatilia — automation-first platform schema (0001)
-- Maps the six components of the automation architecture onto Supabase:
--   1. Customer portal      → customers, briefs, brief_competitors
--   2. Data collection      → observations, collection_runs (written by the
--                             Fuatilia engine / n8n with the service_role key)
--   3. Database             → this schema itself (evidence + provenance first)
--   4. Intelligence engine  → reports.summary / reports.content (computed by
--                             the deterministic Node engine + AI interpretation)
--   5. Report generator     → reports (structured JSON, evidence-linked)
--   6. Delivery engine      → deliveries (WhatsApp / email / Telegram log)
-- Billing: subscriptions + intelligence_sessions implement the owner's
--          "5 free intelligence sessions, then paid" model.
--
-- Run in: Supabase Dashboard → SQL Editor (or `supabase db push`).
-- Safe to re-run: tables/indexes use IF NOT EXISTS, the onboarding function is
-- CREATE OR REPLACE, and every policy is dropped before it is recreated.
-- gen_random_uuid() is core since PostgreSQL 13 (Supabase runs 15+), so no
-- extension install is required.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · CUSTOMER PORTAL
-- ---------------------------------------------------------------------------

-- A customer is created automatically when a user signs up (trigger below).
create table if not exists public.customers (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  phone       text,
  company     text,
  created_at  timestamptz not null default now()
);

-- A brief = one monitoring configuration ("what I want to watch").
create table if not exists public.briefs (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.customers(id) on delete cascade,
  name                 text not null default 'My intelligence brief',
  industry             text,
  geography            text not null default 'KE',
  platforms            text[] not null default array['meta','google'],
  frequency            text not null default 'weekly'
                       check (frequency in ('daily','weekly','monthly')),
  day_of_week          int default 1,              -- 1 = Monday
  delivery_channel     text not null default 'whatsapp'
                       check (delivery_channel in ('whatsapp','email','telegram')),
  delivery_time        time not null default '08:00',
  delivery_destination text,                        -- phone / email / chat id
  status               text not null default 'active'
                       check (status in ('active','paused')),
  created_at           timestamptz not null default now()
);

-- Competitors named inside a brief ("three named banks").
create table if not exists public.brief_competitors (
  id        uuid primary key default gen_random_uuid(),
  brief_id  uuid not null references public.briefs(id) on delete cascade,
  name      text not null,
  page_id   text,
  notes     text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2 · DATA COLLECTION  (evidence store — mirrors data/captures.jsonl v0.4)
-- ---------------------------------------------------------------------------

-- One row per observed ad card. Written ONLY by the automation pipeline
-- (service_role) — customers read through RLS.
create table if not exists public.observations (
  id                uuid primary key default gen_random_uuid(),
  brief_id          uuid references public.briefs(id) on delete set null,
  advertiser        text not null,
  platform          text not null check (platform in ('meta','google','tiktok')),
  country           text not null default 'KE',
  page_id           text,
  ad_start          date,
  first_seen_by_us  date,
  active_versions   int,
  active_ad_count   int,                          -- advertiser-level total (scale bands)
  capture_method    text not null default 'manual'
                    check (capture_method in ('manual','auto')),
  concept_id        text,                          -- groups variants of one creative idea
  creative_type     text,
  offer             text,
  landing_url       text,
  landing_headline  text,
  library_url       text,                          -- provenance: link back to the library
  source            text not null default 'manual_capture',
  tags              text[] not null default '{}',
  example           boolean not null default false,
  notes             text,
  captured_at       date not null default current_date,
  inserted_at       timestamptz not null default now(),
  dedupe_key        text unique                    -- idempotent pushes from the CLI
);

create index if not exists observations_captured_idx on public.observations (captured_at desc);
create index if not exists observations_advertiser_idx on public.observations (advertiser);
create index if not exists observations_platform_idx on public.observations (platform);

-- Normalized advertiser directory (advertiser profiles, v0.5).
create table if not exists public.advertisers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  normalized_name text not null unique,
  page_id         text,
  first_seen_at   timestamptz not null default now()
);

-- Pipeline heartbeat: one row per collection run (failures visible, not silent).
create table if not exists public.collection_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  source          text not null,                   -- manual_capture | meta_api | google_atc | tiktok_cc | scheduled_workflow
  status          text not null default 'running'
                  check (status in ('running','ok','failed')),
  records_fetched int,
  records_appended int,
  error           text
);

-- ---------------------------------------------------------------------------
-- 3 · INTELLIGENCE + REPORT GENERATOR
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  brief_id     uuid not null references public.briefs(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft'
               check (status in ('draft','final','delivered')),
  headline     text,
  summary      jsonb,   -- {observations, advertisers, new_observations, offer_changes}
  content      jsonb,   -- {executive:[], strategic:[], methodology:[], limitations:[]}
  storage_path text,    -- Supabase Storage path (HTML/PDF edition)
  generated_at timestamptz not null default now()
);

create index if not exists reports_brief_idx on public.reports (brief_id, period_end desc);

-- ---------------------------------------------------------------------------
-- 4 · DELIVERY ENGINE
-- ---------------------------------------------------------------------------

create table if not exists public.deliveries (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.reports(id) on delete cascade,
  channel             text not null check (channel in ('whatsapp','email','telegram')),
  destination         text not null,
  status              text not null default 'queued'
                      check (status in ('queued','sent','failed')),
  provider_message_id text,
  error               text,
  sent_at             timestamptz
);

-- ---------------------------------------------------------------------------
-- 5 · BILLING — radar free forever, first 5 intelligence sessions free,
--     then paid (Brief KSh 500/session · KSh 2,500/mo · Agency 10k)
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null unique references public.customers(id) on delete cascade,
  plan                text not null default 'radar_free'
                      check (plan in ('radar_free','brief','premium','agency')),
  status              text not null default 'trialing'
                      check (status in ('trialing','active','past_due','canceled')),
  free_sessions_used  int not null default 0,
  free_sessions_limit int not null default 5,
  current_period_end  date,
  created_at          timestamptz not null default now()
);

create table if not exists public.intelligence_sessions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  brief_id    uuid references public.briefs(id) on delete set null,
  started_at  timestamptz not null default now(),
  kind        text not null default 'brief'
              check (kind in ('brief','snapshot','teardown'))
);

-- ---------------------------------------------------------------------------
-- ONBOARDING TRIGGER — new auth user → customer + subscription rows
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.customers (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (customer_id)
  values (new.id)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — customers see only their own rows; the automation
-- pipeline uses the service_role key, which bypasses RLS by design.
-- ---------------------------------------------------------------------------

alter table public.customers            enable row level security;
alter table public.briefs               enable row level security;
alter table public.brief_competitors    enable row level security;
alter table public.observations         enable row level security;
alter table public.advertisers          enable row level security;
alter table public.collection_runs      enable row level security;
alter table public.reports              enable row level security;
alter table public.deliveries           enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.intelligence_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Re-run safety — PostgreSQL has no CREATE POLICY IF NOT EXISTS, so drop every
-- policy this script owns before recreating it. On a fresh database these are
-- no-ops; on a re-run they replace the existing definitions with the ones
-- below. (Includes the pre-v0.5 observations policy name.)
-- ---------------------------------------------------------------------------

drop policy if exists "customers read own" on public.customers;
drop policy if exists "customers insert own" on public.customers;
drop policy if exists "customers update own" on public.customers;
drop policy if exists "briefs owner all" on public.briefs;
drop policy if exists "competitors owner all" on public.brief_competitors;
drop policy if exists "observations authenticated read" on public.observations;
drop policy if exists "observations owner read" on public.observations;
drop policy if exists "advertisers authenticated read" on public.advertisers;
drop policy if exists "collection_runs authenticated read" on public.collection_runs;
drop policy if exists "reports owner read" on public.reports;
drop policy if exists "deliveries owner read" on public.deliveries;
drop policy if exists "subscriptions owner read" on public.subscriptions;
drop policy if exists "subscriptions owner bootstrap" on public.subscriptions;
drop policy if exists "sessions owner read" on public.intelligence_sessions;

-- customers
create policy "customers read own" on public.customers
  for select using (auth.uid() = id);
create policy "customers insert own" on public.customers
  for insert with check (auth.uid() = id);
create policy "customers update own" on public.customers
  for update using (auth.uid() = id);

-- briefs
create policy "briefs owner all" on public.briefs
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

-- brief_competitors (ownership via the parent brief)
create policy "competitors owner all" on public.brief_competitors
  for all using (
    exists (select 1 from public.briefs b where b.id = brief_id and b.customer_id = auth.uid())
  ) with check (
    exists (select 1 from public.briefs b where b.id = brief_id and b.customer_id = auth.uid())
  );

-- observations: customer-scoped evidence. A row is readable only by the
-- customer who owns the brief it was collected for. Rows with no brief link
-- (unlinked pushes, pre-onboarding captures) and demo rows stay invisible to
-- clients — the service_role pipeline is the only writer AND the only reader
-- of those. Writes have NO policy → service_role (the pipeline) only.
create policy "observations owner read" on public.observations
  for select to authenticated using (
    example = false
    and brief_id is not null
    and exists (
      select 1 from public.briefs b
      where b.id = observations.brief_id and b.customer_id = auth.uid()
    )
  );

create policy "advertisers authenticated read" on public.advertisers
  for select to authenticated using (true);

create policy "collection_runs authenticated read" on public.collection_runs
  for select to authenticated using (true);

-- reports (ownership via the parent brief)
create policy "reports owner read" on public.reports
  for select using (
    exists (select 1 from public.briefs b where b.id = brief_id and b.customer_id = auth.uid())
  );

-- deliveries (ownership via report → brief)
create policy "deliveries owner read" on public.deliveries
  for select using (
    exists (
      select 1 from public.reports r
      join public.briefs b on b.id = r.brief_id
      where r.id = report_id and b.customer_id = auth.uid()
    )
  );

-- subscriptions: read own; self-bootstrap insert allowed (defaults apply),
-- upgrades/cancellation are billing-side via service_role
create policy "subscriptions owner read" on public.subscriptions
  for select using (auth.uid() = customer_id);
create policy "subscriptions owner bootstrap" on public.subscriptions
  for insert with check (auth.uid() = customer_id);

-- intelligence sessions: read own; the engine records sessions via service_role
create policy "sessions owner read" on public.intelligence_sessions
  for select using (auth.uid() = customer_id);
