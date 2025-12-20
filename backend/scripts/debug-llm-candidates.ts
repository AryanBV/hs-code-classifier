import { PrismaClient } from '@prisma/client';
import { getTopCandidates } from '../src/services/multi-candidate-search.service';

const prisma = new PrismaClient();

async function debugLLMCandidates() {
  console.log('🔍 DEBUGGING CANDIDATES SENT TO LLM');
  console.log('═'.repeat(70));
  console.log('Query: "ceramic brake pads for motorcycles"\n');

  try {
    // Get top 50 candidates (same as LLM receives)
    const candidates = await getTopCandidates('ceramic brake pads for motorcycles', 50);

    console.log(`Found ${candidates.length} candidates\n`);

    // Get full details
    const codes = candidates.map(c => c.code);
    const fullDetails = await prisma.hsCode.findMany({
      where: { code: { in: codes } },
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    console.log('═'.repeat(70));
    console.log('TOP 20 CANDIDATES (AS LLM SEES THEM):');
    console.log('═'.repeat(70));

    candidates.slice(0, 20).forEach((candidate, idx) => {
      const details = fullDetails.find(d => d.code === candidate.code);
      const chapter = candidate.code.substring(0, 2);
      const isCorrectCode = candidate.code === '8708.30.00';
      const isChapter87 = chapter === '87';
      const isChapter68 = chapter === '68';

      let marker = '';
      if (isCorrectCode) marker = ' ⭐ CORRECT!';
      else if (isChapter87) marker = ' ✅ Ch.87';
      else if (isChapter68) marker = ' ⚠️  Ch.68';

      console.log(`\n${idx + 1}. HS Code: ${candidate.code}${marker}`);
      console.log(`   Description: ${details?.description || 'N/A'}`);
      console.log(`   Match Score: ${candidate.score.toFixed(2)}`);
      console.log(`   Match Type: ${candidate.matchType}`);

      if (details?.keywords && details.keywords.length > 0) {
        console.log(`   Keywords: ${details.keywords.join(', ')}`);
      }

      if (details?.commonProducts && details.commonProducts.length > 0) {
        console.log(`   Common Products: ${details.commonProducts.join(', ')}`);
      }
    });

    console.log('\n' + '═'.repeat(70));
    console.log('ANALYSIS:');
    console.log('═'.repeat(70));

    // Find 8708.30.00
    const correctIndex = candidates.findIndex(c => c.code === '8708.30.00');
    if (correctIndex !== -1) {
      const correctCandidate = candidates[correctIndex]!;
      const correctDetails = fullDetails.find(d => d.code === '8708.30.00');

      console.log(`\n✅ 8708.30.00 FOUND at position ${correctIndex + 1}`);
      console.log(`   Score: ${correctCandidate.score.toFixed(2)}`);
      console.log(`   Match Type: ${correctCandidate.matchType}`);
      console.log(`   Description: ${correctDetails?.description}`);
      console.log(`   Keywords: ${correctDetails?.keywords?.join(', ')}`);
    } else {
      console.log('\n❌ 8708.30.00 NOT FOUND in candidates');
    }

    // Find 6813.20.10
    const wrongIndex = candidates.findIndex(c => c.code === '6813.20.10');
    if (wrongIndex !== -1) {
      const wrongCandidate = candidates[wrongIndex]!;
      const wrongDetails = fullDetails.find(d => d.code === '6813.20.10');

      console.log(`\n⚠️  6813.20.10 (WRONG) at position ${wrongIndex + 1}`);
      console.log(`   Score: ${wrongCandidate.score.toFixed(2)}`);
      console.log(`   Match Type: ${wrongCandidate.matchType}`);
      console.log(`   Description: ${wrongDetails?.description}`);
      console.log(`   Keywords: ${wrongDetails?.keywords?.join(', ')}`);
    }

    // Compare scores
    if (correctIndex !== -1 && wrongIndex !== -1) {
      const correctScore = candidates[correctIndex]!.score;
      const wrongScore = candidates[wrongIndex]!.score;
      const scoreDiff = wrongScore - correctScore;

      console.log('\n📊 SCORE COMPARISON:');
      console.log(`   6813.20.10 (wrong): ${wrongScore.toFixed(2)}`);
      console.log(`   8708.30.00 (correct): ${correctScore.toFixed(2)}`);
      console.log(`   Difference: ${scoreDiff.toFixed(2)} (${wrongScore > correctScore ? 'wrong code has HIGHER score' : 'correct code has HIGHER score'})`);
      console.log('\n   💡 Issue: LLM is relying on match scores, not chapter priority!');
    }

    // Chapter distribution
    console.log('\n📈 CHAPTER DISTRIBUTION:');
    const chapterCounts = new Map<string, number>();
    candidates.forEach(c => {
      const chapter = c.code.substring(0, 2);
      chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
    });

    Array.from(chapterCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([chapter, count]) => {
        const isCorrectChapter = chapter === '87';
        const marker = isCorrectChapter ? ' ✅ CORRECT' : '';
        console.log(`   Chapter ${chapter}: ${count} codes${marker}`);
      });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugLLMCandidates();
