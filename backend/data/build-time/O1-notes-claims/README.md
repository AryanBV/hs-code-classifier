# O1 — Notes Claims Extraction (Opus 4.7 build-time)

Output target: `notes_claims` table (Postgres).

Stores predicate-DSL-encoded claims extracted from chapter, section, heading, and subheading notes.
Used by Verifier Rules 7/8/9 (notes-conformance).

Spec: [01-verifier-rules.md](../../../docs/sub-specs/01-verifier-rules.md)

Contents (when populated):
- `raw/<chapter>.jsonl` — per-chapter raw Opus extraction outputs
- `validation-set/` — the 50-claim hand-validated set (gold standard)
- `merged.jsonl` — final pre-DB merge
- `run-log.md` — per-batch invocation log

Loaded via `scripts/load-notes-claims.ts` (TBD by O1 executor).
