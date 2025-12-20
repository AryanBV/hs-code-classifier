# System-Wide Improvement Plan
## Fixing ALL 15,818 Codes, Not Just Test Cases

**Date**: 2025-12-06
**Principle**: Fix the entire system systematically, not individual test cases

---

## The Problem with Test-Case-Only Fixes

### Risk of Over-Fitting
- ❌ Fixing only 2 failed cases might break 28 passing cases
- ❌ Might not improve accuracy on NEW test cases
- ❌ System might perform poorly in production with different queries

### Correct Approach
- ✅ Make system-wide improvements that benefit ALL 15,818 codes
- ✅ Test improvements on MANY cases (not just 30)
- ✅ Ensure improvements are generalizable

---

## Next Steps: System-Wide Testing & Validation

### Step 1: Expand Test Suite (CRITICAL)
**Current**: 30 test cases
**Target**: 100+ test cases covering:
- All 21 major chapters (currently only ~10 covered)
- Edge cases (multi-material products, functional vs material classification)
- Different query types (short, long, specific, general)
- Common production queries

**Why This Matters**:
- 30 cases = 0.19% of 15,818 codes (statistically insignificant)
- Need larger sample to validate system-wide improvements
- Need to catch regressions before they happen

**File to Create**: `backend/tests/comprehensive-test-cases.json` (100 cases)

---

### Step 2: Run Full Accuracy Audit
**Before making ANY more changes**, measure current performance on 100+ cases:

```bash
npx ts-node scripts/run-comprehensive-test.ts
```

**Metrics to Track**:
1. Overall accuracy (% correct)
2. Accuracy by chapter (which chapters perform poorly?)
3. Accuracy by query length (1 word, 2-3 words, 4+ words)
4. Accuracy by code specificity (chapter vs heading vs tariff)
5. False positive rate (suggesting wrong chapter entirely)
6. Near-miss rate (right chapter, wrong subheading)

**Output**: Baseline report showing WHERE the system struggles

---

### Step 3: Identify System-Wide Patterns
From 100+ test results, identify:

1. **Chapters with <50% accuracy** → Need better embeddings/keywords
2. **Query patterns that fail** → Need better query parsing
3. **Specificity issues** → Need hierarchy expansion
4. **Semantic confusion** → Need better embeddings for similar products

**Example Patterns to Look For**:
- Do ALL toy queries fail? → Embedding problem for functional categories
- Do ALL multi-material queries fail? → Query parsing problem
- Do ALL short queries (<3 words) fail? → Need fuzzy search improvements
- Do ALL specific queries (8-10 digits) fail? → Hierarchy expansion needed

---

## System-Wide Improvements (Not Case-Specific)

### Improvement 1: Comprehensive Embedding Audit
**Scope**: ALL 15,818 codes

**What to Audit**:
1. **Keyword Coverage**
   - How many codes have <3 keywords? (likely thousands)
   - How many codes have NO commonProducts? (likely thousands)
   - How many codes have generic descriptions?

2. **Semantic Quality**
   - Are similar products (e.g., "toys", "games", "dolls") clustered together?
   - Are dissimilar products separated (e.g., "toys" vs "plastic raw materials")?

3. **Functional vs Material**
   - Do functional keywords exist for all functional products?
   - Example: "toys" should have keywords: toy, game, play, children
   - NOT just: plastic, metal, wood (materials)

**Script to Create**: `backend/scripts/comprehensive-embedding-audit.ts`

**Actions Based on Audit**:
- Enhance ALL codes with poor data (not just failed test case codes)
- Add functional keywords to ALL functional products
- Ensure material AND function keywords exist where applicable

---

### Improvement 2: Systematic Keyword Enhancement
**Scope**: ALL 15,818 codes

**Process**:
1. Identify codes with <5 total keywords/products/synonyms
2. Use GPT-4o-mini to generate rich keywords from description
3. Regenerate embeddings for ALL enhanced codes
4. Cost: ~$0.04 for 2000 codes, ~$0.30 for all 15,818 codes

**Categories to Focus On**:
- Functional products (toys, games, tools, instruments)
- Multi-purpose products (e.g., "plastic articles" → specific uses)
- Technical products (e.g., "photovoltaic cells" → "solar panels", "solar cells", "PV modules")

**Script**: `backend/scripts/enhance-all-embeddings-systematic.ts`

---

### Improvement 3: Query Pattern Analysis
**Scope**: Understand ALL query types users might submit

**Analyze**:
1. Production logs (if available)
2. Test cases (current 30 + new 70)
3. Common search patterns

**Query Categories**:
- Material-only: "steel", "plastic", "cotton"
- Function-only: "toys", "tools", "furniture"
- Material + Function: "plastic toys", "steel tools", "wooden furniture"
- Material + Function + Context: "plastic toys for children", "steel nuts for automotive"
- Technical terms: "photovoltaic cells", "compression-ignition engines"

**Enhancement**: Ensure query parser handles ALL patterns correctly

---

### Improvement 4: LLM Prompt System-Wide Enhancement
**Current Issue**: LLM prompt is generic for all queries

**System-Wide Fix**:
1. **Add Hierarchy Level Information** (for ALL candidates)
   - "Level 2 (Chapter) - ⚠️ NOT SPECIFIC"
   - "Level 4 (Heading) - ⚠️ NOT SPECIFIC"
   - "Level 8 (Tariff) - ✓ SPECIFIC"

2. **Add Keyword Match Information** (for ALL candidates)
   - Which query keywords matched
   - Which keywords are missing
   - Helps LLM understand relevance

3. **Add Query Analysis** (for ALL queries)
   - Primary subject vs context
   - Material vs function classification
   - Specificity level needed

**File to Modify**: `backend/src/services/llm-validation.service.ts`

**Benefits ALL Queries**, not just failed cases!

---

## Testing Strategy: Prevent Regressions

### 1. Baseline Testing
**Before ANY system change**:
```bash
npm run test:baseline  # Run on 100+ cases, save results
```

### 2. Incremental Testing
**After EACH improvement**:
```bash
npm run test:compare   # Compare to baseline
```

**Check**:
- Did accuracy improve overall?
- Did any previously passing cases fail? (regression)
- Did improvement apply broadly or just specific cases?

### 3. Regression Prevention
**Rules**:
- ❌ Do NOT deploy if accuracy decreases
- ❌ Do NOT deploy if >5% of passing cases regress
- ✅ DO deploy if overall accuracy improves >3%
- ✅ DO deploy if no regressions AND some improvements

---

## Proposed Next Actions

### Immediate (This Session)
1. ✅ Create comprehensive test suite (100 cases) - **NEXT**
2. ✅ Run baseline accuracy audit on 100 cases
3. ✅ Identify system-wide patterns (not just 2 failed cases)
4. ✅ Document findings in report

### Short Term (Next Session)
1. Execute system-wide embedding audit (ALL 15,818 codes)
2. Enhance embeddings for ALL poor-quality codes
3. Re-test on 100 cases, measure improvement
4. Iterate if needed

### Medium Term
1. LLM prompt enhancements (benefits all queries)
2. Query pattern improvements (benefits all queries)
3. Confidence calibration (benefits all classifications)

---

## Success Criteria

### System-Wide Metrics (Not Case-Specific)
1. **Overall Accuracy**: 83%+ on 100+ diverse test cases
2. **Chapter Coverage**: >70% accuracy on ALL 21 major chapters
3. **No Regressions**: <5% of baseline passing cases fail
4. **Consistency**: Similar accuracy across all query types
5. **Confidence Calibration**: Average confidence ≈ average accuracy (±5%)

### Production Readiness
- Works well on unseen queries (not just test cases)
- Generalizable improvements (not over-fitted)
- Robust across all product categories
- Maintainable and explainable

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-fitting to test cases | System fails in production | Test on 100+ diverse cases |
| Breaking passing cases | Regression | Run baseline before changes |
| Embedding changes too narrow | Doesn't help other codes | Audit ALL 15,818 codes first |
| Prompt changes too specific | Doesn't generalize | Test on many query types |
| Cost of fixing ALL codes | Budget exceeded | Start with worst performers, iterate |

---

## Key Principle

> **"Fix the SYSTEM, not the SYMPTOMS"**

- 2 failed test cases are symptoms
- Poor embeddings for functional categories is the system issue
- Fixing embeddings for ALL functional categories fixes the system
- This fixes the 2 test cases AND thousands of other potential failures

---

## Next Step

**Create comprehensive test suite with 100+ cases** covering:
1. All 21 major HS chapters
2. All query patterns (short/long, material/function, technical)
3. Edge cases and production examples
4. Different specificity levels

Then run baseline audit to understand TRUE system performance.

---

_This ensures we fix the entire system, not just pass specific tests._
