/**
 * Phase 5E-2: ML Model Training Script
 *
 * Trains the ML classifier on feedback data
 * and generates baseline predictions for comparison
 */

import { mlClassifier } from './src/services/ml-classifier.service';
import { logger } from './src/utils/logger';

async function trainAndValidateModel() {
  console.log('\n🤖 PHASE 5E-2: ML MODEL TRAINING\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Train the model
    console.log('\n📚 Step 1: Training ML Model on Feedback Data');
    console.log('─'.repeat(60));

    const trainingResults = await mlClassifier.trainModel();

    console.log(`\n✅ Training Complete!`);
    console.log(`   Trained on: ${trainingResults.trainedSamples} feedback records`);
    console.log(`   Baseline accuracy: ${trainingResults.accuracy.toFixed(2)}%`);
    console.log(`\n📊 Feature Importance:`);
    for (const [feature, importance] of Object.entries(trainingResults.featureImportance)) {
      const bar = '█'.repeat(Math.round(importance * 20));
      console.log(`   ${feature.padEnd(20)}: ${bar} ${(importance * 100).toFixed(0)}%`);
    }

    // Step 2: Get model statistics
    console.log(`\n📈 Step 2: Model Statistics`);
    console.log('─'.repeat(60));

    const stats = await mlClassifier.getStats();
    console.log(`\n✅ Model Status:`);
    console.log(`   Trained: ${stats.trained ? 'Yes' : 'No'}`);
    console.log(`   Training samples: ${stats.trainingSamples}`);
    console.log(`   Model version: ${stats.modelVersion}`);

    console.log(`\n📊 Category-Level Performance:`);
    const categoryEntries = Object.entries(stats.categoryStats)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 10);

    for (const [category, perf] of categoryEntries) {
      const accuracyBar = '█'.repeat(Math.round(perf.accuracy / 5));
      console.log(
        `   Chapter ${category}: ${accuracyBar} ${perf.accuracy.toFixed(1)}% (n=${perf.sampleSize})`
      );
    }

    // Step 3: Sample predictions
    console.log(`\n🔮 Step 3: Sample Predictions on Test Data`);
    console.log('─'.repeat(60));

    const testProducts = [
      { desc: 'Fresh fish salmon', expectedCode: '0304.52.00' },
      { desc: 'Cow milk dairy', expectedCode: '0403.90.10' },
      { desc: 'Fresh tomato vegetable', expectedCode: '0702.00.00' },
      { desc: 'Coffee beans beverage', expectedCode: '0901.12.00' },
      { desc: 'Cotton fabric textile', expectedCode: '5210.00.00' }
    ];

    const candidateCodes = [
      '0304.52.00', // Fish
      '0403.90.10', // Dairy
      '0702.00.00', // Vegetables
      '0901.12.00', // Coffee
      '5210.00.00'  // Textiles
    ];

    console.log('\nSample ML Predictions:');
    for (const test of testProducts) {
      console.log(`\n  Product: "${test.desc}"`);
      const predictions = await mlClassifier.predict(test.desc, new Array(768).fill(0), candidateCodes);

      if (predictions.length > 0 && predictions[0]) {
        const topPred = predictions[0];
        const match = topPred.hsCode === test.expectedCode ? '✅' : '❌';
        console.log(`    Top prediction: ${topPred.hsCode} (${topPred.confidence}% confidence) ${match}`);
      } else {
        console.log(`    No predictions generated`);
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`\n✨ ML Model Training Complete!`);
    console.log(`\nNext Steps:`);
    console.log(`1. Run quick-validation-test.ts to see overall accuracy improvement`);
    console.log(`2. Deploy model to production`);
    console.log(`3. Collect 100+ real user feedback records`);
    console.log(`4. Retrain model weekly for continuous improvement`);
    console.log(`5. Target: 85%+ accuracy by week 4\n`);

  } catch (error) {
    logger.error('Training failed');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

trainAndValidateModel().then(() => {
  console.log('\n✅ Training script completed successfully\n');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
