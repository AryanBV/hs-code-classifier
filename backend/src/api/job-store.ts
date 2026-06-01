// backend/src/api/job-store.ts
//
// Phase B job-queue store. The 5-RPM-safe serving spine persists each
// classification request as a row in `classification_jobs`; the public API
// enqueues (`createJob` → status='queued') and a single rate-limited worker
// drains it (`claimNextQueued` → run → `completeJob`/`failJob`). The poll
// endpoint reads via `getJob`.
//
// DB access goes through the SHARED pooled QueryRunner from supabase-client
// (`getQueryRunner`) so it honors the `_setQueryRunnerForTesting` seam — unit
// tests inject a fake runner and assert PARAMETERIZED SQL with NO value
// interpolation (every value is a `$n` placeholder).

import type { QueryResult, QueryResultRow } from 'pg';
import { getQueryRunner } from '../classifier-v2/lib/supabase-client';
import type { ApiClassifyResponse } from './v2-api-adapter';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

/** Lifecycle status of a job row (DB CHECK-constrained). */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** What the worker should run for this job (DB CHECK-constrained). */
export type JobKind = 'classify' | 'answer';

/** One staged-progress event appended to the `progress` jsonb array. */
export interface JobProgressEvent {
  /** Pipeline stage label (e.g. 'L1', 'L4', 'L5'). */
  stage: string;
  /** Short event tag (e.g. 'triage', 'select', 'verify'). */
  event: string;
  /** Milliseconds since the job started running. */
  t_ms:  number;
}

/** Structured error payload stored on a failed job. */
export interface JobError {
  message:   string;
  /** true = transient (system_error / infra) → client may retry; false = unexpected throw. */
  retryable: boolean;
}

/** Full `classification_jobs` row as read back from Postgres. */
export interface JobRow {
  id:               string;
  status:           JobStatus;
  kind:             JobKind;
  query:            string;
  previous_answers: Record<string, string>;
  rounds:           number;
  question_id:      string | null;
  answer_id:        string | null;
  stage:            string | null;
  progress:         JobProgressEvent[];
  queue_position:   number | null;
  result:           ApiClassifyResponse | null;
  error:            JobError | null;
  attempts:         number;
  client_token:     string | null;
  created_at:       string;
  started_at:       string | null;
  finished_at:      string | null;
  expires_at:       string;
}

/** Input to {@link createJob}. */
export interface CreateJobInput {
  kind:             JobKind;
  query:            string;
  previous_answers?: Record<string, string>;
  rounds?:          number;
  question_id?:     string | null;
  answer_id?:       string | null;
  /** Idempotency key: a duplicate non-expired row with the same token is returned as-is. */
  client_token?:    string | null;
}

/** Lightweight handle returned by {@link createJob}. */
export interface CreatedJob {
  id:             string;
  status:         JobStatus;
  queue_position: number;
}

/** Poll-endpoint view returned by {@link getJob}. */
export interface JobView {
  id:             string;
  status:         JobStatus;
  stage:          string | null;
  progress:       JobProgressEvent[];
  queue_position: number | null;
  result:         ApiClassifyResponse | null;
  error:          JobError | null;
}

/* ---------------------------------------------------------------------------
 * Raw-row coercion helpers
 *
 * pg returns jsonb columns already parsed (object/array), but be defensive: a
 * column could arrive as a JSON string in some driver configs. Coerce to the
 * declared TS shape without trusting the runtime type blindly.
 * --------------------------------------------------------------------------- */

function asObject<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asNullableJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

/** Raw shape as it arrives from pg (jsonb/text/int columns un-coerced). */
interface RawJobRow extends QueryResultRow {
  id:               string;
  status:           JobStatus;
  kind:             JobKind;
  query:            string;
  previous_answers: unknown;
  rounds:           number | string;
  question_id:      string | null;
  answer_id:        string | null;
  stage:            string | null;
  progress:         unknown;
  queue_position:   number | string | null;
  result:           unknown;
  error:            unknown;
  attempts:         number | string;
  client_token:     string | null;
  created_at:       string;
  started_at:       string | null;
  finished_at:      string | null;
  expires_at:       string;
}

function toJobRow(raw: RawJobRow): JobRow {
  return {
    id:               raw.id,
    status:           raw.status,
    kind:             raw.kind,
    query:            raw.query,
    previous_answers: asObject<Record<string, string>>(raw.previous_answers, {}),
    rounds:           Number(raw.rounds),
    question_id:      raw.question_id,
    answer_id:        raw.answer_id,
    stage:            raw.stage,
    progress:         asArray<JobProgressEvent>(raw.progress),
    queue_position:   raw.queue_position === null ? null : Number(raw.queue_position),
    result:           asNullableJson<ApiClassifyResponse>(raw.result),
    error:            asNullableJson<JobError>(raw.error),
    attempts:         Number(raw.attempts),
    client_token:     raw.client_token,
    created_at:       raw.created_at,
    started_at:       raw.started_at,
    finished_at:      raw.finished_at,
    expires_at:       raw.expires_at,
  };
}

/* ---------------------------------------------------------------------------
 * Query helper — every call goes through the injectable shared runner
 * --------------------------------------------------------------------------- */

function run<T extends QueryResultRow = QueryResultRow>(
  text:   string,
  params: unknown[],
): Promise<QueryResult<T>> {
  return getQueryRunner().query<T>(text, params);
}

/* ---------------------------------------------------------------------------
 * Public store API (all parameterized — no value interpolation)
 * --------------------------------------------------------------------------- */

/**
 * Insert a new 'queued' job. IDEMPOTENT on `client_token`: when a non-expired
 * row already exists with the same token, that existing row is returned instead
 * of inserting a duplicate (so a client retry of POST does not double-enqueue).
 *
 * `queue_position` = number of still-pending ('queued'|'running') jobs created
 * AT OR BEFORE this row (1 = at the head of the line). It is computed and
 * returned but NOT persisted on insert (a static column would go stale as the
 * queue drains — the poll endpoint recomputes it live via getJob).
 */
export async function createJob(input: CreateJobInput): Promise<CreatedJob> {
  // Idempotency fast-path: short-circuit to the existing non-expired row on a
  // duplicate token (an optimization — the ON CONFLICT below is the atomic
  // guarantee under a concurrent same-token race).
  if (input.client_token !== undefined && input.client_token !== null) {
    const existing = await run<RawJobRow>(
      `SELECT * FROM classification_jobs
       WHERE client_token = $1 AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.client_token],
    );
    if (existing.rows.length > 0) {
      const row = toJobRow(existing.rows[0]!);
      const queuePosition = await countQueuedAhead(row.created_at);
      return { id: row.id, status: row.status, queue_position: queuePosition };
    }
  }

  // ATOMIC idempotent insert (B3 de-landmine): the fast-path SELECT cannot close
  // the concurrent-same-token race (two POSTs both miss the SELECT, both INSERT →
  // a 23505 unique-violation 500 that withRetry does NOT retry). ON CONFLICT on
  // the partial unique index (client_token IS NOT NULL) makes the duplicate a
  // no-op; an empty RETURNING means a CONCURRENT insert won the row, so we
  // re-SELECT the existing non-expired row and return it instead of 500ing.
  const inserted = await run<RawJobRow>(
    `INSERT INTO classification_jobs (kind, query, previous_answers, rounds, question_id, answer_id, client_token)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     ON CONFLICT (client_token) WHERE client_token IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      input.kind,
      input.query,
      JSON.stringify(input.previous_answers ?? {}),
      input.rounds ?? 0,
      input.question_id ?? null,
      input.answer_id ?? null,
      input.client_token ?? null,
    ],
  );

  if (inserted.rows.length === 0) {
    // Conflict lost the race: the winning row already exists for this token.
    // Re-SELECT it (token is non-null here — DO NOTHING only fires on the partial
    // index). If somehow no row is found, fail loudly rather than fabricate one.
    const winner = await run<RawJobRow>(
      `SELECT * FROM classification_jobs
       WHERE client_token = $1 AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.client_token ?? null],
    );
    if (winner.rows.length === 0) {
      throw new Error('createJob: INSERT did nothing and no conflicting row was found');
    }
    const row = toJobRow(winner.rows[0]!);
    const queuePosition = await countQueuedAhead(row.created_at);
    return { id: row.id, status: row.status, queue_position: queuePosition };
  }

  const row = toJobRow(inserted.rows[0]!);
  const queuePosition = await countQueuedAhead(row.created_at);
  return { id: row.id, status: row.status, queue_position: queuePosition };
}

/**
 * Atomically claim the oldest 'queued' job for processing: flip it to
 * 'running', stamp `started_at`, bump `attempts`. Uses `FOR UPDATE SKIP LOCKED`
 * so concurrent workers never claim the same row (single-worker today, safe if
 * scaled out later). Returns the claimed row, or null when the queue is empty.
 */
export async function claimNextQueued(): Promise<JobRow | null> {
  const res = await run<RawJobRow>(
    `UPDATE classification_jobs
     SET status = 'running', started_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM classification_jobs
       WHERE status = 'queued'
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [],
  );
  if (res.rows.length === 0) return null;
  return toJobRow(res.rows[0]!);
}

/**
 * Append a {stage,event,t_ms} event to the job's `progress` jsonb array AND set
 * the scalar `stage` to the event's stage (SSE/poll surface the latest stage).
 * The append is server-side (`progress || $event::jsonb`) so concurrent appends
 * never clobber each other.
 */
export async function appendProgress(id: string, event: JobProgressEvent): Promise<void> {
  await run(
    `UPDATE classification_jobs
     SET progress = COALESCE(progress, '[]'::jsonb) || $2::jsonb,
         stage = $3
     WHERE id = $1`,
    [id, JSON.stringify([event]), event.stage],
  );
}

/** Mark a job 'done' and store the FLAT ApiClassifyResponse DTO as the result. */
export async function completeJob(id: string, result: ApiClassifyResponse): Promise<void> {
  await run(
    `UPDATE classification_jobs
     SET status = 'done', result = $2::jsonb, finished_at = now()
     WHERE id = $1`,
    [id, JSON.stringify(result)],
  );
}

/** Mark a job 'failed' and store the structured error payload. */
export async function failJob(id: string, error: JobError): Promise<void> {
  await run(
    `UPDATE classification_jobs
     SET status = 'failed', error = $2::jsonb, finished_at = now()
     WHERE id = $1`,
    [id, JSON.stringify(error)],
  );
}

/**
 * Poll-endpoint read. Returns the job's status/stage/progress/result/error and a
 * LIVE queue_position (recomputed from current pending rows so it shrinks as the
 * queue drains). Returns null when no row matches the id.
 */
export async function getJob(id: string): Promise<JobView | null> {
  const res = await run<RawJobRow>(
    `SELECT * FROM classification_jobs WHERE id = $1`,
    [id],
  );
  if (res.rows.length === 0) return null;
  const row = toJobRow(res.rows[0]!);

  // Live queue position only matters while pending; a done/failed job is 0.
  const queuePosition =
    row.status === 'queued' || row.status === 'running'
      ? await countQueuedAhead(row.created_at)
      : 0;

  return {
    id:             row.id,
    status:         row.status,
    stage:          row.stage,
    progress:       row.progress,
    queue_position: queuePosition,
    result:         row.result,
    error:          row.error,
  };
}

/**
 * Count still-pending jobs created at or before `createdAt`, i.e. this job's
 * 1-based position in the drain line (1 = head). Used for `queue_position`.
 */
export async function countQueuedAhead(createdAt: string): Promise<number> {
  const res = await run<{ ahead: string | number }>(
    `SELECT COUNT(*)::int AS ahead
     FROM classification_jobs
     WHERE status IN ('queued','running')
       AND created_at <= $1`,
    [createdAt],
  );
  const ahead = res.rows[0]?.ahead ?? 0;
  return Number(ahead);
}

/** TTL sweep: delete every job past its `expires_at`. Returns the rows removed. */
export async function sweepExpired(): Promise<number> {
  const res = await run(
    `DELETE FROM classification_jobs WHERE expires_at < now()`,
    [],
  );
  return res.rowCount ?? 0;
}
