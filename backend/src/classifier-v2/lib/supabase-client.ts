/**
 * Supabase / Postgres client wrapper for Phase 4 v2 Layer 2 Retrieval.
 *
 * Why `pg` and not `@supabase/supabase-js`?
 *   The Supabase JS SDK is a REST/PostgREST wrapper that does NOT expose the
 *   pgvector `<=>` cosine-distance operator nor PG full-text-search operators
 *   (`@@`, `ts_rank_cd`). Both are required by L2's spec (multi-level HNSW
 *   cosine search + GIN-FTS on tariff_lines.fts_search_text + GIN-FTS on
 *   chapter_exclusions.excluded_product_text). Workarounds (RPC functions per
 *   query shape) would multiply schema artifacts; `pg` is already installed
 *   and is the same connection target as Supabase. We point `pg.Pool` at the
 *   Supabase DATABASE_URL (pooler:6543) and use parameterized SQL.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 Layer 2 (multi-level HNSW + GIN-FTS)
 *   - backend/docs/ARCHITECTURE.md §4.7 (head_nouns | raw_tokens tsquery)
 *   - backend/CLAUDE.md (env: DATABASE_URL)
 *
 * Connection lifecycle:
 *   - Single shared pool, lazily initialized on first query.
 *   - Pool is reusable across requests; intentionally NOT closed in normal
 *     operation. Tests that need to swap implementations should inject a mock
 *     via `_setQueryRunnerForTesting()`.
 */
import 'dotenv/config';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

/** Vector cosine-search result row (one row per candidate at this level). */
export interface CosineCandidate {
  code:         string;
  cosine_score: number;
}

/** FTS hit row from `tariff_lines.fts_search_text @@ to_tsquery(...)`. */
export interface FtsHit {
  code:         string;
  description:  string;
  subheading:   string;
  rank:         number;
  matched_text: string;
}

/** GIN-FTS hit row from `chapter_exclusions.excluded_product_text @@ ...`. */
export interface ExclusionFtsHit {
  id:                     number;
  source_chapter:         string;
  excluded_product_text:  string;
  redirects_to_chapter:   string[];
}

/** Parent-chain lookup row for a tariff_line code. */
export interface ParentChainRow {
  code:        string;
  description: string;
  subheading:  string;
  heading:     string;
  chapter:     string;
}

/** Hierarchy level the retrieval cosine call targets. */
export type HierarchyTable = 'chapters' | 'headings' | 'subheadings' | 'tariff_lines';

/* ---------------------------------------------------------------------------
 * Query-runner abstraction (so tests can mock without spinning up pg)
 * --------------------------------------------------------------------------- */

/**
 * Minimal subset of `pg.Pool#query` we depend on. Defined as an interface so
 * tests can swap in a fake without instantiating real pg pools.
 */
export interface QueryRunner {
  query<T extends QueryResultRow = QueryResultRow>(
    text:    string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

let _pool:       Pool | null = null;
let _runner:     QueryRunner | null = null;

/* ---------------------------------------------------------------------------
 * Retry policy
 *
 * Wraps the inner pg query call with 3-attempt exponential backoff on
 * transient errors. Mirrors `vertex-client.ts` semantics:
 *   backoff = (2^attempt) * 500ms + random(0..200ms) jitter
 *
 * Retry on:
 *   - Node net errors: ECONNRESET / ETIMEDOUT / ECONNREFUSED / EAI_AGAIN
 *   - Postgres class-08 errors (connection_exception): 08000, 08003, 08006,
 *     08001, 08004, 08007, 08P01 — anything starting with '08'.
 *
 * Do NOT retry constraint violations (23xxx), syntax errors (42xxx), or any
 * other deterministic SQLSTATE — they will fail identically on retry.
 *
 * After 3 attempts exhausted: rethrow with `[supabase-client] After 3 retry
 * attempts:` prefix, preserving the original error as `cause`.
 * --------------------------------------------------------------------------- */

const SUPABASE_MAX_ATTEMPTS = 3;

interface ErrorLike {
  code?: string | number;
}

function isRetryablePgError(err: unknown): boolean {
  const e = err as ErrorLike;
  const code = e?.code;
  if (typeof code === 'string') {
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
      return true;
    }
    if (code.startsWith('08')) {
      // Postgres class 08 — connection_exception family.
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a base QueryRunner with retry-on-transient-errors. The wrapper preserves
 * the QueryRunner contract exactly — callers see no behavioral difference
 * except improved resilience to brief Supabase pooler hiccups.
 */
function withRetry(base: QueryRunner): QueryRunner {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      text:    string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < SUPABASE_MAX_ATTEMPTS; attempt++) {
        try {
          return await base.query<T>(text, params);
        } catch (e: unknown) {
          lastErr = e;
          if (attempt < SUPABASE_MAX_ATTEMPTS - 1 && isRetryablePgError(e)) {
            const backoff = (2 ** attempt) * 500 + Math.floor(Math.random() * 200);
            await sleep(backoff);
            continue;
          }
          if (attempt === SUPABASE_MAX_ATTEMPTS - 1 && isRetryablePgError(e)) {
            const msg = e instanceof Error ? e.message : String(e);
            const wrapped = new Error(`[supabase-client] After ${SUPABASE_MAX_ATTEMPTS} retry attempts: ${msg}`);
            (wrapped as Error & { cause?: unknown }).cause = e;
            throw wrapped;
          }
          // Non-retryable — surface directly so caller sees the real SQLSTATE.
          throw e;
        }
      }
      // Unreachable: loop either returns or throws.
      throw lastErr ?? new Error('[supabase-client] retry loop exited unexpectedly');
    },
  };
}

/** Lazily construct the pg.Pool from DATABASE_URL. */
function getRunner(): QueryRunner {
  if (_runner) return _runner;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.length === 0) {
    throw new Error(
      'classifier-v2/supabase-client: DATABASE_URL is not set in env',
    );
  }
  _pool = new Pool({
    connectionString,
    // Supabase pooler requires TLS but accepts self-signed in some configs.
    // Setting rejectUnauthorized=false matches the legacy classifier behavior.
    ssl: { rejectUnauthorized: false },
    // Modest pool to avoid exhausting Supabase pooler slots.
    max: 5,
  });
  _runner = withRetry(_pool);
  return _runner;
}

/**
 * Test-only hook: inject a mock QueryRunner. Pass `null` to restore default.
 *
 * Note: the injected runner is used AS-IS (no retry wrapper), so tests can
 * directly assert call counts without retry doubling them.
 */
export function _setQueryRunnerForTesting(runner: QueryRunner | null): void {
  _runner = runner;
}

/**
 * Public accessor for the shared (retry-wrapped, lazily-initialized) QueryRunner.
 *
 * Other backend modules that need raw parameterized SQL against the SAME pooled
 * Supabase connection — e.g. the Phase B job-store (`src/api/job-store.ts`) —
 * call this instead of constructing their own pool. It honors the
 * `_setQueryRunnerForTesting` seam, so injecting a fake runner there also routes
 * those modules' queries to the fake (no live pg required in unit tests).
 */
export function getQueryRunner(): QueryRunner {
  return getRunner();
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

/**
 * Convert a number[] embedding into the literal pgvector text format
 * pgvector accepts: '[0.1,0.2,...]'. Cheaper than client-side validation since
 * the DB itself rejects malformed vectors.
 */
function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/* ---------------------------------------------------------------------------
 * Cosine search at each hierarchy level
 * --------------------------------------------------------------------------- */

/**
 * Search `chapters.embedding` for the top-K closest chapters in `candidateChapters`.
 *
 * Returns rows with `cosine_score = 1 - (embedding_v2 <=> :q)`.
 */
export async function cosineSearchChapters(
  embedding:         number[],
  candidateChapters: string[],
  limit:             number,
): Promise<CosineCandidate[]> {
  if (candidateChapters.length === 0) return [];
  const runner = getRunner();
  const vec = embeddingToPgVector(embedding);
  const sql = `
    SELECT
      chapter AS code,
      1 - (embedding_v2 <=> $1::vector) AS cosine_score
    FROM chapters
    WHERE chapter = ANY($2)
      AND embedding_v2 IS NOT NULL
    ORDER BY embedding_v2 <=> $1::vector
    LIMIT $3
  `;
  const res = await runner.query<{ code: string; cosine_score: number }>(sql, [
    vec,
    candidateChapters,
    limit,
  ]);
  return res.rows.map((r) => ({
    code:         r.code,
    cosine_score: Number(r.cosine_score),
  }));
}

/**
 * Search `headings.embedding` constrained to a set of parent chapters.
 */
export async function cosineSearchHeadings(
  embedding:        number[],
  chapters:         string[],
  limit:            number,
): Promise<CosineCandidate[]> {
  if (chapters.length === 0) return [];
  const runner = getRunner();
  const vec = embeddingToPgVector(embedding);
  const sql = `
    SELECT
      heading AS code,
      1 - (embedding_v2 <=> $1::vector) AS cosine_score
    FROM headings
    WHERE chapter = ANY($2)
      AND embedding_v2 IS NOT NULL
    ORDER BY embedding_v2 <=> $1::vector
    LIMIT $3
  `;
  const res = await runner.query<{ code: string; cosine_score: number }>(sql, [
    vec,
    chapters,
    limit,
  ]);
  return res.rows.map((r) => ({
    code:         r.code,
    cosine_score: Number(r.cosine_score),
  }));
}

/**
 * Search `subheadings.embedding` constrained to a set of parent headings.
 */
export async function cosineSearchSubheadings(
  embedding:  number[],
  headings:   string[],
  limit:      number,
): Promise<CosineCandidate[]> {
  if (headings.length === 0) return [];
  const runner = getRunner();
  const vec = embeddingToPgVector(embedding);
  const sql = `
    SELECT
      subheading AS code,
      1 - (embedding_v2 <=> $1::vector) AS cosine_score
    FROM subheadings
    WHERE heading = ANY($2)
      AND embedding_v2 IS NOT NULL
    ORDER BY embedding_v2 <=> $1::vector
    LIMIT $3
  `;
  const res = await runner.query<{ code: string; cosine_score: number }>(sql, [
    vec,
    headings,
    limit,
  ]);
  return res.rows.map((r) => ({
    code:         r.code,
    cosine_score: Number(r.cosine_score),
  }));
}

/**
 * Search `tariff_lines.embedding` constrained to a set of parent subheadings.
 */
export async function cosineSearchTariffLines(
  embedding:    number[],
  subheadings:  string[],
  limit:        number,
): Promise<CosineCandidate[]> {
  if (subheadings.length === 0) return [];
  const runner = getRunner();
  const vec = embeddingToPgVector(embedding);
  const sql = `
    SELECT
      code,
      1 - (embedding_v2 <=> $1::vector) AS cosine_score
    FROM tariff_lines
    WHERE subheading = ANY($2)
      AND embedding_v2 IS NOT NULL
    ORDER BY embedding_v2 <=> $1::vector
    LIMIT $3
  `;
  const res = await runner.query<{ code: string; cosine_score: number }>(sql, [
    vec,
    subheadings,
    limit,
  ]);
  return res.rows.map((r) => ({
    code:         r.code,
    cosine_score: Number(r.cosine_score),
  }));
}

/* ---------------------------------------------------------------------------
 * GIN-FTS searches
 * --------------------------------------------------------------------------- */

/**
 * GIN-FTS hit query against `tariff_lines.fts_search_text @@ to_tsquery(...)`.
 *
 * The caller is responsible for providing a properly escaped tsquery string
 * (`buildTsQuery()` in L2-retrieval.ts handles the escape). Results are
 * scoped to the `chapters[]` set (matched via LEFT(code,2)).
 */
export async function ftsSearchTariffLines(
  tsquery:   string,
  chapters:  string[],
  limit:     number,
): Promise<FtsHit[]> {
  if (chapters.length === 0 || tsquery.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      tl.code,
      tl.description,
      tl.subheading,
      ts_rank_cd(to_tsvector('english', tl.fts_search_text), to_tsquery('english', $1)) AS rank,
      tl.fts_search_text AS matched_text
    FROM tariff_lines tl
    WHERE LEFT(tl.code, 2) = ANY($2)
      AND tl.fts_search_text IS NOT NULL
      AND to_tsvector('english', tl.fts_search_text) @@ to_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT $3
  `;
  const res = await runner.query<FtsHit>(sql, [tsquery, chapters, limit]);
  return res.rows.map((r) => ({
    code:         r.code,
    description:  r.description,
    subheading:   r.subheading,
    rank:         Number(r.rank),
    matched_text: r.matched_text,
  }));
}

/**
 * GIN-FTS hit query against `chapter_exclusions.excluded_product_text` —
 * pre-filter for Layer 3 (Rule 2 in mechanical verifier).
 *
 * Scoped to the candidate chapters set so we only see rules that could plausibly
 * fire against our retrieval set.
 */
export async function ftsSearchExclusions(
  tsquery:   string,
  chapters:  string[],
  limit:     number,
): Promise<ExclusionFtsHit[]> {
  if (chapters.length === 0 || tsquery.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      id,
      source_chapter,
      excluded_product_text,
      redirects_to_chapter
    FROM chapter_exclusions
    WHERE source_chapter = ANY($2)
      AND excluded_product_text IS NOT NULL
      AND to_tsvector('english', excluded_product_text) @@ to_tsquery('english', $1)
    ORDER BY ts_rank_cd(
      to_tsvector('english', excluded_product_text),
      to_tsquery('english', $1)
    ) DESC
    LIMIT $3
  `;
  const res = await runner.query<{
    id: number;
    source_chapter: string;
    excluded_product_text: string;
    redirects_to_chapter: string[] | null;
  }>(sql, [tsquery, chapters, limit]);
  return res.rows.map((r) => ({
    id:                     Number(r.id),
    source_chapter:         r.source_chapter,
    excluded_product_text:  r.excluded_product_text,
    redirects_to_chapter:   Array.isArray(r.redirects_to_chapter)
      ? r.redirects_to_chapter
      : [],
  }));
}

/* ---------------------------------------------------------------------------
 * Parent-chain + leaf-count lookups
 * --------------------------------------------------------------------------- */

/**
 * Fetch parent-chain rows for a list of tariff_line codes.
 *
 * Returns one row per existing code (codes not present are silently dropped —
 * Layer 5 Rule 1 will catch any selected_code that doesn't exist).
 */
export async function getTariffLineParentChains(
  codes: string[],
): Promise<ParentChainRow[]> {
  if (codes.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      tl.code,
      tl.description,
      tl.subheading,
      sh.heading AS heading,
      h.chapter  AS chapter
    FROM tariff_lines tl
    JOIN subheadings  sh ON sh.subheading = tl.subheading
    JOIN headings     h  ON h.heading     = sh.heading
    WHERE tl.code = ANY($1)
  `;
  const res = await runner.query<ParentChainRow>(sql, [codes]);
  return res.rows;
}

/** Subheading title lookup row (6-digit code → its own description). */
export interface SubheadingDescriptionRow {
  code:        string;
  description: string;
}

/**
 * Fetch the title (description) for a set of 6-digit subheading codes. Used by
 * the API adapter to hydrate the headline description of a 6-digit CLASSIFY
 * result (whose own row lives in `subheadings`, NOT `tariff_lines`).
 *
 * Returns one row per existing subheading (codes not present are silently
 * dropped). Mirrors the parameterized `$1`/return-rows style of the other
 * helpers in this file.
 */
export async function getSubheadingDescriptions(
  codes: string[],
): Promise<SubheadingDescriptionRow[]> {
  if (codes.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      subheading AS code,
      title      AS description
    FROM subheadings
    WHERE subheading = ANY($1)
  `;
  const res = await runner.query<SubheadingDescriptionRow>(sql, [codes]);
  return res.rows;
}

/**
 * For each subheading, return the count of tariff_line children. Used by L2 to
 * detect the "single-child subheading shortcut" (60% case per recon).
 */
export interface SubheadingChildCount {
  subheading:  string;
  child_count: number;
}

export async function getSubheadingChildCounts(
  subheadings: string[],
): Promise<SubheadingChildCount[]> {
  if (subheadings.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      subheading,
      COUNT(*)::int AS child_count
    FROM tariff_lines
    WHERE subheading = ANY($1)
    GROUP BY subheading
  `;
  const res = await runner.query<SubheadingChildCount>(sql, [subheadings]);
  return res.rows.map((r) => ({
    subheading:  r.subheading,
    child_count: Number(r.child_count),
  }));
}

/**
 * For a list of headings, return ALL subheading codes under them. Used by L2's
 * direct_leaf_lookup branch to widen the rerank pool from the cosine top-5
 * subheadings to every subheading of the SURFACED headings, so missing sibling
 * subheadings (and their residual `.90/.99/Other` leaf) enter the rerank pool.
 */
export async function getSubheadingsForHeadings(
  headings: string[],
): Promise<string[]> {
  if (headings.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT subheading
    FROM subheadings
    WHERE heading = ANY($1)
    ORDER BY subheading
  `;
  const res = await runner.query<{ subheading: string }>(sql, [headings]);
  return res.rows.map((r) => r.subheading);
}

/**
 * Fetch all tariff_line children for a list of subheadings — used by the
 * direct-leaf-lookup shortcut to emit candidates without going through rerank.
 */
export async function getTariffLinesForSubheadings(
  subheadings: string[],
): Promise<ParentChainRow[]> {
  if (subheadings.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      tl.code,
      tl.description,
      tl.subheading,
      sh.heading AS heading,
      h.chapter  AS chapter
    FROM tariff_lines tl
    JOIN subheadings  sh ON sh.subheading = tl.subheading
    JOIN headings     h  ON h.heading     = sh.heading
    WHERE tl.subheading = ANY($1)
    ORDER BY tl.code
  `;
  const res = await runner.query<ParentChainRow>(sql, [subheadings]);
  return res.rows;
}

/* ---------------------------------------------------------------------------
 * Layer 4 (Select) multi-signal fetchers
 *
 * The Select layer needs to inject five legal-context signals into the prompt:
 *   - candidate hydrated rows (chapter/heading/subheading titles + policy)
 *   - chapter notes (7 JSONB columns) for each candidate's chapter
 *   - section notes for each candidate's parent section
 *   - notes_claims scoped to candidate chapters
 *   - tariff_line_attributes for candidate codes (may be empty during O2 ramp)
 *
 * All fetchers are pure read functions, parameterized by the candidate-code or
 * chapter set produced by L3. Each runs through the shared retry-wrapped pool.
 * --------------------------------------------------------------------------- */

/** Hydrated candidate row used by L4 to render the prompt {candidates} block. */
export interface SelectCandidateRowRaw {
  code:                 string;
  is_six_digit_only:    boolean;
  description:          string;
  chapter:              string;
  heading:              string;
  subheading:           string;
  subheading_title:     string | null;
  heading_title:        string | null;
  chapter_title:        string | null;
  export_policy:        string | null;
  policy_condition:     string | null;
  india_specific:       boolean;
  india_specific_note:  string | null;
}

/**
 * Hydrate L4 candidate rows from the DB. Returns one row per existing code with
 * full hierarchy + policy + india-specific context. Codes not present in DB are
 * silently dropped (caller surfaces via Verifier Rule 1 candidate-set-membership).
 *
 * Handles 8-digit `^\d{4}\.\d{2}\.\d{2}$` codes via `tariff_lines` and 6-digit
 * `^\d{4}\.\d{2}$` subheading-only codes via `subheadings` (used when a candidate
 * subheading has no 8-digit children — the 6-digit-fallback path).
 */
export async function getSelectCandidateRows(
  codes: string[],
): Promise<SelectCandidateRowRaw[]> {
  if (codes.length === 0) return [];
  const runner = getRunner();

  // Split into 8-digit and 6-digit-only buckets.
  const eightDigit = codes.filter((c) => /^\d{4}\.\d{2}\.\d{2}$/.test(c));
  const sixDigit   = codes.filter((c) => /^\d{4}\.\d{2}$/.test(c));

  const out: SelectCandidateRowRaw[] = [];

  if (eightDigit.length > 0) {
    const sql = `
      SELECT
        tl.code                     AS code,
        FALSE                       AS is_six_digit_only,
        tl.description              AS description,
        h.chapter                   AS chapter,
        sh.heading                  AS heading,
        tl.subheading               AS subheading,
        sh.title                    AS subheading_title,
        h.title                     AS heading_title,
        c.title                     AS chapter_title,
        tl.export_policy            AS export_policy,
        tl.policy_condition         AS policy_condition,
        COALESCE(sh.india_specific, FALSE) AS india_specific,
        sh.india_specific_note      AS india_specific_note
      FROM tariff_lines  tl
      JOIN subheadings   sh ON sh.subheading = tl.subheading
      JOIN headings      h  ON h.heading     = sh.heading
      JOIN chapters      c  ON c.chapter     = h.chapter
      WHERE tl.code = ANY($1)
    `;
    const res = await runner.query<SelectCandidateRowRaw>(sql, [eightDigit]);
    out.push(...res.rows.map((r) => ({
      ...r,
      is_six_digit_only: false,
      india_specific:    Boolean(r.india_specific),
    })));
  }

  if (sixDigit.length > 0) {
    const sql = `
      SELECT
        sh.subheading               AS code,
        TRUE                        AS is_six_digit_only,
        sh.title                    AS description,
        h.chapter                   AS chapter,
        sh.heading                  AS heading,
        sh.subheading               AS subheading,
        sh.title                    AS subheading_title,
        h.title                     AS heading_title,
        c.title                     AS chapter_title,
        NULL::text                  AS export_policy,
        NULL::text                  AS policy_condition,
        COALESCE(sh.india_specific, FALSE) AS india_specific,
        sh.india_specific_note      AS india_specific_note
      FROM subheadings sh
      JOIN headings    h  ON h.heading = sh.heading
      JOIN chapters    c  ON c.chapter = h.chapter
      WHERE sh.subheading = ANY($1)
    `;
    const res = await runner.query<SelectCandidateRowRaw>(sql, [sixDigit]);
    out.push(...res.rows.map((r) => ({
      ...r,
      is_six_digit_only: true,
      india_specific:    Boolean(r.india_specific),
    })));
  }

  return out;
}

/** Raw row of a per-chapter notes bundle (7 JSONB cols + parent section notes). */
export interface ChapterNotesRow {
  chapter:                     string;
  notes:                       unknown[] | null;
  chapter_subheading_notes:    unknown[] | null;
  supplementary_notes:         unknown[] | null;
  export_licensing_notes:      unknown[] | null;
  section_notes:               unknown[] | null;
}

/**
 * Fetch chapter notes JSONB columns + parent-section notes for a set of
 * candidate chapters. Returns one row per chapter.
 *
 * The chapters table has 7 JSONB note columns (CLAUDE.md "Phase 2f normalized"):
 *   notes, chapter_subheading_notes, supplementary_notes, export_licensing_notes,
 *   definitions, extraction_warnings, notes_sources.
 *
 * L4 needs the first four (legally controlling) plus the parent section's notes.
 */
export async function getChapterNotesBundles(
  chapters: string[],
): Promise<ChapterNotesRow[]> {
  if (chapters.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      c.chapter                                              AS chapter,
      c.notes                                                AS notes,
      c.chapter_subheading_notes                             AS chapter_subheading_notes,
      c.supplementary_notes                                  AS supplementary_notes,
      c.export_licensing_notes                               AS export_licensing_notes,
      s.notes                                                AS section_notes
    FROM chapters c
    LEFT JOIN sections s ON s.section = c.section
    WHERE c.chapter = ANY($1)
  `;
  const res = await runner.query<ChapterNotesRow>(sql, [chapters]);
  return res.rows;
}

/** Light-weight notes_claims row consumed by L4. */
export interface NotesClaimRow {
  id:           number;
  source_ref:   string;
  source_kind:  string;
  claim_type:   string;
  claim_text:   string;
  predicate:    unknown;
  applies_to:   string[];
}

/**
 * Fetch notes_claims rows whose `applies_to` array overlaps the given chapter set.
 *
 * Scoping: only claims relevant to the candidate set are passed to the LLM. The
 * full corpus would blow the context budget (Ch.87 alone has ~3K tokens).
 * Uses the `&&` array-overlap operator (GIN-indexed in Phase 4.0 prep).
 */
export async function getNotesClaimsForChapters(
  chapters: string[],
): Promise<NotesClaimRow[]> {
  if (chapters.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT
      id,
      source_ref,
      source_kind,
      claim_type,
      claim_text,
      predicate,
      applies_to
    FROM notes_claims
    WHERE applies_to && $1::text[]
  `;
  const res = await runner.query<NotesClaimRow>(sql, [chapters]);
  return res.rows;
}

/**
 * Metadata discriminator columns fetched IN ADDITION to the 7 core fields.
 *
 * Why these and not all ~41 columns: sibling groups whose ONLY discriminator is
 * a metadata column (e.g. Ch.61 knitted-vs-woven `fabric_construction`, Ch.27/29
 * organic-vs-isomer `chemical_class`, Ch.71-83 `predominant_element` / metal %s)
 * were previously invisible to L4's sibling-diff — the diff saw identical core
 * fields and surfaced no discriminator, so L4 had to guess or over-defer to the
 * 6-digit/general leaf. Fetching these lets `computeSiblingDiscriminators` surface
 * the real splitter. The list is the HIGH/MEDIUM/LOWER tier from the over-defer
 * investigation; metadata-only / SKIP-prone columns (`solution_purpose`,
 * `electrically_*`, `wearable`, the remaining trace-metal %s, sieve %s) are
 * deliberately omitted to keep the row — and the diff input — lean.
 *
 * Keyed by their DB column names so the L5 predicate evaluator (`resolveVar`)
 * can resolve `fabric_construction`, `chemical_class`, `carbon_pct`, etc.
 * directly — these previously SKIPped for lack of the key (no behavior loss, a
 * net gain). `function_` keeps both the legacy `function` key (consumed by the
 * L4 prompt block) AND `function_` is unaffected (core block unchanged).
 */
const TLA_METADATA_COLUMNS = [
  // HIGH-tier discriminators
  'fabric_construction',
  'chemical_class',
  'predominant_element',
  'in_solution',
  // MEDIUM-tier (metal composition %s)
  'carbon_pct',
  'chromium_pct',
  'nickel_pct',
  'iron_pct',
  'aluminum_pct',
  // LOWER-tier
  'made_up',
  'intended_role',
] as const;

type TlaMetadataColumn = (typeof TLA_METADATA_COLUMNS)[number];

/** Raw row shape returned by the widened SELECT. */
interface TariffLineAttributesRowRaw {
  code: string;
  material: string[] | null;
  form: string[] | null;
  function_: string[] | null;
  intended_use: string[] | null;
  processing_state: string[] | null;
  composition: string[] | null;
  composite_components: unknown[] | null;
  fabric_construction: string | null;
  chemical_class: string | null;
  predominant_element: string | null;
  in_solution: boolean | null;
  carbon_pct: number | string | null;
  chromium_pct: number | string | null;
  nickel_pct: number | string | null;
  iron_pct: number | string | null;
  aluminum_pct: number | string | null;
  made_up: boolean | null;
  intended_role: string | null;
}

/** Numeric metadata columns arrive from pg as `string` (NUMERIC) — coerce. */
const TLA_NUMERIC_COLUMNS: ReadonlySet<TlaMetadataColumn> = new Set<TlaMetadataColumn>([
  'carbon_pct',
  'chromium_pct',
  'nickel_pct',
  'iron_pct',
  'aluminum_pct',
]);

/**
 * Fetch tariff_line_attributes rows for a set of candidate codes. May return
 * empty when O2 extraction is still running — L4 gracefully renders an empty
 * TLA block in that case (Verifier Rule 7/8/9 SKIP semantics absorb the gap).
 *
 * Returns one record per code; codes without an attributes row are silently
 * dropped. Each record carries the 7 CORE fields (always present, defaulted to
 * `[]`/`null`) plus any of the `TLA_METADATA_COLUMNS` whose value is NON-NULL.
 * Null metadata columns are OMITTED so the record stays compact: a code with no
 * metadata looks exactly like the old 7-field shape, and the sibling-diff treats
 * an omitted field as "absent" (consistent with the present-vs-absent rule).
 *
 * Consumers:
 *   - L4 `computeSiblingDiscriminators` diffs the FULL record (core + metadata),
 *     so a metadata-only split (e.g. `fabric_construction`) now surfaces.
 *   - L4 injects only the LEAN core subset per-candidate into the prompt
 *     (see `projectCoreAttributes` in L4-select.ts) — metadata rides only in the
 *     compact sibling-diff, never as a per-candidate dump.
 *   - L5 predicate evaluator resolves metadata vars (`carbon_pct`, etc.) directly.
 */
/* ---------------------------------------------------------------------------
 * QGS — question_templates lookup
 * --------------------------------------------------------------------------- */

/** A curated question_templates row consumed by the QGS generator. */
export interface QuestionTemplateRow {
  id:                       number;
  discriminating_attribute: string;
  /** Chapters this template is scoped to; null = general (any chapter). */
  chapter_scope:            string[] | null;
  question_text:            string;
  /** Map of option-value → human label (e.g. { "leather": "Leather only — ..." }). */
  value_labels:             Record<string, string>;
}

/**
 * Fetch curated question_templates rows for one discriminating attribute.
 *
 * The `discriminating_attribute` column stores DB-column keys (`function_`, not
 * `function`), matching the QGS DB-key space. Returns all matching rows; the QGS
 * generator picks the most chapter-relevant one via `pickTemplate`. Empty array
 * when no template exists for the attribute (QGS then synthesizes a generic
 * question_text + value-derived labels).
 */
export async function getQuestionTemplatesForAttribute(
  attribute: string,
): Promise<QuestionTemplateRow[]> {
  if (attribute.length === 0) return [];
  const runner = getRunner();
  const sql = `
    SELECT id, discriminating_attribute, chapter_scope, question_text, value_labels
    FROM question_templates
    WHERE discriminating_attribute = $1
    ORDER BY id
  `;
  const res = await runner.query<{
    id: number;
    discriminating_attribute: string;
    chapter_scope: string[] | null;
    question_text: string;
    value_labels: Record<string, string> | null;
  }>(sql, [attribute]);
  return res.rows.map((r) => ({
    id:                       Number(r.id),
    discriminating_attribute: r.discriminating_attribute,
    chapter_scope:            Array.isArray(r.chapter_scope) ? r.chapter_scope : null,
    question_text:            r.question_text,
    value_labels:             r.value_labels !== null && typeof r.value_labels === 'object'
      ? r.value_labels
      : {},
  }));
}

export async function getTariffLineAttributesForCodes(
  codes: string[],
): Promise<Record<string, unknown>> {
  if (codes.length === 0) return {};
  const runner = getRunner();
  const metadataSelect = TLA_METADATA_COLUMNS.join(',\n      ');
  const sql = `
    SELECT
      code,
      material,
      form,
      function_,
      intended_use,
      processing_state,
      composition,
      composite_components,
      ${metadataSelect}
    FROM tariff_line_attributes
    WHERE code = ANY($1)
  `;
  const res = await runner.query<TariffLineAttributesRowRaw>(sql, [codes]);
  const out: Record<string, unknown> = {};
  for (const r of res.rows) {
    const rec: Record<string, unknown> = {
      material:             r.material         ?? [],
      form:                 r.form             ?? [],
      function:             r.function_        ?? [],
      intended_use:         r.intended_use     ?? [],
      processing_state:     r.processing_state ?? [],
      composition:          r.composition      ?? [],
      composite_components: r.composite_components ?? null,
    };
    // Attach ONLY non-null metadata columns (keeps the record + diff input lean).
    for (const col of TLA_METADATA_COLUMNS) {
      const raw = (r as unknown as Record<string, unknown>)[col];
      if (raw === null || raw === undefined) continue;
      if (TLA_NUMERIC_COLUMNS.has(col)) {
        const n = typeof raw === 'string' ? Number(raw) : raw;
        if (typeof n === 'number' && Number.isFinite(n)) rec[col] = n;
      } else {
        rec[col] = raw;
      }
    }
    out[r.code] = rec;
  }
  return out;
}
