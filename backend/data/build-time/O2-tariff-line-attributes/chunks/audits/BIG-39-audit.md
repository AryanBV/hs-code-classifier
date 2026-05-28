# BIG-39 Audit — Verdict: KEEP existing 145 records, complete remaining 283

**Audit date:** 2026-05-27
**Auditor:** Opus 4.7 (build-time agent)
**Existing output state:** Truncated mid-array (missing closing `]`), but the LAST record in the file is a complete `}` object (3914.00.90). No mid-record truncation. 145 records parseable after appending `]`.

## Phase A — Disqualifying-evidence checklist

### 1. Helper scripts
Inspected `chunks/scripts/`. Only `emit-BIG-52.js` present (expected — the known-disqualified sibling). No helper script exists for BIG-39. PASS.

### 2. Sample 15 records (evenly spread, indices 0,10,20,30,41,51,61,72,82,92,102,113,123,133,144)

| idx | code | code-specificity evidence |
|---|---|---|
| 0 | 3901.10.10 | LLDPE primary form; cites "ethylene >=95% by weight" (subheading note specific to this code) |
| 10 | 3902.30.00 | propylene-copolymer composition cite, distinct from 3902.10/3902.20 PP homopolymer |
| 20 | 3904.10.10 | PVC binder for pigments; processing_state:`not-mixed` (Indian split specific) |
| 30 | 3904.50.90 | PVDC (vinylidene chloride polymer); barrier-film intended_use distinguishes from PVC |
| 41 | 3905.19.90 | "Other PVA primary form, not aqueous dispersion" — distinguishes from 3905.21 dispersions |
| 51 | 3906.90.60 | acrylonitrile-copolymer with active disambiguation: "not ABS/SAN — those are in 3903" |
| 61 | 3907.50.00 | alkyd resin with detailed composition `[polyol, polybasic-acid, fatty-acid]`, paint/coating use |
| 72 | 3907.91.90 | unsaturated polyester, processing_state:`unsaturated`, residual "other" notes |
| 82 | 3908.10.51 | Nylon-6,9: composition cites monomers `hexamethylenediamine, azelaic-acid` — code-specific |
| 92 | 3909.20.90 | melamine-formaldehyde residual; composition `[melamine, formaldehyde]` |
| 102 | 3909.40.90 | phenolic resin residual |
| 113 | 3912.11.20 | cellulose acetate, NON-plasticised, powder, moulding-material |
| 123 | 3912.20.21 | cellulose nitrate (celluloid), PLASTICISED — distinguishes from 3912.11 |
| 133 | 3912.90.20 | regenerated cellulose **sponge** — form:sponge, function:sponge, intended_use:cleaning |
| 144 | 3914.00.90 | ion-exchange-resin residual under 3914.00 |

All 15 records show genuine per-code reasoning matching the description's distinguishing feature. Vocab fidelity matches Ch.01 + validation-set Ch.39 (`primary-form` hyphenated, polymer-name + plastic stacking, `pvc`/`pva`/`pvdc` synonyms included).

### 3. Templating fingerprint scan

- **Duplicate attribute signatures (material+form+function+intended_use+processing_state+composition):** 2 groups of 2 records each.
  - Group A: `3904.30.10` (Poly vinyl derivatives) + `3904.30.90` (Other) — both are VC-VA copolymers within the same subheading; one named, one residual → LEGITIMATE shared signature. Notes are distinct.
  - Group B: `3904.90.90` (Other halogenated olefin polymers) + `3905.99.90` (Other vinyl polymers, residual) — both generic residual "other vinyl polymers in primary form" with empty composition → LEGITIMATE.
- **Duplicate extraction_notes:** 0. Every one of 145 notes is unique.
- **Internal contradictions:** none found.
- **Boilerplate:** notes range 15-142 chars (median 52); short notes are factual one-liners ("Dextran — bacterial polysaccharide"), not templated.

### 4. Confidence distribution
- HIGH: 96/145 (66%)
- MEDIUM: 49/145 (34%)
- Realistic split — MEDIUM concentrated on "other" residual subheadings where the description is genuinely ambiguous. No suspicious uniformity.

## Verdict: PASS — KEEP existing 145 records

The existing records show all the hallmarks of genuine LLM reasoning:
- Code-specific extraction_notes citing distinguishing features (95%+ thresholds, monomer names, India-specific splits)
- Active disambiguation (e.g., "not ABS/SAN — those are in 3903")
- Vocab fidelity to Ch.01 and validation-set Ch.39
- Realistic confidence distribution
- Zero boilerplate, zero scripted output

The truncation was a clean session-end termination — the last record (3914.00.90) is structurally complete; only the closing `]` is missing.

## Phase B — Plan

Complete the remaining 283 codes spanning 3915-3926 (articles of plastics). Apply Ch.39 articles-side vocabulary: heading-level specialization (3923 packaging, 3924 tableware, 3925 builders' ware, 3926 other), product-specific materials and forms, intended_role enum for packaging articles.
