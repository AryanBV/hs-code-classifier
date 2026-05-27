# O3 — Question Templates Curation (Opus 4.7 build-time)

Output target: `question_templates` table (Postgres).

Curated QGS templates keyed by discriminating attribute (material, form, function, intended_use,
processing_state, composition + sub-spec 04 additions where relevant).

Spec: [02-qgs-and-backtrack.md §A.7](../../../docs/sub-specs/02-qgs-and-backtrack.md)

Contents (when populated):
- `drafts/` — first-pass templates from Opus
- `curated.jsonl` — post-review final set
- `run-log.md`
