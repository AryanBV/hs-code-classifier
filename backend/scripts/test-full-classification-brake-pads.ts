import { classifyWithLLM } from '../src/services/llm-validation.service';

async function testFullClassification() {
  console.log('🧪 TESTING FULL END-TO-END CLASSIFICATION');
  console.log('═'.repeat(70));
  console.log('Query: "ceramic brake pads for motorcycles"\n');

  try {
    const startTime = Date.now();

    // Use the improved classification system (now defaults to 50 candidates)
    const result = await classifyWithLLM('ceramic brake pads for motorcycles');

    const totalTime = Date.now() - startTime;

    console.log('═'.repeat(70));
    console.log('CLASSIFICATION RESULT:');
    console.log('═'.repeat(70));
    console.log(`Selected Code: ${result.code}`);
    console.log(`Description: ${result.description}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Reasoning: ${result.reasoning}`);
    console.log();

    if (result.alternatives.length > 0) {
      console.log('Alternatives:');
      result.alternatives.forEach((alt, i) => {
        console.log(`  ${i + 1}. ${alt.code}: ${alt.description}`);
      });
      console.log();
    }

    console.log('Performance:');
    console.log(`  Search Time: ${result.searchTime}ms`);
    console.log(`  LLM Time: ${result.llmTime}ms`);
    console.log(`  Total Time: ${totalTime}ms`);
    console.log();

    console.log('═'.repeat(70));
    console.log('VERIFICATION:');
    console.log('═'.repeat(70));

    const isCorrect = result.code === '8708.30.00';
    const isChapter87 = result.code.startsWith('87');
    const isSpecific = result.code.replace(/\./g, '').length >= 8;

    if (isCorrect) {
      console.log('✅ CORRECT CODE: 8708.30.00 (Brakes for vehicles)');
      console.log('✅ Correct chapter: Chapter 87 (Automotive parts)');
      console.log('✅ Specific tariff code (not heading)');
    } else {
      console.log(`❌ WRONG CODE: ${result.code}`);
      if (!isChapter87) {
        console.log('❌ Wrong chapter (should be Chapter 87)');
      }
      if (!isSpecific) {
        console.log('❌ Not specific enough (should be 8-10 digits)');
      }

      // Check if correct code was in alternatives
      const correctInAlts = result.alternatives.some(alt => alt.code === '8708.30.00');
      if (correctInAlts) {
        console.log('⚠️  Correct code 8708.30.00 was in alternatives');
      } else {
        console.log('❌ Correct code 8708.30.00 not even in alternatives');
      }
    }

    console.log();
    console.log('═'.repeat(70));
    console.log('COMPARISON WITH OLD SYSTEM:');
    console.log('═'.repeat(70));
    console.log('Old System (Before HNSW):');
    console.log('  - Returned 6813 (wrong chapter, wrong code)');
    console.log('  - Only searched 1-3% of database');
    console.log('  - Missed 8708.30.00 entirely');
    console.log('  - Confidence: ~56%');
    console.log();
    console.log('New System (After HNSW + Enhanced Prompt):');
    console.log(`  - Returned ${result.code}`);
    console.log('  - Searches entire database (HNSW index)');
    console.log('  - Uses top 50 candidates for LLM');
    console.log(`  - Confidence: ${result.confidence}%`);
    console.log();

    if (isCorrect) {
      console.log('🎉 SUCCESS! Classification system is now working correctly!');
    } else {
      console.log('⚠️  Still needs improvement. LLM chose wrong code despite having correct one in candidates.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testFullClassification();
