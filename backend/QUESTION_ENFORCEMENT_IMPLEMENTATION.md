# Question Enforcement System Implementation

## Overview

This document describes the implementation of the Question Enforcement System for the HS Code Classifier. The system ensures that critical questions are NEVER skipped during classification, preventing incorrect HS codes that could lead to user fines.

## Problem Statement

The original LLM-based classification system had too much autonomy and would sometimes:
- Classify products without asking critical questions
- Skip questions about material, species, form/state, or end-use
- Rely on incomplete information leading to wrong HS codes

**Impact**: Wrong HS codes lead to customs fines for users.

## Solution Architecture

### 1. Critical Dimensions Registry (`critical-dimensions.types.ts`)

A universal, rule-based system that applies to ALL product categories using context clues.

**Dimension Categories**:
- `identity`: What the product IS (species, material, type)
- `state`: Product state/form (fresh, frozen, processed)
- `quality`: Grade/quality specifications
- `purpose`: End use/intended application
- `packaging`: Bulk vs retail packaging
- `composition`: Material composition percentage

**Key Dimensions** (with priority):
| Dimension | Priority | Mandatory | Example Triggers |
|-----------|----------|-----------|------------------|
| material | 1 | Yes | shirt, shoes, bag, fabric |
| species_variety | 1 | Yes | coffee, tea, rice, fish |
| product_type | 1 | Yes | pump, motor, machine |
| form_state | 2 | Yes | fruit, meat, food |
| processing_level | 2 | Yes | coffee, oil, rice |
| end_use | 4 | Yes | pump, chemical, part |
| quality_grade | 3 | No | coffee, tea, diamond |
| packaging_type | 4 | No | food, beverage |

### 2. Question Tracker Service (`question-tracker.service.ts`)

Tracks coverage of critical dimensions throughout a conversation.

**Key Functions**:
- `initializeCoverage()`: Initialize tracking for new conversation
- `updateCoverageFromAnswers()`: Update coverage from user answers
- `validateCoverage()`: Check if classification should be allowed
- `generateFallbackQuestions()`: Generate questions for uncovered dimensions
- `mergeQuestions()`: Merge hierarchy + fallback questions

**Coverage States**:
- `not_applicable`: Dimension not relevant for this product
- `covered_explicit`: User answered a question about this
- `covered_implicit`: Inferred from product description
- `uncovered`: Relevant but not yet asked
- `skipped`: User selected "Other" option

### 3. Conversational Classifier Integration

**Modified Functions**:
- `startNewConversation()`: Initializes coverage tracking
- `continueConversation()`: Updates coverage from previous answers
- `getLLMDecision()`: Passes coverage to prompt generation
- `processLLMDecision()`: **CRITICAL** - Override logic that forces questions

**Override Logic** (in `processLLMDecision`):
```typescript
if (coverage && decision.decision === 'classify' && !forceClassify) {
  const validation = validateCoverage(coverage, false);

  if (!validation.isValid && validation.missingMandatory.length > 0) {
    // OVERRIDE: Force question asking
    decision.decision = 'ask_questions';
    decision.questions = generateFallbackQuestions(coverage, 3);
  }
}
```

### 4. LLM Prompt Enhancement

Added `formatCoverageSection()` that adds to the prompt:
```
**⚠️ MANDATORY DIMENSIONS NOT YET COVERED:**
The following critical dimensions have NOT been addressed yet.
You MUST ask about these before classifying:
  - MATERIAL
  - FORM STATE

DO NOT classify until these dimensions are covered by questions or answers!
```

## Files Changed

### New Files
1. `backend/src/types/critical-dimensions.types.ts` - Dimension definitions
2. `backend/src/services/question-tracker.service.ts` - Coverage tracking
3. `backend/scripts/test-question-enforcement.ts` - Integration tests

### Modified Files
1. `backend/src/services/conversational-classifier.service.ts`:
   - Added imports for coverage tracking
   - Added coverage initialization in `startNewConversation()`
   - Added coverage update in `continueConversation()`
   - Added override logic in `processLLMDecision()`
   - Added `formatCoverageSection()` helper
   - Updated `createClarificationPrompt()` signature

2. `backend/src/types/conversation.types.ts`:
   - Changed `MAX_QUESTIONS` from 5 to 6
   - Changed `MAX_QUESTIONS_PER_ROUND` from 2 to 3

## Test Cases

The test script covers:

**Agricultural Products**:
- Coffee (ambiguous vs specified)
- Tea, Rice, Mango variations

**Textiles**:
- Shirt (material detection)
- Fabric, Shoes

**Machinery**:
- Pump (type and end-use)
- Motor variations

**Chemicals**:
- Oil (processing level)

Run tests with:
```bash
cd backend
npx ts-node scripts/test-question-enforcement.ts
```

## How It Works (Flow)

1. **New Conversation**:
   - User submits "coffee beans"
   - System initializes coverage tracking
   - Detects mandatory dimensions: species_variety, processing_level, form_state
   - None covered in description → All marked "uncovered"

2. **LLM Decision**:
   - LLM might try to classify directly
   - System checks: Are mandatory dimensions covered? NO
   - **OVERRIDE**: Force question asking
   - Generate fallback questions for uncovered dimensions

3. **User Answers**:
   - User answers "Arabica" for species
   - Coverage updated: species_variety → "covered_explicit"
   - Still missing: processing_level, form_state
   - Continue asking questions

4. **Classification Allowed**:
   - After all mandatory dimensions covered
   - Or max rounds/questions reached (forced classification with warning)

## Configuration

### Adding New Dimensions

Add to `CRITICAL_DIMENSIONS` array in `critical-dimensions.types.ts`:

```typescript
{
  name: 'new_dimension',
  displayName: 'New Dimension',
  category: 'identity',
  priority: 1,
  triggerPatterns: [/\b(keyword1|keyword2)\b/i],
  coveragePatterns: [/\b(covered_value1|covered_value2)\b/i],
  questionTemplate: 'What is the new dimension?',
  chapterRanges: [[1, 10]], // or null for all chapters
  mandatory: true,
}
```

### Adjusting Limits

In `conversation.types.ts`:
- `MAX_QUESTIONS`: Total questions per conversation (default: 6)
- `MAX_ROUNDS`: Maximum conversation rounds (default: 3)
- `MAX_QUESTIONS_PER_ROUND`: Questions per round (default: 3)

## Logging

The system logs coverage state at key points:
- `[NEW]` - When new conversation starts
- `[CONTINUE]` - When conversation continues
- `OVERRIDE` - When LLM decision is overridden

Check logs for debugging coverage issues.

## Future Improvements

1. **Persistent Coverage**: Store coverage in database for recovery
2. **Learning**: Track which dimensions lead to correct classifications
3. **Chapter-Specific Rules**: More granular dimension rules per chapter
4. **User Feedback Loop**: Adjust mandatory dimensions based on feedback
