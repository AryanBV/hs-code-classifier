import { getTopCandidates } from '../src/services/multi-candidate-search.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function debugBrakeCandidates() {
  console.log('🔍 Debug: Brake Pads Candidates\n');

  const query = 'ceramic brake pads for motorcycles';

  const candidates = await getTopCandidates(query, 15);

  console.log(`Query: "${query}"\n`);
  console.log(`Found ${candidates.length} candidates:\n`);

  candidates.forEach((c, i) => {
    console.log(`${i + 1}. ${c.code} (score: ${c.score.toFixed(3)}, ${c.matchType})`);
  });

  process.exit(0);
}

debugBrakeCandidates();
