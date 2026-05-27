/**
 * TF-IDF normalized citation-similarity check for L5 Verifier Rule 3.
 *
 * Uses Postgres `ts_rank_cd` against `plainto_tsquery(verbatim_text)` to score
 * how strongly the verbatim_text overlaps the resolved source_text. Then
 * normalizes by a self-score computed from a 10-token sample of source_text
 * (per sub-spec 01 §"Rule 3" SQL pattern).
 *
 *   normalized_score = ts_rank_cd(source, verbatim) / ts_rank_cd(source, self_sample)
 *
 * - `>= CITATION_TFIDF_THRESHOLD` (default 0.6) → PASS.
 * - source_text < 5 tokens → SKIP (too short to score reliably).
 * - self_score == 0 (degenerate) → null normalized_score → SKIP.
 *
 * Spec references:
 *   - backend/docs/sub-specs/01-verifier-rules.md §"Rule 3"
 *   - backend/src/classifier-v2/lib/verifier-constants.ts
 */
import type { QueryRunner } from './supabase-client';
import { CITATION_TFIDF_THRESHOLD } from './verifier-constants';

/* ---------------------------------------------------------------------------
 * Public types
 * --------------------------------------------------------------------------- */

export interface CitationMatchResult {
  /** Score in [0, ~1.0]. null when degenerate or source too short. */
  normalized_score: number | null;
  /** True iff normalized_score >= threshold. False when score below or null. */
  passed:           boolean;
  /** Same threshold used (echoed for diagnostics). */
  threshold:        number;
  /** True iff the source was too short to score; verifier may downgrade to SKIP. */
  source_too_short: boolean;
}

/* ---------------------------------------------------------------------------
 * Tokenization for the self-score sample
 * --------------------------------------------------------------------------- */

/** Lowercased alphanumeric tokens; mirrors how Postgres FTS tokenizes 'english'. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Build a tsquery from a 10-token (or fewer) sample of source_text, OR-joined.
 *
 * The Postgres `plainto_tsquery` requires AND-joining; `to_tsquery` accepts OR
 * but every term needs to be a single bare token. We sample up to 10 unique
 * tokens and OR-join. This is the "self_query" of sub-spec 01.
 */
export function buildSelfTsQuery(sourceText: string, sampleSize = 10): string {
  const tokens = tokenize(sourceText);
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    sample.push(t);
    if (sample.length >= sampleSize) break;
  }
  return sample.join(' | ');
}

/* ---------------------------------------------------------------------------
 * SQL — computed in one round-trip so we don't fan-out connections.
 *
 * Returns:
 *   raw_score:  ts_rank_cd(source, plainto_tsquery(verbatim))
 *   self_score: ts_rank_cd(source, to_tsquery(self_query))
 *
 * normalized_score is computed client-side so we can detect degenerate cases.
 * --------------------------------------------------------------------------- */

const SCORE_SQL = `
  WITH src AS (SELECT to_tsvector('english', $1::text) AS vec)
  SELECT
    ts_rank_cd(src.vec, plainto_tsquery('english', $2::text))      AS raw_score,
    CASE WHEN $3::text = '' THEN 0
         ELSE ts_rank_cd(src.vec, to_tsquery('english', $3::text)) END AS self_score
  FROM src
`;

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Compute the normalized TF-IDF citation match score between `verbatimText`
 * (the candidate citation) and `sourceText` (resolved DB text).
 *
 * @param verbatimText  Candidate citation text (from SelectOutput.citation.primary.verbatim_text).
 * @param sourceText    Resolved DB text (from source-ref-resolver).
 * @param runner        QueryRunner — uses ts_rank_cd in Postgres directly.
 * @param threshold     Override for CITATION_TFIDF_THRESHOLD (default 0.6).
 */
export async function citationFuzzyMatch(
  verbatimText: string,
  sourceText:   string,
  runner:       QueryRunner,
  threshold:    number = CITATION_TFIDF_THRESHOLD,
): Promise<CitationMatchResult> {
  // Sanity gates.
  const verbatimTokens = tokenize(verbatimText);
  const sourceTokens   = tokenize(sourceText);

  if (sourceTokens.length < 5 || verbatimTokens.length < 2) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: sourceTokens.length < 5,
    };
  }

  const selfQuery = buildSelfTsQuery(sourceText);
  if (selfQuery.length === 0) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: true,
    };
  }

  const res = await runner.query<{ raw_score: number; self_score: number }>(SCORE_SQL, [
    sourceText,
    verbatimText,
    selfQuery,
  ]);
  if (res.rows.length === 0) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: false,
    };
  }
  const firstRow = res.rows[0];
  if (firstRow === undefined) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: false,
    };
  }
  const raw  = Number(firstRow.raw_score);
  const self = Number(firstRow.self_score);
  if (!Number.isFinite(self) || self === 0) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: false,
    };
  }
  const normalized = raw / self;
  return {
    normalized_score: normalized,
    passed:           normalized >= threshold,
    threshold,
    source_too_short: false,
  };
}
