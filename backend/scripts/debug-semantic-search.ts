import { semanticSearchMulti } from '../src/services/multi-candidate-search.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function debugSemanticSearch() {
  console.log('🔍 Debug: Semantic Search for Brake Pads\n');

  const query = 'ceramic brake pads for motorcycles';

  const candidates = await semanticSearchMulti(query, 30);  // Get top 30

  console.log(`Query: "${query}"\n`);
  console.log(`Found ${candidates.length} candidates:\n`);

  candidates.forEach((c, i) => {
    console.log(`${i + 1}. ${c.code} (score: ${c.score.toFixed(4)})`);
    if (c.code.startsWith('6813')) {
      console.log(`   ⭐ BRAKE CODE FOUND!`);
    }
  });

  process.exit(0);
}

debugSemanticSearch();
