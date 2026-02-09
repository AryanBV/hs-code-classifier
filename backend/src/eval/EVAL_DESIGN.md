# Eval Harness Design

## Purpose

Measure the HS code classifier's accuracy before making any changes to classification logic. Every future improvement must beat this baseline.

## Architecture

The eval calls `classify()` directly from `backend/src/classifier/index.ts` — no HTTP server needed. It loads env vars via dotenv, imports the classifier, and runs test cases sequentially with 500ms delays between calls.

```
runner.ts  →  classify(query)  →  scorer.ts  →  EvalReport JSON
                  ↓
          ClassificationResult
          (responseType, hsCode, question, confidence)
```

## Scoring System

### 1. Routing Score

Binary: did the system classify when it should, ask when it should?

Produces a 3x3 confusion matrix:

|              | Predicted: Classify | Predicted: Ask | Predicted: Reject |
|--------------|--------------------:|---------------:|------------------:|
| **Expected: Classify** | correct | wrong | wrong |
| **Expected: Ask** | wrong | correct | wrong |
| **Expected: Reject** | wrong | wrong | correct |

### 2. Classification Score (correctly-routed classify cases only)

Per case, 0-100 points:
- **Chapter match** (first 2 digits): 40 points
- **Heading match** (first 4 digits): 30 points
- **Full code match** (all 8 digits): 30 points

Alternative chapters (for ambiguous cases) get 30/40 partial credit.

HS codes are normalized before comparison: dots and whitespace stripped.
- `"8708.30.00"` → `"87083000"`
- Chapter: `"87"` = `actual.substring(0, 2)`
- Heading: `"8708"` = `actual.substring(0, 4)`

### 3. Question Quality Score (correctly-routed ask cases only)

Per case, 0-2 points:
- **Targeted** (+1): Question mentions specific product terms from the query, not generic
- **Relevant** (+1): Question offers multiple-choice options or uses classification-relevant terms

## Test Suites

### Master Suite (~340 cases)

Sources:
- `comprehensive-test-set.json` tier 1 (100 cases, manual verification) — high confidence
- `comprehensive-test-set.json` tier 2 (200 cases, database-derived) — medium confidence
- Session5 unique cases (~25 additional, including 15 ambiguous with `alternativeChapters`)
- Integration "ask" cases (3) + hand-written generic queries (~7)

Tier 3 (202 LLM-generated cases) is **excluded** — ground truth unverified.

### Quick Suite (20 cases)

Hand-picked for fast feedback (~30 seconds):
- 5 easy classify, 5 medium, 5 hard, 3 ask, 2 edge cases

## CLI Usage

```bash
# Full master suite
npm run eval

# Quick 20-case suite
npm run eval:quick

# Filter by category
npm run eval -- --category automotive

# Custom run ID
npm run eval -- --run-id my-experiment

# Compare two reports
npm run eval:compare before.json after.json

# Auto-compare latest two reports
npm run eval:compare
```

## Report Output

Reports are saved to `backend/eval-results/<run-id>.json` as JSON matching the `EvalReport` interface.

Console output includes:
- Routing accuracy + confusion matrix
- Classification accuracy (chapter, heading, 8-digit, weighted)
- Question quality metrics
- Top 10 failures

## Cost Estimates

- Quick suite (20 cases): ~$0.05
- Master suite (~340 cases): ~$1-2
- Each case makes 1-3 OpenAI API calls (attribute extraction + chapter routing + code selection)

## Adding Test Cases

1. Add to the supplemental array in `test-suites/master-suite.ts`, or
2. Add to `comprehensive-test-set.json` and the master suite will pick them up

Required fields: `id`, `query`, `source`, `category`, `expected_routing`, `difficulty`
Recommended: `expected_chapter`, `expected_heading`, `expected_code`

## Data Provenance

| Tier | Source | Confidence | Count |
|------|--------|-----------|-------|
| 1 | Manual verification (WCO opinions, Indian Customs Tariff) | High | 100 |
| 2 | Database-derived (hs_codes descriptions) | Medium | 200 |
| 3 | LLM-generated (GPT-4o-mini) | Lower (excluded) | 202 |
| - | Session5 test data | Medium-High | ~25 unique |
| - | Integration/hand-written ask cases | High | ~10 |
