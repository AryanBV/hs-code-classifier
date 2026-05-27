/**
 * Tunable thresholds for the L5 Mechanical Verifier.
 *
 * These constants encode the "soft" judgment lines in the verifier — the points
 * where we trade between catching hallucinated citations / poisoned retrievals
 * and over-rejecting legitimate emissions. They are isolated here so that the
 * Phase 4.4 calibration cycle (per sub-spec 01 §"Calibration plan") can tune
 * them in one place against the 168-case eval harness.
 *
 * Spec references:
 *   - backend/docs/sub-specs/01-verifier-rules.md §"Rule 3" (citation TF-IDF)
 *     and §"Calibration plan (Phase 4.4)"
 *   - backend/docs/ARCHITECTURE.md §6 Rule 4 (embedding cosine floor)
 */

/**
 * TF-IDF normalized-score floor for Rule 3 (verbatim citation match).
 *
 * The verifier computes `ts_rank_cd / max_ts_rank_cd` per sub-spec 01 SQL:
 * see source-ref-resolver + tfidf-citation-check. Anything below this value is
 * treated as a hallucinated / paraphrased-too-loose citation and fails.
 *
 * Initial value: 0.6 (sub-spec 01 §"Rule 3" lock).
 *
 * Calibration plan (Phase 4.4): log every normalized_score on the 168-case
 * run, labelled `{known_good | suspected_hallucinated}`. Plot distributions;
 * set operational threshold at the gap. If overlap > 0.1 Bhattacharyya, lower
 * to 0.45 and add a `verbatim_text.length >= 20` floor.
 */
export const CITATION_TFIDF_THRESHOLD = 0.6;

/**
 * Minimum cosine similarity between the query embedding and the
 * `tariff_lines.embedding` row for the selected code (Rule 4).
 *
 * Initial value: 0.55 (ARCHITECTURE.md §6 Rule 4 lock — calibrated against the
 * Phase 3 spike + Phase 3.5 A9 empirical proof, where 30/30 correct emissions
 * had cosine ≥ 0.6 and the single incorrect emission was 0.51).
 *
 * Calibration plan (Phase 4.4): same procedure as TF-IDF. If overlap is wide,
 * we surface "LOW_COSINE_SIMILARITY" as a soft warning (still escalated to L6
 * Tiebreak via the repair loop, but not as a hard refusal).
 */
export const EMBEDDING_COSINE_FLOOR = 0.55;
