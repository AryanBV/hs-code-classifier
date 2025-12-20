import { getTopCandidates } from '../src/services/multi-candidate-search.service';

async function find8708InCandidates() {
  console.log('Searching for 8708.30.00 in 50 candidates...\n');

  const candidates = await getTopCandidates('ceramic brake pads for motorcycles', 50);

  console.log(`Total candidates: ${candidates.length}\n`);

  const found = candidates.find(c => c.code === '8708.30.00');

  if (found) {
    const index = candidates.findIndex(c => c.code === '8708.30.00');
    console.log(`✅ FOUND 8708.30.00 at position ${index + 1}`);
    console.log(`   Score: ${found.score}`);
    console.log(`   Match Type: ${found.matchType}`);
    console.log(`   Source: ${found.source}`);
  } else {
    console.log('❌ 8708.30.00 NOT in top 50 candidates\n');
    console.log('Checking Chapter 87 codes in candidates:');

    const chapter87 = candidates.filter(c => c.code.startsWith('87'));
    console.log(`Found ${chapter87.length} Chapter 87 codes:\n`);

    chapter87.forEach((c, i) => {
      console.log(`${i + 1}. ${c.code} (score: ${c.score.toFixed(2)}, ${c.matchType})`);
      console.log(`   ${c.description?.substring(0, 80)}...`);
    });
  }
}

find8708InCandidates();
