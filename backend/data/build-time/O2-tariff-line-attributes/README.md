# O2 — Tariff Line Attributes Extraction (Opus 4.7 build-time)

Output target: `tariff_line_attributes` table (Postgres).

Structured product attributes for all 12,460 tariff_lines.
~30 fields: core arrays (material/form/function/intended_use/...) +
numeric composition (carbon_pct, chromium_pct, ...) + booleans + enums.

Specs:
- Base: [01-verifier-rules.md §tariff_line_attributes](../../../docs/sub-specs/01-verifier-rules.md)
- Expanded fields: [04-dsl-audit.md §O2 schema additions](../../../docs/sub-specs/04-dsl-audit.md)

Contents (when populated):
- `batches/ch-<NN>.jsonl` — per-chapter batched extraction outputs
- `validation-set-50.jsonl` — 50 hand-validated codes spanning Ch.39, Ch.72, Ch.85
- `merged.jsonl`
- `run-log.md`

Dependency: numeric composition fields (Ch.71-83) must ship before O1 claims for those chapters can be evaluated.
