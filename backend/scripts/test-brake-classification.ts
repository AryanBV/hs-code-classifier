import { classifyWithLLM } from '../src/services/llm-validation.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function testBrakeClassification() {
  console.log('🧪 Testing Brake Pads Classification\n');
  console.log('═'.repeat(70));

  const testQuery = 'ceramic brake pads for motorcycles';

  console.log(`Query: "${testQuery}"\n`);

  try {
    const result = await classifyWithLLM(testQuery, 10);

    console.log('📊 CLASSIFICATION RESULT:');
    console.log('═'.repeat(70));
    console.log(`HS Code: ${result.code}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Reasoning: ${result.reasoning}`);
    console.log();

    console.log('🔄 Top Alternatives:');
    result.alternatives.slice(0, 5).forEach((alt, i) => {
      console.log(`${i + 1}. ${alt.code} - ${alt.description.substring(0, 60)}...`);
    });
    console.log();

    console.log('⚡ Performance:');
    console.log(`   Total time: ${result.responseTime}ms`);
    console.log(`   Search time: ${result.searchTime}ms`);
    console.log(`   LLM time: ${result.llmTime}ms`);
    console.log();

    // Check if it's the correct code
    const expectedCode = '6813.20.10'; // Brake lining and pads
    if (result.code === expectedCode) {
      console.log('✅ SUCCESS! Classified correctly as brake lining and pads (6813.20.10)');
    } else if (result.code.startsWith('6813')) {
      console.log('✅ CLOSE! Classified in Chapter 68 (ceramics/friction materials)');
    } else if (result.code.startsWith('87')) {
      console.log('⚠️  PARTIAL! Classified in Chapter 87 (automotive parts)');
    } else {
      console.log(`❌ INCORRECT! Expected 6813.20.10 but got ${result.code}`);
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }

  process.exit(0);
}

testBrakeClassification();
