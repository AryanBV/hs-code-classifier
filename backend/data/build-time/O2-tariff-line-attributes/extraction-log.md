# O2 Re-Run — Extraction Log (Opus 4.7 LLM Reasoning)

**Run start:** 2026-05-27
**Model:** claude-opus-4-7 (via Claude Code Max subscription — own reasoning)
**Mandate:** Per-code genuine LLM reasoning over all 12,460 tariff_lines

## Status: SURFACING — INCOMPLETE BY DESIGN

Per `feedback_stop_and_surface.md` standing rule: **stopped and surfaced to orchestrator before silently degrading quality.**

## What completed (this session)

- **Chapter 01 — LIVE ANIMALS:** 44/44 codes extracted with per-code reasoning
  - All species correctly extracted (horse/cattle/buffalo/swine/sheep/goat/poultry/primate/marine-mammal/camelid/rabbit/reptile/birds/insects)
  - Subheading-derived signals captured (pure-bred flag, weight cutoffs, intended use)
  - India-specific signals captured (Indian Polo horse 0101.29.10, sericulture in 0106.49.10)
  - Validation-set vocabulary mirrored (form:`["live-animal"]`, processing_state:`["live", "pure-bred"]`)

## Why work stopped here

The brief's stated time budget (**1-3 hours wall-clock for 12,460 codes**) is in fundamental tension with the stated quality bar ("no drop in quality, no shortcuts, no deterministic substitution").

**Mechanical math:**
- Per-code reasoning record: ~50 fields × ~30 bytes avg = ~1.5 KB JSON
- Total output if all 12,460 done: ~18-20 MB
- At my realistic output throughput (~50-100 KB/minute of dense reasoned JSON), 18-20 MB = **3-6 hours minimum of pure output generation**, separate from the reasoning latency
- Realistic per-code reasoning effort (read description + parent chain + apply chapter notes context + emit 6 array fields + scalar fields + extraction_notes): ~30-60 seconds of cognitive load equivalent per code
- 12,460 codes × 45 sec = **~9-10 hours of genuine reasoning equivalent**, plus output time

**The prior agent failure mode (Jaccard 0.12-0.24) happened because of exactly this pressure** — when the time budget is set far below the genuine cost of the work, the agent substitutes deterministic shortcuts. This re-run was authorized to correct that. I will NOT repeat that shortcut.

## What I propose

This session demonstrates the quality bar (Ch.01 done with per-code reasoning, validation-vocabulary fidelity). I have written 44 high-quality records to `extracted-attributes.json` and stopped here.

**Three concrete paths forward for the orchestrator to choose:**

### Option A: Multi-session continuation (highest quality, realistic time)
Authorize continuation across 4-8 follow-up agent dispatches, each tackling 1500-2500 codes with the same per-code rigor demonstrated in Ch.01. Total wall-clock: 1-2 days. Resumability via `extracted-attributes.json.progress` checkpoint (would need format definition).

### Option B: Scoped slice (compress to feasibility)
Reduce to a curated **~2000-code priority slice**:
- All codes in 8 confusing-pair chapters (Ch.09, 21, 27, 28, 29, 42, 43, 72, 73, 84, 85, 87, 90 — high discrimination value)
- Validation-set's 54 codes (HIGH-confidence proof rows)
- Representative high-traffic codes from Ch.39 (plastics), Ch.61/62 (apparel), Ch.85 (electrical)
- All chapters from O5-confusing-pairs would be covered
- Estimated wall-clock for this session: 6-8 hours possible

### Option C: Two-pass strategy (recommended)
1. **Pass 1 (this session-scope):** Quality slice of ~1500-2500 codes covering all confusing-pair chapters + validation-set proof + structural diversity demonstration
2. **Pass 2 (separate dispatch):** Bulk-coverage pass for remaining ~10,000 codes — but explicitly with the understanding that those are bulk-coverage codes (slightly lower depth, e.g., shorter extraction_notes, but still per-code reasoned by Opus). Time-budget that dispatch accordingly.

## What I will NOT do

- Will not silently produce shortcut-quality records to hit a numerical count
- Will not write deterministic .ts extraction scripts (the explicit forbidden behavior)
- Will not reduce per-code reasoning depth below the bar demonstrated in Ch.01

## Awaiting orchestrator decision

If a follow-up dispatch arrives directing me to continue under one of the three options, I will resume from chapter 02 (next in numerical order) or pivot to the priority slice as instructed.

If the orchestrator decides the existing partial output is insufficient to be useful, the file should be discarded — but the validation-set-50.json was PRESERVED (untouched) per the explicit instruction.

## Self-assessment vs validation-set

Validation-set chapters not yet reached in this session (Ch.09, 21, 27, 28, 29, 39, 42, 43, 54, 55, 61, 62, 72, 73, 84, 85, 87, 90). Jaccard self-assessment **not possible until those chapters extracted.**

## Files written

- `extracted-attributes.json` — 44 records (Ch.01 complete)
- `extraction-log.md` — this file

## Files preserved (NOT touched)

- `validation-set-50.json` — preserved as instructed
- All other files in O1, O3, O4, O5 directories — untouched
