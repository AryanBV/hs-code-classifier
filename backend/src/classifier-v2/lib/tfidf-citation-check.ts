/**
 * Citation-fidelity check for L5 Verifier Rule 3 (MV-03).
 *
 * MV-03's intent: verify the model's `citation.primary.verbatim_text` is a
 * FAITHFUL (near-verbatim) copy of the actual DB source text it cites (resolved
 * via the source-ref resolver). The question is purely "is verbatim_text
 * actually contained in / a faithful copy of the source text?" — NOT a relevance
 * ranking.
 *
 * --- Why the old metric was rewritten (2026-05-28) ---
 * The previous implementation computed
 *     normalized_score = ts_rank_cd(source, plainto_tsquery(verbatim))
 *                      / ts_rank_cd(source, to_tsquery(self_10token_OR))
 * The numerator AND-joins ~all verbatim tokens (tiny rank for any normal-length
 * note) while the denominator is a 10-token OR query (large rank). The ratio of
 * an all-AND query over a 10-OR query is ≈0 for any normal-length note, so the
 * normalized score sat at ~0.004 even for a NEAR-VERBATIM citation → MV-03
 * rejected essentially every legitimate citation. The threshold was fine; the
 * SCORE was mathematically meaningless. (See task brief FIX 1 / MV-03.)
 *
 * --- New metric: token-set containment ---
 *     score = |verbatim_tokens ∩ source_tokens| / |verbatim_tokens|
 * Both texts are normalized (lowercase, punctuation stripped, split to word
 * tokens). A faithful copy → score ≈ 1.0 (every verbatim word also appears in
 * the source); a fabricated/unrelated citation → low. This directly answers
 * "is the citation a faithful copy of the source it points at?" and needs no
 * Postgres extension (pg_trgm is NOT installed on this DB — verified
 * 2026-05-28 via `SELECT * FROM pg_extension WHERE extname='pg_trgm'` → empty).
 *
 * The computation is pure JS (set intersection), so the `runner` parameter is
 * now unused; it is retained in the signature so callers (L5 ruleVerbatimCitation)
 * and existing tests do not have to change their call site.
 *
 * Edge handling:
 * - source_text < 5 tokens → SKIP (too short to score reliably).
 * - verbatim_text < 2 tokens → null score → verifier downgrades to SKIP.
 *
 * Spec references:
 *   - backend/docs/sub-specs/01-verifier-rules.md §"Rule 3"
 *   - backend/src/classifier-v2/lib/verifier-constants.ts (CITATION_TFIDF_THRESHOLD)
 */
import type { QueryRunner } from './supabase-client';
import { CITATION_TFIDF_THRESHOLD } from './verifier-constants';

/* ---------------------------------------------------------------------------
 * Public types
 * --------------------------------------------------------------------------- */

export interface CitationMatchResult {
  /**
   * Token-set containment in [0, 1]: fraction of verbatim tokens also present
   * in the source. null when the inputs are degenerate (verbatim too short).
   */
  normalized_score: number | null;
  /** True iff normalized_score >= threshold. False when score below or null. */
  passed:           boolean;
  /** Same threshold used (echoed for diagnostics). */
  threshold:        number;
  /** True iff the source was too short to score; verifier may downgrade to SKIP. */
  source_too_short: boolean;
}

/* ---------------------------------------------------------------------------
 * Tokenization
 * --------------------------------------------------------------------------- */

/**
 * Lowercased alphanumeric word tokens. Punctuation and whitespace collapse to
 * token boundaries; tokens shorter than 2 chars are dropped (mirrors the
 * 'english' FTS tokenizer's treatment of stray single chars). Note: we do NOT
 * stem or remove stopwords — for a verbatim-copy fidelity check we want the
 * literal words, including common ones, so that paraphrase (which swaps content
 * words) scores low.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Token-set containment: |verbatim ∩ source| / |verbatim|.
 *
 * Uses SET semantics (distinct verbatim tokens) so that repeated words in the
 * verbatim text do not distort the ratio. Returns null when there are no
 * scorable verbatim tokens.
 */
export function tokenSetContainment(verbatimTokens: string[], sourceTokens: string[]): number | null {
  const verbatimSet = new Set(verbatimTokens);
  if (verbatimSet.size === 0) return null;
  const sourceSet = new Set(sourceTokens);
  let overlap = 0;
  for (const t of verbatimSet) {
    if (sourceSet.has(t)) overlap += 1;
  }
  return overlap / verbatimSet.size;
}

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Compute the citation-fidelity (token-set containment) score between
 * `verbatimText` (the candidate citation) and `sourceText` (resolved DB text).
 *
 * @param verbatimText  Candidate citation text (from SelectOutput.citation.primary.verbatim_text).
 * @param sourceText    Resolved DB text (from source-ref-resolver).
 * @param _runner       Unused (kept for call-site stability; metric is pure JS).
 * @param threshold     Override for CITATION_TFIDF_THRESHOLD.
 */
export async function citationFuzzyMatch(
  verbatimText: string,
  sourceText:   string,
  _runner:      QueryRunner,
  threshold:    number = CITATION_TFIDF_THRESHOLD,
): Promise<CitationMatchResult> {
  const verbatimTokens = tokenize(verbatimText);
  const sourceTokens   = tokenize(sourceText);

  // Source too short to be a reliable reference → SKIP-able.
  if (sourceTokens.length < 5) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: true,
    };
  }
  // Verbatim too short to score → null (verifier downgrades to SKIP).
  if (verbatimTokens.length < 2) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: false,
    };
  }

  const score = tokenSetContainment(verbatimTokens, sourceTokens);
  if (score === null) {
    return {
      normalized_score: null,
      passed:           false,
      threshold,
      source_too_short: false,
    };
  }
  return {
    normalized_score: score,
    passed:           score >= threshold,
    threshold,
    source_too_short: false,
  };
}
