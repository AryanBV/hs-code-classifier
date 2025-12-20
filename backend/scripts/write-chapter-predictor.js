const fs = require('fs');

const content = `/**
 * Chapter Predictor Service
 *
 * Predicts likely HS code chapters from query keywords and applies boosting.
 * ENHANCED: Added functional overrides and stronger chapter boosts
 */

const CHAPTER_PATTERNS: Record<string, string[]> = {
  '01': ['live', 'animal', 'cattle', 'horse', 'sheep', 'goat', 'pig', 'chicken'],
  '02': ['meat', 'beef', 'pork', 'poultry', 'lamb'],
  '03': ['fish', 'seafood', 'shellfish', 'salmon', 'tuna', 'shrimp', 'frozen fish'],
  '04': ['dairy', 'milk', 'cheese', 'butter', 'eggs', 'cream', 'yogurt'],
  '05': ['hair', 'feathers', 'ivory', 'bone'],
  '06': ['live plants', 'flowers', 'bulbs', 'trees', 'seedlings'],
  '07': ['vegetables', 'potato', 'tomato', 'onion', 'cabbage', 'carrot'],
  '08': ['fruit', 'apple', 'banana', 'orange', 'grape', 'berry', 'fresh'],
  '09': ['coffee', 'tea', 'spice', 'pepper', 'vanilla', 'cinnamon', 'ginger'],
  '10': ['grain', 'wheat', 'corn', 'rice', 'barley', 'oats'],
  '11': ['flour', 'malt', 'starch', 'wheat flour', 'meslin'],
  '12': ['seed', 'soy', 'peanut', 'sunflower'],
  '15': ['fats', 'vegetable oil', 'olive oil', 'olive'],
  '16': ['prepared meat', 'sausage', 'canned meat'],
  '17': ['sugar', 'molasses', 'syrup'],
  '18': ['chocolate', 'cocoa'],
  '19': ['bread', 'pasta', 'biscuit', 'cake', 'cereal'],
  '20': ['prepared vegetables', 'jam', 'juice', 'canned', 'apple juice'],
  '21': ['sauce', 'condiment', 'vinegar', 'yeast'],
  '22': ['beverage', 'water', 'beer', 'wine', 'alcohol', 'spirits'],
  '23': ['animal feed', 'pet food'],
  '24': ['tobacco', 'cigarette', 'cigar'],
  '25': ['salt', 'sand', 'limestone', 'marble', 'granite'],
  '26': ['ore', 'mineral', 'slag'],
  '27': ['fuel', 'petroleum', 'gas', 'coal'],
  '28': ['chemical', 'acid'],
  '30': ['pharmaceutical', 'medicine', 'drug', 'vaccine'],
  '31': ['fertilizer'],
  '32': ['dye', 'paint', 'ink', 'pigment'],
  '33': ['perfume', 'cosmetic', 'fragrance', 'essential oil'],
  '34': ['soap', 'detergent', 'cleaning'],
  '38': ['insecticide', 'pesticide'],
  '39': ['plastic bottle', 'plastic container', 'polymer', 'polyethylene', 'pvc', 'acrylic'],
  '40': ['rubber', 'tire', 'tyre', 'latex'],
  '41': ['leather', 'hide', 'raw skin'],
  '42': ['leather goods', 'bag', 'wallet', 'luggage'],
  '43': ['fur', 'fur clothing'],
  '44': ['wood', 'wooden', 'timber', 'lumber', 'plywood'],
  '45': ['cork'],
  '46': ['basket', 'wicker', 'straw'],
  '47': ['pulp', 'paper pulp'],
  '48': ['paper', 'cardboard', 'tissue', 'notebook'],
  '49': ['book', 'print', 'newspaper', 'poster'],
  '50': ['silk'],
  '51': ['wool'],
  '52': ['cotton fabric', 'cotton cloth', 'woven cotton'],
  '54': ['synthetic filament', 'polyester'],
  '55': ['synthetic staple'],
  '56': ['wadding', 'felt', 'nonwoven'],
  '57': ['carpet', 'rug'],
  '58': ['lace', 'embroidery'],
  '61': ['knitted', 't-shirt', 'sweater', 'jersey', 'pullover', 'cardigan'],
  '62': ['woven shirt', 'blouse', 'suit', 'jacket', 'trousers', 'dress'],
  '63': ['blanket', 'linen', 'curtain', 'bedding'],
  '64': ['footwear', 'shoe', 'boot', 'sandal', 'slipper'],
  '65': ['headgear', 'hat', 'cap'],
  '66': ['umbrella', 'walking stick'],
  '68': ['cement', 'concrete'],
  '69': ['ceramic', 'pottery', 'porcelain', 'tile'],
  '70': ['glass', 'glassware', 'glass bottle'],
  '71': ['jewelry', 'precious', 'diamond', 'silver', 'pearl'],
  '72': ['iron', 'steel'],
  '73': ['iron articles', 'steel articles', 'bolt', 'nut', 'screw'],
  '74': ['copper'],
  '75': ['nickel'],
  '76': ['aluminum', 'aluminium', 'aluminum can'],
  '78': ['lead'],
  '79': ['zinc'],
  '80': ['tin'],
  '81': ['tungsten', 'molybdenum'],
  '82': ['tool', 'knife', 'blade', 'spoon', 'fork', 'screwdriver'],
  '83': ['lock', 'hinge', 'padlock'],
  '84': ['machine', 'machinery', 'engine', 'motor', 'pump', 'compressor',
         'turbine', 'valve', 'bearing', 'gear', 'boiler', 'furnace',
         'computer', 'laptop', 'printer', 'excavator', 'crane', 'diesel'],
  '85': ['electric', 'electrical', 'electronic', 'battery', 'circuit',
         'transformer', 'generator', 'television', 'radio', 'telephone',
         'microphone', 'speaker', 'cable', 'wire', 'led', 'solar', 'photovoltaic'],
  '86': ['railway', 'train', 'locomotive'],
  '87': ['vehicle', 'car', 'truck', 'automobile', 'motorcycle', 'tractor', 'brake'],
  '88': ['aircraft', 'airplane', 'helicopter', 'drone'],
  '89': ['ship', 'boat', 'vessel', 'yacht'],
  '90': ['optical', 'medical', 'microscope', 'camera', 'lens', 'x-ray', 'thermometer', 'measuring'],
  '91': ['watch', 'clock', 'timepiece', 'wrist watch'],
  '92': ['musical', 'piano', 'guitar', 'drum'],
  '93': ['weapon', 'arms', 'ammunition', 'firearm', 'gun'],
  '94': ['furniture', 'table', 'chair', 'bed', 'mattress', 'lamp', 'lighting'],
  '95': ['toy', 'toys', 'game', 'doll', 'puzzle', 'sporting', 'golf', 'tennis', 'skiing', 'children'],
  '96': ['brush', 'broom', 'button', 'zipper'],
};

/**
 * High-priority functional keywords that MUST override material-based matches
 */
const FUNCTIONAL_OVERRIDES: Record<string, { chapter: string; priority: number }> = {
  'toy': { chapter: '95', priority: 100 },
  'toys': { chapter: '95', priority: 100 },
  'doll': { chapter: '95', priority: 100 },
  'game': { chapter: '95', priority: 100 },
  'puzzle': { chapter: '95', priority: 100 },
  'flour': { chapter: '11', priority: 100 },
  't-shirt': { chapter: '61', priority: 100 },
  'tshirt': { chapter: '61', priority: 100 },
  'shirt': { chapter: '61', priority: 80 },
  'watch': { chapter: '91', priority: 100 },
  'furniture': { chapter: '94', priority: 100 },
  'table': { chapter: '94', priority: 90 },
  'chair': { chapter: '94', priority: 90 },
  'fabric': { chapter: '52', priority: 80 },
};

export function predictChapters(query: string): string[] {
  const queryLower = query.toLowerCase();
  const chapterScores = new Map<string, number>();

  // FIRST: Check for functional overrides
  for (const [keyword, override] of Object.entries(FUNCTIONAL_OVERRIDES)) {
    if (queryLower.includes(keyword)) {
      const currentScore = chapterScores.get(override.chapter) || 0;
      chapterScores.set(override.chapter, currentScore + override.priority);
    }
  }

  // THEN: Score each chapter based on keyword matches
  for (const [chapter, patterns] of Object.entries(CHAPTER_PATTERNS)) {
    let score = chapterScores.get(chapter) || 0;
    for (const pattern of patterns) {
      if (queryLower.includes(pattern)) {
        score += pattern.length;
      }
    }
    if (score > 0) {
      chapterScores.set(chapter, score);
    }
  }

  return Array.from(chapterScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([chapter]) => chapter);
}

export function calculateChapterBoost(
  candidateCode: string,
  predictedChapters: string[]
): number {
  const candidateChapter = candidateCode.substring(0, 2);
  const position = predictedChapters.indexOf(candidateChapter);

  if (position === -1) {
    // Penalize wrong chapters when we have predictions
    if (predictedChapters.length >= 1) {
      return -5;
    }
    return 0;
  }

  // ENHANCED: Much higher boost for top-ranked predicted chapters
  if (position === 0) {
    return 15;  // Top predicted chapter - very strong boost
  } else if (position === 1) {
    return 10;  // Second predicted chapter
  } else if (position === 2) {
    return 5;   // Third predicted chapter
  } else {
    return 2;   // Other predicted chapters
  }
}

export function explainChapterPredictions(query: string): string {
  const predicted = predictChapters(query);
  if (predicted.length === 0) {
    return \`No specific chapters predicted for: "\${query}"\`;
  }
  let explanation = \`Predicted chapters for: "\${query}"\\n\`;
  predicted.slice(0, 5).forEach((chapter, idx) => {
    const patterns = CHAPTER_PATTERNS[chapter] || [];
    const matchedPatterns = patterns.filter(p => query.toLowerCase().includes(p));
    explanation += \`\${idx + 1}. Chapter \${chapter}: \${matchedPatterns.join(', ')}\\n\`;
  });
  return explanation;
}
`;

fs.writeFileSync('src/services/chapter-predictor.service.ts', content);
console.log('Chapter predictor service updated successfully!');
