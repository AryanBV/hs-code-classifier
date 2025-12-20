/**
 * Critical Dimensions Type Definitions
 *
 * Defines mandatory dimensions that MUST be asked for accurate HS code classification.
 * The system ensures critical questions are NEVER skipped, regardless of LLM confidence.
 *
 * UNIVERSAL APPROACH:
 * Instead of hardcoding dimensions per chapter, we use a rule-based system that applies
 * to ALL products based on context clues in the product description and candidate codes.
 */

// ========================================
// Dimension Categories (Universal)
// ========================================

/**
 * Dimension category - grouped by importance level
 */
export type DimensionCategory =
  | 'identity'      // What the product IS (species, material, type)
  | 'state'         // Product state/form (fresh, frozen, processed)
  | 'quality'       // Grade/quality specifications
  | 'purpose'       // End use/intended application
  | 'packaging'     // Packaging/bulk vs retail
  | 'composition';  // Material composition percentage

/**
 * A critical dimension that may need to be asked
 */
export interface CriticalDimension {
  /** Unique dimension name */
  name: string;

  /** Display name for questions */
  displayName: string;

  /** Category for grouping */
  category: DimensionCategory;

  /** Priority level (1 = highest) */
  priority: 1 | 2 | 3 | 4 | 5;

  /** Patterns that indicate this dimension is relevant */
  triggerPatterns: RegExp[];

  /** Patterns that indicate this dimension is already covered */
  coveragePatterns: RegExp[];

  /** Question template to use */
  questionTemplate: string;

  /** Chapter ranges where this dimension is commonly needed (null = all chapters) */
  chapterRanges: [number, number][] | null;

  /** Whether this is mandatory when triggered (vs recommended) */
  mandatory: boolean;
}

// ========================================
// Universal Critical Dimensions
// ========================================

/**
 * UNIVERSAL DIMENSIONS
 *
 * These apply across ALL product categories based on contextual triggers.
 * The system detects when a dimension is relevant and ensures it's asked.
 */
export const CRITICAL_DIMENSIONS: CriticalDimension[] = [
  // ========== IDENTITY DIMENSIONS (Priority 1) ==========

  {
    name: 'material',
    displayName: 'Material/Composition',
    category: 'identity',
    priority: 1,
    triggerPatterns: [
      /\b(shirt|pants|dress|jacket|coat|fabric|textile|cloth|garment|apparel|clothing|sweater|t-shirt|blouse|skirt|suit)\b/i,
      /\b(bag|case|cover|wallet|belt|shoes?|boots?|sandals?)\b/i,
      /\b(rope|cord|twine|cable|wire)\b/i,
      /\b(made of|composed of)\b/i,
    ],
    coveragePatterns: [
      /\b(cotton|polyester|nylon|silk|wool|leather|synthetic|natural|plastic|metal|rubber|wood|glass|ceramic)\b/i,
      /\b(\d+%\s*(cotton|polyester|nylon|silk|wool))\b/i,
      /\b(pure|100%|blended|mixed)\b.*\b(cotton|silk|wool|polyester)\b/i,
    ],
    questionTemplate: 'What material is the product primarily made of?',
    chapterRanges: [[39, 40], [42, 43], [50, 63], [64, 65]], // Plastics, leather, textiles, footwear
    mandatory: true,
  },

  {
    name: 'species_variety',
    displayName: 'Species/Variety',
    category: 'identity',
    priority: 1,
    triggerPatterns: [
      /\b(coffee|tea|rice|wheat|corn|maize|fish|meat|chicken|beef|pork|shrimp|prawn)\b/i,
      /\b(plant|flower|seed|grain|cereal|nut|bean|legume)\b/i,
      /\b(animal|poultry|livestock|seafood)\b/i,
    ],
    coveragePatterns: [
      // Coffee species
      /\b(arabica|robusta|liberica)\b/i,
      // Tea types
      /\b(green tea|black tea|oolong|white tea|herbal tea)\b/i,
      // Rice varieties
      /\b(basmati|jasmine|long grain|short grain|brown rice|white rice)\b/i,
      // Specific species/varieties
      /\b(atlantic|pacific|chinook|tilapia|salmon|tuna|cod)\b/i,
      /\b(alphonso|totapuri|kent|keitt)\b/i, // Mango varieties
    ],
    questionTemplate: 'What is the specific variety or species?',
    chapterRanges: [[1, 14], [16, 24]], // Live animals through food products (skip chapter 15 oils for species)
    mandatory: true,
  },

  {
    name: 'product_type',
    displayName: 'Product Type/Category',
    category: 'identity',
    priority: 1,
    triggerPatterns: [
      /\b(pump|motor|machine|equipment|device|tool|instrument|apparatus)\b/i,
      /\b(part|component|accessory|spare)\b/i,
      /\b(vehicle|car|truck|motorcycle|bicycle)\b/i,
    ],
    coveragePatterns: [
      /\b(water pump|fuel pump|oil pump|hydraulic pump|vacuum pump|centrifugal pump|reciprocating pump)\b/i,
      /\b(electric motor|diesel motor|petrol motor|AC motor|DC motor|servo motor|stepper motor)\b/i,
      /\b(passenger|commercial|industrial|agricultural|medical|domestic)\b/i,
    ],
    questionTemplate: 'What specific type of product is it?',
    chapterRanges: [[84, 85], [87, 90]], // Machinery, vehicles, instruments
    mandatory: true,
  },

  // ========== STATE DIMENSIONS (Priority 2) ==========

  {
    name: 'form_state',
    displayName: 'Form/State',
    category: 'state',
    priority: 2,
    triggerPatterns: [
      /\b(food|fruit|vegetable|meat|fish|seafood|grain|nut|coffee|tea|spice)\b/i,
      /\b(mangoe?s?|bananas?|oranges?|apples?|grapes?|rice|wheat|corn|maize)\b/i,
      /\b(product|item|goods)\b/i,
    ],
    coveragePatterns: [
      /\b(fresh|frozen|dried|preserved|canned|pickled|salted|smoked|processed|raw|cooked)\b/i,
      /\b(whole|cut|sliced|diced|ground|powdered|liquid|solid|paste|juice|extract|concentrate)\b/i,
      /\b(live|dead|chilled|refrigerated|milled|hulled|parboiled)\b/i,
    ],
    questionTemplate: 'What is the form or state of the product?',
    chapterRanges: [[1, 24]], // Food/agricultural products
    mandatory: true,
  },

  {
    name: 'processing_level',
    displayName: 'Processing Level',
    category: 'state',
    priority: 2,
    triggerPatterns: [
      /\b(coffee|tea|cocoa|chocolate|sugar|rice|wheat|flour|oil)\b/i,
      /\b(processed|prepared|manufactured)\b/i,
    ],
    coveragePatterns: [
      /\b(roasted|unroasted|not roasted|raw|green|processed|unprocessed)\b/i,
      /\b(refined|unrefined|crude|virgin|extra virgin)\b/i,
      /\b(instant|soluble|extract|concentrate)\b/i,
      /\b(hulled|unhulled|shelled|unshelled|husked|dehusked)\b/i,
      /\b(plantation|cherry|parchment|washed|unwashed)\b/i,
    ],
    questionTemplate: 'What is the processing level of the product?',
    chapterRanges: [[1, 24], [15, 15]], // Food products and oils
    mandatory: true,
  },

  {
    name: 'caffeine_content',
    displayName: 'Caffeine Content',
    category: 'state',
    priority: 2,
    triggerPatterns: [
      /\b(coffee|tea|cocoa)\b/i,
    ],
    coveragePatterns: [
      /\b(decaf|decaffeinated|caffeine.?free|not decaffeinated|caffeinated)\b/i,
    ],
    questionTemplate: 'Is the product decaffeinated or regular?',
    chapterRanges: [[9, 9], [21, 21]], // Coffee, tea, food preparations
    mandatory: false,
  },

  // ========== QUALITY DIMENSIONS (Priority 3) ==========

  {
    name: 'quality_grade',
    displayName: 'Quality/Grade',
    category: 'quality',
    priority: 3,
    triggerPatterns: [
      /\b(coffee|tea|rice|wheat|cotton|silk|wool|diamond|gem|stone)\b/i,
      /\b(grade|quality|premium|standard)\b/i,
    ],
    coveragePatterns: [
      /\b(grade\s*[A-C]|[A-C]\s*grade|AB|PB|BB|premium|standard|first quality|second quality|reject)\b/i,
      /\b(extra fine|fine|coarse|super fine)\b/i,
      /\b(AAA|AA|A\+|industrial grade|food grade|pharmaceutical grade)\b/i,
    ],
    questionTemplate: 'What is the quality grade of the product?',
    chapterRanges: null, // Can apply to many chapters
    mandatory: false,
  },

  // ========== PURPOSE DIMENSIONS (Priority 4) ==========

  {
    name: 'end_use',
    displayName: 'End Use/Purpose',
    category: 'purpose',
    priority: 4,
    triggerPatterns: [
      /\b(pump|motor|valve|pipe|tube|wire|cable|switch|sensor)\b/i,
      /\b(chemical|compound|substance|reagent|acid|base|solvent)\b/i,
      /\b(part|component)\b/i,
    ],
    coveragePatterns: [
      /\b(for (sowing|planting|breeding|consumption|industrial|medicinal|cosmetic|edible|technical|cooking|frying))\b/i,
      /\b(automotive|agricultural|medical|domestic|industrial|commercial)\b/i,
      /\b(human consumption|animal feed|fuel|lubricant|cleaning)\b/i,
    ],
    questionTemplate: 'What is the intended end use or purpose?',
    chapterRanges: [[25, 40], [84, 90]], // Minerals, chemicals, machinery, instruments
    mandatory: true,
  },

  {
    name: 'target_user',
    displayName: 'Target User',
    category: 'purpose',
    priority: 4,
    triggerPatterns: [
      /\b(shirt|pants|dress|shoes|boots|sandals|hat|cap|gloves)\b/i,
      /\b(bicycle|toy|game|sport)\b/i,
    ],
    coveragePatterns: [
      /\b(men'?s?|women'?s?|boy'?s?|girl'?s?|children'?s?|kid'?s?|infant'?s?|baby|unisex|adult)\b/i,
    ],
    questionTemplate: 'Who is the target user (men, women, children)?',
    chapterRanges: [[61, 65], [95, 95]], // Apparel, footwear, toys
    mandatory: false,
  },

  // ========== PACKAGING DIMENSIONS (Priority 4) ==========

  {
    name: 'packaging_type',
    displayName: 'Packaging Type',
    category: 'packaging',
    priority: 4,
    triggerPatterns: [
      /\b(coffee|tea|rice|spice|sugar|flour|grain|seed|nut)\b/i,
      /\b(food|beverage|drink)\b/i,
    ],
    coveragePatterns: [
      /\b(bulk|retail|packaged|loose|bagged|boxed|canned|bottled)\b/i,
      /\b(in bulk|bulk packing|immediate packing|consumer pack|industrial pack)\b/i,
      /\b(\d+\s*(g|kg|ml|l|oz|lb)\s*(pack|package|bag|box|tin|can))\b/i,
    ],
    questionTemplate: 'What is the packaging type (bulk/retail)?',
    chapterRanges: [[1, 24]], // Food/agricultural products
    mandatory: false, // Often inferred from context
  },

  // ========== COMPOSITION DIMENSIONS (Priority 2) ==========

  {
    name: 'content_percentage',
    displayName: 'Content Percentage',
    category: 'composition',
    priority: 2,
    triggerPatterns: [
      /\b(chocolate|cocoa|sugar|alcohol|ethanol|fat|oil|butter|cream|milk)\b/i,
      /\b(blend|mixed|containing|with)\b/i,
    ],
    coveragePatterns: [
      /\b(\d+%|\d+ percent|more than \d+|less than \d+|not exceeding \d+|exceeding \d+)\b.*\b(cocoa|sugar|fat|alcohol|milk)\b/i,
      /\b(pure|100%|containing \d+%)\b/i,
    ],
    questionTemplate: 'What is the percentage of the main ingredient?',
    chapterRanges: [[17, 22]], // Sugar, cocoa, food preparations
    mandatory: false,
  },

  {
    name: 'weight_capacity',
    displayName: 'Weight/Capacity',
    category: 'composition',
    priority: 3,
    triggerPatterns: [
      /\b(vehicle|truck|lorry|trailer|motor|engine|machine)\b/i,
      /\b(cylinder|tank|container|vessel)\b/i,
    ],
    coveragePatterns: [
      /\b(not exceeding|exceeding|up to|over|under|less than|more than)\s*\d+\s*(kg|g|ton|tonnes?|cc|cm3|ml|l|kw|hp|watts?)\b/i,
      /\b(\d+\s*(kg|ton|cc|kw|hp))\b/i,
    ],
    questionTemplate: 'What is the weight/capacity specification?',
    chapterRanges: [[84, 85], [87, 89]], // Machinery, vehicles
    mandatory: false,
  },
];

// ========================================
// Dimension Coverage Tracking
// ========================================

/**
 * Status of a dimension in the current conversation
 */
export type DimensionStatus =
  | 'not_applicable'    // Dimension not relevant for this product
  | 'covered_explicit'  // User answered a question about this
  | 'covered_implicit'  // Inferred from product description
  | 'uncovered'         // Relevant but not yet asked
  | 'skipped';          // Was asked but user skipped/other'd

/**
 * Tracking entry for a single dimension
 */
export interface DimensionCoverage {
  /** Dimension name */
  dimension: string;

  /** Current status */
  status: DimensionStatus;

  /** How it was covered (question ID or 'inferred') */
  coveredBy?: string;

  /** The value/answer if covered */
  value?: string;

  /** Whether this is mandatory for the current product */
  isMandatory: boolean;
}

/**
 * Full coverage tracking for a conversation
 */
export interface QuestionCoverage {
  /** Conversation ID */
  conversationId: string;

  /** Original product description */
  productDescription: string;

  /** Detected chapter (if known) */
  detectedChapter?: number;

  /** Coverage status for each relevant dimension */
  dimensions: DimensionCoverage[];

  /** Total mandatory dimensions */
  totalMandatory: number;

  /** Covered mandatory dimensions */
  coveredMandatory: number;

  /** Whether all mandatory dimensions are covered */
  isComplete: boolean;

  /** Last updated timestamp */
  lastUpdated: string;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Get relevant dimensions for a product based on description and chapter
 */
export function getRelevantDimensions(
  productDescription: string,
  candidateChapters: number[]
): CriticalDimension[] {
  const relevant: CriticalDimension[] = [];
  const descLower = productDescription.toLowerCase();

  for (const dim of CRITICAL_DIMENSIONS) {
    // Check if any trigger pattern matches
    const isTriggered = dim.triggerPatterns.some(pattern => pattern.test(descLower));

    if (!isTriggered) continue;

    // Check if chapter is relevant (if chapter ranges specified)
    if (dim.chapterRanges !== null) {
      const chapterMatch = candidateChapters.some(chapter =>
        dim.chapterRanges!.some(([min, max]) => chapter >= min && chapter <= max)
      );
      if (!chapterMatch) continue;
    }

    relevant.push(dim);
  }

  // Sort by priority
  return relevant.sort((a, b) => a.priority - b.priority);
}

/**
 * Check if a dimension is already covered in the description
 */
export function isDimensionCoveredInDescription(
  dimension: CriticalDimension,
  description: string
): boolean {
  const descLower = description.toLowerCase();
  return dimension.coveragePatterns.some(pattern => pattern.test(descLower));
}

/**
 * Extract chapter numbers from candidate HS codes
 */
export function extractChaptersFromCodes(codes: string[]): number[] {
  const chapters = new Set<number>();

  for (const code of codes) {
    const chapterStr = code.substring(0, 2);
    const chapter = parseInt(chapterStr, 10);
    if (!isNaN(chapter)) {
      chapters.add(chapter);
    }
  }

  return Array.from(chapters);
}

/**
 * Get uncovered mandatory dimensions
 */
export function getUncoveredMandatory(coverage: QuestionCoverage): DimensionCoverage[] {
  return coverage.dimensions.filter(
    d => d.isMandatory && d.status === 'uncovered'
  );
}

/**
 * Check if classification should be blocked due to missing dimensions
 */
export function shouldBlockClassification(coverage: QuestionCoverage): {
  blocked: boolean;
  reason?: string;
  missingDimensions: string[];
} {
  const uncovered = getUncoveredMandatory(coverage);

  if (uncovered.length === 0) {
    return { blocked: false, missingDimensions: [] };
  }

  return {
    blocked: true,
    reason: `Missing mandatory dimensions: ${uncovered.map(d => d.dimension).join(', ')}`,
    missingDimensions: uncovered.map(d => d.dimension),
  };
}

export default {
  CRITICAL_DIMENSIONS,
  getRelevantDimensions,
  isDimensionCoveredInDescription,
  extractChaptersFromCodes,
  getUncoveredMandatory,
  shouldBlockClassification,
};
