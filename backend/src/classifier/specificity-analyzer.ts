// backend/src/classifier/specificity-analyzer.ts

import { ExtractedAttributes, SpecificityResult, QuestionResponse } from './types';

/**
 * Attribute weights for completeness scoring
 */
const ATTRIBUTE_WEIGHTS: Record<string, number> = {
  material: 25,
  form: 25,
  function: 20,
  intended_use: 15,
  processing_state: 10,
  composition: 5,
};

// Material keywords for quick detection
const MATERIALS = [
  'cotton', 'silk', 'wool', 'polyester', 'nylon', 'leather', 'rubber',
  'plastic', 'steel', 'iron', 'aluminium', 'aluminum', 'copper', 'brass',
  'wood', 'paper', 'glass', 'ceramic', 'cement', 'concrete', 'stone',
  'coffee', 'tea', 'rice', 'wheat', 'sugar', 'gold', 'silver',
  // Spices
  'pepper', 'turmeric', 'cardamom', 'cinnamon', 'clove', 'ginger', 'cumin',
  'coriander', 'nutmeg', 'saffron', 'vanilla',
  // Pharmaceuticals
  'paracetamol', 'amoxicillin', 'aspirin', 'ibuprofen',
  // Electronics
  'lithium', 'led', 'lcd', 'battery'
];

// Form keywords
const FORMS = [
  'powder', 'liquid', 'tablet', 'capsule', 'fabric', 'sheet', 'bar',
  'wire', 'tube', 'pipe', 'block', 'tile', 'plate', 'coil', 'film',
  'granule', 'pellet', 'fiber', 'thread', 'yarn', 'cloth', 'beans',
  'pads', 'filter', 'pump', 'valve', 'seeds', 'whole', 'ground',
  'screen', 'display', 'disc', 'discs', 'disk', 'disks', 'radiator',
  'bushings', 'suspension', 'clinker', 'tiles', 'blocks', 't-shirt', 'shirt'
];

// Function keywords
const FUNCTIONS = [
  'brake', 'braking', 'engine', 'motor', 'pump', 'filter', 'bearing',
  'gear', 'valve', 'switch', 'connector', 'sensor', 'display',
  'heating', 'cooling', 'cutting', 'welding'
];

// Use keywords
const USES = [
  'vehicle', 'car', 'truck', 'aircraft', 'ship', 'industrial',
  'medical', 'pharmaceutical', 'food', 'cosmetic', 'construction',
  'agricultural', 'textile', 'packaging', 'automobile', 'laptop',
  'computer', 'phone', 'men', 'women', 'heavy', 'bulk'
];

// Processing state keywords
const STATES = [
  'raw', 'processed', 'finished', 'semi-finished', 'refined',
  'crude', 'instant', 'fresh', 'frozen', 'dried', 'roasted',
  'ground', 'polished', 'coated', 'woven', 'knitted', 'bulk',
  'green', 'unroasted', 'grade'
];

/**
 * Quick attribute extraction using keyword matching
 */
export function quickExtractAttributes(query: string): ExtractedAttributes {
  const q = query.toLowerCase();
  const attrs: ExtractedAttributes = { raw_query: query };

  // Material detection
  for (const mat of MATERIALS) {
    if (q.includes(mat)) {
      attrs.material = mat;
      break;
    }
  }

  // Form detection
  for (const form of FORMS) {
    if (q.includes(form)) {
      attrs.form = form;
      break;
    }
  }

  // Function detection
  for (const func of FUNCTIONS) {
    if (q.includes(func)) {
      attrs.function = func;
      break;
    }
  }

  // Intended use detection
  for (const use of USES) {
    if (q.includes(use)) {
      attrs.intended_use = use;
      break;
    }
  }

  // Processing state detection
  for (const state of STATES) {
    if (q.includes(state)) {
      attrs.processing_state = state;
      break;
    }
  }

  return attrs;
}

/**
 * Calculate completeness score (0-100)
 */
export function calculateCompletenessScore(attrs: ExtractedAttributes): number {
  let score = 0;
  let maxScore = 0;

  for (const [attr, weight] of Object.entries(ATTRIBUTE_WEIGHTS)) {
    maxScore += weight;
    if (attrs[attr as keyof ExtractedAttributes]) {
      score += weight;
    }
  }

  return Math.round((score / maxScore) * 100);
}

/**
 * Generate context-aware question for missing attributes
 */
function generateQuestion(attrs: ExtractedAttributes): QuestionResponse | null {
  const q = attrs.raw_query.toLowerCase();

  // If it looks like vehicle parts but no use specified
  if ((q.includes('brake') || q.includes('filter') || q.includes('bearing') ||
       q.includes('pads') || q.includes('pump')) && !attrs.intended_use) {
    return {
      question: 'What type of vehicle/equipment are these parts for?',
      options: [
        { id: 'motor_vehicle', label: 'Motor vehicles (cars, trucks, buses)', leads_to_chapter: '87' },
        { id: 'aircraft', label: 'Aircraft', leads_to_chapter: '88' },
        { id: 'railway', label: 'Railway/trains', leads_to_chapter: '86' },
        { id: 'industrial', label: 'Industrial machinery', leads_to_chapter: '84' },
        { id: 'other', label: 'Other/general use' },
      ],
      context: 'Parts are classified by the equipment they are designed for.',
      attribute_needed: 'intended_use'
    };
  }

  // If coffee but no processing state
  if (q.includes('coffee') && !attrs.processing_state && !attrs.form) {
    return {
      question: 'What type of coffee product is this?',
      options: [
        { id: 'beans_green', label: 'Green (unroasted) coffee beans', leads_to_chapter: '09' },
        { id: 'beans_roasted', label: 'Roasted coffee beans', leads_to_chapter: '09' },
        { id: 'ground', label: 'Ground roasted coffee', leads_to_chapter: '09' },
        { id: 'instant', label: 'Instant/soluble coffee', leads_to_chapter: '21' },
        { id: 'extract', label: 'Coffee extract/concentrate', leads_to_chapter: '21' },
      ],
      context: 'Raw/roasted coffee → Chapter 09. Instant/soluble → Chapter 21.',
      attribute_needed: 'processing_state'
    };
  }

  // If cement but unclear form
  if (q.includes('cement') && !attrs.form) {
    return {
      question: 'What form is this cement product?',
      options: [
        { id: 'powder', label: 'Cement powder/clinker (bulk)', leads_to_chapter: '25' },
        { id: 'blocks', label: 'Cement blocks/bricks', leads_to_chapter: '68' },
        { id: 'tiles', label: 'Cement tiles/slabs', leads_to_chapter: '68' },
        { id: 'pipes', label: 'Cement pipes', leads_to_chapter: '68' },
      ],
      context: 'Raw cement → Chapter 25. Cement articles → Chapter 68.',
      attribute_needed: 'form'
    };
  }

  // Skip generic question if product is already sufficiently specific
  // (has clear material + form + processing_state or is a known product type)
  const isSpecificProduct =
    (q.includes('coffee') && (q.includes('beans') || attrs.processing_state)) ||
    (q.includes('cement') && attrs.form) ||
    (q.includes('silk') && attrs.form) ||
    (q.includes('fabric') && attrs.processing_state) ||
    (attrs.material && attrs.form && attrs.processing_state);

  if (isSpecificProduct) {
    return null; // Proceed without asking
  }

  // Generic fallback - ask about intended use
  if (!attrs.intended_use && !attrs.function) {
    return {
      question: 'What is this product used for?',
      options: [
        { id: 'industrial', label: 'Industrial/manufacturing' },
        { id: 'consumer', label: 'Consumer/retail use' },
        { id: 'medical', label: 'Medical/pharmaceutical' },
        { id: 'food', label: 'Food/beverage industry' },
        { id: 'construction', label: 'Construction/building' },
        { id: 'automotive', label: 'Automotive/vehicles', leads_to_chapter: '87' },
      ],
      context: 'The intended use helps determine correct classification.',
      attribute_needed: 'intended_use'
    };
  }

  return null;
}

/**
 * Main specificity analysis function
 */
export function analyzeSpecificity(query: string): SpecificityResult {
  const attrs = quickExtractAttributes(query);
  const score = calculateCompletenessScore(attrs);

  const missingAttributes: string[] = [];
  for (const attr of Object.keys(ATTRIBUTE_WEIGHTS)) {
    if (!attrs[attr as keyof ExtractedAttributes]) {
      missingAttributes.push(attr);
    }
  }

  // Threshold: 50 = proceed, <50 = ask question
  // But also ask if score is exactly 45 (ambiguous cases like "brake pads")
  const shouldAsk = score < 50;
  const question = shouldAsk ? generateQuestion(attrs) : undefined;

  return {
    score,
    known_attributes: attrs,
    missing_attributes: missingAttributes,
    should_ask_question: shouldAsk && question !== null,
    suggested_question: question || undefined
  };
}
