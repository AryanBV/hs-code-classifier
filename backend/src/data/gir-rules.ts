/**
 * General Interpretive Rules (GIRs) for HS Classification
 *
 * Source: WCO Harmonized System Convention
 *
 * CRITICAL: GIR 2(a) fixed Material vs Function errors in Proof Session:
 * - Rubber oil seals: Ch.40 → Ch.87 ✅
 * - Ceramic brake pads: Ch.69 → Ch.87 ✅
 */

export interface GIRRule {
  number: string;
  title: string;
  fullText: string;
  application: string;
  examples: GIRExample[];
  decisiveFor: string[];
}

export interface GIRExample {
  product: string;
  correctClassification: string;
  incorrectClassification: string;
  explanation: string;
}

export const GIR_RULES: GIRRule[] = [
  {
    number: '1',
    title: 'Terms of Headings and Section/Chapter Notes',
    fullText: 'The titles of Sections, Chapters and sub-Chapters are provided for ease of reference only; for legal purposes, classification shall be determined according to the terms of the headings and any relative Section or Chapter Notes and, provided such headings or Notes do not otherwise require, according to the following provisions.',
    application: 'Always start here. Read the heading description and check chapter notes FIRST. Most classifications are determined by GIR 1 alone.',
    examples: [
      {
        product: 'Paracetamol tablets 500mg',
        correctClassification: 'Chapter 30 (Pharmaceuticals)',
        incorrectClassification: 'Chapter 29 (Organic Chemicals)',
        explanation: 'Chapter 29 Note excludes compounds with additions for "specific use". Tablets in dosage form = therapeutic use = Ch.30.'
      }
    ],
    decisiveFor: ['Chemical vs Medicament', 'Chapter note exclusions']
  },
  {
    number: '2a',
    title: 'Incomplete/Unfinished Articles and Parts',
    fullText: 'Any reference in a heading to an article shall be taken to include a reference to that article incomplete or unfinished, provided that, as presented, the incomplete or unfinished article has the essential character of the complete or finished article. It shall also be taken to include a reference to that article complete or finished (or falling to be classified as complete or finished by virtue of this Rule), presented unassembled or disassembled.',
    application: 'CRITICAL FOR PARTS: If a part is designed for use SOLELY OR PRINCIPALLY with a specific machine/vehicle, it classifies WITH that machine/vehicle, NOT by its material.',
    examples: [
      {
        product: 'Rubber oil seals for automobile engines',
        correctClassification: 'Chapter 87 (Vehicles) - 8708',
        incorrectClassification: 'Chapter 40 (Rubber)',
        explanation: 'Seals designed solely for vehicle engines are PARTS of vehicles. Function determines classification, not material.'
      },
      {
        product: 'Ceramic brake pads for passenger cars',
        correctClassification: 'Chapter 87 (Vehicles) - 8708',
        incorrectClassification: 'Chapter 69 (Ceramics)',
        explanation: 'Brake pads function solely as vehicle parts. Ceramic material is irrelevant.'
      },
      {
        product: 'Plastic dashboard for cars',
        correctClassification: 'Chapter 87 (Vehicles) - 8708',
        incorrectClassification: 'Chapter 39 (Plastics)',
        explanation: 'Dashboard is a vehicle part. Plastic material does not determine classification.'
      },
      {
        product: 'Unassembled bicycle (all parts in one shipment)',
        correctClassification: 'Chapter 87 - 8712 (Bicycles)',
        incorrectClassification: 'Individual part headings',
        explanation: 'Unassembled complete article classifies as finished article.'
      }
    ],
    decisiveFor: ['Material vs Function', 'Vehicle parts', 'Machine parts', 'Unassembled goods']
  },
  {
    number: '2b',
    title: 'Mixtures and Combinations of Materials',
    fullText: 'Any reference in a heading to a material or substance shall be taken to include a reference to mixtures or combinations of that material or substance with other materials or substances. Any reference to goods of a given material or substance shall be taken to include a reference to goods consisting wholly or partly of such material or substance. The classification of goods consisting of more than one material or substance shall be according to the principles of Rule 3.',
    application: 'A heading for "plastic articles" includes articles that are MOSTLY plastic but contain other materials.',
    examples: [
      {
        product: 'Handbag 70% leather, 30% textile',
        correctClassification: 'Chapter 42 (Leather goods)',
        incorrectClassification: 'Chapter 62 (Textiles)',
        explanation: 'Leather articles includes articles predominantly of leather.'
      }
    ],
    decisiveFor: ['Mixed material goods', 'Composite articles']
  },
  {
    number: '3a',
    title: 'Most Specific Heading',
    fullText: 'When by application of Rule 2(b) or for any other reason, goods are, prima facie, classifiable under two or more headings, classification shall be effected as follows: The heading which provides the most specific description shall be preferred to headings providing a more general description.',
    application: 'Specific product name beats general material description. "Electric shavers" (8510) beats "domestic appliances" (8509).',
    examples: [
      {
        product: 'Electric hair clippers',
        correctClassification: '8510 (Shavers, hair clippers)',
        incorrectClassification: '8509 (Domestic appliances)',
        explanation: '8510 specifically names hair clippers; 8509 is general.'
      }
    ],
    decisiveFor: ['Product-specific vs general headings']
  },
  {
    number: '3b',
    title: 'Essential Character',
    fullText: 'Mixtures, composite goods consisting of different materials or made up of different components, and goods put up in sets for retail sale, which cannot be classified by reference to 3(a), shall be classified as if they consisted of the material or component which gives them their essential character, insofar as this criterion is applicable.',
    application: 'For composites, determine which component gives the product its fundamental identity. Pencil with eraser = pencil (writing is essential purpose).',
    examples: [
      {
        product: 'Pencil with attached eraser',
        correctClassification: '9609 (Pencils)',
        incorrectClassification: '4016 (Rubber)',
        explanation: 'Writing function is essential character, not erasing.'
      },
      {
        product: 'First aid kit',
        correctClassification: 'Chapter 30 (Pharmaceuticals)',
        incorrectClassification: 'Chapter 82 (Tools)',
        explanation: 'Medical treatment is essential purpose.'
      }
    ],
    decisiveFor: ['Composite goods', 'Retail sets']
  },
  {
    number: '3c',
    title: 'Last Heading in Numerical Order',
    fullText: 'When goods cannot be classified by reference to 3(a) or 3(b), they shall be classified under the heading which occurs last in numerical order among those which equally merit consideration.',
    application: 'Tie-breaker: if 3(a) and 3(b) fail, pick higher heading number.',
    examples: [],
    decisiveFor: ['Tie-breaker only']
  },
  {
    number: '4',
    title: 'Most Akin Goods',
    fullText: 'Goods which cannot be classified in accordance with the above Rules shall be classified under the heading appropriate to the goods to which they are most akin.',
    application: 'For novel products not covered by any heading, find most similar category.',
    examples: [],
    decisiveFor: ['Novel products', 'New technology']
  },
  {
    number: '5a',
    title: 'Cases and Containers for Specific Goods',
    fullText: 'Camera cases, musical instrument cases, gun cases, drawing instrument cases, necklace cases and similar containers, specially shaped or fitted to contain a specific article or set of articles, suitable for long-term use and presented with the articles for which they are intended, shall be classified with such articles when of a kind normally sold therewith.',
    application: 'Fitted cases sold with product classify WITH product (guitar + case = guitars heading).',
    examples: [
      {
        product: 'Guitar with fitted hard case',
        correctClassification: '9202 (Guitars) - case included',
        incorrectClassification: 'Guitar 9202 + Case 4202',
        explanation: 'Fitted case classifies with instrument.'
      }
    ],
    decisiveFor: ['Product + case combinations']
  },
  {
    number: '5b',
    title: 'Packing Materials',
    fullText: 'Subject to the provisions of Rule 5(a), packing materials and packing containers presented with the goods therein shall be classified with the goods if they are of a kind normally used for packing such goods. However, this provision does not apply when such packing materials or packing containers are clearly suitable for repetitive use.',
    application: 'Disposable packaging classifies with contents. Reusable containers classify separately.',
    examples: [
      {
        product: 'Shoes in cardboard box',
        correctClassification: 'Chapter 64 (Footwear)',
        incorrectClassification: 'Shoes + box separately',
        explanation: 'Disposable retail packaging included.'
      }
    ],
    decisiveFor: ['Packaging', 'Reusable containers']
  },
  {
    number: '6',
    title: 'Subheading Classification',
    fullText: 'For legal purposes, the classification of goods in the subheadings of a heading shall be determined according to the terms of those subheadings and any related Subheading Notes and, mutatis mutandis, to the above Rules, on the understanding that only subheadings at the same level are comparable.',
    application: 'Same GIR principles apply at 6-digit and 8-digit levels. Compare only same-level subheadings.',
    examples: [],
    decisiveFor: ['Subheading selection', '6/8-digit classification']
  }
];

// ============ HELPER FUNCTIONS ============

export function getGIRRule(ruleNumber: string): GIRRule | undefined {
  return GIR_RULES.find(r => r.number === ruleNumber);
}

export function getAllGIRRules(): GIRRule[] {
  return GIR_RULES;
}

export function getPartsClassificationRules(): GIRRule[] {
  return GIR_RULES.filter(r => ['2a', '3a', '3b'].includes(r.number));
}

export function formatGIRsForPrompt(ruleNumbers?: string[]): string {
  const rules = ruleNumbers
    ? GIR_RULES.filter(r => ruleNumbers.includes(r.number))
    : GIR_RULES;

  return rules.map(r =>
    `**GIR ${r.number} - ${r.title}:**\n${r.fullText}\n\nApplication: ${r.application}`
  ).join('\n\n---\n\n');
}

export function getGIRSummary(): string {
  return `
GIR 1: Classification by heading terms and chapter notes (START HERE)
GIR 2(a): Parts for specific machines → classify with machine, NOT by material
GIR 2(b): Mixtures include combinations of materials
GIR 3(a): Most specific heading wins
GIR 3(b): Essential character determines composite goods
GIR 3(c): Last heading number (tie-breaker)
GIR 4: Most similar goods (novel products)
GIR 5(a): Fitted cases classify with contents
GIR 5(b): Disposable packaging with goods
GIR 6: Same rules at subheading level
  `.trim();
}
