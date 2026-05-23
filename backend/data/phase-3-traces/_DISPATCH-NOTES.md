# Phase 3 Spike — Subagent Dispatch Notes

Infra-only. NOT a trace. Records the per-dispatch invariants for the orchestrator so all 30 subagent prompts stay consistent.

## Dispatch order (rolling-cadence; 5-6 in flight)

| Wave | Cases | Reason |
|---|---|---|
| 1 | 4, 5, 13 (× V1, V2) | Diagnosed-failure-first + true-refusal — early-abort signal if architecture fails on these |
| 2 | 1, 6, 8 (× V1, V2) | First-order novel-artifact stress (rules filter, refusal trigger, exclusion redirect) |
| 3 | 7, 11, 12 (× V1, V2) | india_specific + STE policy surfacing |
| 4 | 2, 3, 9 (× V1, V2) | Processing-state + GIR 3 composite + WCO patches |
| 5 | 10, 14, 15 (× V1, V2) | Parts-vs-accessories + Q-budget cycle + adversarial robustness |

## Subagent profile

- type: `general-purpose`
- model: Opus 4.7 (one-time correctness work)
- isolation: none (read-only)
- runtime: foreground

## Verdict file path

`backend/data/phase-3-traces/case-{NN}-{V1|V2}-{slug}.md`

Each trace file MUST end with a single ```yaml … ``` block matching the schema in the plan.

## Early-abort triggers

- ≥3 of first 6 traces show same `gap_class` → halt dispatch, surface to user
- Wave-1 token spend extrapolates >$150 → halt, surface
- Cohere/Supabase outage breaks retrieval queries → halt, surface
