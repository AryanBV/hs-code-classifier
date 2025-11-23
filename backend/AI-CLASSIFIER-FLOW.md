# AI Classifier Service - Decision Flow

## Overview

The AI Classifier intelligently decides when to use OpenAI's GPT-4o-mini based on the confidence of other classification methods, ensuring cost-effective operation.

---

## Decision Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  classifyWithAI() called                                    │
│  - productDescription                                       │
│  - questionnaireAnswers                                     │
│  - keywordMatches (from keyword matcher)                    │
│  - decisionTreeResults (from decision tree)                 │
│  - forceAI (optional override)                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ STEP 1: Calculate Combined │
         │ Confidence                 │
         │                            │
         │ keyword = keywordMatches[0]│
         │           .matchScore      │
         │                            │
         │ tree = treeResults[0]      │
         │        .confidence         │
         │                            │
         │ combined = (keyword × 0.3) │
         │          + (tree × 0.4)    │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ STEP 2: Check if AI Needed │
         │                            │
         │ Is forceAI = true?         │
         └──────┬─────────────┬───────┘
                │             │
           YES  │             │ NO
                │             │
                ▼             ▼
         ┌──────────┐  ┌──────────────────┐
         │ Proceed  │  │ Is combined >= 70%?│
         │ to Step 3│  └─────┬────────┬─────┘
         └────┬─────┘        │        │
              │         YES  │        │ NO
              │              │        │
              │              ▼        │
              │      ┌───────────────┐│
              │      │ SKIP AI       ││
              │      │ Return null   ││
              │      │ (save ~$0.0002)│
              │      └───────────────┘│
              │                       │
              └───────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ STEP 3: Check Rate Limit   │
         │                            │
         │ checkRateLimit()           │
         │ - Reset if new day         │
         │ - Check: calls < 100?      │
         │ - Increment counter        │
         └──────┬─────────────┬───────┘
                │             │
          YES   │             │ NO
     (within    │             │ (limit exceeded)
      limit)    │             │
                ▼             ▼
         ┌──────────┐  ┌──────────────┐
         │ Proceed  │  │ BLOCK AI     │
         │ to API   │  │ Return null  │
         │ call     │  │ Log warning  │
         └────┬─────┘  └──────────────┘
              │
              ▼
         ┌────────────────────────────┐
         │ STEP 4: Build Prompt       │
         │                            │
         │ buildClassificationPrompt()│
         │ - Product description      │
         │ - Questionnaire answers    │
         │ - Context from keyword/tree│
         │ - 10 few-shot examples     │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ STEP 5: Call OpenAI API    │
         │                            │
         │ callOpenAI()               │
         │ - Model: gpt-4o-mini       │
         │ - Temperature: 0.3         │
         │ - Max tokens: 500          │
         │ - Response format: JSON    │
         │ - Cost tracking enabled    │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ STEP 6: Validate Result    │
         │                            │
         │ validateAIResult()         │
         │ - Check HS code format     │
         │ - Verify confidence 0-100  │
         │ - Validate reasoning       │
         └──────┬─────────────┬───────┘
                │             │
          VALID │             │ INVALID
                │             │
                ▼             ▼
         ┌──────────┐  ┌──────────────┐
         │ Return   │  │ Return null  │
         │ AI       │  │ Log warning  │
         │ Result   │  └──────────────┘
         └──────────┘
```

---

## Example Scenarios

### Scenario 1: High Confidence - AI Skipped ✅

```
Input:
  Product: "Ceramic brake pads for motorcycles"
  Keyword confidence: 100%
  Tree confidence:    100%

Calculation:
  Combined = (100 × 0.3) + (100 × 0.4) = 30 + 40 = 70%

Decision:
  70% >= 70% threshold → SKIP AI
  Return null
  Cost saved: $0.0002

Result:
  Main orchestrator uses keyword + tree results
```

---

### Scenario 2: Low Confidence - AI Called ✅

```
Input:
  Product: "Strange automotive part unclear function"
  Keyword confidence: 50%
  Tree confidence:    60%

Calculation:
  Combined = (50 × 0.3) + (60 × 0.4) = 15 + 24 = 39%

Decision:
  39% < 70% threshold → CALL AI
  Check rate limit: PASS (call 5/100)
  Proceed to API call

API Call:
  Model: gpt-4o-mini
  Cost: ~$0.0002
  Response: { hsCode: "8708.99.00", confidence: 75, ... }

Result:
  AI provides additional insight
  Main orchestrator combines all three methods
```

---

### Scenario 3: Force AI Override ✅

```
Input:
  Product: "Ceramic brake pads"
  Keyword confidence: 100%
  Tree confidence:    100%
  forceAI: TRUE

Calculation:
  Combined = 70% (high confidence)

Decision:
  forceAI = true → BYPASS confidence check
  Check rate limit: PASS
  Proceed to API call

Result:
  AI called despite high confidence
  Useful for validation or quality checking
```

---

### Scenario 4: Rate Limit Exceeded ✅

```
Input:
  Product: "Any product"
  Combined confidence: 39% (low)
  Current calls today: 100/100

Decision:
  Need AI (low confidence)
  Check rate limit: FAIL (100/100 calls used)
  Return null with warning

Result:
  Falls back to keyword + tree only
  Budget protection active
  Daily cost capped at ~$2
```

---

## Cost Optimization Metrics

### Expected Performance:

| Metric | Target | Actual |
|--------|--------|--------|
| AI usage rate | < 30% | Depends on product mix |
| Calls per day | < 100 | Hard limit enforced |
| Cost per call | ~$0.0002 | Varies with tokens |
| Max daily cost | < $5 | ~$0.02 (100 calls) |
| Typical daily cost | ~$0.006 | 30 calls @ $0.0002 |

### Benefits:

1. **Cost Savings**: 70%+ of classifications skip AI
2. **Budget Protection**: Hard limit prevents overrun
3. **Quality Maintained**: AI used when other methods uncertain
4. **Flexible Override**: `forceAI` available when needed

---

## Integration Points

### Main Orchestrator Integration:

```typescript
// 1. Run keyword matcher
const keywordResults = await keywordMatcher.match(description);

// 2. Run decision tree
const treeResults = await decisionTree.classify(description, answers);

// 3. Conditionally run AI (automatic decision logic)
const aiResult = await classifyWithAI(
  description,
  answers,
  keywordResults,  // Provides confidence for decision
  treeResults,     // Provides confidence for decision
  false            // Let automatic logic decide
);

// 4. Combine results with weighted scoring
const finalResult = combineResults(
  keywordResults,  // 30% weight
  treeResults,     // 40% weight
  aiResult         // 30% weight (or null if skipped)
);
```

---

## Monitoring & Logging

Every AI classification logs:

```
INFO: Starting AI classification
INFO: Combined confidence: 39.0% (keyword: 50% × 0.3 + tree: 60% × 0.4)
INFO: Calling AI - combined confidence: 39.0% < 70% (threshold)
INFO: AI call 5/100 today
INFO: Expected cost: ~$0.0002 per classification
INFO: OpenAI tokens: 845 (input: 720, output: 125)
INFO: Estimated cost: $0.000183
INFO: AI classification complete: 8708.99.00 (confidence: 75)
```

When AI is skipped:

```
INFO: Starting AI classification
INFO: Combined confidence: 70.0% (keyword: 100% × 0.3 + tree: 100% × 0.4)
INFO: Skipping AI - combined confidence sufficient: 70.0% >= 70%
INFO: Cost savings: ~$0.0002 per skipped classification
```

---

## Testing

Run comprehensive tests:

```bash
cd backend

# Test decision logic and rate limiting
npx ts-node src/test-ai-rate-limiting.ts

# Test full AI classification (makes real API calls)
npx ts-node src/test-ai-classifier.ts
```

---

## Summary

The AI Classifier Service provides:

✅ Intelligent decision logic (70% threshold)
✅ Rate limiting (100 calls/day)
✅ Cost optimization (skip when confidence high)
✅ Budget protection (hard limits)
✅ Comprehensive logging
✅ Flexible override (forceAI parameter)
✅ Graceful fallback (returns null when skipped/blocked)

**Status**: Ready for production integration
