-- =============================================================================
-- APPLIED. THIS TABLE IS LIVE IN THE SUPABASE PROJECT.
-- This file is the canonical migration of record (ledger entry); it reflects the
-- ACTUAL live schema, which was originally applied via apply_migration (MCP)
-- without a committed .sql file. Idempotent (IF NOT EXISTS) so re-running it is
-- a no-op and it is safe to keep purely as a record.
-- =============================================================================
--
-- usage_events — durable, append-only meter of every classification the backend
-- runs. It is the persistent counterpart to the in-memory CostMonitor (which
-- resets on every redeploy), and the source for the gated /usage summary
-- endpoint.
--
-- Writer / reader: backend `src/classifier-v2/lib/supabase-client.ts`
--   * recordUsageEvent()  inserts (decision, llm_calls, total_tokens, by_model, req_id)
--   * getUsageSummary()   aggregates by utc_day (today / last 7 days / all-time)
--
-- Access model: RLS is ENABLED with NO policies, so the anon/authenticated
-- roles can neither read nor write it. The backend writes/reads through the
-- postgres-role pooled connection (DATABASE_URL), which BYPASSES RLS — exactly
-- the "RLS-enabled, no-policy, service-side only" shape of the live table. This
-- keeps the usage ledger entirely server-private (no PII, but not public).
-- =============================================================================

-- Needed for gen_random_uuid().
create extension if not exists "pgcrypto";

create table if not exists public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- UTC calendar day, used for the daily-counter aggregates. Filled by default.
  utc_day       date not null default ((now() at time zone 'utc'))::date,
  -- Pipeline decision for the request (CLASSIFY / ASK / REFUSE / system_error).
  decision      text,
  -- Metered generateContent calls for this request (token_usage.llmCalls).
  llm_calls     integer not null default 0,
  -- Total tokens across all metered calls (token_usage.totalTokens).
  total_tokens  integer not null default 0,
  -- Per-model token breakdown (token_usage.byModel), stored as jsonb.
  by_model      jsonb,
  -- Short per-request id for log correlation.
  req_id        text
);

-- Aggregation indexes: getUsageSummary filters/groups by utc_day; created_at
-- supports time-ordered scans.
create index if not exists usage_events_utc_day_idx
  on public.usage_events (utc_day);

create index if not exists usage_events_created_at_idx
  on public.usage_events (created_at);

-- =============================================================================
-- Row Level Security — ENABLED with NO policies (server-side / postgres-role
-- access only; anon + authenticated are fully denied). Mirrors the live table.
-- =============================================================================

alter table public.usage_events enable row level security;
