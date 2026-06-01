-- Phase B: classification_jobs table
-- The 5-RPM-safe serving spine: the public API enqueues a job (status='queued')
-- and a single rate-limited worker drains it (claim → run → done/failed). The
-- worker stores the FLAT ApiClassifyResponse DTO (from v2-api-adapter.mapV2Result)
-- in `result`. SSE streaming reads `progress`; the poll endpoint reads the row.
--
-- NOT YET applied to the live DB — migration FILE only (Phase B build chunk).
-- The backend accesses this table via the pooled service connection (raw pg in
-- src/classifier-v2/lib/supabase-client.ts), consistent with the other tables;
-- RLS is enabled with NO public policy (service_role / backend-only access).

CREATE TABLE classification_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- DEFAULT 'queued' (B3 de-landmine): createJob's INSERT omits `status`, so
  -- without a default every real-PG insert would fail NOT NULL (23502). The DB
  -- default is where this invariant belongs (mirrors `kind`'s DEFAULT 'classify').
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  kind             TEXT NOT NULL DEFAULT 'classify' CHECK (kind IN ('classify','answer')),
  query            TEXT NOT NULL,
  previous_answers JSONB NOT NULL DEFAULT '{}',
  rounds           INT NOT NULL DEFAULT 0,
  question_id      TEXT,
  answer_id        TEXT,
  stage            TEXT,
  progress         JSONB NOT NULL DEFAULT '[]',
  queue_position   INT,
  result           JSONB,
  error            JSONB,
  attempts         INT NOT NULL DEFAULT 0,
  client_token     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Drain order + status scans (claimNextQueued ORDER BY created_at).
CREATE INDEX idx_classification_jobs_status_created_at
  ON classification_jobs (status, created_at);

-- Idempotency: a non-null client_token maps to at most one job row.
CREATE UNIQUE INDEX idx_classification_jobs_client_token
  ON classification_jobs (client_token)
  WHERE client_token IS NOT NULL;

-- TTL sweep (sweepExpired DELETE WHERE expires_at < now()).
CREATE INDEX idx_classification_jobs_expires_at
  ON classification_jobs (expires_at);

-- RLS: enabled with NO public policy. The backend uses the pooled service
-- connection (service_role bypasses RLS); there is intentionally no anon/
-- authenticated read policy — jobs are backend-only.
ALTER TABLE classification_jobs ENABLE ROW LEVEL SECURITY;

-- Rollback:
--   DROP TABLE IF EXISTS classification_jobs;
