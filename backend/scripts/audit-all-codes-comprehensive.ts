/**
 * Comprehensive Audit of ALL 15,818 HS Codes
 *
 * This script analyzes the entire database to identify system-wide issues,
 * NOT just the issues in failed test cases.
 *
 * Purpose: Understand data quality across ALL codes to make system-wide improvements
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CodeQualityMetrics {
  code: string;
  keywordCount: number;
  commonProductCount: number;
  synonymCount: number;
  totalSearchableTerms: number;
  hasEmbedding: boolean;
  descriptionLength: number;
  qualityScore: number;  // 0-100
  issues: string[];
}

interface ChapterStats {
  chapter: string;
  totalCodes: number;
  avgKeywords: number;
  avgCommonProducts: number;
  avgSynonyms: number;
  avgQualityScore: number;
  codesWithPoorQuality: number;  // quality < 50
  codesWithNoEmbedding: number;
  codesWithFewKeywords: number;  // < 3 keywords
}

async function auditAllCodes() {
  console.log('🔍 COMPREHENSIVE AUDIT OF ALL 15,818 HS CODES');
  console.log('═'.repeat(80));
  console.log('Purpose: Identify system-wide data quality issues\n');

  try {
    // Fetch ALL codes with their data
    console.log('📊 Step 1: Loading all HS codes from database...');
    const allCodes = await prisma.hsCode.findMany({
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true,
        chapter: true
      }
    });

    console.log(`✅ Loaded ${allCodes.length} HS codes\n`);

    // Check embeddings separately (can't select Unsupported type)
    console.log('📊 Step 2: Checking embedding coverage...');
    const codesWithEmbeddings: any[] = await prisma.$queryRaw`
      SELECT code FROM hs_codes WHERE embedding IS NOT NULL
    `;
    const embeddingSet = new Set(codesWithEmbeddings.map((r: any) => r.code));
    console.log(`✅ ${codesWithEmbeddings.length} codes have embeddings\n`);

    // Analyze each code
    console.log('📊 Step 3: Analyzing quality of each code...');
    const codeMetrics: CodeQualityMetrics[] = [];
    let processed = 0;

    for (const code of allCodes) {
      const keywordCount = code.keywords?.length || 0;
      const commonProductCount = code.commonProducts?.length || 0;
      const synonymCount = code.synonyms?.length || 0;
      const totalSearchableTerms = keywordCount + commonProductCount + synonymCount;
      const hasEmbedding = embeddingSet.has(code.code);
      const descriptionLength = code.description?.length || 0;

      // Calculate quality score (0-100)
      let qualityScore = 0;
      const issues: string[] = [];

      // Keywords (up to 30 points)
      if (keywordCount >= 5) qualityScore += 30;
      else if (keywordCount >= 3) qualityScore += 20;
      else if (keywordCount >= 1) qualityScore += 10;
      else issues.push('No keywords');

      // Common products (up to 20 points)
      if (commonProductCount >= 3) qualityScore += 20;
      else if (commonProductCount >= 1) qualityScore += 10;
      else issues.push('No common products');

      // Synonyms (up to 10 points)
      if (synonymCount >= 2) qualityScore += 10;
      else if (synonymCount >= 1) qualityScore += 5;
      else issues.push('No synonyms');

      // Embedding (up to 20 points)
      if (hasEmbedding) qualityScore += 20;
      else issues.push('No embedding');

      // Description (up to 20 points)
      if (descriptionLength >= 100) qualityScore += 20;
      else if (descriptionLength >= 50) qualityScore += 15;
      else if (descriptionLength >= 20) qualityScore += 10;
      else issues.push('Short description');

      codeMetrics.push({
        code: code.code,
        keywordCount,
        commonProductCount,
        synonymCount,
        totalSearchableTerms,
        hasEmbedding,
        descriptionLength,
        qualityScore,
        issues
      });

      processed++;
      if (processed % 2000 === 0) {
        console.log(`   Processed ${processed}/${allCodes.length} codes...`);
      }
    }

    console.log(`✅ Analyzed ${codeMetrics.length} codes\n`);

    // Aggregate statistics by chapter
    console.log('📊 Step 4: Aggregating statistics by chapter...');
    const chapterMap = new Map<string, CodeQualityMetrics[]>();

    for (const metric of codeMetrics) {
      const chapter = metric.code.substring(0, 2);
      if (!chapterMap.has(chapter)) {
        chapterMap.set(chapter, []);
      }
      chapterMap.get(chapter)!.push(metric);
    }

    const chapterStats: ChapterStats[] = [];

    for (const [chapter, metrics] of chapterMap.entries()) {
      const totalCodes = metrics.length;
      const avgKeywords = metrics.reduce((sum, m) => sum + m.keywordCount, 0) / totalCodes;
      const avgCommonProducts = metrics.reduce((sum, m) => sum + m.commonProductCount, 0) / totalCodes;
      const avgSynonyms = metrics.reduce((sum, m) => sum + m.synonymCount, 0) / totalCodes;
      const avgQualityScore = metrics.reduce((sum, m) => sum + m.qualityScore, 0) / totalCodes;
      const codesWithPoorQuality = metrics.filter(m => m.qualityScore < 50).length;
      const codesWithNoEmbedding = metrics.filter(m => !m.hasEmbedding).length;
      const codesWithFewKeywords = metrics.filter(m => m.keywordCount < 3).length;

      chapterStats.push({
        chapter,
        totalCodes,
        avgKeywords,
        avgCommonProducts,
        avgSynonyms,
        avgQualityScore,
        codesWithPoorQuality,
        codesWithNoEmbedding,
        codesWithFewKeywords
      });
    }

    // Sort by chapter number
    chapterStats.sort((a, b) => parseInt(a.chapter) - parseInt(b.chapter));

    console.log(`✅ Analyzed ${chapterStats.length} chapters\n`);

    // Print overall summary
    console.log('═'.repeat(80));
    console.log('📋 OVERALL SUMMARY');
    console.log('═'.repeat(80));

    const overallAvgQuality = codeMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / codeMetrics.length;
    const poorQualityCodes = codeMetrics.filter(m => m.qualityScore < 50);
    const noEmbeddingCodes = codeMetrics.filter(m => !m.hasEmbedding);
    const fewKeywordsCodes = codeMetrics.filter(m => m.keywordCount < 3);
    const noCommonProductsCodes = codeMetrics.filter(m => m.commonProductCount === 0);

    console.log(`\nTotal Codes: ${codeMetrics.length}`);
    console.log(`Average Quality Score: ${overallAvgQuality.toFixed(1)}/100`);
    console.log('');
    console.log('🚨 ISSUES FOUND:');
    console.log(`   ${poorQualityCodes.length} codes (${(poorQualityCodes.length/codeMetrics.length*100).toFixed(1)}%) have quality < 50/100`);
    console.log(`   ${noEmbeddingCodes.length} codes (${(noEmbeddingCodes.length/codeMetrics.length*100).toFixed(1)}%) have NO embedding`);
    console.log(`   ${fewKeywordsCodes.length} codes (${(fewKeywordsCodes.length/codeMetrics.length*100).toFixed(1)}%) have < 3 keywords`);
    console.log(`   ${noCommonProductsCodes.length} codes (${(noCommonProductsCodes.length/codeMetrics.length*100).toFixed(1)}%) have NO common products`);

    // Print chapter-level analysis
    console.log('\n═'.repeat(80));
    console.log('📊 CHAPTER-LEVEL ANALYSIS');
    console.log('═'.repeat(80));
    console.log('(Chapters with lowest quality scores listed first)\n');

    // Sort by quality score (worst first)
    const sortedChapters = [...chapterStats].sort((a, b) => a.avgQualityScore - b.avgQualityScore);

    console.log('Chapter | Codes | Avg Quality | Poor Quality | Few Keywords | No Embedding');
    console.log('--------|-------|-------------|--------------|--------------|-------------');

    for (const stat of sortedChapters.slice(0, 20)) {  // Show worst 20 chapters
      const poorPct = (stat.codesWithPoorQuality / stat.totalCodes * 100).toFixed(0);
      const fewKeyPct = (stat.codesWithFewKeywords / stat.totalCodes * 100).toFixed(0);
      const noEmbPct = (stat.codesWithNoEmbedding / stat.totalCodes * 100).toFixed(0);

      console.log(
        `   ${stat.chapter.padEnd(4)} | ` +
        `${stat.totalCodes.toString().padEnd(5)} | ` +
        `${stat.avgQualityScore.toFixed(1).padEnd(11)} | ` +
        `${poorPct.padEnd(12)}% | ` +
        `${fewKeyPct.padEnd(12)}% | ` +
        `${noEmbPct.padEnd(12)}%`
      );
    }

    // Find worst individual codes
    console.log('\n═'.repeat(80));
    console.log('🚨 WORST QUALITY CODES (Bottom 50)');
    console.log('═'.repeat(80));
    console.log('These codes need immediate attention\n');

    const worstCodes = [...codeMetrics].sort((a, b) => a.qualityScore - b.qualityScore).slice(0, 50);

    console.log('Rank | Code | Quality | Keywords | Products | Synonyms | Issues');
    console.log('-----|------|---------|----------|----------|----------|-------');

    worstCodes.forEach((metric, idx) => {
      console.log(
        `${(idx + 1).toString().padEnd(4)} | ` +
        `${metric.code.padEnd(4)} | ` +
        `${metric.qualityScore.toString().padEnd(7)} | ` +
        `${metric.keywordCount.toString().padEnd(8)} | ` +
        `${metric.commonProductCount.toString().padEnd(8)} | ` +
        `${metric.synonymCount.toString().padEnd(8)} | ` +
        `${metric.issues.join(', ')}`
      );
    });

    // Actionable recommendations
    console.log('\n═'.repeat(80));
    console.log('💡 ACTIONABLE RECOMMENDATIONS');
    console.log('═'.repeat(80));

    console.log('\n1. IMMEDIATE FIXES (High Impact):');
    console.log(`   - Fix ${poorQualityCodes.length} codes with quality < 50`);
    console.log(`   - Add keywords to ${fewKeywordsCodes.length} codes with < 3 keywords`);
    console.log(`   - Add common products to ${noCommonProductsCodes.length} codes`);

    console.log('\n2. CHAPTER-SPECIFIC FIXES:');
    const chaptersNeedingWork = sortedChapters.filter(c => c.avgQualityScore < 70);
    console.log(`   - ${chaptersNeedingWork.length} chapters have avg quality < 70/100`);
    console.log(`   - Focus on chapters: ${chaptersNeedingWork.slice(0, 10).map(c => c.chapter).join(', ')}`);

    console.log('\n3. SYSTEMATIC ENHANCEMENT:');
    console.log('   - Use GPT-4o-mini to generate keywords for ALL poor-quality codes');
    console.log(`   - Estimated cost: ~$0.30 for all ${poorQualityCodes.length} codes`);
    console.log('   - Estimated time: ~30-60 minutes');

    console.log('\n4. VALIDATION:');
    console.log('   - Re-run this audit after enhancements');
    console.log('   - Target: 90%+ codes with quality > 70/100');
    console.log('   - Target: Average quality score > 85/100');

    console.log('\n═'.repeat(80));
    console.log('✅ AUDIT COMPLETE');
    console.log('═'.repeat(80));

    console.log('\nNext steps:');
    console.log('  1. Run: npx ts-node scripts/enhance-poor-quality-codes.ts');
    console.log('  2. Re-run this audit to validate improvements');
    console.log('  3. Test on comprehensive test suite (100+ cases)');
    console.log('');

  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the audit
auditAllCodes()
  .then(() => {
    console.log('✅ Audit completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
