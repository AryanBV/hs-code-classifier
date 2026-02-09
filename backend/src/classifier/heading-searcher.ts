// backend/src/classifier/heading-searcher.ts

import { HeadingSearchResult, ExtractedAttributes } from './types';
import { searchWithinChapter } from '../database/hs-codes';
import { generateEmbedding, createSearchQuery } from './attribute-extractor';
import { getFormattedChapterNotes } from './notes-helper';

/**
 * Rule-based heading selection for known patterns
 * Returns the heading code if a rule matches, otherwise null
 */
function applyHeadingRules(attrs: ExtractedAttributes, chapter: string): { heading: string; description: string } | null {
  const query = [attrs.function, attrs.form, attrs.raw_query]
    .filter(Boolean).join(' ').toLowerCase();

  // Chapter 87 - Vehicle parts
  if (chapter === '87') {
    // Brakes, brake parts -> 8708.30
    if (query.includes('brake') || query.includes('braking') ||
        query.includes('brake pad') || query.includes('brake disc')) {
      return { heading: '8708', description: 'Parts and accessories of motor vehicles' };
    }
    // Suspension parts -> 8708
    if (query.includes('suspension') || query.includes('bushing') ||
        query.includes('shock absorber') || query.includes('spring')) {
      return { heading: '8708', description: 'Parts and accessories of motor vehicles' };
    }
    // Radiators -> 8708
    if (query.includes('radiator')) {
      return { heading: '8708', description: 'Parts and accessories of motor vehicles' };
    }
    // Filters -> Can be 8421 or 8708 depending on type
    if (query.includes('filter') && (query.includes('air') || query.includes('oil') || query.includes('fuel'))) {
      return { heading: '8708', description: 'Parts and accessories of motor vehicles' };
    }
  }

  // Chapter 09 - Coffee, tea, spices
  if (chapter === '09') {
    // Coffee
    if (query.includes('coffee')) {
      return { heading: '0901', description: 'Coffee, whether or not roasted or decaffeinated' };
    }
    // Tea
    if (query.includes('tea')) {
      return { heading: '0902', description: 'Tea' };
    }
    // Pepper
    if (query.includes('pepper') && !query.includes('chilli') && !query.includes('capsicum')) {
      return { heading: '0904', description: 'Pepper; dried or crushed or ground fruits of the genus Capsicum or Pimenta' };
    }
    // Cardamom
    if (query.includes('cardamom')) {
      return { heading: '0908', description: 'Nutmeg, mace and cardamoms' };
    }
    // Turmeric, cumin, etc.
    if (query.includes('turmeric') || query.includes('cumin') ||
        query.includes('ginger') || query.includes('saffron')) {
      return { heading: '0910', description: 'Ginger, saffron, turmeric, thyme, bay leaves, curry and other spices' };
    }
  }

  // Chapter 21 - Processed coffee
  if (chapter === '21') {
    if (query.includes('coffee') || query.includes('instant') || query.includes('soluble')) {
      return { heading: '2101', description: 'Extracts, essences and concentrates of coffee, tea or mate' };
    }
  }

  // Chapter 25 - Cement
  if (chapter === '25') {
    if (query.includes('cement') || query.includes('clinker')) {
      return { heading: '2523', description: 'Portland cement, aluminous cement, slag cement, etc.' };
    }
  }

  // Chapter 68 - Cement articles
  if (chapter === '68') {
    if (query.includes('cement') || query.includes('concrete')) {
      return { heading: '6810', description: 'Articles of cement, concrete or artificial stone' };
    }
  }

  // Chapter 30 - Pharmaceuticals
  if (chapter === '30') {
    if (query.includes('tablet') || query.includes('capsule') ||
        query.includes('medicine') || query.includes('medicament')) {
      return { heading: '3004', description: 'Medicaments in measured doses or retail packing' };
    }
  }

  // Chapter 85 - Electronics
  if (chapter === '85') {
    if (query.includes('battery') || query.includes('accumulator')) {
      return { heading: '8507', description: 'Electric accumulators, including separators' };
    }
    if (query.includes('display') || query.includes('screen') || query.includes('monitor')) {
      return { heading: '8528', description: 'Monitors and projectors; reception apparatus for television' };
    }
  }

  // Chapter 50 - Silk
  if (chapter === '50') {
    if (query.includes('fabric') || query.includes('woven') || query.includes('cloth')) {
      return { heading: '5007', description: 'Woven fabrics of silk or of silk waste' };
    }
  }

  // Chapter 52 - Cotton fabrics
  if (chapter === '52') {
    if (query.includes('fabric') || query.includes('woven')) {
      return { heading: '5208', description: 'Woven fabrics of cotton' };
    }
  }

  // Chapter 61 - Knitted apparel
  if (chapter === '61') {
    if (query.includes('t-shirt') || query.includes('tshirt')) {
      return { heading: '6109', description: 'T-shirts, singlets and other vests, knitted' };
    }
  }

  // Chapter 62 - Woven apparel
  if (chapter === '62') {
    if (query.includes('shirt') && !query.includes('t-shirt')) {
      return { heading: '6205', description: 'Men\'s or boys\' shirts' };
    }
  }

  return null;
}

/**
 * Find the correct 4-digit heading WITHIN the determined chapter
 */
export async function findHeading(
  attrs: ExtractedAttributes,
  chapter: string
): Promise<HeadingSearchResult> {

  console.log(`Searching for heading within chapter ${chapter}`);

  // First try rule-based heading selection for known patterns
  const ruleResult = applyHeadingRules(attrs, chapter);
  if (ruleResult) {
    console.log(`Rule-based heading: ${ruleResult.heading} - ${ruleResult.description}`);
    return {
      heading: ruleResult.heading,
      description: ruleResult.description,
      similarity: 0.95, // High confidence for rule-based matches
      candidates: [{
        code: ruleResult.heading,
        description: ruleResult.description,
        similarity: 0.95
      }]
    };
  }

  // Fall back to semantic search
  const searchQuery = createSearchQuery(attrs);
  const embedding = await generateEmbedding(searchQuery);

  // Search ONLY within the determined chapter, level 4 = headings
  const candidates = await searchWithinChapter(embedding, chapter, 4, 10);

  // Pre-warm notes cache for code-selector (which uses same chapter)
  // TODO(ARY-42): Inject notes into heading search when it gets an LLM path (M3)
  const chapterNotes = await getFormattedChapterNotes(chapter);
  if (chapterNotes) {
    console.log(`  Chapter ${chapter} notes available (${chapterNotes.length} chars)`);
  }

  if (candidates.length === 0) {
    throw new Error(`No headings found in chapter ${chapter}`);
  }

  console.log(`Found ${candidates.length} heading candidates`);
  console.log(`Top match: ${candidates[0].code} - ${candidates[0].description} (${candidates[0].similarity.toFixed(3)})`);

  return {
    heading: candidates[0].code,
    description: candidates[0].description,
    similarity: candidates[0].similarity,
    candidates: candidates.slice(0, 5).map(c => ({
      code: c.code,
      description: c.description,
      similarity: c.similarity
    }))
  };
}
