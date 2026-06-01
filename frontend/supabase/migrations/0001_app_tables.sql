-- =============================================================================
-- NOT APPLIED. THIS IS REFERENCE SQL.
-- APPLY VIA SUPABASE MCP/CLI WHEN READY (USER-GATED). MIRRORS THE FROZEN DTO.
-- =============================================================================
--
-- These four tables back the frontend app layer. The live Supabase project
-- currently holds ONLY the 11 ITC-HS corpus tables; provisioning these is a
-- deliberate, user-approved step (apply_migration). Column shapes mirror the
-- frozen DTO in `frontend/src/lib/types.ts` (UiClassification + Citation +
-- ClassificationComponent) and the dormant backend `classification_jobs`.
--
-- All tables get Row Level Security:
--   * classifications / feedback : owner-only select+insert (auth.uid() = user_id)
--   * shared_records             : PUBLIC read where public = true
-- =============================================================================

-- Needed for gen_random_uuid().
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- classifications — one saved classification record (mirrors UiClassification).
-- Guests store locally; on sign-in the client migrates localStorage -> here.
-- -----------------------------------------------------------------------------
create table if not exists public.classifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete cascade,
  query             text not null,
  hs_code           text not null,
  is_six_digit      boolean not null default false,
  confidence_band   text not null check (confidence_band in ('high', 'medium', 'low')),
  description        text,
  reasoning         text,
  alternatives      jsonb not null default '[]'::jsonb,
  citation          jsonb,
  components         jsonb,
  export_policy      text,
  policy_condition   text,
  india_specific     boolean not null default false,
  created_at         timestamptz not null default now()
);

create index if not exists classifications_user_id_created_at_idx
  on public.classifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- classification_jobs — mirrors the dormant backend job-queue table so the
-- async (CLASSIFY_ASYNC) path is flag-flippable without a schema change.
-- -----------------------------------------------------------------------------
create table if not exists public.classification_jobs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'error')),
  query       text,
  result      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- feedback — lightweight per-classification feedback.
-- -----------------------------------------------------------------------------
create table if not exists public.feedback (
  id                 uuid primary key default gen_random_uuid(),
  classification_id  uuid references public.classifications (id) on delete set null,
  user_id            uuid references auth.users (id) on delete cascade,
  rating             text,
  comment            text,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- shared_records — opt-in public permalink, PII-scrubbed, takedown via `public`.
-- -----------------------------------------------------------------------------
create table if not exists public.shared_records (
  id                 uuid primary key default gen_random_uuid(),
  classification_id  uuid references public.classifications (id) on delete cascade,
  slug               text not null unique,
  public             boolean not null default true,
  pii_scrubbed       jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists shared_records_slug_idx
  on public.shared_records (slug);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.classifications    enable row level security;
alter table public.classification_jobs enable row level security;
alter table public.feedback            enable row level security;
alter table public.shared_records      enable row level security;

-- classifications: owner-only select + insert.
create policy "classifications_select_own"
  on public.classifications for select
  using (auth.uid() = user_id);

create policy "classifications_insert_own"
  on public.classifications for insert
  with check (auth.uid() = user_id);

-- feedback: owner-only select + insert.
create policy "feedback_select_own"
  on public.feedback for select
  using (auth.uid() = user_id);

create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- shared_records: PUBLIC read of published rows.
create policy "shared_records_public_read"
  on public.shared_records for select
  using (public = true);
