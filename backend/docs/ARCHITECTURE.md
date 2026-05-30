> SUPERSEDED 2026-05-30 — earlier-phase document, kept for history. CURRENT STATE: see backend/docs/AUTONOMOUS-CONTINUATION-2026-05-29.md (START HERE block) and CLAUDE.md Current Status. v2 brain ~77% OUTRIGHT / ~86% top-3, Vertex-only (Cohere decommissioned), ship arc started (latency-first).

# ARCHITECTURE.md — Phase 4 Pipeline Spec (LOCKED v2)

**Status:** LOCKED v2 2026-05-26 (supersedes v1 2026-05-25 lock).
**Branch:** still on `feat/phase-3-arch-spike`; cut `feat/phase-4-pipeline-build` from this.
**Source-of-record for the v1 → v2 transition rationale:** `C:/Users/ASUS/.claude/plans/ultrathink-i-m-resuming-the-zesty-candle.md`.
**Source-of-record for design rationale (Phase 3 spike):** `backend/data/phase-3-spike-report.md`.
**Source-of-record for empirical proof (A9):** `backend/data/phase-3.5-audits/A9-regression-comparison.md`.

This is the contract Phase 4 implementers build against. Every locked decision below traces to spike traces, A9 empirical re-run, B2 live measurement, the v2 senior-engineer architecture audit (2026-05-26), or live Supabase DB inspection (2026-05-26) — no design is invented here.

---

## 0. Why this is v2 (and not just v1+patches)

v1 (2026-05-25) used same-family verify (V1+V2 both Gemini 3.5 Flash), prompt-level notes integration, free-form question generation, and assumed Cohere/Claude were credit-covered. v2 fixes five structural defects surfaced by adversarial audit + DB grounding:

1. **Same-family verify collapse** — V1+V2 share weights/tokenizer/training. Replaced with cross-MODEL tiebreak (Gemini 3.5 Flash Select → Gemini 3.1 Pro Tiebreak — different post-training, genuine 4-5pp divergence on reasoning-heavy items).
2. **Notes as prompt context only** — LLM can ignore notes in long prompts. Replaced with mechanical notes_claims predicate enforcement in the verifier.
3. **Free-form question generation** — LLM drifts into code-language options. Replaced with Question Generation Subsystem (QGS): offline attribute extraction + curated template library + runtime information-gain selection.
4. **Multi-destination cardinality silent truncation** — 102 of 1,505 exclusion rules redirect to 2-3+ chapters. Replaced with explicit collapse algorithm + backtrack gate.
5. **Cohere/Claude assumed credit-covered** — false. GDP Premium GenAI Credit is Gemini + Imagen only. Cohere = ~$200/mo cash (or substitute Gemini-rerank for $0 cash, slightly worse quality). Claude unavailable on this Vertex account (Indian SME reseller restriction). Runtime is **single-family Gemini, all credit-covered except Cohere**.

v2 also adds two new capabilities that v1 didn't have:
- **Active-learning flywheel** (Layer 8 case_law) — every classification provisionally cached; user confirmation promotes to authoritative; closes the no-Indian-rulings data gap.
- **Build-time Opus 4.7 jobs** via Claude Max subscription — one-time offline data engineering (notes_claims extraction, tariff_line_attributes, QGS templates, India alias map). Runtime stays all-Gemini.

---

## 1. Intent

Classify Indian-exporter product descriptions into 8-digit ITC-HS codes (6-digit fallback when DB-orphan), with `export_policy` + `policy_condition` surfaced on every CLASSIFY outcome. **Refuse rather than mis-classify under uncertainty.** Adapt to variable input quality (30-100% clarity); ask one sharpest question when ambiguous; surface verbatim legal evidence on every classification.

Pipeline shape: **Verified Cascade with Multi-Signal Synthesis (VCMS)** — a top-down tree walk over the 5-level hierarchy (Section → Chapter → Heading → Subheading → 8-digit), with per-stage Gemini calls, deterministic retrieval + rules, mechanical post-Select verifier, and cross-MODEL Gemini tiebreak on disagreement. Every decision uses multiple signals (retrieval scores + chapter notes + section notes + chapter_exclusions + GIRs + tariff_line_attributes + DGFT policy) with no single signal dominating.

---

## 2. Pipeline overview (8 layers)

```
┌─────────────────────────────────────────────────────────────────────┐
│ BUILD-TIME (offline, one-time + on DB updates) — Opus 4.7 / Max sub │
│   O1 Notes Claims Extraction    → notes_claims table                │
│   O2 Tariff Line Attribute Extraction → tariff_line_attributes table│
│   O3 QGS Template Library (~50 curated) → question_templates table  │
│   O4 India Alias Map (~200 entries) → tokenizer alias dict          │
│   O5 Confusing Pairs Documentation (8 known pairs)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (one-time at deploy + on DB updates)

┌─────────────────────────────────────────────────────────────────────┐
│ RUNTIME (per query) — all Gemini, all credit-covered (Cohere cash)  │
│                                                                      │
│ Layer 0  Input Normalization      (deterministic, no LLM)           │
│            • Apply India alias map (M.S.→mild steel, channa dal→…)  │
│            • Composite-product keyword detector (and, with, set)    │
│                                                                      │
│ Layer 1  TRIAGE                   (Gemini 3.5 Flash, thinking=low)  │
│            • CLASSIFY | ASK | REFUSE decision                       │
│            • Extract attributes + per-attribute confidence          │
│            • Emit head_nouns + raw_tokens (BOTH, not just lemma)    │
│            • Multi-turn state machine, 3-round ASK cap              │
│                                                                      │
│ Layer 2  HYBRID RETRIEVAL         (no LLM, deterministic)           │
│            • Cohere embed-v4 query embedding (~$0.60/mo cash)       │
│            • HNSW cosine top-K at chapter→heading→subheading→leaf   │
│            • PostgreSQL GIN-FTS on tariff_lines.fts_search_text     │
│            • GIN-FTS on chapter_exclusions.excluded_product_text    │
│              (underused pre-filter for Stage 3 work)                │
│            • Cohere Rerank 4 Fast → top-5 (~$200/mo cash)           │
│            • SHORTCUT: 60% of subheadings have 1 tariff_line child  │
│              → skip rerank for the leaf step                        │
│                                                                      │
│ Layer 3  RULES FILTER + COLLAPSE  (deterministic SQL)               │
│            • Apply chapter_exclusions per candidate                 │
│            • Multi-destination collapse: top-5 by rerank, log drops │
│            • If 0 survive: BACKTRACK GATE (re-enter L1, single shot)│
│                                                                      │
│ Layer 4  SELECT                   (Gemini 3.5 Flash, thinking=low)  │
│            • Level-by-level constrained enum (chapter→heading→8dig) │
│            • REQUIRED: selected_code + citation.primary             │
│              (note_id|exclusion_id+verbatim_text) + gir_applied     │
│              + export_policy + policy_condition + india_specific    │
│              + self_confidence                                      │
│            • GIR/Exclusion/Policy precedence matrix in prompt       │
│                                                                      │
│ Layer 5  MECHANICAL VERIFIER      (pure SQL+code, no LLM)           │
│            10 verifier rules including:                             │
│            • Code-exists DB check                                   │
│            • Exclusions completeness (all matching rules checked)   │
│            • Verbatim citation TF-IDF≥0.6 match against DB          │
│            • Per-GIR validator (gir-1..gir-6, each with own rule)   │
│            • Notes-conformance (notes_claims predicate evaluation)  │
│            • Cross-chapter section notes (Section XVI Note 2 etc.)  │
│            • Policy consistency vs chapter.export_licensing_notes   │
│            On PASS: emit + write provisional case_law               │
│            On FAIL: structured repair → Select loop (max 3)         │
│                                                                      │
│ Layer 6  TIEBREAK                 (Gemini 3.1 Pro, thinking=high)   │
│            Triggered: verifier fails 3× OR composite OR LOW conf    │
│            Different MODEL = genuine cross-model diversity          │
│            Goes through verifier again                              │
│                                                                      │
│ Layer 7  DEEP-THINK               (Gemini 3.1 Pro, thinking=high)   │
│            Triggered: Tiebreak verifier also fails                  │
│            Extended-thinking with full filtered knowledge pack      │
│            Output: AUTOCLASSIFY or REFUSAL                          │
│                                                                      │
│ Layer 8  ACTIVE LEARNING          (post-emit, no LLM)               │
│            • Every L4-L7 emission → provisional case_law            │
│            • User confirmation in wizard → authoritative            │
│            • Per-chapter coverage tracking                          │
│            • Low-coverage REFUSE for OOD queries                    │
│            • L1 case_law lookup added later when N≥1k confirmed     │
│                                                                      │
│ Question Generation Subsystem (QGS) — invoked from L1 ASK or        │
│ L4-L7 ambiguity. Computes info-gain per attribute across alive      │
│ candidates → looks up template → emits natural-language Q + opts.   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Per-layer I/O schemas

| Layer | Input | Output | Notes |
|---|---|---|---|
| 0 Normalization | `{query, previousAnswers}` | `{normalized_query, raw_tokens, composite_flag}` | Deterministic; ~10ms |
| 1 Triage | `{normalized_query, previousAnswers, q_budget_remaining}` | per `backend/prompts/triage-v2.md` schema | Multi-turn state object emitted alongside |
| 2 Retrieval | Stage 1 output | `{candidates[≤5], retrieval_scores, fts_matches, exclusion_pre_filter[]}` | No LLM |
| 3 Rules Filter | Stage 2 output | `{filtered_candidates[≤5], matched_exclusions[], dropped_log[], backtrack_signal: boolean}` | No LLM; multi-dest collapse here |
| 4 Select | filtered_candidates + chapter_notes + section_notes + matched_exclusions + applicable_GIRs + notes_claims_for_candidates + tariff_line_attributes_for_candidates + `current_year` + composite_flag | per `backend/prompts/select-v2.md` schema (REQUIRED: selected_code, citation.primary, citation.gir_applied, exclusions_checked[], export_policy, policy_condition, india_specific_flag, self_confidence) | Level-by-level constrained enum |
| 5 Verifier | Select output + full state | `{passed: boolean, failed_rules: VerifierRuleFailure[], repair_feedback: string}` | No LLM; 10 rule checks |
| 6 Tiebreak | Select output + verifier failures + extended context | Same schema as Select | Gemini 3.1 Pro, thinking=high |
| 7 Deep-Think | Full Layer 1-6 trace + filtered knowledge pack | AUTOCLASSIFY (Select schema) or REFUSAL | Gemini 3.1 Pro, extended thinking |
| 8 Active Learning | Final emission | provisional case_law row | No LLM |
| QGS | Candidate set + missing attributes | `{question_text, options[2-4], discriminating_attribute}` | Looks up curated template; runtime; no LLM |

Full prompt + schema text is canonical in the prompt files (`backend/prompts/triage-v2.md`, `select-v2.md`, `verify-tiebreak-v2.md`, `deep-think-v2.md`). This doc enumerates the contract only.

---

## 4. v2 deltas vs v1 (with database grounding from 2026-05-26 inspection)

### 4.1 Single-family runtime, multi-tier diversity within Gemini (✓ LOCKED 2026-05-26)

v1 assumed cross-family verify (Gemini Triage + GPT Select originally; degraded to all-Gemini under D1 lock with same-family carryforward). v2 confirms Claude/GPT unavailable on this Vertex account (Indian SME reseller restriction; empirically verified by user). Runtime is **all-Gemini**:
- **Triage + Select:** `gemini-3.5-flash` with `thinking_level=low`
- **Tiebreak + Deep-Think:** `gemini-3.1-pro-preview` with `thinking_level=high`

3.5 Flash vs 3.1 Pro provides genuine cross-model diversity (different post-training: 3.5 Flash is agent-tuned, 3.1 Pro is reasoning-tuned; 4-5pp divergence on reasoning-heavy benchmarks).

Per `@google/genai` SDK (the new unified SDK; legacy `@google-cloud/vertexai` is deprecated). `thinking_level` is the modern API ("minimal" | "low" | "medium" | "high"); do NOT mix with `thinkingBudget` integer in the same call (400 error). Setting `thinking_level=low` gives Triage real reasoning budget (fixes v1 thinking-budget-paradox: thinkingBudget=0 on a Triage stage with 250+ lines of decision trees).

### 4.2 Mechanical Verifier with notes_claims predicate enforcement (✓ LOCKED 2026-05-26)

v1 treated notes as prompt context — LLM could (and would) ignore them. v2 adds a **mechanical post-Select verifier** that runs 10 deterministic checks. Critically:

- **Notes Claims (Rule 7):** Offline Opus 4.7 extraction converts free-text chapter/section notes into structured predicates stored in `notes_claims` table. At Select-time, verifier evaluates predicates against the candidate's product attributes. Predicate FAIL → verifier FAIL → repair loop. This makes notes **constraints**, not just context.
- **Per-GIR validators (Rule 5):** Each of GIR 1, 2(a), 2(b), 3(a), 3(b), 3(c), 4, 5(a), 5(b), 6 has its own validator with semantic-specific checks (e.g., gir-3(a) requires ≥2 competing headings exist; gir-3(b) requires composite_flag set; gir-4 requires gir-1..gir-3 enumerated as having failed).
- **Verbatim citation (Rule 3):** `citation.primary.verbatim_text` must appear in the DB on the cited source. Fuzzy TF-IDF match ≥ 0.6 (accommodates paraphrased Indian descriptions). Catches hallucinated citations as eval signal.

See §6 for full verifier rule table.

### 4.3 Question Generation Subsystem (✓ LOCKED 2026-05-26)

v1 had Triage generate clarification questions free-form — LLM drifts into code-language ("Is this 8407 or 8408?") or generic options. v2 introduces **QGS** with three components:

1. **Offline `tariff_line_attributes`** — for each of 12,460 codes, structured product attributes extracted by Opus 4.7 with chapter notes context. Stored as JSONB.
2. **Curated `question_templates` library** — ~50 templates per attribute type, each with natural-language question + user-friendly `value_labels` mapping. Hand-curated against the 8 confusing-pair examples.
3. **Runtime discrimination** — when ambiguity arises (Triage insufficient OR Select competing candidates), QGS computes information gain per attribute, picks highest-IG attribute, looks up template, builds options from distinct candidate values. Guarantees: natural-language Q, 2-4 user-comprehensible options, provably disambiguating.

If no template exists for the highest-IG attribute → REFUSE with structured guidance ("please describe the [attribute]"). This is the "ask the right question with the right options" doctrine enforced architecturally.

### 4.4 Multi-destination exclusion collapse algorithm (✓ LOCKED 2026-05-26)

v1 deferred this as a carryforward. v2 specifies it: 102 of 1,505 chapter_exclusions have `redirects_to_chapter text[]` with multiple destinations (up to 11). Stage 3 algorithm:

1. For each surviving candidate after exclusion filter, attach its rerank score.
2. Sort by rerank score desc.
3. Take top-5; **log dropped candidates with their scores** for eval audit.
4. If `< 2` candidates survive after filter → set `backtrack_signal = true` → re-enter Stage 1 once with a constraint hint (`exclude chapter X; try Y, Z from redirects`).

Backtracking is **single-shot bounded** (not a loop) to prevent oscillation.

### 4.5 Multi-signal synthesis (✓ LOCKED 2026-05-26 — operative principle)

At every decision point, multiple signals contribute. Per-signal weight is tuned via prompt and verifier rules, not free-form LLM judgment:

| # | Signal | Layer |
|---|---|---|
| 1 | User description ↔ tariff_lines.description (semantic + lexical) | L2 |
| 2 | User attributes ↔ chapter/heading/subheading/leaf titles | L2, L4 |
| 3 | Chapter notes (positive constraints / definitions / inclusions) | L4 prompt, L5 Rule 7 |
| 4 | Section notes (cross-cutting; Section XVI Note 2 is load-bearing for Ch.84-85 parts) | L4 prompt, L5 Rule 8 |
| 5 | Subheading notes (rare — only 3 populated DB rows, but binding when present) | L4 prompt, L5 Rule 9 |
| 6 | Chapter exclusions (negative constraints + redirects) | L2 pre-filter, L3 filter, L5 Rule 2 |
| 7 | GIRs 1-6 (rule precedence resolver) | L4 prompt, L5 Rule 5 (per-GIR) |
| 8 | tariff_line_attributes (offline-extracted product attrs) | L4 prompt, L5 candidate matching |
| 9 | Export policy / policy_condition (India-specific output) | L4 REQUIRED output, L5 Rule 10 |
| 10 | india_specific_flag (7 subheadings; 217 more with wco_2022_match=false) | L4 REQUIRED output, L5 Rule 6 |

**No single signal dominates.** Each contributes to the final emission decision. If any signal is silent (notes don't speak to this product) or unreliable (subheading notes mostly empty), others compensate via the verifier's multi-rule pass. **Hard timeouts per stage** prevent stuck loops; **bounded clarification** (3-round cap) prevents infinite ASK.

### 4.6 Build-time Opus 4.7 jobs (✓ LOCKED 2026-05-26)

Per user's Claude Max subscription authorization: Opus 4.7 is used for one-time offline data engineering tasks where reasoning capacity matters most. These are NOT runtime calls (no API spend; Max subscription covers freely).

| Job | Input | Output | Estimated effort |
|---|---|---|---|
| O1 Notes Claims Extraction | All chapter notes (89/97 populated) + section notes (21/21) + sparse heading/subheading notes | `notes_claims` table with structured predicates | 1-2 days |
| O2 Tariff Line Attribute Extraction | All 12,460 tariff_lines + parent chain + chapter notes context | `tariff_line_attributes` table | 2-3 days |
| O3 Question Template Library | Curated against confusing pairs + chapter structure | `question_templates` library (~50 entries) | 2-3 days |
| O4 India Alias Map | Curated against common Indian English / Hindi terms | Alias dictionary (~200 entries) | 1-2 days |
| O5 Confusing Pairs Documentation | 8 known pairs (42/43, 09/21, 61/62, etc.) | Discriminating attributes per pair | 1 day |

Re-runs only when DGFT issues a tariff update OR when a chapter's notes change. The `pg_cron` + `pg_net` extensions are available (not installed) and provide a clean path for scheduled re-runs.

**O2 scope expansion (2026-05-26):** Per sub-spec 04 DSL audit, O2 must extract ~30 fields (was ~6): numeric composition percentages (carbon_pct, chromium_pct, manganese_pct, nickel_pct, silicon_pct, phosphorus_pct, aluminum_pct, boron_pct, cobalt_pct, copper_pct, lead_pct, molybdenum_pct, niobium_pct, titanium_pct, tungsten_pct, vanadium_pct, zirconium_pct, iron_pct) for metals (Ch.71-83), `predominant_element` for cast-iron-vs-steel discrimination (Ch.73), granule sieve fields (Ch.72 Note 1(h)), textile fields (made_up, fabric_construction), electrical flags (electrically_warmed, wearable, electrically_heated), chemical class (chemical_class, in_solution, solution_purpose), and intent fields (intended_role; SKIP-prone). Manual validation set: 50 codes spanning Ch.39, Ch.72, Ch.85 before bulk run.

### 4.7 Inherited from v1 (still LOCKED)

- **`tariff_lines.fts_search_text`** trigger-maintained denormalized column + GIN index `tariff_lines_fts_search_text_gin` (note: it's a trigger, not a generated column — parent-title changes need manual `refresh_fts_search_text()` call) ← v1 §4.1.
- **`chapter_exclusions.redirects_to_chapter text[]`** (102 multi-destination rules) — trigger-validated against chapters table ← v1 §4.2.
- **`sections.notes` JSONB** populated for all 21 sections — load-bearing for Section XVI / Section XVII cross-cutting ← v1 §4.3.
- **`chapter_exclusions` enrichment** to 1,505 rules (+352 from A1 Phase 3.5) ← v1 §4.4.
- **Stage 3 tsquery from `head_nouns_for_fts OR raw_tokens`** (NOT `websearch_to_tsquery(raw_query)`) ← v1 §4.5, extended with `raw_tokens` to mitigate v1 head-noun lemmatization brittleness.
- **6-digit subheading return permitted** when subheading has no 8-digit children ← v1 §4.6.
- **Select schema REQUIRES `export_policy` + `policy_condition`** (verbatim from DB row; never fabricate) ← v1 §4.7.

---

## 5. Model stack (D1 v2) (✓ LOCKED 2026-05-26)

All runtime LLM stages run on **Vertex AI Gemini** at region `global` via `@google/genai` SDK. Auth: service-account JSON at `backend/.gcp/vertex-sa.json` via `GOOGLE_APPLICATION_CREDENTIALS` env var.

**Vertex was renamed to "Gemini Enterprise Agent Platform" in 2026** — old `aiplatform.googleapis.com` endpoints still work; docs are migrating. `asia-south1` (Mumbai) serves Gemini-only.

| Layer | Model | Region | thinking_level | Cost/call (est) | Credit? |
|---|---|---|---|---|---|
| 0 Normalization | (none) | — | — | $0 | — |
| 1 Triage | `gemini-3.5-flash` | global | low | ~$0.00050 | ✅ GDP Premium |
| 2 Retrieval — query embed | Cohere embed-v4 (via `COHERE_API_KEY` env) | n/a | — | ~$0.000006 | ❌ cash (own Cohere billing) |
| 2 Retrieval — rerank | Cohere Rerank 4 **Pro** (via `COHERE_API_KEY` env) | n/a | — | ~$0.003 | ❌ cash (own Cohere billing) |
| 3 Rules Filter | (none) | — | — | $0 | — |
| 4 Select | `gemini-3.5-flash` | global | low | ~$0.0073 | ✅ GDP Premium |
| 5 Verifier | (none — pure code) | — | — | $0 | — |
| 6 Tiebreak | `gemini-3.1-pro-preview` | global | high | ~$0.020 (when triggered, ~10% of queries) | ✅ GDP Premium |
| 7 Deep-Think | `gemini-3.1-pro-preview` | global | high (extended) | ~$0.045 (when triggered, ~3%) | ✅ GDP Premium |
| 8 Active Learning | (none — DB write) | — | — | $0 | — |
| QGS | (none — template lookup) | — | — | $0 | — |
| Build-time O1-O5 | `claude-opus-4-7` via Max sub | n/a | — | $0 (subscription, one-time) | n/a |

**Modern API note:** Use `@google/genai` SDK (the new unified SDK), not legacy `@google-cloud/vertexai`. `thinking_level` enum is the modern API; do NOT mix with integer `thinkingBudget` in the same call (400 error). Default for 3.5 Flash = "medium"; we explicitly set "low" for cost; "high" reserved for Tiebreak + Deep-Think.

**Cohere via own API key (NOT Vertex):** Cohere is NOT on Vertex Model Garden AND NOT covered by GDP Premium GenAI Credit (confirmed via official SKU group page). Cohere is integrated via the project's own `COHERE_API_KEY` env var on Cohere's billing. Lock decision: use **Cohere Rerank 4 Pro** (specialist quality, best-in-class) for runtime rerank. At 100K queries/month: ~$0.60 query embedding + ~$300 rerank-Pro = **~$300/mo cash on Cohere's own billing**. User explicitly authorized "best models only" — Rerank Pro is the choice over Fast despite ~$100/mo delta. Gemini-rerank substitution remains as a fallback if cash pressure ever bites, but is not the default.

**Claude on Vertex:** technically GA on Vertex Model Garden (Sonnet 4.6, Opus 4.7, Opus 4.6) but functionally unavailable for this account due to Indian SME reseller restriction (Anthropic prohibits resale through certain GCP resellers). Do NOT plan around at runtime.

**Anthropic via Claude Max subscription (build-time only):** unrestricted Opus 4.7 / Sonnet 4.6 access via the user's Claude Max subscription (NOT via API key — there is no Anthropic API key in env). Used for ALL offline build-time jobs (O1-O5) and for the Claude Code conversation that produces this architecture, code, and prompts. NOT used at runtime — subscriptions are not deployable as a service.

**OpenAI via own API key (runtime escalation, ASK FIRST):** `OPENAI_API_KEY` is present in env. Available for runtime use ONLY with explicit user authorization. Default plan does NOT use OpenAI at runtime. Reserved as an authorized-on-request alternative if Gemini 3.1 Pro Tiebreak proves systematically wrong on a specific failure class (e.g., user could authorize GPT-5.4 mini as Tiebreak for that class).

---

## 6. Mechanical Verifier — the 10 rules (✓ LOCKED 2026-05-26)

The verifier runs after every L4 Select emission (and L6 Tiebreak emission). Pure SQL+TypeScript, no LLM. Each rule fails → `failed_rules[]` populates with structured feedback; L4 loops with the feedback up to 3 times; on the 4th attempt → escalate to L6 Tiebreak.

```
Rule 1 — Code existence
  Check: SELECT 1 FROM tariff_lines WHERE code = selected_code
  Fail mode: hallucinated code (Vertex guarantees schema syntax, NOT catalog membership)

Rule 2 — Exclusions completeness
  Pre-filter chapter_exclusions via GIN-FTS on excluded_product_text:
    SELECT id, source_chapter, ... FROM chapter_exclusions
    WHERE source_chapter = candidate.chapter
      AND to_tsvector('english', excluded_product_text)
          @@ to_tsquery('english', head_nouns | raw_tokens)
  Check: every matching exclusion is in selected.exclusions_checked[]
  Fail mode: LLM didn't see / acknowledge a fired exclusion

Rule 3 — Verbatim citation
  Check: citation.primary.verbatim_text appears in DB text at cited source
    (chapter_id|section_id|exclusion_id|note_number → resolve to DB row)
  Match: fuzzy TF-IDF ≥ 0.6 (accommodates paraphrased Indian text)
  Fail mode: fabricated citation

Rule 4 — Embedding cosine floor
  Check: cosine(tariff_lines.embedding[selected_code], query_embedding) ≥ 0.55
  Fail mode: retrieval-poisoned selection

Rule 5 — Per-GIR validator
  Dispatch on citation.gir_applied:
    'GIR-1':    must cite chapter/section note (not just heading text)
    'GIR-2(a)': product must be marked incomplete/unfinished in attrs
    'GIR-2(b)': mixture/composite — composite_flag must be set
    'GIR-3(a)': ≥2 competing headings must exist in alive_set with overlap
    'GIR-3(b)': composite_flag set; ≥2 components enumerated in reasoning
    'GIR-3(c)': enumerate which gir-3(a) and gir-3(b) failed
    'GIR-4':    enumerate which gir-1..gir-3 failed; cite analogy
    'GIR-5(a)': fitted case/container scenario; product must be packaging
    'GIR-5(b)': packing material scenario; product must be packaging
    'GIR-6':    only between same-level subheadings; both must exist
  Fail mode: GIR claimed but semantic preconditions absent

Rule 6 — india_specific consistency
  Check: india_specific_flag == subheadings.india_specific WHERE code = selected_code
  Fail mode: missed Indian-specific subheading flag

Rule 7 — Notes-Conformance (chapter notes)
  For each notes_claim WHERE applies_to ∋ candidate.chapter
    AND claim_type IN ('inclusion','definition','condition'):
    Evaluate predicate against tariff_line_attributes[candidate.code]
    Fail → repair feedback with quoted claim
  Fail mode: candidate violates a chapter note constraint

Rule 8 — Cross-chapter Section Notes
  For each notes_claim WHERE source = 'section:X'
    AND X covers candidate.chapter:
    Evaluate predicate (Section XVI Note 2 — "parts and accessories" rules — is the canonical case)
  Fail mode: cross-cutting section rule violated

Rule 9 — Subheading Notes
  For each notes_claim WHERE source = 'subheading:X'
    AND X = candidate.subheading:
    Evaluate predicate
  Fail mode: narrow subheading constraint violated (rare; only 3 populated)

Rule 10 — Policy Consistency
  Check: export_policy == DB row's export_policy
  Check: policy_condition does NOT contradict chapter.export_licensing_notes
  Fail mode: fabricated or wrong policy text
```

**Predicate DSL (for notes_claims):**

```typescript
type Predicate =
  | { op: '=='|'!='|'>'|'<'|'>='|'<='; var: string; value: string|number|boolean }
  | { op: 'IN'|'NOT_IN'; var: string; values: (string|number)[] }
  | { op: 'AND'|'OR'; clauses: Predicate[] }
  | { op: 'NOT'; clause: Predicate }
  | { op: 'IMPLIES'; antecedent: Predicate; consequent: Predicate }
  | { op: 'EXISTS'; var: string };
```

Evaluator: ~150 lines TypeScript. Extraction job (O1) is the harder part — Opus 4.7 with a 50-claim manual validation set.

---

## 7. Failure modes + escalation contracts

| Failure | Trigger | Handling |
|---|---|---|
| Triage REFUSE | L1 `decision: "REFUSE"` | Return refusal payload. No retrieval. |
| Triage ASK | L1 `decision: "ASK"`, Q-budget > 0 | QGS generates the question with structured options; surface to user; on reply, re-enter L1 with `previousAnswers++`. **3-round cap** (was 2). |
| Triage ASK + Q-budget = 0 | Triage wants to ASK but no budget | Triage forces REFUSE with `out_of_scope_class: "function_only_no_substance"`. |
| Triage invalid JSON | rare | Retry once at temp=0.0; if still invalid → REFUSE with `out_of_scope_class: "incoherent_query"`. |
| Retrieval 0 candidates | All cosine + FTS empty after rules filter | Backtrack gate (L3) fires once; if still 0 → escalate to L7 Deep-Think. |
| Select hallucinated code | `selected_code ∉ candidates` | Verifier Rule 1 fails; repair feedback to L4; loop max 3. |
| Select 6-digit | `selected_code_is_six_digit=true` (no 8-digit children in DB) | Authorized path (e.g., 3301.22 jasmine essential oil); verifier passes; emit at 6-digit. |
| Select REFUSE | `selected_code: null` | Return refusal to user. No L6 unless caller explicitly opts in. |
| Verifier fail × 3 | L4 + L5 loop exhausted | Escalate to L6 Tiebreak. |
| Tiebreak verifier fail | L6 + L5 also failed | Escalate to L7 Deep-Think. |
| Deep-Think AUTOCLASSIFY | L7 returns Select-shaped output | Surface with `escalated_to_deep_think: true`. |
| Deep-Think REFUSE | L7 cannot defend any answer | Return refusal. No further escalation. |
| QGS no template | Highest-IG attribute has no `question_templates` entry | REFUSE with structured guidance ("please describe [attribute]"). |
| Vertex 5xx | Provider error | Exponential backoff retry (max 3); if persistent, surface system-error to user (NOT a misclassification). |
| Cohere down | Rerank API unavailable | Fall back to raw retrieval scores (no rerank); flag in audit log. |

---

## 8. `previousAnswers` schema (✓ LOCKED 2026-05-26)

Unchanged from v1: `previousAnswers: Record<questionId: string, answerId: string>` where both match `^[a-z][a-z0-9_]*$`. Max 3 entries (Q-budget = 3, up from 2 in v1). Triage replay rule: fold each as binding fact into `extracted_attributes`; do not re-ask.

QGS provides the `questionId` (template ID) and `answerId` (selected option ID).

---

## 9. Refusal contract (✓ LOCKED 2026-05-26)

The system MUST refuse (rather than guess) under any of:

1. **Triage out-of-scope** — `out_of_scope_class ∈ {extraterrestrial, fictional, services_not_goods, contraband, weapons_restricted_class, function_only_no_substance, incoherent_query}` (per `triage-v2.md` Rule 1).
2. **Triage Q-budget exhausted** — 3 ASK rounds used; REFUSE with `out_of_scope_class: "function_only_no_substance"`.
3. **Select unfaithful** — no candidate is a faithful classification → `selected_code: null` + `refusal.reason`.
4. **QGS no template** — when ambiguity needs clarifying but no template for the discriminating attribute → REFUSE with structured guidance.
5. **L7 Deep-Think refusal** — no defensible answer.
6. **L8 Low-coverage flag** (post-MVP) — query falls outside trained case_law distribution; refuse rather than guess.

Refusal payload (minimum):
- `decision: "REFUSE"`
- `refusal_reason: string` (one-sentence diagnostic)
- `out_of_scope_class: string | null`
- `escalation_path: string[]` (stages traversed)
- `verifier_failures: VerifierRuleFailure[]` (when refusal was verifier-triggered)
- HTTP semantics: 200 OK with refusal in body (NOT 4xx).

---

## 10. Phase 4 prompt iteration cycle

`triage-v2.md`, `select-v2.md`, `verify-tiebreak-v2.md`, `deep-think-v2.md` are **seed drafts**, not final. Phase 4 iterates against the canonical `backend/src/eval/` harness (~386-case master suite — see §11):

1. Run `npm run eval` (master suite) — or `eval:quick` during tight loops.
2. Group failures via `analyze-failures.ts` by stage and failure mode (Triage routing wrong, Select picked wrong sibling, Verifier over-rejected, etc.) + per-chapter via `measure-brain-chapters.ts`.
3. Update one prompt at a time; tag the new version (`triage-v3.md`); do not overwrite previous. Fix the ROOT CAUSE, never a per-case patch.
4. Re-run; use `compare.ts` to diff vs the prior run; accept when ≥80% of the targeted class resolves AND no regression > 2 cases elsewhere.
5. Lock prompts at Phase 4 exit (targets in §14.4 — measured on the master suite).

Prompts and eval cases are the contract; the runtime (`backend/src/classifier-v2/`) is the iterable artifact.

---

## 11. Eval infrastructure (B1) — CORRECTED 2026-05-28

**Canonical eval system: `backend/src/eval/`** (the active, real-classifier-wired harness — NOT the frozen `backend/eval/` Phase-1 stub; see note).
- **Runner:** `backend/src/eval/runner.ts` (`npm run eval` / `eval:quick` / `--category X`); reads `test-suites/master-suite.ts` (~386 cases: 351 classify / 30 ask / 5 reject) + `quick-suite.ts`.
- **Scoring:** `scorer.ts` — routing 3×3 confusion matrix + classification (chapter 40% / heading 30% / code 30% weighted) + question-quality (0–2). Output: `backend/eval-results/{run_id}.json`.
- **Tooling (build on, do not recreate):** `compare.ts` (before/after diff), `analyze-failures.ts` (failure taxonomy), `measure-brain-chapters.ts` (per-chapter accuracy), `gt-fix/` (ground-truth QA: validate codes vs DB, fill missing GT, flag LLM cases).
- **Wiring v2:** `runner.ts` currently imports legacy `../classifier`. Phase 4 introduces `backend/src/eval/v2-adapter.ts` exporting `classifyForEval()` which calls v2 `classify()` and maps `ClassifyResult → ClassificationResult` (`mapV2ToLegacy`), so the entire scorer/compare/analyze stack works unchanged. `runner.ts` changes only its import.

> **Note — `backend/eval/run-eval.ts` + `cases.json` (168) is a FROZEN Phase-1 artifact** (stub runner; deprecated 2026-05-28 — see `backend/eval/DEPRECATED.md`). Retained only as a candidate source of cases to merge into the master suite. **Do NOT wire v2 there.**

---

## 12. Open carryforwards (track post-Phase-4)

| # | Item | Source | Severity | Resolves in |
|---|---|---|---|---|
| 1 | 5 borderline multi-destination chapter_exclusions rows pending review | A1-multidest-sweep.md | Low | Phase 5 |
| 2 | 6 pre-existing OCR data quirks | A8 finding | Low | Phase 5 data cleanup |
| 3 | 454 empty-subheading-title rows (cosmetic) | A8 finding | Cosmetic | Phase 5 |
| 4 | `policy_conditions` sidecar table empty | CLAUDE.md known issue | UX | Phase 8 (frontend) |
| 5 | `tariff_lines.unit` column 100% NULL | DB inspection 2026-05-26 | M3 blocker | M3 trade-intelligence |
| 6 | `policy_condition` unreliable (1,104/12,460 populated, truncated mid-sentence) | DB inspection 2026-05-26 | Phase 5 | Phase 5 data refresh from DGFT |
| 7 | 217 subheadings have `wco_2022_match=false` without rationale text | DB inspection 2026-05-26 | Low | Phase 5 data backfill |
| 8 | Legacy `backend/src/rules/chapter-rules.ts` | Spike §Phase 2 fixes | Replaced by Phase 4 rebuild | Phase 4 |
| 9 | Cohere on Vertex unavailable / not credit-covered | Vertex availability research 2026-05-26 | Long-horizon | 2027+ (substitute Gemini rerank if Cohere $200/mo pinches budget) |
| 10 | Claude on Vertex blocked by Indian SME reseller restriction | Vertex availability research 2026-05-26 | Out-of-scope | Long-horizon (re-link billing through different reseller if ever needed) |
| 11 | `pg_cron` + `pg_net` extensions available but not installed | DB inspection 2026-05-26 | Nice-to-have | Phase 5 (for scheduled offline-job re-runs) |
| 12 | Post-credit-expiry OSS hybrid cutover plan | `D1-opensource-research.md` | Long-horizon | 2027 |

**Resolved from v1:** Carryforwards #8 (same-family verify) and #9 (Claude on Vertex) are no longer open — addressed by cross-MODEL Gemini diversity (3.5 Flash vs 3.1 Pro) and acknowledgment that Claude is unavailable on this account.

---

## 13. References

- Architecture decision log (v1→v2 transition): `C:/Users/ASUS/.claude/plans/ultrathink-i-m-resuming-the-zesty-candle.md`
- Phase 3 spike report: `backend/data/phase-3-spike-report.md`
- Phase 3.5 plan: `C:/Users/ASUS/.claude/plans/bubbly-foraging-catmull.md`
- A9 empirical proof: `backend/data/phase-3.5-audits/A9-regression-comparison.md`
- B2 Cohere Rerank live-test: `backend/data/phase-3.5-prompts/B2-cohere-rerank-test.md`
- T17 credit-coverage test: `backend/data/phase-3.5-prompts/T17-credit-coverage-test.md`
- D1 open-source post-credit plan: `backend/data/phase-3.5-prompts/D1-opensource-research.md`
- Triage prompt: `backend/prompts/triage-v2.md` (was `triage-v1.md`)
- Select prompt: `backend/prompts/select-v2.md` (was `select-v1.md`)
- Tiebreak prompt: `backend/prompts/verify-tiebreak-v2.md` (was `verify-router-v1.ts`)
- Deep-Think prompt: `backend/prompts/deep-think-v2.md` (new)
- Eval skeleton: `backend/eval/run-eval.ts`
- Project context: `CLAUDE.md` (root)
- SDK migration notes: `backend/docs/SETUP-vertex-service-account.md`

---

## 14. Phase 4 v2 next steps (handoff to implementer)

The Phase 3.5 exit gate is GREEN; Phase 4 v2 architecture is LOCKED 2026-05-26. **DO NOT proceed to implementation until the user explicitly authorizes.** The locked-architecture deliverable is the documentation + plan; implementation is the next gate.

Build sequence under v2:

### Required reading for implementers (added 2026-05-26 post-recon)

Before implementing any Phase 4 layer, read the relevant sub-spec:

- `backend/docs/sub-specs/01-verifier-rules.md` — Mechanical Verifier Rules 3, 5, 7/8/9 + Predicate DSL evaluator
- `backend/docs/sub-specs/02-qgs-and-backtrack.md` — QGS info-gain formula + backtrack constraint hint schema
- `backend/docs/sub-specs/03-thinking-level.md` — `thinking_level` naming + model-conditional helper for 2.5-pro vs 3.x
- `backend/docs/sub-specs/04-dsl-audit.md` — Predicate DSL expressiveness audit + O2 schema additions
- `backend/docs/sub-specs/05-vertex-model-id.md` — `gemini-3.1-pro-preview` correct ID + fallback strategy

### Implementation status as of 2026-05-27

**Branch:** `feat/phase-4-pipeline-build` (uncommitted; significant work in tree)

**Phase 4.0 build-time data:**
- O1 Notes Claims: COMPLETE — 253 rows ingested into `notes_claims` table (50 validated=true sampled).
- O2 Tariff Line Attributes: PARTIAL — Ch.01 only extracted to JSON (44/12,460 codes). DB table empty. 35-agent rolling-cadence dispatch plan saved on Task #28; resumes on user signal post-limit-reset.
- O3 Question Templates: COMPLETE — 51 rows ingested into `question_templates` table; all 8 confusing pairs covered.
- O4 India Alias Map: COMPLETE — 299 entries on disk at `backend/data/build-time/O4-india-alias-map/aliases.json` (consumed by L0 at runtime).
- O5 Confusing Pairs: COMPLETE — 8 pairs documented at `backend/data/build-time/O5-confusing-pairs/`.

**Phase 4.1 runtime layers (L0-L5): COMPLETE — 302/302 vitest passing**
- L0 Normalization, L1 Triage, L2 Hybrid Retrieval, L3 Rules Filter, L4 Select, L5 Mechanical Verifier all implemented under `backend/src/classifier-v2/layers/`.
- Shared libs: vertex-client (raw HTTPS + retry + MaxTokensError), cohere-client, supabase-client (with withRetry), thinking-config (model-conditional), predicate-evaluator (three-valued), source-ref-resolver, tfidf-citation-check, verifier-constants.
- 5 Supabase migrations applied (`20260526120000`-`20260526120400`): notes_claims, tariff_line_attributes (41 cols), question_templates, TLA additional GIN indexes, chemical_class enum extension.

**Phase 4.2 remaining:** QGS wiring only (info-gain computation + template lookup for L1 ASK path). L3, L4, L5 from the original Phase 4.2 plan below are done.

**Phase 4.3, 4.4:** unchanged from original plan — pending.

**Continuation prompt for fresh session:** `backend/docs/PHASE-4-CONTINUATION-PROMPT.md`.

---

### Phase 4.0 — Build-time offline jobs (Opus 4.7 via Max subscription) — ~5-7 days
1. **O1 Notes Claims Extraction** → populate `notes_claims` table
2. **O2 Tariff Line Attribute Extraction** → populate `tariff_line_attributes` table
3. **O3 Question Template Library** → populate `question_templates` table (curated)
4. **O4 India Alias Map** → populate alias dictionary
5. **O5 Confusing Pairs Documentation** → discriminating attributes per pair

### Phase 4.1 — Runtime skeleton — ~1 week
6. **Cut branch:** `git checkout -b feat/phase-4-pipeline-build` off `feat/phase-3-arch-spike`
7. **`backend/src/classifier-v2/index.ts`** entry point + Vertex client setup (`@google/genai`, `thinking_level` wiring, response_schema)
8. **L0 Normalization** module (deterministic, fast)
9. **L1 Triage** wiring with `triage-v2.md` prompt (refined from v1)
10. **L2 Hybrid Retrieval** wiring (reuses Phase 3.5 work; adds GIN-FTS on exclusions pre-filter)

### Phase 4.2 — Decision + verification — ~1 week
11. **L3 Rules Filter** + multi-destination collapse algorithm + backtrack gate
12. **L4 Select** with `select-v2.md` prompt (level-by-level constrained enum)
13. **L5 Mechanical Verifier** (10 rules, including notes_claims predicate evaluator)
14. **QGS** wiring (template lookup + info-gain calc)

### Phase 4.3 — Escalation + integration — ~1 week
15. **L6 Tiebreak** (Gemini 3.1 Pro, thinking=high)
16. **L7 Deep-Think** with `deep-think-v2.md` prompt
17. **L8 Active Learning** write-back (provisional case_law, confirmation hooks for wizard)
18. **Rewire `backend/src/api/classify.ts`** to call classifier-v2 (AFTER the eval gate passes — never replace the running classifier with an unvalidated one)
19. **Wire v2 into `backend/src/eval/runner.ts`** via a new `src/eval/v2-adapter.ts` (`classifyForEval` → `mapV2ToLegacy`); the ~386-case master suite is canonical. (`backend/eval/run-eval.ts` is the FROZEN 168-case Phase-1 artifact — do NOT use; see §11.)

### Phase 4.4 — Eval + iteration — ~1-2 weeks
20. **First eval gate:** ≥80% chapter-match correctness on the ~386-case master suite. Segment failures by chapter + failure-mode class (`analyze-failures.ts`, `measure-brain-chapters.ts`).
21. **Iterate prompts** on weak chapters (orchestrator-quality-cycle: implementer → spec-reviewer → quality-reviewer).
22. **Target at Phase 4 exit:** ≥85% chapter / ≥75% heading / ≥70% code; cost ≤$0.012/query mean; latency ≤8s p95.

**Total estimated Phase 4 effort:** ~4-5 weeks. Build-time jobs (Phase 4.0) can run in parallel with runtime skeleton (Phase 4.1).

**STOP-AND-SURFACE triggers during Phase 4:**
- Mean cost exceeds $0.015/query → review pricing assumptions
- Tiebreak triggered on >20% of queries → review Select prompt
- Verifier Rule 7 (notes-conformance) fails on >30% of cases → review notes_claims extraction quality
- Cohere $200/mo cash creates budget pressure → review substitute-Gemini-rerank decision
- Any verifier rule fails identically across many cases → architectural review (not prompt iteration)
