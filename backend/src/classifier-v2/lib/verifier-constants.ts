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
 * Citation-fidelity floor for Rule 3 / MV-03 (verbatim citation match).
 *
 * The verifier now computes TOKEN-SET CONTAINMENT (see tfidf-citation-check.ts):
 *     score = |verbatim_tokens ∩ source_tokens| / |verbatim_tokens|
 * i.e. the fraction of the cited verbatim_text's words that actually appear in
 * the resolved DB source text. A faithful (near-verbatim) copy → ~1.0; a
 * fabricated / mismatched citation → low. The old `ts_rank_cd`-ratio metric was
 * mathematically broken (an all-AND numerator over a 10-OR denominator gave
 * ~0.004 even for verbatim copies, rejecting essentially every legitimate
 * citation) and was rewritten on 2026-05-28. The constant name is kept to avoid
 * churn across imports; it is now a containment floor, NOT a TF-IDF ratio.
 *
 * Empirically recalibrated 2026-05-28 (scripts/calibrate-citation-containment.ts)
 * over 1,161 real DB source texts (chapter notes + chapter_exclusions
 * source_note_text + tariff_lines descriptions). FAITHFUL citations (exact full
 * copies AND contiguous near-verbatim slices) scored containment = 1.000 at
 * EVERY percentile (min..max). FABRICATED citations (verbatim text taken from an
 * unrelated row) had median 0.119, P90 0.350. Threshold sweep:
 *     t=0.60 → faithful PASS 100.0%, fabricated REJECT 98.7%
 *     t=0.80 → faithful PASS 100.0%, fabricated REJECT 99.7%
 *     t=0.90 → faithful PASS 100.0%, fabricated REJECT 99.7%
 *
 * Chosen floor 0.80: passes 100% of faithful citations while rejecting 99.7% of
 * fabricated ones, sitting in the flat 0.80–0.90 optimum. We pick the LOW end of
 * that plateau so minor model-introduced typos / whitespace / hyphenation noise
 * in an otherwise-faithful copy do not trip a false reject. pg_trgm is NOT
 * installed on this DB (verified 2026-05-28), so token-set containment (pure JS,
 * no extension) is the metric rather than trigram similarity.
 */
export const CITATION_TFIDF_THRESHOLD = 0.8;

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
