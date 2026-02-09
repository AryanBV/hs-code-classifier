/**
 * CONFUSING CHAPTER PAIRS
 *
 * When both chapters in a pair appear in top candidates AND
 * query contains trigger keywords, ALWAYS ask clarifying question.
 *
 * Based on verified test failures.
 */

export interface ConfusingPair {
  chapters: [string, string];
  keywords: string[];
  question: string;
  options: Array<{
    label: string;
    chapter: string;
    description: string;
    examples: string;
  }>;
}

export const CONFUSING_PAIRS: ConfusingPair[] = [
  // Failure 1: fur coats → Ch.42 (should be Ch.43)
  {
    chapters: ['42', '43'],
    keywords: ['fur', 'furskin', 'mink', 'pelt', 'coat', 'jacket', 'fox', 'rabbit'],
    question: 'Is this made of FUR (with hair attached) or LEATHER (tanned hide without hair)?',
    options: [
      {
        label: 'Fur (animal fur/pelt with hair)',
        chapter: '43',
        description: 'Furskins and artificial fur; manufactures thereof',
        examples: 'Fur coats, mink stoles, fox fur accessories'
      },
      {
        label: 'Leather (tanned hide, no hair)',
        chapter: '42',
        description: 'Articles of leather; travel goods, handbags',
        examples: 'Leather jackets, leather bags, leather belts'
      }
    ]
  },

  // Failure 2: tin plates → Ch.72 (should be Ch.80)
  {
    chapters: ['72', '80'],
    keywords: ['tin', 'tinplate', 'tin-plated', 'tin plate', 'tin sheet'],
    question: 'Is this IRON/STEEL (possibly tin-coated) or pure TIN metal?',
    options: [
      {
        label: 'Iron or Steel (may be tin-coated)',
        chapter: '72',
        description: 'Iron and steel',
        examples: 'Steel sheets, tinplate (tin-coated steel), galvanized steel'
      },
      {
        label: 'Tin (the actual metal)',
        chapter: '80',
        description: 'Tin and articles thereof',
        examples: 'Pure tin plates, tin foil, tin bars, tin solder'
      }
    ]
  },

  // Failure 3: synthetic fiber → Ch.54 (should be Ch.55)
  {
    chapters: ['54', '55'],
    keywords: ['synthetic', 'polyester', 'nylon', 'acrylic', 'fiber', 'fibre', 'viscose', 'rayon'],
    question: 'Is this FILAMENT (continuous strands) or STAPLE (short cut fibers)?',
    options: [
      {
        label: 'Filament (continuous, uncut strands)',
        chapter: '54',
        description: 'Man-made filaments; strip and the like',
        examples: 'Nylon thread, polyester filament yarn, monofilament'
      },
      {
        label: 'Staple (short, cut lengths)',
        chapter: '55',
        description: 'Man-made staple fibres',
        examples: 'Polyester staple fiber, acrylic staple, viscose staple'
      }
    ]
  },

  // Failure 4: leather jackets → Ch.62 (should be Ch.42)
  {
    chapters: ['42', '62'],
    keywords: ['leather', 'jacket', 'coat', 'apparel', 'garment', 'vest'],
    question: 'Is the primary material LEATHER or TEXTILE fabric?',
    options: [
      {
        label: 'Leather (leather is main material)',
        chapter: '42',
        description: 'Articles of leather',
        examples: 'Leather jackets, leather coats, leather vests'
      },
      {
        label: 'Textile/woven fabric',
        chapter: '62',
        description: 'Woven apparel (not knitted)',
        examples: 'Woven jackets, suits, dresses, blouses'
      }
    ]
  },

  // Common: knit vs woven apparel
  {
    chapters: ['61', '62'],
    keywords: ['shirt', 'blouse', 'dress', 'jacket', 't-shirt', 'sweater', 'polo'],
    question: 'Is this KNITTED (stretchy) or WOVEN (non-stretch)?',
    options: [
      {
        label: 'Knitted (stretchy, looped)',
        chapter: '61',
        description: 'Knitted or crocheted apparel',
        examples: 'T-shirts, sweaters, knitted dresses, underwear'
      },
      {
        label: 'Woven (non-stretch, interlaced)',
        chapter: '62',
        description: 'Woven apparel (not knitted)',
        examples: 'Dress shirts, suits, woven trousers'
      }
    ]
  },

  // Coffee raw vs processed
  {
    chapters: ['09', '21'],
    keywords: ['coffee', 'instant', 'extract', 'concentrate'],
    question: 'Is this RAW/ROASTED coffee or PROCESSED (instant/extract)?',
    options: [
      {
        label: 'Raw or roasted (beans, ground)',
        chapter: '09',
        description: 'Coffee, tea, mate and spices',
        examples: 'Coffee beans, roasted coffee, ground coffee'
      },
      {
        label: 'Instant, extract, concentrate',
        chapter: '21',
        description: 'Miscellaneous edible preparations',
        examples: 'Instant coffee, coffee extract'
      }
    ]
  },

  // Mechanical vs electrical
  {
    chapters: ['84', '85'],
    keywords: ['machine', 'motor', 'pump', 'apparatus', 'equipment'],
    question: 'Is this primarily MECHANICAL or ELECTRICAL?',
    options: [
      {
        label: 'Mechanical (engines, pumps)',
        chapter: '84',
        description: 'Nuclear reactors, boilers, machinery',
        examples: 'Pumps, engines, compressors'
      },
      {
        label: 'Electrical (circuits, motors)',
        chapter: '85',
        description: 'Electrical machinery and equipment',
        examples: 'Electric motors, transformers, batteries'
      }
    ]
  },

  // Plastic vs rubber
  {
    chapters: ['39', '40'],
    keywords: ['rubber', 'plastic', 'silicone', 'polymer', 'pvc', 'synthetic'],
    question: 'What is the primary material - PLASTIC or RUBBER?',
    options: [
      {
        label: 'Plastics/polymers',
        chapter: '39',
        description: 'Plastics and articles thereof',
        examples: 'Plastic containers, PVC pipes, plastic sheets'
      },
      {
        label: 'Rubber/elastomers',
        chapter: '40',
        description: 'Rubber and articles thereof',
        examples: 'Rubber tires, rubber hoses, rubber seals'
      }
    ]
  }
];

/**
 * Detect if query triggers a confusing pair
 */
export function detectConfusingPair(
  query: string,
  topChapters: string[]
): ConfusingPair | null {
  const queryLower = query.toLowerCase();

  for (const pair of CONFUSING_PAIRS) {
    // Check if BOTH chapters from the pair are in top candidates
    const hasChapter0 = topChapters.includes(pair.chapters[0]);
    const hasChapter1 = topChapters.includes(pair.chapters[1]);

    if (hasChapter0 && hasChapter1) {
      // Check if query contains any trigger keyword
      const hasKeyword = pair.keywords.some(kw => queryLower.includes(kw));
      if (hasKeyword) {
        return pair;
      }
    }
  }

  return null;
}

/**
 * Check if two chapters form a known confusing pair
 */
export function isConfusingPair(chapter1: string, chapter2: string): boolean {
  return CONFUSING_PAIRS.some(
    pair =>
      (pair.chapters[0] === chapter1 && pair.chapters[1] === chapter2) ||
      (pair.chapters[0] === chapter2 && pair.chapters[1] === chapter1)
  );
}

/**
 * Get the disambiguation data for a pair of chapters.
 * Used by Brain (M3) to generate targeted clarifying questions.
 */
export function getConfusingPairQuestion(ch1: string, ch2: string): ConfusingPair | null {
  return CONFUSING_PAIRS.find(
    pair =>
      (pair.chapters[0] === ch1 && pair.chapters[1] === ch2) ||
      (pair.chapters[0] === ch2 && pair.chapters[1] === ch1)
  ) || null;
}
