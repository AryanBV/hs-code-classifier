# HS Code Classifier - Project Specification V3

**Version:** 3.0
**Date:** November 24, 2024
**Status:** Phase 0 Complete (MVP with 20 codes) → Planning Phase 1-6

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Core Technical Challenges](#core-technical-challenges)
4. [Proposed Architecture](#proposed-architecture)
5. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
6. [Detailed Technical Specifications](#detailed-technical-specifications)
7. [Cost Analysis](#cost-analysis)
8. [Success Metrics](#success-metrics)
9. [Risk Mitigation](#risk-mitigation)
10. [Appendix](#appendix)

---

## Executive Summary

### Vision
Build a production-grade HS code classification system that:
- **Scales:** 20 codes → 14,000+ codes
- **Accuracy:** 89% → 95%+ confidence
- **Speed:** <4 seconds per classification
- **Cost:** <$0.01 per classification
- **Scope:** Automotive → All product categories

### Current Status
**Phase 0 - MVP Complete ✅**
- 20 automotive HS codes in database
- 89% classification confidence
- Keyword matching + Decision trees + AI
- Production deployment (Railway + Vercel)
- **Live:** https://hs-code-classifier.vercel.app

### Key Achievements
- ✅ Hybrid classification (Keyword 30% + Tree 40% + AI 30%)
- ✅ Decision tree framework working
- ✅ Mobile-responsive UI
- ✅ Production-ready architecture

### Critical Problems Identified

**Problem 1: The "Other" Category Challenge**
- Many HS codes end with "Other" (e.g., "8708.99.90 - Other parts of motor vehicles")
- These are catch-all categories for items not specifically listed
- Current system struggles with ambiguous classifications
- **Example:** "Custom motorcycle exhaust bracket" → Falls under "Other" but AI doesn't know which "Other"

**Problem 2: Terminology Mismatch**
- Users use common terms: "coolant", "brake pads", "LED bulb"
- HS codes use technical terms: "Antifreeze preparations", "Friction material mounted", "Light-emitting diode lamps"
- Current keyword matching misses these matches
- **Example:** User says "coolant" but HS code 3820.00.00 says "Antifreeze preparations and prepared de-icing fluids"

**Problem 3: Scalability Limitations**
- Manual keyword database: Not feasible for 14,000 codes
- Manual decision trees: Would require 70,000+ rules
- Current approach doesn't scale beyond automotive

**Problem 4: HS Code Data Extraction**
- Need comprehensive database with all 14,000+ Indian HS codes
- Must include: code, description, chapter, heading, subheading, common products, duty rates
- Data sources: Iceberg, Indian Customs, WCO

---

## Current System Analysis

### What Works ✅

#### 1. AI-Powered Classification
```
GPT-4o-mini → 85% confidence → $0.0002 per classification
```
- Understands context and product descriptions
- Provides detailed reasoning
- Handles complex products
- Cost-effective

#### 2. Hybrid Confidence Scoring
```
Final = (Keyword × 0.30) + (Decision Tree × 0.40) + (AI × 0.30)
```
- Multiple methods validate each other
- Consensus boosts confidence
- Transparent breakdown

#### 3. Production Infrastructure
- **Backend:** Railway (Node.js + Express + PostgreSQL)
- **Frontend:** Vercel (Next.js + React)
- **Database:** PostgreSQL with Prisma ORM
- **AI:** OpenAI GPT-4o-mini

#### 4. Decision Tree Framework
- Category detection: Automotive Parts
- Rule-based confidence boosting
- Keyword-based matching
- 34 rules covering major automotive parts

### What Doesn't Scale ❌

#### 1. Keyword Database
**Current:** 20 codes with manually curated keywords
```typescript
{
  code: "8708.30.00",
  keywords: ["brake", "pad", "ceramic", "friction"],
  commonProducts: ["Ceramic Brake Pads for Motorcycles"]
}
```
**Problem:**
- 14,000 codes × 10 keywords avg = 140,000 keyword entries
- Keyword collisions ("filter" matches oil filter, air filter, fuel filter, water filter)
- Maintenance nightmare
- Doesn't handle synonyms

#### 2. Manual Decision Trees
**Current:** 34 rules for automotive parts
```typescript
{
  conditions: { keywords: ['brake', 'pad'] },
  suggestedCodes: ['8708.30.00'],
  confidenceBoost: 90
}
```
**Problem:**
- 14,000 codes would need ~70,000+ rules
- Each category needs separate rules
- No automated way to generate rules
- Becomes unmaintainable quickly

#### 3. Category Detection
**Current:** Simple keyword matching
```typescript
if (description.includes('brake') || description.includes('engine')) {
  return 'Automotive Parts';
}
```
**Problem:**
- Doesn't handle multi-category products
- No confidence scoring
- Breaks with complex products
- **Example:** "Smartphone battery" could be Electronics, Batteries, or Accessories

---

## Core Technical Challenges

### Challenge 1: The "Other" Category Problem

#### The Problem
HS nomenclature uses "Other" categories as catch-alls:
- **8708.99** - Other parts and accessories of motor vehicles
- **8542.39** - Other electronic integrated circuits
- **3926.90** - Other articles of plastics

When a product doesn't fit specific categories, it falls under "Other". But there are MANY "Other" categories!

#### Why It's Difficult
1. **Ambiguity:** "Custom motorcycle bracket" could be:
   - 8708.99.90 - Other parts of motor vehicles (if specifically for motorcycles)
   - 7326.90.90 - Other articles of iron or steel (if generic bracket)
   - 8301.70.00 - Keys presented separately (if it's a key bracket)

2. **Exclusion Logic Required:** Classification requires knowing what it's NOT:
   - Not specifically listed parts → Goes to "Other"
   - Not meeting specific chapter criteria → Goes to different chapter

3. **Context Dependent:** Same product, different classification based on:
   - Primary function
   - Material composition
   - Level of processing (raw, semi-finished, finished)
   - Intended use

#### Proposed Solution

**Step 1: Hierarchical Elimination**
```
Product: "Custom motorcycle exhaust bracket"

Level 1 - Chapter Detection:
  87 - Vehicles and parts ✓
  73 - Articles of iron/steel ?

Level 2 - Heading Narrowing:
  8708 - Parts of motor vehicles ✓
  7326 - Other articles of iron/steel ?

Level 3 - Subheading Specificity:
  8708.92 - Silencers and exhaust pipes? ✗
  8708.99 - Other parts? ✓ (by elimination)

Level 4 - AI Reasoning:
  "This is a BRACKET specifically designed for motorcycle exhausts.
   It's not the exhaust itself (8708.92), but a mounting accessory.
   Since it's specifically for vehicles and not a general metal bracket,
   it falls under 8708.99.90 - Other parts of motor vehicles."
```

**Step 2: Confidence Scoring for "Other"**
```typescript
if (hsCode.endsWith('.99') || hsCode.includes('Other')) {
  // Lower confidence but explain why
  confidence = Math.min(confidence, 85); // Cap at 85% for "Other"
  reasoning += "\n\nNote: This falls under a catch-all 'Other' category. " +
               "Classification is based on exclusion logic (what it's NOT) " +
               "rather than specific definition. Consider consulting a " +
               "customs expert for high-value shipments.";
}
```

**Step 3: Smart Questionnaire for Ambiguous Cases**
When AI confidence < 85% and code contains "Other":
```
❓ Additional Classification Help Needed

This product may fall under multiple "Other" categories.
Please clarify:

Q1: What is the PRIMARY material?
   ○ Steel/Iron
   ○ Aluminum
   ○ Plastic
   ○ Rubber
   ○ Other metal

Q2: What is the PRIMARY purpose?
   ○ Mounting/Support bracket
   ○ Structural component
   ○ Functional part (moves/operates)
   ○ Decorative accessory

Q3: Is this specific to vehicles or general-purpose?
   ○ Specifically designed for vehicles
   ○ General-purpose, usable in vehicles
   ○ Not vehicle-specific at all
```

---

### Challenge 2: Terminology & Synonym Mismatch

#### The Problem

**User Language vs. HS Code Language:**

| User Says | HS Code Says | HS Code |
|-----------|--------------|---------|
| "Coolant" | "Antifreeze preparations and prepared de-icing fluids" | 3820.00.00 |
| "Brake pads" | "Mounted brake linings" | 8708.30.00 |
| "LED bulb" | "Light-emitting diode (LED) lamps" | 8539.50.00 |
| "Fuel filter" | "Oil or petrol-filters for internal combustion engines" | 8421.23.00 |
| "Car battery" | "Lead-acid accumulators of a kind used for starting piston engines" | 8507.10.00 |

**Why Keyword Matching Fails:**
```typescript
// User input
"I need to export engine coolant for cars"

// Current keyword matching
keywords: ['coolant']
→ No match in database! ❌

// HS Code 3820.00.00 keywords
keywords: ['antifreeze', 'de-icing', 'ethylene', 'glycol']
→ Different terminology!
```

#### Proposed Solutions

**Solution 1: Comprehensive Synonym Database**

```typescript
// Database: product_synonyms table
{
  canonical_term: "antifreeze",
  synonyms: [
    "coolant",
    "engine coolant",
    "radiator fluid",
    "cooling fluid",
    "antifreeze liquid",
    "ethylene glycol",
    "propylene glycol"
  ],
  hs_codes: ["3820.00.00"],
  category: "Automotive Fluids"
}
```

**Solution 2: Semantic Search with Embeddings**

Instead of exact keyword matching, use vector similarity:

```typescript
// Generate embeddings for all HS codes
const hsCodeEmbeddings = await generateEmbeddings([
  "3820.00.00: Antifreeze preparations and prepared de-icing fluids, ethylene glycol based",
  // ... all 14,000 codes
]);

// Search with user input
const userQuery = "engine coolant";
const queryEmbedding = await generateEmbedding(userQuery);

// Find semantically similar codes
const similarCodes = await vectorSearch(queryEmbedding, topK: 10);
// Returns: [3820.00.00 (similarity: 0.89), ...]
```

**Advantage:** Automatically handles:
- Synonyms ("coolant" matches "antifreeze")
- Related terms ("engine fluid" matches "automotive liquid")
- Typos and variations
- Technical vs. common names

**Solution 3: AI-Powered Terminology Bridge**

```typescript
const systemPrompt = `
You are an HS code classification expert.
Users often use common terms while HS codes use technical terminology.

Common mappings:
- "Coolant" = "Antifreeze preparations" (3820.00.00)
- "Brake pads" = "Mounted brake linings" (8708.30.00)
- "LED bulb" = "Light-emitting diode lamps" (8539.50.00)

When classifying, consider both common and technical terms.
`;
```

---

### Challenge 3: HS Code Data Extraction

#### The Challenge
Need comprehensive database with:
- 14,000+ Indian HS codes (8-digit)
- Official descriptions
- Chapter/Heading/Subheading hierarchy
- Duty rates (import/export)
- Common product examples
- Keywords and synonyms

#### Data Sources

**Primary Source: Indian Customs (DGFT)**
- URL: https://www.icegate.gov.in/
- Format: PDF/Excel tariff schedules
- Content: Official HS codes with duty rates
- **Pros:** Authoritative, legally binding
- **Cons:** Not API-friendly, requires scraping

**Secondary Source: Iceberg (HS Code Lookup)**
- URL: https://www.findhs code.com/ or similar
- Format: Web scraping
- Content: User-friendly descriptions, examples
- **Pros:** Easy to scrape, good examples
- **Cons:** May not be 100% up-to-date

**Tertiary Source: WCO (World Customs Organization)**
- URL: https://www.wcoomd.org/
- Format: Official nomenclature
- Content: International 6-digit HS codes
- **Pros:** International standard
- **Cons:** Doesn't include country-specific 8-digit extensions

#### Extraction Strategy

**Phase 1: Get Base 6-Digit Codes (International)**
```python
# Scrape from WCO or use existing datasets
# ~5,000 international codes
source = "WCO Harmonized System"
codes = scrape_wco_codes()

# Example output:
{
  "code": "8708.30",
  "description": "Brakes and servo-brakes; parts thereof",
  "chapter": "87",
  "heading": "8708",
  "level": "subheading"
}
```

**Phase 2: Get Indian 8-Digit Extensions**
```python
# Scrape from Indian Customs
# ~14,000 India-specific codes
source = "Indian Customs Tariff"
codes = scrape_indian_tariff()

# Example output:
{
  "code": "8708.30.00",
  "description": "Mounted brake linings",
  "chapter": "87",
  "heading": "8708",
  "subheading": "8708.30",
  "duty_rate": "10%",
  "country": "IN"
}
```

**Phase 3: Enrich with Examples**
```python
# Scrape from Iceberg and other sources
# Add common products, keywords
enriched_codes = enrich_with_examples(codes)

# Example output:
{
  "code": "8708.30.00",
  "description": "Mounted brake linings",
  "common_products": [
    "Ceramic brake pads for motorcycles",
    "Brake shoes for cars",
    "Disc brake pads",
    "Drum brake linings"
  ],
  "keywords": [
    "brake", "pad", "lining", "friction",
    "ceramic", "mounted", "shoe"
  ],
  "synonyms": [
    "brake pads",
    "brake linings",
    "friction pads",
    "brake shoes"
  ]
}
```

**Phase 4: Generate Embeddings**
```typescript
// For each code, create semantic embedding
for (const code of allCodes) {
  const text = `
    ${code.code}: ${code.description}
    Common products: ${code.common_products.join(', ')}
    Keywords: ${code.keywords.join(', ')}
    Synonyms: ${code.synonyms.join(', ')}
  `;

  code.embedding = await generateEmbedding(text);
}

// Store in database with pgvector
await prisma.hsCode.create({
  data: {
    ...code,
    embedding: code.embedding
  }
});
```

#### Database Schema for HS Codes

```prisma
model HsCode {
  id               Int      @id @default(autoincrement())
  code             String   @unique // "8708.30.00"
  description      String   // Official description
  chapter          String   // "87"
  heading          String   // "8708"
  subheading       String?  // "8708.30"
  countryCode      String   @default("IN")
  dutyRate         String?  // "10%"
  keywords         String[] // ["brake", "pad", "ceramic"]
  commonProducts   String[] // ["Ceramic brake pads", ...]
  synonyms         String[] // ["brake pads", "brake linings"]
  embedding        Unsupported("vector(1536)")? // pgvector

  // Hierarchy helpers
  isOther          Boolean  @default(false) // True if description contains "Other"
  parentHeading    String?  // Link to parent for hierarchy

  // Metadata
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([chapter])
  @@index([heading])
  @@index([embedding(ops: VectorCosineOps)], type: Ivfflat)
}

model ProductSynonym {
  id            Int      @id @default(autoincrement())
  canonicalTerm String   // "antifreeze"
  synonyms      String[] // ["coolant", "engine coolant", ...]
  hsCode        String   // "3820.00.00"
  category      String   // "Automotive Fluids"
  confidence    Float    @default(1.0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([canonicalTerm])
  @@index([hsCode])
}
```

---

### Challenge 4: Hierarchical Classification

#### The HS Code Structure

HS codes are hierarchical:

```
87        → Chapter: Vehicles, parts and accessories thereof
  8708    → Heading: Parts and accessories of motor vehicles
    8708.30 → Subheading: Brakes and servo-brakes; parts thereof
      8708.30.00 → Full code: Mounted brake linings
      8708.30.10 → Full code: Brake assemblies
      8708.30.90 → Full code: Other
```

#### Why Hierarchy Matters

**Efficiency:**
- Don't search all 14,000 codes
- First narrow to chapter (~500 codes)
- Then to heading (~50 codes)
- Then to subheading (~5-10 codes)
- Finally pick exact code

**Accuracy:**
- Each level eliminates wrong branches
- Reduces false positives
- Provides context for "Other" categories

#### Hierarchical Search Algorithm

```typescript
async function hierarchicalClassification(description: string) {

  // Step 1: Detect Chapter (2-digit)
  const chapter = await detectChapter(description);
  // "Ceramic brake pads for motorcycles" → Chapter 87

  // Step 2: Narrow to Heading (4-digit)
  const headings = await getHeadingsInChapter(chapter);
  const heading = await selectBestHeading(description, headings);
  // Chapter 87 → Heading 8708 (Parts of motor vehicles)

  // Step 3: Narrow to Subheading (6-digit)
  const subheadings = await getSubheadingsInHeading(heading);
  const subheading = await selectBestSubheading(description, subheadings);
  // Heading 8708 → Subheading 8708.30 (Brakes)

  // Step 4: Find Exact Code (8-digit)
  const exactCodes = await getExactCodesInSubheading(subheading);
  const finalCode = await selectBestExactCode(description, exactCodes);
  // Subheading 8708.30 → 8708.30.00 (Mounted brake linings)

  return finalCode;
}
```

**Benefits:**
- Search space: 14,000 → 500 → 50 → 5 → 1
- Speed: O(n) → O(log n)
- Accuracy: Context at each level

---

## Proposed Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. Product Description Input                        │   │
│  │  2. Smart Info Detection (transparent)               │   │
│  │  3. Dynamic Questionnaire (0-3 questions)            │   │
│  │  4. Classification Results                           │   │
│  │  5. Feedback (Correct / Incorrect / Unsure)          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  CLASSIFICATION PIPELINE                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PHASE 1: Preprocessing                              │   │
│  │  - Extract info (material, type, function, etc.)     │   │
│  │  - Detect category                                   │   │
│  │  - Expand synonyms                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PHASE 2: Hierarchical Narrowing                     │   │
│  │  - Detect Chapter (2-digit)                          │   │
│  │  - Narrow to Heading (4-digit)                       │   │
│  │  - Narrow to Subheading (6-digit)                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PHASE 3: Vector Search (Semantic Matching)          │   │
│  │  - Generate embedding for query                      │   │
│  │  - Search pgvector (only within subheading)          │   │
│  │  - Return top 10 candidate codes                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PHASE 4: AI Re-ranking & Validation                 │   │
│  │  - GPT-4 evaluates top 10 candidates                 │   │
│  │  - Applies HS code rules                             │   │
│  │  - Handles "Other" with exclusion logic              │   │
│  │  - Returns best match + confidence + reasoning       │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PHASE 5: Smart Questionnaire (if needed)            │   │
│  │  - If confidence < 85%, ask clarifying questions     │   │
│  │  - Only ask about missing critical info              │   │
│  │  - Re-run classification with answers                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PostgreSQL   │  │  pgvector    │  │   OpenAI     │     │
│  │              │  │              │  │              │     │
│  │ 14K HS Codes │  │ Embeddings   │  │ GPT-4o-mini  │     │
│  │ Synonyms     │  │ Similarity   │  │ Embeddings   │     │
│  │ Feedback     │  │ Search       │  │ Reasoning    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase-by-Phase Implementation

### Phase 0: MVP ✅ COMPLETED

**Status:** Production (https://hs-code-classifier.vercel.app)

**What Was Built:**
- ✅ 20 automotive HS codes
- ✅ Keyword matching service
- ✅ Decision tree framework (34 rules)
- ✅ AI classification with GPT-4o-mini
- ✅ Hybrid confidence scoring
- ✅ Production deployment
- ✅ Mobile-responsive UI

**Achievements:**
- 89% classification confidence
- <4 second response time
- $0.0002 per classification
- CORS-enabled API
- Database seeding automation

**Limitations:**
- Only 20 codes (needs 14,000+)
- Only automotive category
- Manual keywords (doesn't scale)
- No synonym handling
- No "Other" category logic

---

### Phase 1: Data Foundation (Weeks 1-2)

**Goal:** Extract and structure all 14,000+ Indian HS codes

#### Week 1: Data Extraction

**Tasks:**
1. **Scrape Indian Customs Tariff**
   - Source: https://www.icegate.gov.in/
   - Extract all 8-digit HS codes
   - Get official descriptions
   - Capture duty rates

2. **Scrape Product Examples**
   - Source: Iceberg, FindHSCode, etc.
   - Get common product names
   - Extract user-friendly descriptions

3. **Build Synonym Database**
   - Map common terms to technical terms
   - Source: Domain experts, existing databases
   - Example: "coolant" → "antifreeze preparations"

4. **Clean and Normalize**
   - Remove duplicates
   - Standardize format
   - Validate codes

**Deliverables:**
- `data/hs_codes_full.json` (14,000+ codes)
- `data/product_synonyms.json` (synonym mappings)
- `data/common_products.json` (example products per code)

#### Week 2: Database Setup

**Tasks:**
1. **Update Prisma Schema**
   - Add pgvector support
   - Add synonym table
   - Add hierarchy fields

2. **Enable pgvector on Railway**
   ```sql
   CREATE EXTENSION vector;
   ```

3. **Create Seed Scripts**
   - `prisma/seed-hs-codes.ts` (14,000 codes)
   - `prisma/seed-synonyms.ts` (synonym mappings)
   - `prisma/seed-embeddings.ts` (generate vectors)

4. **Generate Embeddings**
   - Use OpenAI text-embedding-3-small
   - Cost: ~$0.30 one-time
   - Store in pgvector column

**Deliverables:**
- Updated database schema
- 14,000 HS codes seeded
- Embeddings generated
- pgvector indexes created

**Success Metrics:**
- All 14,000 codes in database
- Embedding generation complete
- Vector search working (<100ms)

---

### Phase 2: Vector Search & Semantic Matching (Weeks 3-4)

**Goal:** Replace keyword matching with semantic search

#### Week 3: Vector Search Implementation

**Tasks:**
1. **Create Vector Search Service**
   ```typescript
   // backend/src/services/vector-search.service.ts
   async function searchSimilarCodes(
     description: string,
     limit: number = 10
   ): Promise<HSCodeResult[]>
   ```

2. **Integrate with Classification Pipeline**
   - Replace keyword matcher
   - Keep AI re-ranking
   - Measure accuracy improvement

3. **Optimize Search Performance**
   - Add pgvector indexes
   - Tune similarity threshold
   - Implement caching

4. **Add Synonym Expansion**
   - Before vector search, expand synonyms
   - "coolant" → ["coolant", "antifreeze", "cooling fluid"]

**Deliverables:**
- Vector search service
- Integration with classification
- Performance benchmarks

#### Week 4: Testing & Tuning

**Tasks:**
1. **Test with 100+ Products**
   - Cover all categories
   - Include edge cases
   - Measure accuracy

2. **Tune Similarity Thresholds**
   - Find optimal cutoff
   - Balance precision vs recall

3. **A/B Testing**
   - Compare old (keyword) vs new (vector)
   - Measure confidence improvement
   - Collect user feedback

4. **Deploy to Production**
   - Gradual rollout
   - Monitor performance
   - Rollback plan ready

**Success Metrics:**
- Accuracy: 89% → 92%+
- Search time: <100ms
- User satisfaction: Positive feedback

---

### Phase 3: Hierarchical Classification (Weeks 5-6)

**Goal:** Implement smart chapter/heading detection for faster, more accurate classification

#### Week 5: Hierarchy Implementation

**Tasks:**
1. **Build Chapter Detector**
   ```typescript
   async function detectChapter(description: string): Promise<string>
   ```
   - Use AI to detect primary chapter
   - Narrow search space to ~500 codes

2. **Build Heading Selector**
   ```typescript
   async function selectHeading(description: string, chapter: string): Promise<string>
   ```
   - Within chapter, detect best heading
   - Further narrow to ~50 codes

3. **Integrate with Vector Search**
   - First: Detect chapter/heading
   - Then: Vector search within that heading only
   - Much faster, more accurate

4. **Add Confidence Adjustments**
   - Higher confidence when hierarchy is clear
   - Lower confidence when ambiguous

**Deliverables:**
- Hierarchical detection services
- Integrated classification pipeline
- Performance improvements

#### Week 6: "Other" Category Handling

**Tasks:**
1. **Implement Exclusion Logic**
   ```typescript
   async function handleOtherCategory(
     description: string,
     candidates: HSCode[]
   ): Promise<ClassificationResult>
   ```
   - Check if specific codes match first
   - Fall back to "Other" only if no match
   - Provide clear reasoning

2. **Smart Questionnaire for "Other"**
   - Detect when "Other" might apply
   - Ask disambiguating questions
   - Re-classify with answers

3. **Lower Confidence for "Other"**
   - Cap at 85% for "Other" categories
   - Add warning in UI
   - Suggest expert consultation

4. **Testing with Ambiguous Products**
   - Test 50+ products that fall under "Other"
   - Validate accuracy
   - Refine logic

**Success Metrics:**
- "Other" category accuracy: >80%
- Clear reasoning provided
- User understands why "Other"

---

### Phase 4: Smart Questionnaire (Weeks 7-8)

**Goal:** Only ask questions about missing critical information

#### Week 7: Info Extraction Service

**Tasks:**
1. **Build Info Extractor**
   ```typescript
   function extractInfo(description: string): ExtractedInfo {
     return {
       material: detectMaterial(description),
       productType: detectProductType(description),
       finishStatus: detectFinishStatus(description),
       purpose: detectPurpose(description),
       specificType: detectSpecificType(description)
     };
   }
   ```

2. **Build Question Selector**
   ```typescript
   function selectSmartQuestions(
     extracted: ExtractedInfo,
     category: string
   ): Question[] {
     // Only ask about gaps
     // Max 3 questions
   }
   ```

3. **Create Question Templates**
   - Material questions
   - Finish status questions
   - Purpose questions
   - Category-specific questions

4. **Add Pre-selection Logic**
   - Auto-select answers inferred from description
   - User just confirms or changes

**Deliverables:**
- Info extraction service
- Question selector service
- Question templates

#### Week 8: Frontend Integration

**Tasks:**
1. **Build Questionnaire UI Component**
   ```tsx
   <SmartQuestionnaire
     detectedInfo={info}
     questions={questions}
     onComplete={handleAnswers}
   />
   ```

2. **Show Detected Info**
   - Display what system understood
   - Build user trust
   - Allow corrections

3. **Two-Step Classification Flow**
   - Step 1: Detect info + show questions
   - Step 2: Final classification with answers

4. **Skip Button**
   - Allow quick classification
   - For users who don't want questions

**Success Metrics:**
- Question relevance: >90%
- Never ask redundant questions
- Confidence with questions: >95%

---

### Phase 5: Multi-Category Support (Weeks 9-10)

**Goal:** Expand beyond automotive to all product categories

#### Week 9: Category System

**Tasks:**
1. **Define All Categories**
   ```typescript
   const categories = [
     'Automotive Parts',
     'Electronics',
     'Textiles & Apparel',
     'Food & Agriculture',
     'Chemicals',
     'Machinery',
     'Plastics',
     'Metals',
     // ... 20+ categories
   ];
   ```

2. **Build Category Detector**
   - Multi-category AI classification
   - Confidence scoring per category
   - Handle ambiguous cases

3. **Create Category-Specific Rules**
   - Each category has unique factors
   - Electronics: voltage, wattage
   - Textiles: fabric type, blend percentage
   - Food: perishability, processing level

4. **Update Decision Trees**
   - Automotive: Existing 34 rules
   - Electronics: New rules
   - Textiles: New rules
   - etc.

**Deliverables:**
- Category detection system
- Category-specific rules
- Updated decision trees

#### Week 10: Testing & Refinement

**Tasks:**
1. **Test All Categories**
   - 20 products per category minimum
   - Measure accuracy per category
   - Identify weak spots

2. **Refine Category Rules**
   - Based on test results
   - Add missing rules
   - Remove redundant rules

3. **Update UI**
   - Show detected category
   - Category-specific help text
   - Examples per category

4. **Documentation**
   - Category-specific guides
   - Example products
   - Common issues

**Success Metrics:**
- All categories supported
- Accuracy >90% across categories
- User can classify any product

---

### Phase 6: Learning & Optimization (Weeks 11-12)

**Goal:** Continuous improvement based on user feedback

#### Week 11: Feedback System

**Tasks:**
1. **User Feedback Collection**
   ```tsx
   <FeedbackButtons>
     <button onClick={() => markCorrect()}>✓ Correct</button>
     <button onClick={() => markIncorrect()}>✗ Incorrect</button>
     <button onClick={() => markUnsure()}>? Unsure</button>
   </FeedbackButtons>
   ```

2. **Correction Flow**
   - If incorrect, let user provide correct code
   - Store correction
   - Update training data

3. **Feedback Database**
   ```prisma
   model ClassificationFeedback {
     id                  String   @id @default(cuid())
     productDescription  String
     suggestedCode       String
     actualCode          String?
     userFeedback        FeedbackType
     confidence          Float
     reasoning           String
     createdAt           DateTime @default(now())
   }
   ```

4. **Analytics Dashboard**
   - Accuracy by category
   - Common errors
   - User satisfaction
   - Cost tracking

**Deliverables:**
- Feedback system
- Correction flow
- Analytics dashboard

#### Week 12: Optimization

**Tasks:**
1. **Analyze Feedback Data**
   - Identify patterns in errors
   - Find commonly misclassified products
   - Detect systematic issues

2. **Retrain / Refine**
   - Update synonym database
   - Add missing keywords
   - Refine decision trees
   - Improve prompts

3. **Performance Optimization**
   - Reduce latency
   - Optimize database queries
   - Implement caching
   - Batch processing

4. **Cost Optimization**
   - Reduce AI calls where possible
   - Use cheaper models for simple tasks
   - Implement smart caching

**Success Metrics:**
- Accuracy: >95%
- Speed: <3 seconds
- Cost: <$0.005 per classification
- User satisfaction: >90%

---

## Detailed Technical Specifications

### Classification Algorithm (Complete Flow)

```typescript
/**
 * Main Classification Function
 *
 * Orchestrates the entire classification pipeline
 */
async function classifyProduct(
  description: string,
  destinationCountry?: string,
  questionnaireAnswers?: QuestionnaireAnswers
): Promise<ClassificationResult> {

  const startTime = Date.now();

  try {
    // ========================================
    // PHASE 1: Preprocessing & Info Extraction
    // ========================================
    console.log('Phase 1: Extracting information...');

    // Extract structured information from description
    const extractedInfo = extractInfo(description);
    // Result: { material: "ceramic", productType: "brake pads", ... }

    // Expand synonyms
    const expandedTerms = await expandSynonyms(extractedInfo);
    // "coolant" → ["coolant", "antifreeze", "cooling fluid", "ethylene glycol"]

    // Detect category
    const category = await detectCategory(description, extractedInfo);
    // Result: "Automotive Parts"

    // ========================================
    // PHASE 2: Hierarchical Narrowing
    // ========================================
    console.log('Phase 2: Hierarchical detection...');

    // Detect HS Code Chapter (2-digit)
    const chapter = await detectChapter(description, category);
    // Result: "87" (Vehicles and parts)

    // Narrow to Heading (4-digit)
    const heading = await selectHeading(description, chapter);
    // Result: "8708" (Parts of motor vehicles)

    // Narrow to Subheading (6-digit) - OPTIONAL
    const subheading = await selectSubheading(description, heading);
    // Result: "8708.30" (Brakes and servo-brakes)

    // ========================================
    // PHASE 3: Vector Search (Semantic Matching)
    // ========================================
    console.log('Phase 3: Semantic search...');

    // Generate embedding for search query
    const searchQuery = buildSearchQuery(description, expandedTerms, extractedInfo);
    const queryEmbedding = await generateEmbedding(searchQuery);

    // Search only within detected subheading (or heading if no subheading)
    const searchScope = subheading || heading;
    const vectorResults = await vectorSearch(queryEmbedding, {
      scope: searchScope,
      limit: 10
    });
    // Result: Top 10 similar HS codes with similarity scores

    // ========================================
    // PHASE 4: AI Re-ranking & Validation
    // ========================================
    console.log('Phase 4: AI re-ranking...');

    // Let GPT-4 evaluate the candidates
    const aiResult = await aiRerankCandidates(
      description,
      vectorResults,
      extractedInfo,
      questionnaireAnswers
    );

    // Handle "Other" categories with special logic
    if (aiResult.hsCode.includes('Other') || aiResult.hsCode.endsWith('.99')) {
      aiResult = await applyOtherCategoryLogic(aiResult, description);
    }

    // ========================================
    // PHASE 5: Smart Questionnaire (if needed)
    // ========================================

    if (aiResult.confidence < 85 && !questionnaireAnswers) {
      console.log('Phase 5: Generating smart questions...');

      // Generate questions about missing critical info
      const questions = generateSmartQuestions(
        extractedInfo,
        aiResult,
        category
      );

      return {
        success: true,
        needsQuestions: true,
        questions,
        partialResult: aiResult,
        detectedInfo: extractedInfo
      };
    }

    // ========================================
    // PHASE 6: Final Result Assembly
    // ========================================

    const duration = Date.now() - startTime;

    return {
      success: true,
      hsCode: aiResult.hsCode,
      description: aiResult.description,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      alternatives: aiResult.alternatives,
      category,
      detectedInfo: extractedInfo,
      processingTime: duration,
      metadata: {
        chapter,
        heading,
        subheading,
        isOther: aiResult.hsCode.includes('Other'),
        vectorSimilarity: vectorResults[0]?.similarity
      }
    };

  } catch (error) {
    console.error('Classification failed:', error);
    throw new ClassificationError('Failed to classify product', error);
  }
}
```

### Key Helper Functions

```typescript
/**
 * Extract structured information from product description
 */
function extractInfo(description: string): ExtractedInfo {
  const lower = description.toLowerCase();

  return {
    material: detectMaterial(lower),
    // Detects: ceramic, steel, aluminum, plastic, rubber, etc.

    productType: detectProductType(lower),
    // Detects: brake pads, filter, bulb, pump, etc.

    vehicleType: detectVehicleType(lower),
    // Detects: motorcycle, car, truck, bicycle, etc.

    finishStatus: detectFinishStatus(lower),
    // Detects: finished, semi-finished, raw, processed

    purpose: detectPurpose(lower),
    // Detects: aftermarket, OEM, replacement, original

    condition: detectCondition(lower),
    // Detects: new, used, refurbished, damaged

    specificAttributes: extractSpecificAttributes(lower)
    // Detects: dimensions, voltage, capacity, etc.
  };
}

/**
 * Expand user terms to include all synonyms
 */
async function expandSynonyms(info: ExtractedInfo): Promise<string[]> {
  const terms: string[] = [];

  // Query synonym database
  const synonyms = await prisma.productSynonym.findMany({
    where: {
      OR: [
        { canonicalTerm: { in: Object.values(info) } },
        { synonyms: { hasSome: Object.values(info) } }
      ]
    }
  });

  for (const syn of synonyms) {
    terms.push(syn.canonicalTerm, ...syn.synonyms);
  }

  return [...new Set(terms)]; // Deduplicate
}

/**
 * Detect HS Code Chapter using AI
 */
async function detectChapter(
  description: string,
  category: string
): Promise<string> {

  const prompt = `
You are an HS code expert. Detect the PRIMARY HS Code Chapter (2-digit) for this product.

Product: "${description}"
Category: ${category}

HS Code Chapters (examples):
- 84: Machinery and mechanical appliances
- 85: Electrical machinery and equipment
- 87: Vehicles, parts and accessories
- 39: Plastics and articles thereof
- 73: Articles of iron or steel

Return ONLY the 2-digit chapter number that best matches this product's PRIMARY classification.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 10
  });

  const chapter = response.choices[0]?.message?.content?.trim();
  return chapter || 'unknown';
}

/**
 * Handle "Other" category classifications with special logic
 */
async function applyOtherCategoryLogic(
  result: AIResult,
  description: string
): Promise<AIResult> {

  // Check if any specific codes match BEFORE falling back to "Other"
  const specificCodes = await findSpecificAlternatives(
    result.hsCode,
    description
  );

  if (specificCodes.length > 0) {
    // Found a more specific code, use that instead
    result.hsCode = specificCodes[0].code;
    result.confidence = Math.max(result.confidence - 5, 75);
    result.reasoning = `Originally classified as "Other" category, but found more specific code: ${specificCodes[0].description}. ${result.reasoning}`;
  } else {
    // Truly an "Other" category
    result.confidence = Math.min(result.confidence, 85); // Cap confidence
    result.reasoning += `\n\n⚠️ Classification Note: This product falls under a catch-all "Other" category (${result.hsCode}). This means it doesn't fit more specific HS code definitions. For high-value or critical shipments, consider consulting a customs expert to confirm this classification.`;
  }

  return result;
}

/**
 * Generate smart questions based on missing information
 */
function generateSmartQuestions(
  extractedInfo: ExtractedInfo,
  aiResult: AIResult,
  category: string
): Question[] {

  const questions: Question[] = [];

  // Only ask if information is MISSING and CRITICAL

  if (!extractedInfo.material && isMaterialCritical(aiResult.hsCode)) {
    questions.push({
      id: 'material',
      text: 'What is the primary material?',
      options: getMaterialOptionsForCode(aiResult.hsCode),
      reason: 'Material affects HS code classification for this product',
      required: true
    });
  }

  if (!extractedInfo.finishStatus && isFinishCritical(aiResult.hsCode)) {
    questions.push({
      id: 'finish',
      text: 'What is the product finish status?',
      options: [
        'Finished product (ready to install/use)',
        'Semi-finished (requires additional processing)',
        'Raw material/component'
      ],
      reason: 'Finish status determines specific HS code subheading',
      required: true
    });
  }

  if (!extractedInfo.purpose && aiResult.hsCode.includes('Other')) {
    questions.push({
      id: 'purpose',
      text: 'What is the intended use/market?',
      options: [
        'Aftermarket/Replacement part',
        'OEM/Original equipment',
        'Industrial/Commercial use',
        'Consumer/Retail use'
      ],
      reason: 'Helps narrow down the correct "Other" subcategory',
      required: false
    });
  }

  // Limit to 3 most important questions
  return questions.slice(0, 3);
}
```

---

## Cost Analysis

### Development Costs

| Phase | Duration | Estimated Hours | Developer Cost (@$50/hr) |
|-------|----------|----------------|--------------------------|
| Phase 1: Data Foundation | 2 weeks | 80 hours | $4,000 |
| Phase 2: Vector Search | 2 weeks | 80 hours | $4,000 |
| Phase 3: Hierarchical Classification | 2 weeks | 80 hours | $4,000 |
| Phase 4: Smart Questionnaire | 2 weeks | 80 hours | $4,000 |
| Phase 5: Multi-Category | 2 weeks | 80 hours | $4,000 |
| Phase 6: Learning & Optimization | 2 weeks | 80 hours | $4,000 |
| **Total** | **12 weeks** | **480 hours** | **$24,000** |

**Note:** This assumes solo developer. With 2 developers working in parallel, can be done in 6 weeks.

### Operational Costs (Monthly)

#### Infrastructure

| Service | Tier | Cost |
|---------|------|------|
| Railway (PostgreSQL + Backend) | Hobby | $5 |
| Vercel (Frontend) | Free | $0 |
| **Total Infrastructure** | | **$5/month** |

#### AI Services (per 1000 classifications)

| Service | Usage | Unit Cost | Monthly Cost |
|---------|-------|-----------|--------------|
| OpenAI Embeddings | 1000 queries × 50 tokens | $0.00002/1K tokens | $0.001 |
| OpenAI GPT-4o-mini | 1000 queries × 1000 tokens | $0.00015/1K tokens | $0.15 |
| **Total AI** | | | **$0.151** |

#### Total Monthly Cost

| Usage Level | Classifications/Month | Infrastructure | AI | **Total** |
|-------------|----------------------|----------------|-----|-----------|
| **Low** | 100 | $5 | $0.015 | **$5.02** |
| **Medium** | 1,000 | $5 | $0.151 | **$5.15** |
| **High** | 10,000 | $5 | $1.51 | **$6.51** |
| **Very High** | 100,000 | $5 | $15.10 | **$20.10** |

### Cost Per Classification

| Usage Level | Cost Per Classification |
|-------------|------------------------|
| 100/month | $0.05 |
| 1,000/month | $0.005 |
| 10,000/month | $0.0007 |
| 100,000/month | $0.0002 |

**Conclusion:** System becomes more cost-effective at scale!

### One-Time Costs

| Item | Cost | Frequency |
|------|------|-----------|
| HS Code Data Extraction | $500 (manual labor) | Once |
| Generate Embeddings (14K codes) | $0.30 | Once |
| Initial Testing & QA | $2,000 | Once |
| **Total One-Time** | **$2,500** | |

---

## Success Metrics

### Accuracy Metrics

| Metric | Phase 0 (Current) | Phase 2 Target | Phase 6 Target |
|--------|-------------------|----------------|----------------|
| Overall Accuracy | 89% | 92% | 95%+ |
| Automotive Category | 89% | 93% | 96% |
| Other Categories | N/A | 90% | 94% |
| "Other" Category Handling | Poor | Good | Excellent |
| Synonym Recognition | 60% | 85% | 95% |

### Performance Metrics

| Metric | Phase 0 (Current) | Phase 2 Target | Phase 6 Target |
|--------|-------------------|----------------|----------------|
| Response Time | 3-5 seconds | 2-4 seconds | 1-3 seconds |
| Database Size | 20 codes | 14,000 codes | 14,000+ codes |
| Vector Search Time | N/A | <100ms | <50ms |
| Questions Asked | 0 (no questionnaire) | 0-3 (smart) | 0-3 (smarter) |

### User Experience Metrics

| Metric | Target |
|--------|--------|
| User Satisfaction | >90% positive |
| Classification Confidence | >90% of results >85% confidence |
| Question Relevance | >95% (never ask redundant) |
| Mobile Usability | 100% WCAG 2.1 AA compliant |
| Time to First Result | <4 seconds |

### Business Metrics

| Metric | Target |
|--------|--------|
| Monthly Active Users | 1,000+ by Month 6 |
| Classifications per User | 5-10 average |
| User Retention | >60% return within 30 days |
| Feedback Rate | >20% provide feedback |
| Correction Rate | <10% of classifications corrected |

---

## Risk Mitigation

### Technical Risks

#### Risk 1: Vector Search Performance at Scale

**Risk:** pgvector might be slow with 14,000+ vectors

**Mitigation:**
- Implement hierarchical search (narrow to chapter first)
- Use IVFFLAT indexes properly
- Monitor query performance
- Fallback: Upgrade to Qdrant if needed (still free)

**Probability:** Medium
**Impact:** Medium
**Mitigation Cost:** $0 (Qdrant free tier)

#### Risk 2: AI Hallucinations

**Risk:** GPT-4 might generate incorrect HS codes

**Mitigation:**
- Always validate against database (only return codes that exist)
- Use temperature=0.1 for consistent results
- Implement confidence thresholds
- Show reasoning to user for verification

**Probability:** Low
**Impact:** High
**Mitigation:** Built into architecture

#### Risk 3: Data Quality Issues

**Risk:** Scraped HS code data might be inaccurate

**Mitigation:**
- Use multiple sources (cross-validate)
- Prioritize official government sources
- Manual QA for top 500 most common codes
- User feedback loop to catch errors

**Probability:** Medium
**Impact:** High
**Mitigation Cost:** $2,000 (QA labor)

### Business Risks

#### Risk 4: Synonym Database Incomplete

**Risk:** Missing key synonyms leads to poor matches

**Mitigation:**
- Start with automotive (known domain)
- Expand gradually based on user feedback
- Use AI to suggest synonyms
- Community contribution system

**Probability:** High
**Impact:** Medium
**Mitigation:** Ongoing process

#### Risk 5: Regulatory Changes

**Risk:** HS codes change annually

**Mitigation:**
- Design for easy updates
- Automated diff detection
- Version control for HS code database
- Notification system for changes

**Probability:** High (annual updates)
**Impact:** Medium
**Mitigation:** Built into design

### User Experience Risks

#### Risk 6: Users Don't Trust AI

**Risk:** Users might not trust AI-generated classifications

**Mitigation:**
- Show transparent reasoning
- Provide confidence scores
- Allow expert verification
- Build trust through accuracy
- Add disclaimer for high-value shipments

**Probability:** Medium
**Impact:** Medium
**Mitigation:** UX design focus

#### Risk 7: Too Many Questions

**Risk:** Smart questionnaire asks too much

**Mitigation:**
- Max 3 questions ever
- Only ask about missing critical info
- Show what was detected (transparency)
- Allow skip option
- Pre-select answers when possible

**Probability:** Low
**Impact:** Low
**Mitigation:** Built into design

---

## Appendix

### A. Technology Stack

**Frontend:**
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Vercel (hosting)

**Backend:**
- Node.js 20
- Express
- TypeScript
- Prisma ORM
- Railway (hosting)

**Database:**
- PostgreSQL 16
- pgvector extension

**AI/ML:**
- OpenAI GPT-4o-mini (classification)
- OpenAI text-embedding-3-small (embeddings)

**DevOps:**
- Git/GitHub
- Railway CI/CD
- Vercel CI/CD

### B. Key Dependencies

```json
{
  "backend": {
    "express": "^4.18.0",
    "prisma": "^5.20.0",
    "@prisma/client": "^5.20.0",
    "openai": "^4.67.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0"
  },
  "frontend": {
    "next": "14.0.0",
    "react": "^18.2.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0"
  }
}
```

### C. Environment Variables

```env
# Backend
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-proj-...
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://hs-code-classifier.vercel.app

# Frontend
NEXT_PUBLIC_API_URL=https://hs-code-classifier-production.up.railway.app
```

### D. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/classify` | POST | Classify product |
| `/api/detect-info` | POST | Extract info from description |
| `/api/questions` | GET | Get smart questions |
| `/api/feedback` | POST | Submit user feedback |
| `/api/codes/search` | GET | Search HS codes |
| `/api/codes/:code` | GET | Get code details |

### E. Database Tables

| Table | Purpose | Rows |
|-------|---------|------|
| `hs_codes` | All HS codes with embeddings | 14,000 |
| `product_synonyms` | Synonym mappings | 5,000+ |
| `decision_trees` | Category decision trees | 10-20 |
| `classification_feedback` | User feedback | Growing |
| `user_classifications` | Classification history | Growing |

### F. Testing Strategy

**Unit Tests:**
- Info extraction functions
- Synonym expansion
- Question generation logic

**Integration Tests:**
- Full classification pipeline
- Vector search
- AI integration

**E2E Tests:**
- User flows
- Classification accuracy
- Performance benchmarks

**Test Coverage Target:** >80%

### G. Documentation Structure

```
hs-code-classifier/
├── docs/
│   ├── PROJECT-SPEC-V3.md (this file)
│   ├── HS-CODE-EXTRACTION-GUIDE.md
│   ├── CLASSIFICATION-ALGORITHM.md
│   ├── API-DOCUMENTATION.md
│   └── USER-GUIDE.md
├── backend/
├── frontend/
└── data/
```

---

## Conclusion

This specification provides a complete roadmap for scaling the HS Code Classifier from 20 codes to 14,000+ codes while maintaining high accuracy and great user experience.

**Key Takeaways:**
1. **Vector search + pgvector** solves scalability (free!)
2. **Hierarchical classification** makes search efficient
3. **Smart questionnaire** improves accuracy without annoying users
4. **"Other" category handling** addresses real-world complexity
5. **Synonym database** bridges terminology gaps
6. **Phased approach** allows incremental progress

**Next Steps:**
1. Review and approve this specification
2. Begin Phase 1: Data Foundation
3. Iterate and refine based on real-world usage

---

**Document Version:** 3.0
**Last Updated:** November 24, 2024
**Status:** Draft - Pending Approval
**Author:** Claude Code + Aryan
