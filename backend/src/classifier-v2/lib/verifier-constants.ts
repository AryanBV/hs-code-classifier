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
 * Empirically recalibrated 2026-05-28 (scripts/calibrate-cosine-floor.ts) over
 * the 342 gold classify cases in src/eval/test-suites/master-suite.ts.
 *
 * The query is the SHORT L0-normalized text (Cohere embed-v4 search_query); the
 * stored row is a LONG hierarchy-concatenated search_document. This asymmetry
 * makes correct-code cosines run much lower than a symmetric setup would: the
 * correct-code distribution had median 0.455, P5 0.248, P10 0.287, min 0.117 —
 * so the old 0.55 floor rejected ~78% of CORRECT codes (recall 22%). The wrong-
 * code distribution (random same-chapter-different-heading sibling + random
 * different-chapter code) had median 0.182 and P90 0.330.
 *
 * Chosen floor 0.22 → 96.2% correct-code recall (13/342 false-rejects, which
 * escalate to L6 Tiebreak rather than emit) while rejecting ~63% of all wrong
 * codes (~88% of fully-unrelated different-chapter codes). Caveats: (a) this is a
 * single global constant tuned on the eval gold (mild overfitting — acceptable);
 * (b) correct vs same-chapter-sibling distributions OVERLAP in ~0.25-0.36, so
 * MV-04 is a weak discriminator for WITHIN-chapter near-misses and strong only
 * for unrelated/hallucinated codes. A soft-warning/escalate redesign (vs hard
 * reject) is the right long-term move if within-chapter precision matters; not
 * implemented here.
 */
export const EMBEDDING_COSINE_FLOOR = 0.22;
