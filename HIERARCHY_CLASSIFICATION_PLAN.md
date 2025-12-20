# Hierarchy-Aware Classification System - Implementation Plan

## Problem Statement

Currently, when a user enters "coffee", the LLM:
1. Asks basic questions (roasted/unroasted, decaffeinated/not)
2. Returns a 6-digit code like `0901.11`
3. Does NOT drill down to the 8-digit code like `0901.11.11` (Arabica A Grade)

The LLM doesn't know about the **child codes** and their distinguishing characteristics.

## Root Cause

The LLM prompt receives:
- Top candidate codes (mostly parent/6-digit codes)
- Descriptions from those codes

But it does NOT receive:
- The **full hierarchy tree** below the candidate codes
- The **distinguishing factors** between sibling codes
- The **classification criteria** embedded in the HS structure

## Solution: Hierarchy-Aware Question Derivation

### Core Concept

**The HS code hierarchy itself encodes the classification logic.**

For example, `0901.11` has children:
```
0901.11.11 - Arabica plantation: A Grade
0901.11.12 - Arabica plantation: B Grade
0901.11.21 - Arabica Cherry: AB Grade
0901.11.31 - Robusta plantation: AB Grade
```

From this, we can derive questions:
1. Species: Arabica vs Robusta (derived from "Arabica" vs "Robusta" in descriptions)
2. Processing: Plantation vs Cherry (derived from "plantation" vs "Cherry")
3. Grade: A, B, C, AB, PB, etc. (derived from "A Grade", "B Grade", etc.)

### Implementation Steps

#### Phase 1: Build Hierarchy Context Function

Create a function that, given a parent code, returns:
1. All 8-digit children codes
2. The **distinguishing dimensions** (what makes children different)
3. Suggested questions based on those dimensions

```typescript
interface HierarchyContext {
  parentCode: string;
  parentDescription: string;
  childCodes: {
    code: string;
    description: string;
  }[];
  dimensions: {
    name: string;           // e.g., "Species", "Processing", "Grade"
    values: string[];       // e.g., ["Arabica", "Robusta"]
    derivedFrom: string;    // Which part of descriptions this came from
  }[];
  suggestedQuestions: {
    dimension: string;
    question: string;
    options: string[];
  }[];
}
```

#### Phase 2: Enhance LLM Prompt with Hierarchy

Instead of just showing candidate codes, provide:
1. The parent code and its meaning
2. ALL child codes in a structured format
3. The derived dimensions and their values
4. Suggested questions (LLM can refine or use directly)

#### Phase 3: Smart Dimension Extraction

Use NLP to extract distinguishing dimensions from sibling descriptions:

```typescript
function extractDimensions(children: {code: string, description: string}[]): Dimension[] {
  // Group by common prefixes
  // Identify varying parts (e.g., "A Grade" vs "B Grade")
  // Categorize dimensions (Species, Grade, Form, Size, etc.)
}
```

#### Phase 4: Multi-Level Traversal

For deep hierarchies, traverse level by level:
1. First identify the heading (4-digit): `0901` - Coffee
2. Then the subheading (6-digit): `0901.11` - Not roasted, not decaffeinated
3. Then the tariff item (8-digit): `0901.11.11` - Arabica A Grade

At each level, ask questions to narrow down.

### Example Flow for "Coffee"

**Round 1:**
Based on `0901` children (`0901.11`, `0901.12`, `0901.21`, `0901.22`, `0901.90`):
- Q1: "Is the coffee roasted or unroasted?" → Distinguishes 01.11/12 from 01.21/22
- Q2: "Is it decaffeinated?" → Distinguishes .11 from .12, .21 from .22

User answers: Unroasted, Not decaffeinated → Narrows to `0901.11`

**Round 2:**
Based on `0901.11` children (`0901.11.11-19`, `0901.11.21-29`, `0901.11.31-49`, `0901.11.90`):
- Q1: "What species of coffee?" → Arabica / Robusta
- Q2: "What processing method?" → Plantation / Cherry / Parchment

User answers: Arabica, Plantation → Narrows to `0901.11.11-19`

**Round 3:**
Based on `0901.11.11-19` codes:
- Q1: "What grade?" → A / B / C / Other

User answers: A Grade → Final code: `0901.11.11`

### Algorithm

```python
def classify_with_hierarchy(product_description, current_code=None, round=1):
    if round > MAX_ROUNDS:
        return best_guess_classification()

    if current_code is None:
        # Initial search - find top-level candidates
        candidates = search_candidates(product_description)
        current_code = identify_common_parent(candidates)

    # Get hierarchy context
    context = get_hierarchy_context(current_code)

    if len(context.childCodes) == 0:
        # Leaf node - classify directly
        return classify_final(current_code)

    if len(context.childCodes) == 1:
        # Only one option - no need to ask
        return classify_with_hierarchy(product_description, context.childCodes[0].code, round)

    # Multiple children - need to ask questions
    questions = generate_questions_from_dimensions(context.dimensions)

    # Return questions to user
    return {
        "type": "questions",
        "current_code": current_code,
        "questions": questions,
        "next_round": round + 1
    }

def continue_classification(answers, current_code, round):
    # Use answers to filter children
    context = get_hierarchy_context(current_code)
    matching_child = find_best_matching_child(context.childCodes, answers)

    if is_leaf_code(matching_child):
        return classify_final(matching_child)

    # Continue drilling down
    return classify_with_hierarchy(None, matching_child, round + 1)
```

### Key Functions to Implement

1. **`getHierarchyContext(code: string)`**
   - Returns all children, dimensions, and suggested questions

2. **`extractDimensionsFromDescriptions(descriptions: string[])`**
   - Uses NLP/pattern matching to find distinguishing factors

3. **`generateQuestionsFromDimensions(dimensions: Dimension[])`**
   - Creates user-friendly questions from technical dimensions

4. **`findBestMatchingChild(children, answers)`**
   - Maps user answers to the most likely child code

5. **`identifyCommonParent(candidates)`**
   - Given multiple candidate codes, find their common ancestor

### Database Requirements

1. **Populate `HsCodeHierarchy` table** with parent-child relationships
2. **Add dimension metadata** (optional but helpful for common categories)
3. **Ensure all 8-digit codes are in the database**

### Benefits

1. **Accuracy**: Questions derived from actual HS structure
2. **Completeness**: All relevant options are presented
3. **Scalability**: Works for any chapter, any product
4. **Transparency**: Users understand why questions are asked
5. **Auditability**: Classification path is documented

### Timeline

1. Phase 1 (Hierarchy Context): 1 implementation session
2. Phase 2 (Enhanced Prompt): 1 implementation session
3. Phase 3 (Dimension Extraction): 1-2 sessions
4. Phase 4 (Multi-Level Traversal): 1 session
5. Testing & Refinement: 1 session
