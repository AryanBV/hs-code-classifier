# O4 — India Alias Map (Opus 4.7 build-time)

Output target: JSON file consumed by Layer 0 Input Normalization.

Maps India-specific product terms / Hindi-English mixed terms / regional names
to canonical English HS terminology.

Spec: see ARCHITECTURE.md §4.1 (Layer 0 Input Normalization).

Contents (when populated):
- `aliases.json` — canonical map { alias: canonical_term, source, confidence }
- `drafts/` — Opus extraction drafts
- `run-log.md`

L0 Input Normalization (backend/src/classifier-v2/layers/L0-normalization.ts) reads from `aliases.json` — keep the filename in sync.
