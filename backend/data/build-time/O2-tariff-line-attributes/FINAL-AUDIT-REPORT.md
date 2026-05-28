# O2 — `tariff_line_attributes` Final Audit Report (F6)

**Date:** 2026-05-28
**Job:** O2 — build-time extraction of structured classification attributes for every Indian ITC-HS 8-digit tariff line.
**Scope:** 12,406 records = 12,362 across 41 canonical chunks (`chunks/output/`) + 44 Ch.01 base (`extracted-attributes.json`). The 54 held-out gold-validation codes are intentionally NOT in this corpus.

## OVERALL VERDICT: ✅ INGESTED & VERIFIED (2026-05-28)

All six audit gates pass. The corpus was ingested to `tariff_line_attributes` (**12,406 rows**) and independently verified via MCP (see §Ingest result). Five defects were found and fixed across the finale + ingest (details in §7) — **none reached the database** (the ingest is atomic; the one mid-ingest failure rolled back to 0 rows before the fix).

---

## F1 — Corpus integrity (`o2-aggregate-and-ingest.ts --dry-run`)

| Check | Result |
|---|---|
| Total records merged | **12,406** (44 base + 12,362 chunk) |
| Chunks complete | **41 / 41** |
| Record-count vs `plan.json` | every chunk **OK** (actual == `code_count_in_scope`) |
| JSON validity / all 42 fields present | PASS |
| Type conformance | **0 errors** |
| DB CHECK-enum conformance (added this session) | **0 violations** |
| Validation-set leaks | **0** |
| Duplicate codes | **0** |

Confidence distribution: HIGH 9,657 (77.8%) · MEDIUM 2,725 (22.0%) · LOW 24 (0.2%) · OTHER 0.

## F2 — Templating forensics (`o2-f2-templating-forensics.js`)

- Corpus signature-diversity: **94.9%** (well above the templating-failure regime).
- Cross-chunk duplicate notes: **0**.
- Chunks below 70% diversity: **0** (lowest individual chunk 93.7%).
- Flagged: 6 large cross-heading clusters (>3 records) — judged **structural HS convergence** (e.g. electronics parts 8538–8543; male/female garment heading pairs 6101/6102), NOT templating. Accepted.

## F3 — Gold-standard accuracy (`o2-f3-gold-comparison.js`)

Blind re-extraction of the 54 held-out validation codes, compared to `validation-set-50.json` without sight of gold:

- Mean enum-agreement: **95.5%** (464/486)
- Mean array-Jaccard: **0.620** (vs templating-failure band 0.12–0.24)
- Coverage gaps: **none** (all gold codes present in blind extraction)

**Interpretation:** the 22 disagreements are overwhelmingly **production being RICHER than gold** — production correctly set `wearable=true` (7), `fabric_construction="woven"` (4), `made_up=false` (4), and `intended_role` packaging/support where the older/sparser gold left null. Only ~3 cases show gold richer (2× `intended_role="technical_use"` on complex instrument parts; 1× `chemical_class` specificity) — and all are held-out codes, not in the ingest corpus. Net: production quality ≥ gold.

## F4 — Per-chunk independent audits

All **41 chunks** were independently F4-audited PASS in the prior session (adversarial re-audit by separate Opus agents, not self-reports). **3 defects** were caught by these independent audits and fixed in the data:
1. **BIG-72a** — invented `chromium_pct=52` → null.
2. **BIG-84a** — 14 refrigeration codes wrongly `electrically_heated=true` (orchestrator prompt error) → null.
3. **SM-12** — 11 aircraft/arms parts `intended_role="part"` (invalid enum) → null.

> **Honest note:** the F4 audit *report files* referenced as `chunks/audits/F4-*.md` are **not present on disk** in this repo state — they were not persisted from the prior session. The F4 *fixes* are confirmed applied: this session's corpus-wide independent enum check (§F1) returns CLEAN on all four constrained fields, which directly verifies the SM-12 "part" fix and the absence of any other enum violation. Recommend regenerating/persisting F4 reports if a written audit trail is required for the record.

## F5 — Normalization decisions (user-approved 2026-05-28)

| # | Decision | Choice | Action |
|---|---|---|---|
| 1 | `chemical_class="other"` (977 recs, 13 chemical chapters) | **Keep** | none — valid enum, semantically correct (preparations/mixtures, not separate compounds) |
| 2 | `intended_role` enrichment (packaging/support/technical_use) | **Keep** | none — F3-confirmed more correct than gold |
| 3 | `wearable` / `fabric_construction` / `made_up` enrichment | **Keep** | none — F3-confirmed more correct than gold |
| 4 | `"OEM-component"` token in `intended_use[]` (55 recs) | **Drop token** | removed exactly `"OEM-component"` from 55 records (BIG-85a:53, BIG-85b:2); other `-component` tokens (bearing/circuit/etc.) preserved |
| 5 | `predominant_element="Si"` (1 rec) | **Normalize** | → `"silicon"` in SC-38 (1 record) |
| 6 | Benign identical-note sibling pairs (2933.39.29/.90; 6403.51.19/.90) | **Leave** | none — notes are accurate for both residual siblings |

Applied via `scripts/o2-f5-normalize.js`. Post-normalization re-verification: F1 still 12,406/0 errors; `OEM-component`=0; no symbol-like `predominant_element`; all enums CLEAN.

## §7 — Defects found & fixed during this finale (2026-05-28)

The prior session's "verified" state was confirmed *by file-glob*, which masked two issues on the actual ingest path. Both fixed:

1. **Ingest-script type bug** — `o2-aggregate-and-ingest.ts` classified `fabric_construction` as `boolean`, but the DB column is `text` (CHECK ∈ knitted/crocheted/woven/wadding/other). The extraction data ("woven") was correct; the script was wrong. F1 was failing on 1,238 textile records. **Fix:** moved field to the string-nullable set. Also **hardened the dry-run to enforce all DB CHECK enums** (chemical_class, fabric_construction, intended_role, solution_purpose, validation_status), so any bad vocab is caught pre-ingest rather than mid-transaction.
2. **Chunk-filename drift** — 8 single-chapter chunks were committed as `BIG-NN.json` but `plan.json` (canonical chunk identity) names them `SC-NN`; the aggregator keyed off the plan and silently skipped them (only 10,497/12,406 loaded). Verified each `BIG-NN` file contains exactly its `SC-NN` planned chapter+count, then `git mv`'d the 8 files to match the plan. The naming convention (single, unsplit chapter = `SC-`) confirms `SC-NN` is correct.
3. **Diff-hygiene** — the F5 normalize script's parse→re-stringify reformatted SC-38 (its arrays were stored compactly), producing a 13K-line diff for a 1-char change. Restored SC-38 to committed formatting and re-applied the `Si`→`silicon` edit surgically (final diff: 1 line).
4. **DB connection (ingest-time)** — the ingest script used `DIRECT_URL`, which fails auth (`28P01`): it carries the pooler-style username `postgres.<ref>` against the *direct* host `db.<ref>.supabase.co:5432`, which Postgres rejects. A read-only probe (`scripts/o2-db-probe.js`) confirmed the pooled `DATABASE_URL` (Supavisor, 6543) connects fine. **Fix:** script now prefers `DATABASE_URL`.
5. **jsonb serialization (ingest-time)** — node-postgres serializes a JS array parameter as a Postgres array literal, not JSON, so `composite_components` (jsonb array-of-objects) failed at INSERT (`invalid input syntax for type json`); the atomic transaction rolled back with 0 rows. **Fix:** `buildRowParams` now `JSON.stringify`s the jsonb field (TEXT[] columns untouched). Post-ingest `jsonb_typeof` confirms 10 arrays + 10 objects stored correctly.

> **Follow-up (non-blocking):** the ingest/probe use `ssl: { rejectUnauthorized: false }` (pre-existing). For a build-time job to Supabase this is low-risk, but proper TLS (Supabase CA / `verify-full`) is the correct hardening.

## Field population (informational)

| Field group | Set | % |
|---|---|---|
| `extraction_notes` | 12,406 / 12,406 | 100.0% |
| `chemical_class` | 2,371 / 12,406 | 19.1% |
| any metal `*_pct` | 36 / 12,406 | 0.3% |
| `composite_components` | 20 / 12,406 | 0.2% |

`chemical_class` breakdown: null 10,035 · separate_organic_compound 1,029 · other 977 · separate_inorganic_compound 335 · diazonium_salt 16 · isomer_mixture 7 · sugar_derivative 7.

## Ingest result (2026-05-28) — ✅ COMPLETE

- Ran `npx tsx scripts/o2-aggregate-and-ingest.ts --ingest` over the pooled `DATABASE_URL` (batched upsert `ON CONFLICT (code) DO UPDATE`, single transaction). `extraction_confidence` dropped (not a DB column).
- **Committed 12,406 rows.** Independent MCP verification: total=12,406 · distinct codes=12,406 · orphan-FK=0 · composite_components=20 (10 array + 10 object jsonb) · chemical_class="other"=977 · OEM-component remaining=0 · predominant_element="Si" remaining=0 · fabric_construction populated=1,524.
- The 54 held-out gold codes have no attributes row (intended; preserves gold integrity).
