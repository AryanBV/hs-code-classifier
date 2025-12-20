import { semanticSearchMulti } from '../src/services/multi-candidate-search.service';

async function testSemanticOnly() {
  console.log('Testing SEMANTIC SEARCH ONLY...\n');

  const results = await semanticSearchMulti('ceramic brake pads for motorcycles', 50);

  console.log(`Found ${results.length} results\n`);

  console.log('Top 10 results:');
  results.slice(0, 10).forEach((r, i) => {
    const is8708 = r.code === '8708.30.00';
    const marker = is8708 ? ' ⭐ CORRECT!' : '';
    console.log(`${i + 1}. ${r.code} (score: ${r.score.toFixed(2)})${marker}`);
  });

  const found = results.find(r => r.code === '8708.30.00');
  if (found) {
    const index = results.findIndex(r => r.code === '8708.30.00');
    console.log(`\n✅ 8708.30.00 found at position ${index + 1} with score ${found.score.toFixed(2)}`);
  } else {
    console.log('\n❌ 8708.30.00 NOT found');
  }
}

testSemanticOnly();
