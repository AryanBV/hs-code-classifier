// backend/src/tests/audit/semantic-search-audit.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { generateEmbedding } from '../../classifier/attribute-extractor';
import { globalSemanticSearch } from '../../database/hs-codes';
import testData from '../test-data/comprehensive-test-set.json';

async function auditSemanticSearch() {
  console.log('='.repeat(60));
  console.log('AUDIT: Semantic Search Quality');
  console.log('='.repeat(60));

  // Sample 50 diverse cases from Tier 1
  const cases = (testData as any).testCases
    .filter((tc: any) => tc.tier === 1)
    .slice(0, 50);

  console.log(`\nTesting ${cases.length} Tier 1 cases\n`);

  let correctInTop5 = 0;
  let correctInTop10 = 0;
  let correctInTop30 = 0;
  let notFound = 0;

  const notFoundCases: { query: string; expected: string; topChapters: string[] }[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];

    try {
      const embedding = await generateEmbedding(testCase.query);
      const candidates = await globalSemanticSearch(embedding, 30);

      const candidateChapters = candidates.map((c: any) => c.code.substring(0, 2));
      const expectedChapter = testCase.expectedChapter;

      const top5Chapters = [...new Set(candidateChapters.slice(0, 5))];
      const top10Chapters = [...new Set(candidateChapters.slice(0, 10))];
      const top30Chapters = [...new Set(candidateChapters)];

      const inTop5 = top5Chapters.includes(expectedChapter);
      const inTop10 = top10Chapters.includes(expectedChapter);
      const inTop30 = top30Chapters.includes(expectedChapter);

      if (inTop5) correctInTop5++;
      if (inTop10) correctInTop10++;
      if (inTop30) correctInTop30++;
      if (!inTop30) {
        notFound++;
        notFoundCases.push({
          query: testCase.query,
          expected: expectedChapter,
          topChapters: [...new Set(candidateChapters.slice(0, 10))] as string[]
        });
        console.log(`[${i + 1}/${cases.length}] NOT FOUND: "${testCase.query.substring(0, 40)}..." - Expected Ch.${expectedChapter}`);
        console.log(`  Top chapters found: ${[...new Set(candidateChapters.slice(0, 10))].join(', ')}`);
      } else {
        const status = inTop5 ? 'TOP5' : inTop10 ? 'TOP10' : 'TOP30';
        console.log(`[${i + 1}/${cases.length}] ${status}: "${testCase.query.substring(0, 40)}..." - Ch.${expectedChapter}`);
      }
    } catch (error) {
      console.log(`[${i + 1}/${cases.length}] ERROR: "${testCase.query.substring(0, 40)}..." - ${error}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('### SEMANTIC SEARCH QUALITY ###');
  console.log('='.repeat(60));
  console.log(`Correct chapter in top 5: ${correctInTop5}/${cases.length} (${(correctInTop5/cases.length*100).toFixed(1)}%)`);
  console.log(`Correct chapter in top 10: ${correctInTop10}/${cases.length} (${(correctInTop10/cases.length*100).toFixed(1)}%)`);
  console.log(`Correct chapter in top 30: ${correctInTop30}/${cases.length} (${(correctInTop30/cases.length*100).toFixed(1)}%)`);
  console.log(`Not found in top 30: ${notFound}/${cases.length}`);

  console.log('\n### INTERPRETATION ###');
  if (correctInTop30 / cases.length >= 0.9) {
    console.log('\u2713 Semantic search is finding correct chapters. Problem is in ROUTING/SELECTION.');
  } else if (correctInTop30 / cases.length >= 0.7) {
    console.log('\u26A0 Semantic search has gaps. Some chapters missing from candidates.');
  } else {
    console.log('\u2717 Semantic search is NOT finding correct chapters. Problem is in EMBEDDINGS/SEARCH.');
  }

  if (notFoundCases.length > 0) {
    console.log('\n### CASES NOT FOUND IN TOP 30 ###');
    for (const c of notFoundCases) {
      console.log(`\nQuery: "${c.query}"`);
      console.log(`Expected Chapter: ${c.expected}`);
      console.log(`Found Chapters: ${c.topChapters.join(', ')}`);
    }
  }

  // Analysis by expected chapter
  console.log('\n### CHAPTER-WISE ANALYSIS ###');
  const chapterStats = new Map<string, { total: number; inTop5: number; inTop30: number }>();

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const ch = testCase.expectedChapter;
    if (!chapterStats.has(ch)) {
      chapterStats.set(ch, { total: 0, inTop5: 0, inTop30: 0 });
    }
    const stat = chapterStats.get(ch)!;
    stat.total++;

    try {
      const embedding = await generateEmbedding(testCase.query);
      const candidates = await globalSemanticSearch(embedding, 30);
      const candidateChapters = candidates.map((c: any) => c.code.substring(0, 2));

      if ([...new Set(candidateChapters.slice(0, 5))].includes(ch)) stat.inTop5++;
      if ([...new Set(candidateChapters)].includes(ch)) stat.inTop30++;
    } catch {
      // Skip errors
    }

    await new Promise(r => setTimeout(r, 100));
  }

  // Skip duplicate chapter analysis - we already collected it above

  console.log('\n### SUMMARY ###');
  console.log(`Top 5 hit rate: ${(correctInTop5/cases.length*100).toFixed(1)}%`);
  console.log(`Top 10 hit rate: ${(correctInTop10/cases.length*100).toFixed(1)}%`);
  console.log(`Top 30 hit rate: ${(correctInTop30/cases.length*100).toFixed(1)}%`);

  if (correctInTop5 / cases.length >= 0.8) {
    console.log('\nConclusion: Semantic search quality is GOOD. Focus on routing/selection logic.');
  } else if (correctInTop30 / cases.length >= 0.8) {
    console.log('\nConclusion: Semantic search finds answers but not in top ranks. Consider re-ranking.');
  } else {
    console.log('\nConclusion: Semantic search needs improvement. Check embeddings and indexing.');
  }
}

auditSemanticSearch().catch(console.error);
