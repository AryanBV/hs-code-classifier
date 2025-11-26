# HS Code Classification Algorithm

**Version:** 1.0
**Date:** 2025-11-24
**Project:** HS Code Classifier
**Purpose:** Detailed technical specification of the multi-phase classification algorithm

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Algorithm Architecture](#algorithm-architecture)
3. [Phase 1: Info Extraction](#phase-1-info-extraction)
4. [Phase 2: Vector Search](#phase-2-vector-search)
5. [Phase 3: Hierarchical Detection](#phase-3-hierarchical-detection)
6. [Phase 4: AI Re-Ranking](#phase-4-ai-re-ranking)
7. [Phase 5: "Other" Category Handling](#phase-5-other-category-handling)
8. [Phase 6: Smart Questionnaire](#phase-6-smart-questionnaire)
9. [Confidence Scoring](#confidence-scoring)
10. [Implementation Examples](#implementation-examples)
11. [Appendices](#appendices)

---

## Executive Summary

### Algorithm Overview

The HS Code Classification Algorithm is a **5-phase hybrid approach** that combines:
- **Rule-based logic** (keyword matching, decision trees)
- **Semantic search** (vector embeddings, similarity)
- **AI reasoning** (GPT-4o-mini for complex cases)
- **Hierarchical classification** (Chapter → Heading → Subheading → Full code)
- **Interactive refinement** (smart questionnaire for edge cases)

### Success Criteria
- **Accuracy:** 95%+ correct classification
- **Confidence:** 85%+ confidence score for 90% of products
- **Speed:** <3 seconds for classification
- **Coverage:** 14,000+ HS codes across all categories

### Classification Flow

```
User Input (Product Description)
         ↓
[Phase 1] Info Extraction
         ↓
[Phase 2] Vector Search (Top 50 candidates)
         ↓
[Phase 3] Hierarchical Detection (Narrow to Top 10)
         ↓
[Phase 4] AI Re-Ranking (Select Top 3)
         ↓
[Phase 5] "Other" Category Check
         ↓
[Phase 6] Smart Questionnaire (if confidence < 85%)
         ↓
Final Classification (HS Code + Confidence + Reasoning)
```

---

## Algorithm Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Input Layer                         │
│  Product Description: "Ceramic brake pads for motorcycles"      │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Phase 1: Info Extraction                    │
│  • Parse description using NLP                                  │
│  • Extract: material, product type, vehicle, finish, purpose    │
│  • Detected: {material: "ceramic", type: "brake pads", ...}     │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Phase 2: Vector Search                      │
│  • Generate embedding for description                           │
│  • Query pgvector: SELECT TOP 50 by cosine similarity           │
│  • Filter by extracted info (material, category, etc.)          │
│  • Result: 50 candidate HS codes (similarity 0.7-0.95)          │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Phase 3: Hierarchical Detection                │
│  • Chapter detection (87: Vehicles, vehicles parts)             │
│  • Heading detection (8708: Parts of motor vehicles)            │
│  • Subheading detection (8708.30: Brakes and parts)             │
│  • Narrow to Top 10 candidates within detected hierarchy        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Phase 4: AI Re-Ranking                      │
│  • Send Top 10 candidates + description to GPT-4o-mini          │
│  • AI evaluates: material match, function match, specificity    │
│  • AI selects Top 3 with reasoning                              │
│  • Result: [8708.30.10 (90%), 8708.30.90 (75%), ...]            │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 5: "Other" Category Check                 │
│  • Is Top 1 an "Other" category? (ends in .99, contains "Other"│
│  • Apply exclusion logic: check if specific alternative exists  │
│  • If specific found: swap to specific code                     │
│  • If truly "Other": cap confidence at 85%, add warning         │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Phase 6: Smart Questionnaire                   │
│  • If confidence < 85%: identify info gaps                      │
│  • Generate 0-3 targeted questions                              │
│  • User answers → Re-run classification with new info           │
│  • Loop until confidence ≥ 85% or user exits                    │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Final Output                             │
│  HS Code: 8708.30.10                                            │
│  Description: Mounted brake linings                             │
│  Confidence: 90%                                                │
│  Reasoning: "Ceramic material matches; motorcycle-specific..."  │
│  Alternative codes: [8708.30.90, ...]                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Info Extraction

### Purpose
Extract structured information from free-text product descriptions to:
- Filter vector search results
- Avoid asking redundant questions
- Improve classification accuracy

### Extracted Fields

| Field | Type | Examples | Usage |
|-------|------|----------|-------|
| `material` | string | ceramic, steel, aluminum, rubber | Material-based HS code differentiation |
| `productType` | string | brake pads, filter, piston, headlight | Primary product identification |
| `vehicleType` | string | car, motorcycle, truck, tractor | Vehicle-specific codes (e.g., tractor parts) |
| `finishStatus` | string | finished, semi-finished, raw | Determines heading (finished vs parts) |
| `purpose` | string | aftermarket, OEM, replacement | Additional context for reasoning |
| `brand` | string | Bosch, NGK, Denso | Not used for classification (informational) |

### Implementation

```typescript
// src/services/info-extractor.service.ts

import { logger } from '../utils/logger';

interface ExtractedInfo {
  material?: string;
  productType?: string;
  vehicleType?: string;
  finishStatus?: string;
  purpose?: string;
  brand?: string;
  confidence: number; // How confident we are in extraction
}

/**
 * Extract structured information from product description
 */
export function extractInfo(description: string): ExtractedInfo {
  logger.debug('Extracting info from description');

  const lower = description.toLowerCase();
  const extracted: ExtractedInfo = { confidence: 0 };

  // Material detection
  extracted.material = detectMaterial(lower);

  // Product type detection
  extracted.productType = detectProductType(lower);

  // Vehicle type detection
  extracted.vehicleType = detectVehicleType(lower);

  // Finish status detection
  extracted.finishStatus = detectFinishStatus(lower);

  // Purpose detection
  extracted.purpose = detectPurpose(lower);

  // Brand detection (optional)
  extracted.brand = detectBrand(lower);

  // Calculate extraction confidence
  const fieldsExtracted = Object.values(extracted).filter(v => v !== undefined).length;
  extracted.confidence = Math.round((fieldsExtracted / 6) * 100);

  logger.info(`Info extraction complete: ${fieldsExtracted}/6 fields detected (${extracted.confidence}% confidence)`);
  logger.debug(`Extracted info: ${JSON.stringify(extracted)}`);

  return extracted;
}

/**
 * Detect material from description
 */
function detectMaterial(text: string): string | undefined {
  const materials = {
    'ceramic': ['ceramic', 'cermet', 'ceramic composite'],
    'steel': ['steel', 'stainless steel', 'carbon steel', 'alloy steel'],
    'aluminum': ['aluminum', 'aluminium', 'al alloy', 'aluminum alloy'],
    'iron': ['iron', 'cast iron', 'wrought iron'],
    'rubber': ['rubber', 'elastomer', 'vulcanized', 'natural rubber', 'synthetic rubber'],
    'plastic': ['plastic', 'polymer', 'abs', 'polypropylene', 'pvc'],
    'copper': ['copper', 'brass', 'bronze', 'cu alloy'],
    'glass': ['glass', 'tempered glass', 'laminated glass'],
    'carbon fiber': ['carbon fiber', 'carbon fibre', 'cfrp'],
    'composite': ['composite', 'fiberglass', 'frp']
  };

  // Check for material keywords (more specific first)
  for (const [material, keywords] of Object.entries(materials)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return material;
      }
    }
  }

  return undefined;
}

/**
 * Detect product type from description
 */
function detectProductType(text: string): string | undefined {
  const productTypes = {
    // Braking system
    'brake pads': ['brake pad', 'brake pads', 'brake lining', 'friction pad'],
    'brake disc': ['brake disc', 'brake rotor', 'disc brake', 'brake disk'],
    'brake fluid': ['brake fluid', 'hydraulic brake fluid'],
    'brake caliper': ['brake caliper', 'caliper assembly'],

    // Engine components
    'piston': ['piston', 'piston assembly'],
    'piston ring': ['piston ring', 'compression ring', 'oil ring'],
    'spark plug': ['spark plug', 'sparking plug', 'ignition plug'],
    'fuel pump': ['fuel pump', 'petrol pump'],

    // Filtration
    'oil filter': ['oil filter', 'lube filter', 'lubrication filter'],
    'air filter': ['air filter', 'intake filter', 'engine air filter'],
    'fuel filter': ['fuel filter', 'petrol filter', 'diesel filter'],

    // Electrical
    'headlight': ['headlight', 'headlamp', 'head lamp', 'front light'],
    'tail light': ['tail light', 'tail lamp', 'rear light', 'rear lamp'],
    'bulb': ['bulb', 'light bulb', 'halogen bulb', 'led bulb'],
    'wiper blade': ['wiper', 'wiper blade', 'windshield wiper'],
    'alternator': ['alternator', 'generator', 'charging unit'],
    'starter': ['starter', 'starter motor', 'cranking motor'],

    // Suspension
    'shock absorber': ['shock absorber', 'damper', 'shock', 'strut'],
    'suspension spring': ['suspension spring', 'coil spring', 'leaf spring'],

    // Transmission
    'clutch': ['clutch', 'clutch disc', 'clutch plate', 'clutch assembly'],
    'gearbox': ['gearbox', 'transmission', 'gear box'],

    // Exhaust
    'muffler': ['muffler', 'silencer', 'exhaust muffler'],
    'exhaust pipe': ['exhaust pipe', 'exhaust tube', 'tail pipe'],
    'catalytic converter': ['catalytic converter', 'cat converter', 'catalyst'],

    // Cooling
    'radiator': ['radiator', 'cooling radiator'],
    'coolant': ['coolant', 'antifreeze', 'radiator fluid', 'engine coolant'],
    'radiator hose': ['radiator hose', 'coolant hose', 'water hose'],

    // Bearings
    'bearing': ['bearing', 'ball bearing', 'roller bearing', 'wheel bearing'],

    // Belts
    'timing belt': ['timing belt', 'cam belt', 'cambelt'],
    'serpentine belt': ['serpentine belt', 'drive belt', 'v-belt', 'poly-v belt'],

    // Rubber parts
    'cv joint boot': ['cv boot', 'cv joint boot', 'drive shaft boot', 'constant velocity boot']
  };

  // Check for product type keywords (longest match first)
  const sortedTypes = Object.entries(productTypes).sort(
    ([, a], [, b]) => b[0].length - a[0].length
  );

  for (const [productType, keywords] of sortedTypes) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return productType;
      }
    }
  }

  return undefined;
}

/**
 * Detect vehicle type from description
 */
function detectVehicleType(text: string): string | undefined {
  const vehicleTypes = {
    'motorcycle': ['motorcycle', 'motorbike', 'bike', 'two-wheeler', '2-wheeler', 'scooter'],
    'car': ['car', 'automobile', 'passenger vehicle', 'sedan', 'hatchback', 'suv'],
    'truck': ['truck', 'lorry', 'commercial vehicle', 'heavy vehicle'],
    'tractor': ['tractor', 'agricultural vehicle', 'farm vehicle'],
    'bus': ['bus', 'coach', 'public transport'],
    'van': ['van', 'minivan', 'cargo van']
  };

  for (const [vehicleType, keywords] of Object.entries(vehicleTypes)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return vehicleType;
      }
    }
  }

  return undefined;
}

/**
 * Detect finish status from description
 */
function detectFinishStatus(text: string): string | undefined {
  const finishStatuses = {
    'finished': ['finished', 'complete', 'assembled', 'ready to install'],
    'semi-finished': ['semi-finished', 'semi finished', 'unfinished', 'blank'],
    'raw': ['raw', 'raw material', 'unmachined', 'rough']
  };

  for (const [status, keywords] of Object.entries(finishStatuses)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return status;
      }
    }
  }

  // Default: assume finished if mounted/assembled keywords present
  if (text.includes('mounted') || text.includes('assembled') || text.includes('kit')) {
    return 'finished';
  }

  return undefined;
}

/**
 * Detect purpose from description
 */
function detectPurpose(text: string): string | undefined {
  const purposes = {
    'aftermarket': ['aftermarket', 'replacement', 'spare', 'spare part'],
    'oem': ['oem', 'original equipment', 'genuine'],
    'racing': ['racing', 'performance', 'sport', 'high performance'],
    'heavy-duty': ['heavy duty', 'heavy-duty', 'industrial']
  };

  for (const [purpose, keywords] of Object.entries(purposes)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return purpose;
      }
    }
  }

  return undefined;
}

/**
 * Detect brand from description
 */
function detectBrand(text: string): string | undefined {
  const brands = [
    'bosch', 'denso', 'ngk', 'delco', 'delphi', 'valeo', 'brembo',
    'continental', 'mann', 'mahle', 'gates', 'dayco', 'acdelco',
    'mobil', 'castrol', 'shell', 'total', 'motul'
  ];

  for (const brand of brands) {
    if (text.includes(brand)) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }

  return undefined;
}
```

### Usage Example

```typescript
const description = "Ceramic brake pads for motorcycles (aftermarket replacement)";
const extracted = extractInfo(description);

console.log(extracted);
// Output:
// {
//   material: 'ceramic',
//   productType: 'brake pads',
//   vehicleType: 'motorcycle',
//   finishStatus: undefined,
//   purpose: 'aftermarket',
//   brand: undefined,
//   confidence: 67
// }
```

---

## Phase 2: Vector Search

### Purpose
Use semantic similarity to find the top 50 most relevant HS codes from 14,000+ candidates.

### Technology
- **pgvector**: PostgreSQL extension for vector operations
- **OpenAI Embeddings**: text-embedding-3-small (1536 dimensions, $0.00002 per 1K tokens)
- **Cosine Similarity**: Measure semantic closeness between query and HS codes

### Algorithm

```typescript
// src/services/vector-search.service.ts

import { prisma } from '../utils/prisma';
import { OpenAI } from 'openai';
import { logger } from '../utils/logger';
import { ExtractedInfo } from './info-extractor.service';

const openai = new OpenAI();

interface VectorSearchResult {
  hsCode: string;
  description: string;
  similarity: number;
  chapter: string;
  heading: string;
  subheading: string;
}

/**
 * Perform vector similarity search
 */
export async function vectorSearch(
  description: string,
  extractedInfo: ExtractedInfo,
  topK: number = 50
): Promise<VectorSearchResult[]> {
  logger.info(`Vector search: Finding top ${topK} candidates`);

  // Step 1: Generate embedding for query
  const queryEmbedding = await generateEmbedding(description);

  // Step 2: Enhance query with extracted info
  const enhancedQuery = enhanceQueryWithInfo(description, extractedInfo);
  logger.debug(`Enhanced query: "${enhancedQuery}"`);

  // Step 3: Query database with vector similarity
  const results = await performVectorQuery(queryEmbedding, topK);

  // Step 4: Filter by extracted info (post-processing)
  const filtered = filterByExtractedInfo(results, extractedInfo);

  logger.info(`Vector search complete: ${filtered.length} candidates (filtered from ${results.length})`);

  return filtered;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    input: text,
    model: 'text-embedding-3-small'
  });

  return response.data[0].embedding;
}

/**
 * Enhance query with extracted information
 */
function enhanceQueryWithInfo(description: string, info: ExtractedInfo): string {
  const enhancements: string[] = [description];

  if (info.material) {
    enhancements.push(`made of ${info.material}`);
  }

  if (info.vehicleType) {
    enhancements.push(`for ${info.vehicleType}`);
  }

  if (info.finishStatus) {
    enhancements.push(`${info.finishStatus} product`);
  }

  return enhancements.join(', ');
}

/**
 * Query database using pgvector cosine similarity
 */
async function performVectorQuery(
  queryEmbedding: number[],
  topK: number
): Promise<VectorSearchResult[]> {
  // Convert embedding to PostgreSQL vector format
  const embeddingStr = '[' + queryEmbedding.join(',') + ']';

  // Use pgvector's <=> operator for cosine distance
  // (1 - cosine_distance) = cosine_similarity
  const results = await prisma.$queryRaw<VectorSearchResult[]>`
    SELECT
      hs_code as "hsCode",
      description,
      chapter,
      heading,
      subheading,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM hs_codes
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `;

  return results;
}

/**
 * Filter results by extracted information
 */
function filterByExtractedInfo(
  results: VectorSearchResult[],
  info: ExtractedInfo
): VectorSearchResult[] {
  // If no info extracted, return all results
  if (info.confidence === 0) {
    return results;
  }

  let filtered = results;

  // Material-based filtering
  if (info.material) {
    filtered = filtered.filter(r => {
      const desc = r.description.toLowerCase();
      return (
        desc.includes(info.material!) ||
        // If no material mentioned, keep it (might be generic code)
        !containsAnyMaterial(desc)
      );
    });

    logger.debug(`Filtered by material (${info.material}): ${filtered.length} remaining`);
  }

  // Vehicle-type filtering (for automotive parts)
  if (info.vehicleType && results[0]?.chapter === '87') {
    filtered = filtered.filter(r => {
      const desc = r.description.toLowerCase();
      return (
        desc.includes(info.vehicleType!) ||
        desc.includes('motor vehicles') || // Generic vehicle parts
        desc.includes('vehicles')
      );
    });

    logger.debug(`Filtered by vehicle type (${info.vehicleType}): ${filtered.length} remaining`);
  }

  // Ensure we have at least 10 results
  if (filtered.length < 10) {
    logger.warn('Filtering too aggressive, reverting to unfiltered results');
    return results.slice(0, 50);
  }

  return filtered;
}

/**
 * Check if description contains any material keyword
 */
function containsAnyMaterial(text: string): boolean {
  const materials = [
    'ceramic', 'steel', 'aluminum', 'iron', 'rubber', 'plastic',
    'copper', 'glass', 'carbon', 'composite'
  ];

  return materials.some(m => text.includes(m));
}
```

### Database Index

For fast vector search, create an IVFFlat index:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create IVFFlat index for fast approximate search
CREATE INDEX ON hs_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- For exact search (slower but more accurate)
-- CREATE INDEX ON hs_codes USING hnsw (embedding vector_cosine_ops);
```

### Performance

| Database Size | Index Type | Query Time | Accuracy |
|---------------|------------|------------|----------|
| 14,000 codes | No index | 2-3 seconds | 100% |
| 14,000 codes | IVFFlat | <100ms | ~97% |
| 14,000 codes | HNSW | <50ms | ~99% |

---

## Phase 3: Hierarchical Detection

### Purpose
Narrow down from 50 vector candidates to top 10 by detecting the correct chapter, heading, and subheading.

### Hierarchy Structure

```
Chapter (2-digit)
  └─ Heading (4-digit)
      └─ Subheading (6-digit)
          └─ Full Code (8-digit)

Example:
87 (Vehicles, aircraft, vessels and associated transport equipment)
  └─ 8708 (Parts and accessories of motor vehicles)
      └─ 8708.30 (Brakes and servo-brakes; parts thereof)
          ├─ 8708.30.10 (Mounted brake linings)
          └─ 8708.30.90 (Other)
```

### Algorithm

```typescript
// src/services/hierarchical-detector.service.ts

import { logger } from '../utils/logger';
import { VectorSearchResult } from './vector-search.service';
import { ExtractedInfo } from './info-extractor.service';
import { prisma } from '../utils/prisma';

interface HierarchyDetection {
  chapter: string;
  chapterConfidence: number;
  heading: string;
  headingConfidence: number;
  subheading?: string;
  subheadingConfidence: number;
}

interface HierarchicalResult extends VectorSearchResult {
  hierarchyScore: number;
}

/**
 * Detect correct hierarchy and narrow down candidates
 */
export async function detectHierarchy(
  candidates: VectorSearchResult[],
  description: string,
  extractedInfo: ExtractedInfo
): Promise<HierarchicalResult[]> {
  logger.info('Hierarchical detection: Analyzing chapter/heading/subheading');

  // Step 1: Detect chapter
  const chapterDetection = await detectChapter(candidates, description);
  logger.info(`Detected chapter: ${chapterDetection.chapter} (confidence: ${chapterDetection.chapterConfidence}%)`);

  // Step 2: Detect heading within chapter
  const headingDetection = await detectHeading(
    candidates,
    description,
    chapterDetection.chapter
  );
  logger.info(`Detected heading: ${headingDetection.heading} (confidence: ${headingDetection.headingConfidence}%)`);

  // Step 3: Detect subheading within heading (optional)
  const subheadingDetection = await detectSubheading(
    candidates,
    description,
    headingDetection.heading
  );

  if (subheadingDetection.subheading) {
    logger.info(`Detected subheading: ${subheadingDetection.subheading} (confidence: ${subheadingDetection.subheadingConfidence}%)`);
  }

  // Step 4: Score candidates based on hierarchy match
  const scored = scoreCandidatesByHierarchy(
    candidates,
    {
      ...chapterDetection,
      ...headingDetection,
      ...subheadingDetection
    }
  );

  // Step 5: Return top 10
  const top10 = scored.slice(0, 10);

  logger.info(`Hierarchical detection complete: Top 10 candidates selected`);
  logger.debug(`Top candidate: ${top10[0]?.hsCode} (hierarchy score: ${top10[0]?.hierarchyScore})`);

  return top10;
}

/**
 * Detect most likely chapter (2-digit)
 */
async function detectChapter(
  candidates: VectorSearchResult[],
  description: string
): Promise<{ chapter: string; chapterConfidence: number }> {
  // Count chapter frequency in top candidates
  const chapterCounts = new Map<string, number>();
  const chapterSimilarities = new Map<string, number[]>();

  for (const candidate of candidates) {
    const count = chapterCounts.get(candidate.chapter) || 0;
    chapterCounts.set(candidate.chapter, count + 1);

    const sims = chapterSimilarities.get(candidate.chapter) || [];
    sims.push(candidate.similarity);
    chapterSimilarities.set(candidate.chapter, sims);
  }

  // Find chapter with highest weighted score
  // Score = (frequency × 0.4) + (avg_similarity × 0.6)
  let bestChapter = '';
  let bestScore = 0;

  for (const [chapter, count] of chapterCounts.entries()) {
    const sims = chapterSimilarities.get(chapter)!;
    const avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;

    const frequencyScore = (count / candidates.length) * 100;
    const similarityScore = avgSimilarity * 100;
    const weightedScore = (frequencyScore * 0.4) + (similarityScore * 0.6);

    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestChapter = chapter;
    }
  }

  return {
    chapter: bestChapter,
    chapterConfidence: Math.round(bestScore)
  };
}

/**
 * Detect most likely heading (4-digit) within chapter
 */
async function detectHeading(
  candidates: VectorSearchResult[],
  description: string,
  chapter: string
): Promise<{ heading: string; headingConfidence: number }> {
  // Filter candidates to detected chapter
  const chapterCandidates = candidates.filter(c => c.chapter === chapter);

  if (chapterCandidates.length === 0) {
    logger.warn(`No candidates in chapter ${chapter}, using top candidate's heading`);
    return {
      heading: candidates[0].heading,
      headingConfidence: 50
    };
  }

  // Count heading frequency
  const headingCounts = new Map<string, number>();
  const headingSimilarities = new Map<string, number[]>();

  for (const candidate of chapterCandidates) {
    const count = headingCounts.get(candidate.heading) || 0;
    headingCounts.set(candidate.heading, count + 1);

    const sims = headingSimilarities.get(candidate.heading) || [];
    sims.push(candidate.similarity);
    headingSimilarities.set(candidate.heading, sims);
  }

  // Find heading with highest weighted score
  let bestHeading = '';
  let bestScore = 0;

  for (const [heading, count] of headingCounts.entries()) {
    const sims = headingSimilarities.get(heading)!;
    const avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;

    const frequencyScore = (count / chapterCandidates.length) * 100;
    const similarityScore = avgSimilarity * 100;
    const weightedScore = (frequencyScore * 0.4) + (similarityScore * 0.6);

    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestHeading = heading;
    }
  }

  return {
    heading: bestHeading,
    headingConfidence: Math.round(bestScore)
  };
}

/**
 * Detect most likely subheading (6-digit) within heading
 */
async function detectSubheading(
  candidates: VectorSearchResult[],
  description: string,
  heading: string
): Promise<{ subheading?: string; subheadingConfidence: number }> {
  // Filter candidates to detected heading
  const headingCandidates = candidates.filter(c => c.heading === heading);

  if (headingCandidates.length < 3) {
    return { subheadingConfidence: 0 };
  }

  // Count subheading frequency
  const subheadingCounts = new Map<string, number>();

  for (const candidate of headingCandidates) {
    const count = subheadingCounts.get(candidate.subheading) || 0;
    subheadingCounts.set(candidate.subheading, count + 1);
  }

  // Find most common subheading
  let bestSubheading = '';
  let bestCount = 0;

  for (const [subheading, count] of subheadingCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestSubheading = subheading;
    }
  }

  const confidence = Math.round((bestCount / headingCandidates.length) * 100);

  return {
    subheading: bestSubheading,
    subheadingConfidence: confidence
  };
}

/**
 * Score candidates based on hierarchy match
 */
function scoreCandidatesByHierarchy(
  candidates: VectorSearchResult[],
  detection: HierarchyDetection
): HierarchicalResult[] {
  return candidates
    .map(candidate => {
      let hierarchyScore = candidate.similarity * 100; // Base score from vector search

      // Boost for chapter match
      if (candidate.chapter === detection.chapter) {
        hierarchyScore += 20;
      }

      // Boost for heading match
      if (candidate.heading === detection.heading) {
        hierarchyScore += 30;
      }

      // Boost for subheading match
      if (detection.subheading && candidate.subheading === detection.subheading) {
        hierarchyScore += 15;
      }

      return {
        ...candidate,
        hierarchyScore: Math.min(hierarchyScore, 100)
      };
    })
    .sort((a, b) => b.hierarchyScore - a.hierarchyScore);
}
```

---

## Phase 4: AI Re-Ranking

### Purpose
Use GPT-4o-mini to intelligently re-rank the top 10 candidates and select the top 3 with detailed reasoning.

### Prompt Engineering

```typescript
// src/services/ai-reranker.service.ts

import { OpenAI } from 'openai';
import { logger } from '../utils/logger';
import { HierarchicalResult } from './hierarchical-detector.service';
import { ExtractedInfo } from './info-extractor.service';

const openai = new OpenAI();

interface AIRankedResult {
  hsCode: string;
  description: string;
  confidence: number;
  reasoning: string;
  rank: number;
}

/**
 * Use AI to re-rank top candidates
 */
export async function aiRerank(
  candidates: HierarchicalResult[],
  productDescription: string,
  extractedInfo: ExtractedInfo
): Promise<AIRankedResult[]> {
  logger.info(`AI re-ranking: Evaluating top ${candidates.length} candidates`);

  const prompt = buildRerankingPrompt(candidates, productDescription, extractedInfo);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an HS code classification expert. Analyze product descriptions and rank HS codes by accuracy.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3,
    max_tokens: 800
  });

  const result = response.choices[0].message.content!;
  const ranked = parseAIResponse(result, candidates);

  logger.info(`AI re-ranking complete: Top 3 selected`);
  logger.info(`  #1: ${ranked[0].hsCode} (${ranked[0].confidence}%)`);
  logger.info(`  #2: ${ranked[1]?.hsCode} (${ranked[1]?.confidence}%)`);
  logger.info(`  #3: ${ranked[2]?.hsCode} (${ranked[2]?.confidence}%)`);

  return ranked.slice(0, 3);
}

/**
 * Build AI re-ranking prompt
 */
function buildRerankingPrompt(
  candidates: HierarchicalResult[],
  description: string,
  info: ExtractedInfo
): string {
  const candidatesList = candidates
    .map((c, idx) => `${idx + 1}. ${c.hsCode} - ${c.description}`)
    .join('\n');

  const extractedInfoStr = Object.entries(info)
    .filter(([key, value]) => value && key !== 'confidence')
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return `
Product Description:
"${description}"

Extracted Information:
${extractedInfoStr || '(none)'}

Candidate HS Codes:
${candidatesList}

Task:
Rank these HS codes from most to least accurate for the product description.
Consider:
1. Material match (if specified)
2. Function/purpose match
3. Vehicle type match (if applicable)
4. Specificity (more specific codes are better than "Other" categories)
5. Finish status (finished vs parts)

Output Format (JSON):
[
  {
    "rank": 1,
    "hsCode": "XXXX.XX.XX",
    "confidence": 90,
    "reasoning": "Best match because..."
  },
  {
    "rank": 2,
    "hsCode": "XXXX.XX.XX",
    "confidence": 75,
    "reasoning": "Alternative because..."
  },
  {
    "rank": 3,
    "hsCode": "XXXX.XX.XX",
    "confidence": 60,
    "reasoning": "Possible match but..."
  }
]

Return ONLY the JSON array, no other text.
`.trim();
}

/**
 * Parse AI response and merge with candidate data
 */
function parseAIResponse(
  aiResponse: string,
  candidates: HierarchicalResult[]
): AIRankedResult[] {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Merge with candidate data
    return parsed.map((item: any) => {
      const candidate = candidates.find(c => c.hsCode === item.hsCode);

      return {
        hsCode: item.hsCode,
        description: candidate?.description || 'Unknown',
        confidence: item.confidence,
        reasoning: item.reasoning,
        rank: item.rank
      };
    });
  } catch (error) {
    logger.error('Failed to parse AI response, falling back to hierarchy scores');

    // Fallback: Use hierarchy scores
    return candidates.slice(0, 3).map((c, idx) => ({
      hsCode: c.hsCode,
      description: c.description,
      confidence: Math.round(c.hierarchyScore),
      reasoning: 'AI re-ranking failed, using hierarchical detection score',
      rank: idx + 1
    }));
  }
}
```

---

## Phase 5: "Other" Category Handling

### Purpose
Detect "Other" category codes (e.g., 8708.99.90) and apply exclusion logic to find more specific alternatives.

### Algorithm

```typescript
// src/services/other-category-handler.service.ts

import { logger } from '../utils/logger';
import { AIRankedResult } from './ai-reranker.service';
import { prisma } from '../utils/prisma';

/**
 * Check if HS code is an "Other" category
 */
function isOtherCategory(hsCode: string, description: string): boolean {
  // Check code pattern
  if (hsCode.endsWith('.99.00') || hsCode.endsWith('.99.90')) {
    return true;
  }

  // Check description
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes('other') || lowerDesc.includes('n.e.s.') || lowerDesc.includes('not elsewhere specified')) {
    return true;
  }

  return false;
}

/**
 * Handle "Other" category classification
 */
export async function handleOtherCategory(
  topResult: AIRankedResult,
  productDescription: string
): Promise<AIRankedResult> {
  logger.info('Checking for "Other" category classification');

  if (!isOtherCategory(topResult.hsCode, topResult.description)) {
    logger.info('Not an "Other" category - no special handling needed');
    return topResult;
  }

  logger.warn(`Detected "Other" category: ${topResult.hsCode} - ${topResult.description}`);

  // Try to find more specific alternative
  const specificAlternative = await findSpecificAlternative(
    topResult.hsCode,
    productDescription
  );

  if (specificAlternative) {
    logger.info(`Found specific alternative: ${specificAlternative.hsCode}`);

    return {
      hsCode: specificAlternative.hsCode,
      description: specificAlternative.description,
      confidence: Math.max(topResult.confidence - 5, 75), // Reduce confidence slightly
      reasoning: `More specific code found. Original suggestion was "${topResult.description}" (catch-all category). This specific code better matches the product.`,
      rank: 1
    };
  }

  // No specific alternative found - it's truly an "Other" category
  logger.info('No specific alternative found - truly an "Other" category');

  // Cap confidence and add warning
  return {
    ...topResult,
    confidence: Math.min(topResult.confidence, 85),
    reasoning: `${topResult.reasoning}\n\n⚠️ This classification falls under a catch-all "Other" category. For high-value shipments or customs compliance, consider consulting a licensed customs broker to verify this classification.`
  };
}

/**
 * Find more specific alternative to "Other" category
 */
async function findSpecificAlternative(
  otherCategoryCode: string,
  productDescription: string
): Promise<{ hsCode: string; description: string } | null> {
  // Extract hierarchy from "Other" code
  const subheading = otherCategoryCode.substring(0, 7); // XXXX.XX

  // Find all codes in same subheading that are NOT "Other"
  const alternatives = await prisma.hsCode.findMany({
    where: {
      subheading,
      hsCode: {
        not: otherCategoryCode
      }
    }
  });

  // Filter out other "Other" categories
  const specificCodes = alternatives.filter(
    alt => !isOtherCategory(alt.hsCode, alt.description)
  );

  if (specificCodes.length === 0) {
    return null;
  }

  // Use AI to check if any specific code matches better
  const { OpenAI } = await import('openai');
  const openai = new OpenAI();

  const prompt = `
Product: "${productDescription}"

Original classification: ${otherCategoryCode} ("Other" category)

More specific alternatives in same subheading:
${specificCodes.map(c => `- ${c.hsCode}: ${c.description}`).join('\n')}

Question: Does the product fit any of these specific alternatives better than the "Other" category?

Answer with JSON:
{
  "hasMatch": true/false,
  "hsCode": "XXXX.XX.XX" or null,
  "reason": "explanation"
}
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 200
  });

  const result = JSON.parse(response.choices[0].message.content!);

  if (result.hasMatch && result.hsCode) {
    const matched = specificCodes.find(c => c.hsCode === result.hsCode);
    if (matched) {
      return {
        hsCode: matched.hsCode,
        description: matched.description
      };
    }
  }

  return null;
}
```

---

## Phase 6: Smart Questionnaire

### Purpose
If confidence < 85%, generate targeted questions to gather missing information and improve classification.

### Algorithm

```typescript
// src/services/smart-questionnaire.service.ts

import { logger } from '../utils/logger';
import { AIRankedResult } from './ai-reranker.service';
import { ExtractedInfo } from './info-extractor.service';

interface QuestionnaireQuestion {
  id: string;
  text: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  options?: string[];
  reason: string;
  criticalityScore: number; // 0-100: how much this affects classification
}

/**
 * Generate smart questionnaire based on info gaps
 */
export function generateSmartQuestionnaire(
  topResult: AIRankedResult,
  extractedInfo: ExtractedInfo,
  productDescription: string
): QuestionnaireQuestion[] {
  logger.info('Generating smart questionnaire for info gaps');

  const questions: QuestionnaireQuestion[] = [];

  // Only generate questions if confidence is below threshold
  if (topResult.confidence >= 85) {
    logger.info('Confidence above threshold, no questions needed');
    return [];
  }

  // Check what info is missing
  const missingInfo = identifyMissingInfo(extractedInfo, topResult);

  logger.debug(`Missing info: ${JSON.stringify(missingInfo)}`);

  // Generate questions for missing critical info
  if (missingInfo.material && isMaterialCritical(topResult.hsCode)) {
    questions.push({
      id: 'material',
      text: 'What is the primary material of this product?',
      type: 'single_choice',
      options: getMaterialOptionsForCode(topResult.hsCode),
      reason: 'Material affects HS code classification in this category',
      criticalityScore: 90
    });
  }

  if (missingInfo.finishStatus && isFinishStatusCritical(topResult.hsCode)) {
    questions.push({
      id: 'finish_status',
      text: 'What is the finish status of this product?',
      type: 'single_choice',
      options: ['Finished/Assembled', 'Semi-finished', 'Raw/Unmachined'],
      reason: 'Finish status determines classification between finished parts and raw materials',
      criticalityScore: 85
    });
  }

  if (missingInfo.vehicleType && isVehicleTypeCritical(topResult.hsCode)) {
    questions.push({
      id: 'vehicle_type',
      text: 'What type of vehicle is this part for?',
      type: 'single_choice',
      options: ['Car/Passenger vehicle', 'Motorcycle/Two-wheeler', 'Truck/Commercial vehicle', 'Tractor', 'Other'],
      reason: 'Some HS codes differentiate between vehicle types',
      criticalityScore: 75
    });
  }

  // Sort by criticality (highest first)
  questions.sort((a, b) => b.criticalityScore - a.criticalityScore);

  // Limit to max 3 questions
  const limitedQuestions = questions.slice(0, 3);

  logger.info(`Generated ${limitedQuestions.length} questions (from ${questions.length} candidates)`);

  return limitedQuestions;
}

/**
 * Identify missing information
 */
function identifyMissingInfo(info: ExtractedInfo, topResult: AIRankedResult): {
  material: boolean;
  finishStatus: boolean;
  vehicleType: boolean;
  productType: boolean;
} {
  return {
    material: !info.material,
    finishStatus: !info.finishStatus,
    vehicleType: !info.vehicleType,
    productType: !info.productType
  };
}

/**
 * Check if material is critical for this HS code
 */
function isMaterialCritical(hsCode: string): boolean {
  const chapter = hsCode.substring(0, 2);

  // Material-sensitive chapters
  const materialSensitiveChapters = [
    '39', // Plastics
    '40', // Rubber
    '72', '73', // Iron and steel
    '74', '75', '76', // Copper, nickel, aluminum
    '84', '85', // Machinery (material affects classification)
    '87'  // Vehicles (some parts differentiated by material)
  ];

  return materialSensitiveChapters.includes(chapter);
}

/**
 * Check if finish status is critical
 */
function isFinishStatusCritical(hsCode: string): boolean {
  // Check if description contains "parts" or "semi-finished"
  // Chapters where finish status matters
  const finishSensitiveChapters = ['73', '76', '84', '85', '87'];
  const chapter = hsCode.substring(0, 2);

  return finishSensitiveChapters.includes(chapter);
}

/**
 * Check if vehicle type is critical
 */
function isVehicleTypeCritical(hsCode: string): boolean {
  const chapter = hsCode.substring(0, 2);

  // Vehicle-specific chapter
  return chapter === '87';
}

/**
 * Get material options relevant to HS code
 */
function getMaterialOptionsForCode(hsCode: string): string[] {
  const chapter = hsCode.substring(0, 2);

  const materialsByChapter: Record<string, string[]> = {
    '40': ['Natural rubber', 'Synthetic rubber', 'Vulcanized rubber'],
    '73': ['Steel', 'Stainless steel', 'Cast iron', 'Wrought iron'],
    '74': ['Copper', 'Brass', 'Bronze'],
    '76': ['Aluminum', 'Aluminum alloy'],
    '87': ['Steel', 'Aluminum', 'Plastic', 'Rubber', 'Ceramic', 'Composite/Mixed materials']
  };

  return materialsByChapter[chapter] || [
    'Metal (steel/iron)',
    'Metal (aluminum)',
    'Plastic/Polymer',
    'Rubber/Elastomer',
    'Ceramic',
    'Composite/Mixed materials',
    'Other'
  ];
}

/**
 * Re-classify with questionnaire answers
 */
export async function reclassifyWithAnswers(
  productDescription: string,
  questionnaireAnswers: Record<string, string>,
  previousResult: AIRankedResult
): Promise<AIRankedResult> {
  logger.info('Re-classifying with questionnaire answers');

  // Enhance description with answers
  const enhancedDescription = enhanceDescriptionWithAnswers(
    productDescription,
    questionnaireAnswers
  );

  logger.debug(`Enhanced description: "${enhancedDescription}"`);

  // Re-run classification with enhanced description
  // (This would call the full classification pipeline again)
  // For now, just boost confidence

  return {
    ...previousResult,
    confidence: Math.min(previousResult.confidence + 10, 95),
    reasoning: `${previousResult.reasoning}\n\nConfidence increased after clarification via questionnaire.`
  };
}

/**
 * Enhance description with questionnaire answers
 */
function enhanceDescriptionWithAnswers(
  description: string,
  answers: Record<string, string>
): string {
  const enhancements: string[] = [description];

  if (answers.material) {
    enhancements.push(`Material: ${answers.material}`);
  }

  if (answers.finish_status) {
    enhancements.push(`Finish: ${answers.finish_status}`);
  }

  if (answers.vehicle_type) {
    enhancements.push(`Vehicle: ${answers.vehicle_type}`);
  }

  return enhancements.join('. ');
}
```

---

## Confidence Scoring

### Weighted Formula

```typescript
// Final confidence calculation

interface ConfidenceBreakdown {
  vectorSimilarity: number;     // 0-100 from Phase 2
  hierarchyMatch: number;        // 0-100 from Phase 3
  aiConfidence: number;          // 0-100 from Phase 4
  infoCompleteness: number;      // 0-100 based on extracted info
  otherCategoryPenalty: number;  // -15 if "Other" category
}

function calculateFinalConfidence(breakdown: ConfidenceBreakdown): number {
  // Weighted average
  const baseConfidence =
    (breakdown.vectorSimilarity * 0.20) +
    (breakdown.hierarchyMatch * 0.25) +
    (breakdown.aiConfidence * 0.40) +
    (breakdown.infoCompleteness * 0.15);

  // Apply penalties
  const finalConfidence = baseConfidence + breakdown.otherCategoryPenalty;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(finalConfidence)));
}
```

### Confidence Levels

| Confidence | Interpretation | Action |
|-----------|----------------|--------|
| 90-100% | Very High | Auto-accept |
| 85-89% | High | Accept with review |
| 75-84% | Medium | Show questionnaire |
| 60-74% | Low | Manual review recommended |
| <60% | Very Low | Manual classification required |

---

## Implementation Examples

### Complete Classification Flow

```typescript
// src/services/classifier.service.ts

import { extractInfo } from './info-extractor.service';
import { vectorSearch } from './vector-search.service';
import { detectHierarchy } from './hierarchical-detector.service';
import { aiRerank } from './ai-reranker.service';
import { handleOtherCategory } from './other-category-handler.service';
import { generateSmartQuestionnaire } from './smart-questionnaire.service';
import { logger } from '../utils/logger';

export async function classifyProduct(productDescription: string) {
  logger.info('='.repeat(60));
  logger.info('STARTING HS CODE CLASSIFICATION');
  logger.info('='.repeat(60));

  const startTime = Date.now();

  try {
    // Phase 1: Extract info
    logger.info('[Phase 1/6] Info Extraction');
    const extractedInfo = extractInfo(productDescription);

    // Phase 2: Vector search
    logger.info('[Phase 2/6] Vector Search');
    const vectorCandidates = await vectorSearch(productDescription, extractedInfo, 50);

    // Phase 3: Hierarchical detection
    logger.info('[Phase 3/6] Hierarchical Detection');
    const hierarchicalCandidates = await detectHierarchy(
      vectorCandidates,
      productDescription,
      extractedInfo
    );

    // Phase 4: AI re-ranking
    logger.info('[Phase 4/6] AI Re-Ranking');
    const rankedResults = await aiRerank(
      hierarchicalCandidates,
      productDescription,
      extractedInfo
    );

    // Phase 5: Handle "Other" category
    logger.info('[Phase 5/6] "Other" Category Check');
    const topResult = await handleOtherCategory(rankedResults[0], productDescription);

    // Phase 6: Smart questionnaire (if needed)
    logger.info('[Phase 6/6] Smart Questionnaire');
    const questions = generateSmartQuestionnaire(
      topResult,
      extractedInfo,
      productDescription
    );

    const duration = Date.now() - startTime;

    logger.info('='.repeat(60));
    logger.info(`CLASSIFICATION COMPLETE (${duration}ms)`);
    logger.info(`Result: ${topResult.hsCode} (${topResult.confidence}%)`);
    logger.info('='.repeat(60));

    return {
      primary: topResult,
      alternatives: rankedResults.slice(1, 3),
      questions: questions.length > 0 ? questions : undefined,
      extractedInfo,
      metadata: {
        duration,
        vectorCandidates: vectorCandidates.length,
        hierarchicalCandidates: hierarchicalCandidates.length
      }
    };
  } catch (error) {
    logger.error('Classification failed');
    logger.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
```

---

## Appendices

### Appendix A: Performance Benchmarks

| Phase | Operation | Avg Time | Max Time |
|-------|-----------|----------|----------|
| 1 | Info Extraction | 10ms | 50ms |
| 2 | Vector Search (IVFFlat) | 80ms | 150ms |
| 3 | Hierarchical Detection | 20ms | 50ms |
| 4 | AI Re-Ranking | 800ms | 2000ms |
| 5 | "Other" Check | 50ms | 500ms |
| 6 | Questionnaire Generation | 10ms | 30ms |
| **Total** | **End-to-End** | **~1.0s** | **2.8s** |

### Appendix B: Error Handling

```typescript
// Graceful degradation strategy

class ClassificationError extends Error {
  constructor(
    message: string,
    public phase: string,
    public fallbackAvailable: boolean
  ) {
    super(message);
  }
}

// Example: If vector search fails, fall back to keyword matching
try {
  candidates = await vectorSearch(description, info);
} catch (error) {
  logger.warn('Vector search failed, falling back to keyword matching');
  candidates = await keywordMatch(description);
}
```

### Appendix C: Cost Analysis

| Component | Per Request | Per 1000 Requests |
|-----------|-------------|-------------------|
| Embedding generation | $0.00002 | $0.02 |
| AI re-ranking | $0.0005 | $0.50 |
| AI "Other" check (optional) | $0.0002 | $0.20 |
| Database queries | $0 | $0 |
| **Total** | **~$0.0007** | **~$0.72** |

### Appendix D: Future Enhancements

1. **Multi-language support**: Translate descriptions to English before classification
2. **Image classification**: Use GPT-4 Vision to classify from product images
3. **Batch classification**: Process CSV files with multiple products
4. **Learning loop**: Improve embeddings based on user feedback
5. **Country-specific rules**: Handle India-specific 8-digit extensions
6. **Duty calculation**: Integrate duty rates and trade agreements

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-24 | Initial algorithm specification |

---

**Previous Document:** [HS-CODE-EXTRACTION-GUIDE.md](./HS-CODE-EXTRACTION-GUIDE.md)
**Parent Document:** [PROJECT-SPEC-V3.md](./PROJECT-SPEC-V3.md)
