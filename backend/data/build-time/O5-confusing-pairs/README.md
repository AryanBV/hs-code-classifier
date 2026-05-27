# O5 — Confusing Chapter Pair Discriminators (Opus 4.7 build-time)

Output target: per-pair discriminator docs consumed at Triage/Tiebreak time
(8 confusing chapter pairs from `backend/src/data/confusing-chapter-pairs.ts`).

Each doc gives the decisive question + answer-to-chapter mapping for a known
confusable pair (e.g., 42 leather vs 43 fur, 61 knitted vs 62 woven,
09 raw vs 21 instant coffee).

Spec: see ARCHITECTURE.md §6 (Tiebreak), §14 (build-time jobs).

Contents (when populated):
- `pair-<A>-<B>.md` — one file per confusing pair
- `merged.json` — combined index consumed by the runtime
- `run-log.md`
