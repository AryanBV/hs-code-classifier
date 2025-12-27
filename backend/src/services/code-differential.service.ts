/**
 * Code Differential Analysis Service
 *
 * Analyzes differences between candidate HS codes to identify what distinguishes them.
 * This is the core of the dynamic question generation system.
 *
 * Key Insight: The HS code descriptions themselves contain all the information
 * needed to know what questions to ask. We just need to extract the differences.
 */

import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ========================================
// Types
// ========================================

export type DifferentialType =
  | 'term'           // Generic term difference (lamp vs module)
  | 'price'          // Price threshold (≤ Rs 20)
  | 'specification'  // Technical spec (60W, 220V)
  | 'material'       // Material type (cotton, silk)
  | 'use'            // End use (industrial, household)
  | 'form'           // Form/state (fresh, dried, frozen)
  | 'processing'     // Processing level (crude, refined)
  | 'size'           // Size/weight category
  | 'packaging'      // Packaging type (bulk, retail)
  | 'grade'          // Quality grade (A, B, C)
  | 'gender'         // Target gender (men, women, children)
  | 'species';       // Species/variety (Arabica, Robusta)

export interface DifferentialOption {
  value: string;           // The distinguishing value (e.g., "lamp", "module")
  displayText: string;     // User-friendly display text
  matchingCodes: string[]; // HS codes that match this option
  sampleDescription: string; // Example description for context
}

export interface CodeDifferential {
  id: string;                    // Unique ID for this differential
  feature: string;               // Human-readable feature name (e.g., "Type: lamp vs module")
  type: DifferentialType;        // Category of differential
  distinctionType: 'binary' | 'multi' | 'numeric' | 'open';
  options: DifferentialOption[];
  importance: number;            // How many codes does this distinguish? (higher = more important)
  affectedCodes: string[];       // All codes affected by this differential
  extractedFrom: string[];       // Source descriptions (for debugging)
  questionHint: string;          // Suggested question text
}

export interface HsCodeForAnalysis {
  code: string;
  description: string;
  keywords?: string[];
  parentCode?: string;
}

// ========================================
// Pattern Definitions
// ========================================

// Price patterns (Indian Rupees common in ITC-HS)
const PRICE_PATTERNS = [
  { pattern: /not exceeding (?:Rs\.?|Rupees?)\s*(\d+)/i, type: 'max_price' as const },
  { pattern: /exceeding (?:Rs\.?|Rupees?)\s*(\d+)/i, type: 'min_price' as const },
  { pattern: /(?:Rs\.?|Rupees?)\s*(\d+)\s*(?:or less|and below)/i, type: 'max_price' as const },
  { pattern: /above (?:Rs\.?|Rupees?)\s*(\d+)/i, type: 'min_price' as const },
  { pattern: /retail (?:sale )?price/i, type: 'retail_price' as const },
];

// Specification patterns
const SPEC_PATTERNS = [
  { pattern: /(\d+)\s*(?:W|watt|watts)\b/i, unit: 'W', type: 'wattage' },
  { pattern: /(\d+)\s*(?:V|volt|volts)\b/i, unit: 'V', type: 'voltage' },
  { pattern: /(\d+)\s*(?:cc|ml|litre|liter|L)\b/i, unit: 'capacity', type: 'capacity' },
  { pattern: /(\d+)\s*(?:kg|g|gram|grams|ton|tonnes?)\b/i, unit: 'weight', type: 'weight' },
  { pattern: /(\d+)\s*(?:mm|cm|m|inch|inches)\b/i, unit: 'dimension', type: 'dimension' },
  { pattern: /(\d+)\s*(?:kW|HP|hp|horsepower)\b/i, unit: 'power', type: 'power' },
];

// Material terms
const MATERIAL_TERMS = new Set([
  'cotton', 'wool', 'silk', 'synthetic', 'polyester', 'nylon', 'acrylic',
  'leather', 'plastic', 'rubber', 'metal', 'steel', 'aluminum', 'aluminium',
  'wood', 'wooden', 'glass', 'ceramic', 'paper', 'cardboard', 'jute',
  'linen', 'viscose', 'rayon', 'bamboo', 'hemp', 'copper', 'brass', 'iron',
  'stainless', 'chrome', 'nickel', 'zinc', 'tin', 'lead', 'gold', 'silver',
]);

// Form/state terms
const FORM_TERMS = new Set([
  'fresh', 'frozen', 'dried', 'preserved', 'canned', 'pickled', 'salted',
  'smoked', 'processed', 'raw', 'cooked', 'live', 'dead', 'chilled',
  'refrigerated', 'whole', 'cut', 'sliced', 'diced', 'ground', 'powdered',
  'liquid', 'solid', 'paste', 'juice', 'extract', 'concentrate', 'pulp',
  'milled', 'hulled', 'parboiled', 'instant', 'roasted', 'unroasted',
]);

// Processing level terms
const PROCESSING_TERMS = new Set([
  'crude', 'refined', 'unrefined', 'virgin', 'extra virgin', 'processed',
  'unprocessed', 'bleached', 'unbleached', 'dyed', 'undyed', 'printed',
  'embroidered', 'woven', 'knitted', 'assembled', 'unassembled',
]);

// Use/purpose terms
const USE_TERMS = new Set([
  'industrial', 'household', 'domestic', 'commercial', 'automotive',
  'agricultural', 'medical', 'retail', 'wholesale', 'edible', 'technical',
  'for sowing', 'for planting', 'for consumption', 'for feed', 'ornamental',
]);

// Gender terms
const GENDER_TERMS = new Set([
  'men', 'mens', "men's", 'male', 'women', 'womens', "women's", 'female',
  'ladies', 'boys', 'girls', 'children', "children's", 'kids', 'unisex',
  'infants', 'babies', 'toddlers',
]);

// Packaging terms
const PACKAGING_TERMS = new Set([
  'bulk', 'retail', 'consumer', 'wholesale', 'packaged', 'unpackaged',
  'bottled', 'canned', 'boxed', 'bagged', 'loose', 'in bulk packing',
]);

// Grade/quality terms
const GRADE_TERMS = new Set([
  'grade a', 'grade b', 'grade c', 'a grade', 'b grade', 'c grade',
  'premium', 'standard', 'economy', 'first quality', 'second quality',
  'pb', 'ab', 'plantation', 'cherry', 'parchment', 'arabica', 'robusta',
]);

// Known variety/cultivar names for agricultural products
// These are specific named varieties that should trigger a "variety" question
const VARIETY_TERMS = new Set([
  // Mango varieties
  'alphonso', 'hapus', 'banganapalli', 'benishan', 'chausa', 'dasheri',
  'langda', 'langra', 'kesar', 'totapuri', 'mallika', 'neelam', 'safeda',
  'himsagar', 'fazli', 'amrapali', 'sindhu', 'ratna', 'pairi', 'rajapuri',
  // Rice varieties
  'basmati', 'non-basmati', 'parboiled', 'broken',
  // Tea varieties
  'darjeeling', 'assam', 'nilgiri', 'green', 'black', 'oolong',
  // Coffee varieties
  'arabica', 'robusta', 'instant', 'roasted', 'unroasted', 'decaffeinated',
  // Grape varieties
  'thompson', 'seedless', 'sultana', 'raisin',
  // Apple varieties
  'royal', 'delicious', 'gala', 'fuji', 'granny',
  // Banana varieties
  'cavendish', 'robusta', 'nendran', 'poovan',
  // Spice varieties
  'cardamom', 'small', 'large', 'green', 'black', 'white',
]);

// Common stopwords to ignore
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'if', 'than',
  'so', 'such', 'no', 'not', 'only', 'own', 'same', 'other', 'others',
  'their', 'its', 'whether', 'including', 'excluding', 'except',
]);

// ========================================
// Main Analysis Function
// ========================================

/**
 * Analyze differences between candidate HS codes
 * Returns a list of differentials that can be used to generate questions
 */
export async function analyzeCandidateDifferences(
  candidates: HsCodeForAnalysis[],
  productDescription: string
): Promise<CodeDifferential[]> {
  if (candidates.length < 2) {
    logger.debug('Not enough candidates for differential analysis');
    return [];
  }

  const differentials: CodeDifferential[] = [];
  const descriptions = candidates.map(c => c.description.toLowerCase());

  // 1. Check for price-based differentials
  const priceDiffs = detectPriceDifferentials(candidates);
  differentials.push(...priceDiffs);

  // 2. Check for specification-based differentials
  const specDiffs = detectSpecificationDifferentials(candidates);
  differentials.push(...specDiffs);

  // 3. Check for material differentials
  const materialDiffs = detectCategoryDifferentials(
    candidates,
    MATERIAL_TERMS,
    'material',
    'What material is the product made of?'
  );
  differentials.push(...materialDiffs);

  // 4. Check for form/state differentials
  const formDiffs = detectCategoryDifferentials(
    candidates,
    FORM_TERMS,
    'form',
    'What is the form or state of the product?'
  );
  differentials.push(...formDiffs);

  // 5. Check for processing level differentials
  const processingDiffs = detectCategoryDifferentials(
    candidates,
    PROCESSING_TERMS,
    'processing',
    'What is the processing level?'
  );
  differentials.push(...processingDiffs);

  // 6. Check for use/purpose differentials
  const useDiffs = detectCategoryDifferentials(
    candidates,
    USE_TERMS,
    'use',
    'What is the intended use or purpose?'
  );
  differentials.push(...useDiffs);

  // 7. Check for gender differentials
  const genderDiffs = detectCategoryDifferentials(
    candidates,
    GENDER_TERMS,
    'gender',
    'Who is the target user?'
  );
  differentials.push(...genderDiffs);

  // 8. Check for packaging differentials
  const packagingDiffs = detectCategoryDifferentials(
    candidates,
    PACKAGING_TERMS,
    'packaging',
    'What type of packaging?'
  );
  differentials.push(...packagingDiffs);

  // 9. Check for grade differentials
  const gradeDiffs = detectCategoryDifferentials(
    candidates,
    GRADE_TERMS,
    'grade',
    'What is the quality grade?'
  );
  differentials.push(...gradeDiffs);

  // 10. Check for variety/cultivar differentials (CRITICAL for agricultural products)
  const varietyDiffs = detectVarietyDifferentials(candidates, productDescription);
  differentials.push(...varietyDiffs);

  // 11. Check for sibling code differentials (when descriptions ARE the options)
  // This is CRITICAL for cases like mango varieties where each code's description is the variety name
  const siblingDiffs = detectSiblingCodeDifferentials(candidates, productDescription);
  differentials.push(...siblingDiffs);

  // 12. Detect generic term differentials (catch-all)
  const termDiffs = detectTermDifferentials(candidates, productDescription);
  differentials.push(...termDiffs);

  // Sort by importance (higher = distinguishes more codes)
  differentials.sort((a, b) => b.importance - a.importance);

  // Filter already covered by description
  const filteredDiffs = filterAlreadyCovered(differentials, productDescription);

  logger.info(`Differential analysis: ${filteredDiffs.length} differentials found from ${candidates.length} candidates`);

  return filteredDiffs;
}

// ========================================
// Differential Detection Functions
// ========================================

/**
 * Detect price-based differentials (e.g., "not exceeding Rs 20")
 */
function detectPriceDifferentials(candidates: HsCodeForAnalysis[]): CodeDifferential[] {
  const differentials: CodeDifferential[] = [];
  const priceGroups = new Map<string, { codes: string[]; threshold: number; type: string }>();

  for (const candidate of candidates) {
    const desc = candidate.description.toLowerCase();

    for (const { pattern, type } of PRICE_PATTERNS) {
      const match = desc.match(pattern);
      if (match) {
        const threshold = parseInt(match[1] || '0', 10);
        const key = `${type}_${threshold}`;

        if (!priceGroups.has(key)) {
          priceGroups.set(key, { codes: [], threshold, type });
        }
        priceGroups.get(key)!.codes.push(candidate.code);
      }
    }
  }

  // Create differentials for price thresholds
  if (priceGroups.size > 0) {
    const options: DifferentialOption[] = [];
    const allAffectedCodes: string[] = [];

    for (const [key, group] of priceGroups) {
      const displayText = group.type === 'max_price'
        ? `Rs ${group.threshold} or less`
        : `More than Rs ${group.threshold}`;

      options.push({
        value: key,
        displayText,
        matchingCodes: group.codes,
        sampleDescription: candidates.find(c => group.codes.includes(c.code))?.description || ''
      });

      allAffectedCodes.push(...group.codes);
    }

    // Add "other price" option for codes without explicit price
    const codesWithoutPrice = candidates
      .filter(c => !allAffectedCodes.includes(c.code))
      .map(c => c.code);

    if (codesWithoutPrice.length > 0) {
      options.push({
        value: 'other_price',
        displayText: 'Other/Standard price',
        matchingCodes: codesWithoutPrice,
        sampleDescription: candidates.find(c => codesWithoutPrice.includes(c.code))?.description || ''
      });
      allAffectedCodes.push(...codesWithoutPrice);
    }

    if (options.length >= 2) {
      differentials.push({
        id: `price_${Date.now()}`,
        feature: 'Price Category',
        type: 'price',
        distinctionType: options.length === 2 ? 'binary' : 'multi',
        options,
        importance: allAffectedCodes.length,
        affectedCodes: [...new Set(allAffectedCodes)],
        extractedFrom: candidates.slice(0, 5).map(c => c.description),
        questionHint: 'What is the retail price per unit?'
      });
    }
  }

  return differentials;
}

/**
 * Detect specification-based differentials (wattage, voltage, etc.)
 */
function detectSpecificationDifferentials(candidates: HsCodeForAnalysis[]): CodeDifferential[] {
  const differentials: CodeDifferential[] = [];

  for (const { pattern, unit, type } of SPEC_PATTERNS) {
    const specGroups = new Map<string, string[]>();

    for (const candidate of candidates) {
      const match = candidate.description.match(pattern);
      if (match) {
        const value = match[1]!;
        const key = `${value}${unit}`;

        if (!specGroups.has(key)) {
          specGroups.set(key, []);
        }
        specGroups.get(key)!.push(candidate.code);
      }
    }

    if (specGroups.size >= 2) {
      const options: DifferentialOption[] = [];
      const allCodes: string[] = [];

      for (const [spec, codes] of specGroups) {
        options.push({
          value: spec,
          displayText: spec,
          matchingCodes: codes,
          sampleDescription: candidates.find(c => codes.includes(c.code))?.description || ''
        });
        allCodes.push(...codes);
      }

      differentials.push({
        id: `spec_${type}_${Date.now()}`,
        feature: `${type.charAt(0).toUpperCase() + type.slice(1)} Specification`,
        type: 'specification',
        distinctionType: 'multi',
        options,
        importance: allCodes.length,
        affectedCodes: [...new Set(allCodes)],
        extractedFrom: candidates.slice(0, 5).map(c => c.description),
        questionHint: `What is the ${type} specification?`
      });
    }
  }

  return differentials;
}

/**
 * Detect differentials based on category terms (material, form, use, etc.)
 */
function detectCategoryDifferentials(
  candidates: HsCodeForAnalysis[],
  termSet: Set<string>,
  type: DifferentialType,
  questionHint: string
): CodeDifferential[] {
  const differentials: CodeDifferential[] = [];
  const termGroups = new Map<string, string[]>();

  for (const candidate of candidates) {
    const desc = candidate.description.toLowerCase();
    const words = desc.split(/[\s,;:\-()]+/);

    for (const word of words) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (termSet.has(cleanWord) || termSet.has(word)) {
        const term = cleanWord || word;
        if (!termGroups.has(term)) {
          termGroups.set(term, []);
        }
        if (!termGroups.get(term)!.includes(candidate.code)) {
          termGroups.get(term)!.push(candidate.code);
        }
      }
    }

    // Check for multi-word terms
    for (const term of termSet) {
      if (term.includes(' ') && desc.includes(term)) {
        if (!termGroups.has(term)) {
          termGroups.set(term, []);
        }
        if (!termGroups.get(term)!.includes(candidate.code)) {
          termGroups.get(term)!.push(candidate.code);
        }
      }
    }
  }

  // Only create differential if we have multiple distinct terms
  if (termGroups.size >= 2) {
    const options: DifferentialOption[] = [];
    const allCodes: string[] = [];

    for (const [term, codes] of termGroups) {
      options.push({
        value: term,
        displayText: term.charAt(0).toUpperCase() + term.slice(1),
        matchingCodes: codes,
        sampleDescription: candidates.find(c => codes.includes(c.code))?.description || ''
      });
      allCodes.push(...codes);
    }

    // Only add if it distinguishes codes
    const uniqueCodes = new Set(allCodes);
    if (uniqueCodes.size >= 2 && options.length >= 2) {
      differentials.push({
        id: `${type}_${Date.now()}`,
        feature: `${type.charAt(0).toUpperCase() + type.slice(1)}`,
        type,
        distinctionType: options.length === 2 ? 'binary' : 'multi',
        options,
        importance: uniqueCodes.size,
        affectedCodes: [...uniqueCodes],
        extractedFrom: candidates.slice(0, 5).map(c => c.description),
        questionHint
      });
    }
  }

  return differentials;
}

/**
 * Detect variety/cultivar differentials for agricultural products
 * This specifically looks for variety names in the VARIETY_TERMS set
 */
function detectVarietyDifferentials(
  candidates: HsCodeForAnalysis[],
  productDescription: string
): CodeDifferential[] {
  const varietyGroups = new Map<string, string[]>();

  for (const candidate of candidates) {
    const desc = candidate.description.toLowerCase();
    const words = desc.split(/[\s,;:\-()]+/);

    for (const word of words) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (VARIETY_TERMS.has(cleanWord)) {
        if (!varietyGroups.has(cleanWord)) {
          varietyGroups.set(cleanWord, []);
        }
        if (!varietyGroups.get(cleanWord)!.includes(candidate.code)) {
          varietyGroups.get(cleanWord)!.push(candidate.code);
        }
      }
    }
  }

  if (varietyGroups.size >= 2) {
    const options: DifferentialOption[] = [];
    const allCodes: string[] = [];

    for (const [variety, codes] of varietyGroups) {
      options.push({
        value: variety,
        displayText: variety.charAt(0).toUpperCase() + variety.slice(1),
        matchingCodes: codes,
        sampleDescription: candidates.find(c => codes.includes(c.code))?.description || ''
      });
      allCodes.push(...codes);
    }

    const uniqueCodes = new Set(allCodes);
    if (uniqueCodes.size >= 2) {
      return [{
        id: `variety_${Date.now()}`,
        feature: 'Variety/Cultivar',
        type: 'species',
        distinctionType: 'multi',
        options,
        importance: uniqueCodes.size * 2, // Higher importance for variety questions
        affectedCodes: [...uniqueCodes],
        extractedFrom: candidates.slice(0, 5).map(c => c.description),
        questionHint: 'What is the specific variety or cultivar?'
      }];
    }
  }

  return [];
}

/**
 * Detect sibling code differentials - when multiple 8-digit codes share the same parent
 * and their descriptions ARE the distinguishing factor (e.g., mango varieties)
 *
 * This is CRITICAL for cases like:
 * - 0804.50.21 "Alphonso (Hapus)"
 * - 0804.50.22 "Banganapalli"
 * - 0804.50.23 "Chausa"
 * Where each description is essentially a variety name
 */
function detectSiblingCodeDifferentials(
  candidates: HsCodeForAnalysis[],
  productDescription: string
): CodeDifferential[] {
  const differentials: CodeDifferential[] = [];

  // Group candidates by their parent code (first 7 characters: XXXX.XX)
  const parentGroups = new Map<string, HsCodeForAnalysis[]>();

  for (const candidate of candidates) {
    // Only process 8-digit codes
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(candidate.code)) continue;

    const parentCode = candidate.code.substring(0, 7); // e.g., "0804.50"
    if (!parentGroups.has(parentCode)) {
      parentGroups.set(parentCode, []);
    }
    parentGroups.get(parentCode)!.push(candidate);
  }

  // For each parent with multiple children, create a differential
  for (const [parentCode, siblings] of parentGroups) {
    // Need at least 2 siblings to create a differential
    if (siblings.length < 2) continue;

    // CRITICAL: Check if this sibling group is RELEVANT to the product description
    // Skip sibling groups for unrelated products (e.g., Tamarind/Sapota when searching for "mango")
    const descLower = productDescription.toLowerCase();
    const siblingTexts = siblings.map(s => s.description.toLowerCase()).join(' ');

    // Check if any word from product description appears in sibling descriptions
    const productWords = descLower.split(/\s+/).filter(w => w.length > 2);
    const hasRelevantSibling = productWords.some(word => siblingTexts.includes(word));

    // Also check if sibling descriptions contain the product name
    const productInSiblings = descLower.split(/\s+/).some(word =>
      word.length > 3 && siblings.some(s => s.description.toLowerCase().includes(word))
    );

    if (!hasRelevantSibling && !productInSiblings) {
      logger.debug(`[SIBLING DIFF] Skipping ${parentCode} - not relevant to "${productDescription}"`);
      continue;
    }

    // Check if this looks like a variety/type distinction
    // (short descriptions that are likely names, not technical specs)
    const avgDescLength = siblings.reduce((sum, s) => sum + s.description.length, 0) / siblings.length;
    const hasOtherCode = siblings.some(s => s.description.toLowerCase() === 'other' || s.code.endsWith('.90') || s.code.endsWith('.29') || s.code.endsWith('.99'));

    // If descriptions are short (avg < 50 chars) and there's variety, this is likely a type/variety choice
    if (avgDescLength <= 80 || hasOtherCode) {
      // Filter siblings to only include those relevant to the product (e.g., exclude "Guavas" when searching for "mango")
      const relevantSiblings = siblings.filter(sibling => {
        const siblingDesc = sibling.description.toLowerCase();
        // Always keep "Other" codes
        if (siblingDesc === 'other' || sibling.code.endsWith('.90') || sibling.code.endsWith('.29') || sibling.code.endsWith('.99')) {
          return true;
        }
        // Check if sibling description relates to the product
        const productWords = descLower.split(/\s+/).filter(w => w.length > 2);
        const isRelevant = productWords.some(word => siblingDesc.includes(word)) ||
          siblingDesc.split(/\s+/).some(word => word.length > 3 && descLower.includes(word));
        // For variety codes (short descriptions), keep them if they look like variety names
        if (siblingDesc.length < 30 && !siblingDesc.includes('fresh') && !siblingDesc.includes('dried')) {
          return true; // Likely a variety name like "Alphonso", "Kesar"
        }
        return isRelevant;
      });

      // Skip if no relevant siblings after filtering
      if (relevantSiblings.length < 2) continue;

      const options: DifferentialOption[] = relevantSiblings.map(sibling => {
        // Clean up description for display
        let displayText = sibling.description;
        // Remove parent context if present (e.g., "Guavas, mangoes and mangosteens:--- ")
        const colonIndex = displayText.lastIndexOf('---');
        if (colonIndex !== -1) {
          displayText = displayText.substring(colonIndex + 3).trim();
        }
        // Capitalize first letter
        displayText = displayText.charAt(0).toUpperCase() + displayText.slice(1);

        return {
          value: sibling.description.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          displayText,
          matchingCodes: [sibling.code],
          sampleDescription: sibling.description
        };
      });

      // Determine the feature name based on parent code
      let featureName = 'Type/Variety';
      // descLower already defined above

      // Infer more specific names based on product
      if (descLower.includes('mango')) featureName = 'Mango Variety';
      else if (descLower.includes('rice')) featureName = 'Rice Type';
      else if (descLower.includes('tea')) featureName = 'Tea Type';
      else if (descLower.includes('coffee')) featureName = 'Coffee Type';
      else if (descLower.includes('grape')) featureName = 'Grape Variety';
      else if (descLower.includes('apple')) featureName = 'Apple Variety';
      else if (descLower.includes('banana')) featureName = 'Banana Variety';
      else if (descLower.includes('orange')) featureName = 'Orange Variety';
      else if (descLower.includes('spice') || descLower.includes('cardamom')) featureName = 'Spice Type';

      differentials.push({
        id: `sibling_${parentCode}_${Date.now()}`,
        feature: featureName,
        type: 'species',
        distinctionType: 'multi',
        options,
        importance: relevantSiblings.length * 3, // HIGH importance - this is often the final decision
        affectedCodes: relevantSiblings.map(s => s.code),
        extractedFrom: relevantSiblings.map(s => s.description),
        questionHint: `Which specific ${featureName.toLowerCase()} is this?`
      });

      logger.info(`[SIBLING DIFF] Found ${relevantSiblings.length} relevant sibling codes (of ${siblings.length} total) under ${parentCode}: ${featureName}`);
    }
  }

  return differentials;
}

/**
 * Detect generic term differentials by finding unique terms in descriptions
 */
function detectTermDifferentials(
  candidates: HsCodeForAnalysis[],
  productDescription: string
): CodeDifferential[] {
  const differentials: CodeDifferential[] = [];
  const termFrequency = new Map<string, Set<string>>();

  // Extract significant terms from each candidate
  for (const candidate of candidates) {
    const terms = extractSignificantTerms(candidate.description);

    for (const term of terms) {
      if (!termFrequency.has(term)) {
        termFrequency.set(term, new Set());
      }
      termFrequency.get(term)!.add(candidate.code);
    }
  }

  // Find terms that appear in some but not all candidates
  const totalCandidates = candidates.length;
  const discriminatingTerms: Array<{ term: string; codes: string[]; coverage: number }> = [];

  for (const [term, codes] of termFrequency) {
    const coverage = codes.size / totalCandidates;
    // Terms that appear in 10-90% of candidates are potentially discriminating
    if (coverage >= 0.1 && coverage <= 0.9 && codes.size >= 2) {
      discriminatingTerms.push({
        term,
        codes: [...codes],
        coverage
      });
    }
  }

  // Group related terms that affect similar code sets
  const termGroups = groupRelatedTerms(discriminatingTerms);

  for (const group of termGroups) {
    if (group.terms.length >= 2) {
      const options: DifferentialOption[] = group.terms.map(({ term, codes }) => ({
        value: term,
        displayText: term.charAt(0).toUpperCase() + term.slice(1),
        matchingCodes: codes,
        sampleDescription: candidates.find(c => codes.includes(c.code))?.description || ''
      }));

      const allCodes = new Set(group.terms.flatMap(t => t.codes));

      differentials.push({
        id: `term_${group.name}_${Date.now()}`,
        feature: group.name,
        type: 'term',
        distinctionType: options.length === 2 ? 'binary' : 'multi',
        options,
        importance: allCodes.size,
        affectedCodes: [...allCodes],
        extractedFrom: candidates.slice(0, 5).map(c => c.description),
        questionHint: `What type of ${group.name.toLowerCase()} is this?`
      });
    }
  }

  return differentials;
}

/**
 * Extract significant terms from a description
 */
function extractSignificantTerms(description: string): string[] {
  const terms: string[] = [];
  const words = description.toLowerCase().split(/[\s,;:\-()]+/);

  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (clean.length >= 3 && !STOPWORDS.has(clean)) {
      terms.push(clean);
    }
  }

  return [...new Set(terms)];
}

/**
 * Group related discriminating terms
 */
function groupRelatedTerms(
  terms: Array<{ term: string; codes: string[]; coverage: number }>
): Array<{ name: string; terms: Array<{ term: string; codes: string[] }> }> {
  const groups: Array<{ name: string; terms: Array<{ term: string; codes: string[] }> }> = [];
  const used = new Set<string>();

  // Sort by coverage (mid-range coverage first as most discriminating)
  const sorted = [...terms].sort((a, b) => {
    const aCenterDist = Math.abs(a.coverage - 0.5);
    const bCenterDist = Math.abs(b.coverage - 0.5);
    return aCenterDist - bCenterDist;
  });

  for (const item of sorted) {
    if (used.has(item.term)) continue;

    // Find complementary terms (affect different codes)
    const complementary = sorted.filter(other => {
      if (used.has(other.term)) return false;
      if (other.term === item.term) return false;

      // Check if they affect mostly different codes
      const itemCodes = new Set(item.codes);
      const overlap = other.codes.filter(c => itemCodes.has(c)).length;
      const overlapRatio = overlap / Math.min(item.codes.length, other.codes.length);

      return overlapRatio < 0.5; // Less than 50% overlap
    });

    if (complementary.length > 0) {
      const groupTerms = [item, ...complementary.slice(0, 3)];
      groupTerms.forEach(t => used.add(t.term));

      groups.push({
        name: inferGroupName(groupTerms.map(t => t.term)),
        terms: groupTerms.map(t => ({ term: t.term, codes: t.codes }))
      });
    }
  }

  return groups;
}

/**
 * Infer a group name from terms
 */
function inferGroupName(terms: string[]): string {
  // Check for common patterns
  if (terms.some(t => MATERIAL_TERMS.has(t))) return 'Material';
  if (terms.some(t => FORM_TERMS.has(t))) return 'Form/State';
  if (terms.some(t => PROCESSING_TERMS.has(t))) return 'Processing';
  if (terms.some(t => USE_TERMS.has(t))) return 'Use/Purpose';
  if (terms.some(t => GENDER_TERMS.has(t))) return 'Target User';
  if (terms.some(t => PACKAGING_TERMS.has(t))) return 'Packaging';
  if (terms.some(t => GRADE_TERMS.has(t))) return 'Grade/Quality';

  // Default: use first term as name
  const firstTerm = terms[0];
  if (firstTerm) {
    return firstTerm.charAt(0).toUpperCase() + firstTerm.slice(1);
  }
  return 'Type';
}

/**
 * Filter out differentials already covered by the product description
 */
function filterAlreadyCovered(
  differentials: CodeDifferential[],
  productDescription: string
): CodeDifferential[] {
  const descLower = productDescription.toLowerCase();

  return differentials.filter(diff => {
    // Check if the description already mentions one of the options
    const coveredOptions = diff.options.filter(opt => {
      const valueLower = opt.value.toLowerCase();
      return descLower.includes(valueLower);
    });

    // If exactly one option is covered, this differential is resolved
    if (coveredOptions.length === 1) {
      logger.debug(`Differential "${diff.feature}" already covered by description (${coveredOptions[0]?.value})`);
      return false;
    }

    return true;
  });
}

// ========================================
// Utility Functions
// ========================================

/**
 * Get detailed info for codes to analyze
 */
export async function getCodesForAnalysis(codes: string[]): Promise<HsCodeForAnalysis[]> {
  const results = await prisma.hsCode.findMany({
    where: { code: { in: codes } },
    select: {
      code: true,
      description: true,
      keywords: true,
      parentHeading: true
    }
  });

  return results.map(r => ({
    code: r.code,
    description: r.description,
    keywords: r.keywords,
    parentCode: r.parentHeading || undefined
  }));
}

/**
 * Summarize differentials for logging
 */
export function summarizeDifferentials(differentials: CodeDifferential[]): string {
  if (differentials.length === 0) return 'No differentials found';

  return differentials
    .slice(0, 5)
    .map(d => `${d.feature}: ${d.options.map(o => o.displayText).join(' vs ')} (${d.importance} codes)`)
    .join('; ');
}
