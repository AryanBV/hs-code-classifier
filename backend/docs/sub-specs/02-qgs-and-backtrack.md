# SUB-SPEC: QGS Info-Gain Formula + Backtrack Constraint Hint

**Target:** ARCHITECTURE.md §3 (Layer 1 I/O), §4.3 (QGS), §4.4 (backtrack), triage-v2.md template.
**Status:** Ready for merge.

## Section A — QGS Info-Gain Formula

### Setup
- `candidates`: ≤5 alive codes from Layer 3 output
- `attributes`: Map<code, TariffLineAttributes> where each TLA has string-array values per key
- Shared attribute key: `a` present (non-null, non-empty) in ≥2 candidates

### Prior choice (explicit)
**Uniform** over candidates. `P(c) = 1/|candidates|`.
Rationale: Cohere rerank scores are calibrated for retrieval quality, not classification probability. Uniform prior maximizes discriminative value of the question asked. Rerank-weighted prior is a future tuning lever post-N≥1k case_law confirmations.

### Formula
```
H(candidates) = log₂(|candidates|)               // max entropy under uniform
For each shared attr `a`:
  V_a = distinct values across candidates' a-arrays
  For v ∈ V_a:
    partition P_a(v) = { c : v ∈ attrs[c].a[] }
    P(a=v) = |P_a(v)| / |candidates|
    H(candidates | a=v) = log₂(|P_a(v)|) if |P_a(v)|>1 else 0
  E[H | a] = Σ_v P(a=v) · H(candidates | a=v)
  IG(a) = H(candidates) − E[H | a]
Selected = argmax_a IG(a); lex-order tiebreak.
```

### Edge cases
- No attribute with IG > 0 → REFUSE `out_of_scope_class: "genuinely_indistinguishable"`
- Selected attribute has no `question_templates` entry → REFUSE w/ structured guidance ("please describe [attribute]")
- Missing TLA row for any candidate → exclude that candidate; if <2 remain → REFUSE genuinely_indistinguishable
- `|candidates| < 2` → throw (caller contract violation)

### TypeScript pseudocode (~100 LOC)
```typescript
// Note: 'function_' has trailing underscore matching the DB column / TS field convention
// (Postgres reserved word avoidance — see sub-spec 01 Rule 7 + db/types.ts).
const ATTRIBUTE_KEYS = ['material','form','function_','intended_use','processing_state','composition'] as const;

interface IGResult {
  selectedAttribute: typeof ATTRIBUTE_KEYS[number];
  igScore: number;
  partition: Map<string, string[]>;  // value → candidate codes
}

function computeInformationGain(candidates: string[], attributes: Map<string, TLA>): IGResult {
  if (candidates.length < 2) throw new Error('QGS contract violation: IG requires ≥2 candidates');
  const n = candidates.length;
  const priorEntropy = Math.log2(n);
  let bestAttr = null, bestIG = 0, bestPartition = new Map<string, string[]>();

  for (const attrKey of ATTRIBUTE_KEYS) {
    const partition = new Map<string, string[]>();
    let covered = 0;
    for (const code of candidates) {
      const values = attributes.get(code)?.[attrKey];
      if (!values || values.length === 0) continue;
      covered++;
      for (const v of values) {
        const bucket = partition.get(v) ?? [];
        bucket.push(code);
        partition.set(v, bucket);
      }
    }
    if (covered < 2) continue;
    let expected = 0;
    for (const [, codes] of partition) {
      const pV = codes.length / n;
      const hV = codes.length > 1 ? Math.log2(codes.length) : 0;
      expected += pV * hV;
    }
    const ig = priorEntropy - expected;
    if (ig > bestIG || (ig === bestIG && bestAttr !== null && attrKey < bestAttr)) {
      bestIG = ig; bestAttr = attrKey; bestPartition = partition;
    }
  }
  if (bestAttr === null || bestIG <= 0)
    throw new QGSIndistinguishableError('No attribute discriminates the candidate set');
  return { selectedAttribute: bestAttr, igScore: bestIG, partition: bestPartition };
}
```

### Wrapper (async, fetches TLA, looks up template)
1. SELECT tariff_line_attributes WHERE code = ANY($candidates)
2. Drop candidates with no row; check survivors ≥ 2
3. computeInformationGain(survivors, attrMap)
4. SELECT question_templates WHERE discriminating_attribute = selectedAttribute
5. Build QGSQuestion { question_text, options[2-4], discriminating_attribute, ig_score }

## Section B — Backtrack Constraint Hint Schema

### B.1 New input field for Triage
```typescript
interface ConstraintHint {
  exclude_chapters:    string[];   // ["39"]
  prefer_chapters:     string[];   // ["29", "34"] from exclusion redirects
  reason:              string;     // human-readable diagnostic
  source_exclusion_id: number;     // chapter_exclusions.id
}

interface TriageInput {
  normalized_query:   string;
  previousAnswers:    Record<string, string>;
  q_budget_remaining: number;
  constraint_hint:    ConstraintHint | null;  // NEW
}
```

### B.2 Construction (Layer 3 → Layer 1)
1. Collect matched_exclusions for dropped candidate chapters
2. Flatten `redirects_to_chapter[]` → `prefer_chapters` (dedup)
3. `exclude_chapters` = chapters of zero-surviving candidates
4. `source_exclusion_id` = highest-confidence exclusion (or lowest id)
5. `reason` = `"Ch.{X} excluded per rule {id} ({text:80}); try {prefer_chapters}."`

### B.3 Triage prompt template addition (triage-v2.md)
Insert after `Q_BUDGET_REMAINING`, before closing instructions:
```
{{#if constraint_hint}}
=== BACKTRACK CONSTRAINT (single-shot) ===
The previous classification attempt routed to a chapter that was legally excluded.
- EXCLUDED CHAPTERS (do NOT use): {{constraint_hint.exclude_chapters}}
- SUGGESTED CHAPTERS (prefer these): {{constraint_hint.prefer_chapters}}
- REASON: {{constraint_hint.reason}}

Re-classify with these constraints:
  1. MUST NOT include any EXCLUDED CHAPTER in candidate_chapters[].
  2. Prefer SUGGESTED CHAPTERS when they plausibly fit; this is a bias, not absolute.
  3. If no chapter fits → REFUSE with out_of_scope_class "backtrack_no_fit".
{{/if}}
```

### B.4 New out_of_scope_class values for triage-v2.md
Add to enum:
- `"genuinely_indistinguishable"` (from QGS Section A)
- `"backtrack_no_fit"` (from backtrack)

### B.5 State tracking — single-shot enforcement
```typescript
interface PipelineRunState {
  // existing fields...
  backtrack_attempted: boolean;  // NEW; init false
}

if (layer3.backtrack_signal) {
  if (runState.backtrack_attempted) return escalateToLayer7DeepThink(state);
  runState.backtrack_attempted = true;
  return reInvokeLayer1(triageInput, buildConstraintHint(layer3.matched_exclusions));
}
```
