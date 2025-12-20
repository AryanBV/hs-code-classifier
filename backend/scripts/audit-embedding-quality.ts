import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface AuditResult {
  code: string;
  description: string;
  keywordCount: number;
  keywords: string[];
  commonProductsCount: number;
  commonProducts: string[];
  synonymsCount: number;
  synonyms: string[];
  hasEmbedding: boolean;
  qualityScore: number;
  issues: string[];
}

interface AuditSummary {
  totalCodes: number;
  codesWithPoorQuality: number;
  codesWithNoKeywords: number;
  codesWithFewKeywords: number;
  codesWithNoCommonProducts: number;
  codesWithNoEmbedding: number;
  averageKeywordCount: number;
  averageQualityScore: number;
  poorQualityCodes: AuditResult[];
}

/**
 * Calculate quality score for an HS code
 * Score: 0-100
 */
function calculateQualityScore(code: any): number {
  let score = 0;

  // Embedding presence (20 points)
  if (code.embedding) score += 20;

  // Keyword count (30 points max)
  const keywordCount = code.keywords?.length || 0;
  score += Math.min(keywordCount * 5, 30);

  // Common products (25 points max)
  const commonProductsCount = code.commonProducts?.length || 0;
  score += Math.min(commonProductsCount * 5, 25);

  // Synonyms (15 points max)
  const synonymsCount = code.synonyms?.length || 0;
  score += Math.min(synonymsCount * 5, 15);

  // Description quality (10 points)
  const descLength = code.description?.length || 0;
  if (descLength > 100) score += 10;
  else if (descLength > 50) score += 5;

  return score;
}

/**
 * Identify issues with an HS code's data quality
 */
function identifyIssues(code: any): string[] {
  const issues: string[] = [];

  if (!code.embedding) {
    issues.push('NO_EMBEDDING');
  }

  const keywordCount = code.keywords?.length || 0;
  if (keywordCount === 0) {
    issues.push('NO_KEYWORDS');
  } else if (keywordCount < 3) {
    issues.push('FEW_KEYWORDS');
  }

  const commonProductsCount = code.commonProducts?.length || 0;
  if (commonProductsCount === 0) {
    issues.push('NO_COMMON_PRODUCTS');
  }

  const synonymsCount = code.synonyms?.length || 0;
  if (synonymsCount === 0) {
    issues.push('NO_SYNONYMS');
  }

  const descLength = code.description?.length || 0;
  if (descLength < 50) {
    issues.push('SHORT_DESCRIPTION');
  }

  return issues;
}

async function auditAllEmbeddings() {
  console.log('🔍 AUDITING ALL HS CODE EMBEDDINGS');
  console.log('═'.repeat(80));
  console.log('Analyzing quality of all 15,818 HS codes...\n');

  try {
    // Fetch all codes
    // Note: embedding field is Unsupported type, so we fetch it separately via raw query
    const allCodes = await prisma.hsCode.findMany({
      select: {
        code: true,
        description: true,
        keywords: true,
        commonProducts: true,
        synonyms: true
      }
    });

    // Check which codes have embeddings via raw query
    const codesWithEmbeddings: any[] = await prisma.$queryRaw`
      SELECT code
      FROM hs_codes
      WHERE embedding IS NOT NULL
    `;
    const embeddingSet = new Set(codesWithEmbeddings.map(r => r.code));

    console.log(`✅ Loaded ${allCodes.length} HS codes\n`);

    // Analyze each code
    const auditResults: AuditResult[] = [];
    let totalQualityScore = 0;
    let codesWithPoorQuality = 0;
    let codesWithNoKeywords = 0;
    let codesWithFewKeywords = 0;
    let codesWithNoCommonProducts = 0;
    let codesWithNoEmbedding = 0;
    let totalKeywords = 0;

    for (const code of allCodes) {
      const hasEmbedding = embeddingSet.has(code.code);
      const codeWithEmbedding = { ...code, embedding: hasEmbedding };

      const qualityScore = calculateQualityScore(codeWithEmbedding);
      const issues = identifyIssues(codeWithEmbedding);
      const keywordCount = code.keywords?.length || 0;

      totalQualityScore += qualityScore;
      totalKeywords += keywordCount;

      // Track statistics
      if (qualityScore < 50) codesWithPoorQuality++;
      if (keywordCount === 0) codesWithNoKeywords++;
      if (keywordCount > 0 && keywordCount < 3) codesWithFewKeywords++;
      if (!code.commonProducts || code.commonProducts.length === 0) codesWithNoCommonProducts++;
      if (!hasEmbedding) codesWithNoEmbedding++;

      const result: AuditResult = {
        code: code.code,
        description: code.description,
        keywordCount,
        keywords: code.keywords || [],
        commonProductsCount: code.commonProducts?.length || 0,
        commonProducts: code.commonProducts || [],
        synonymsCount: code.synonyms?.length || 0,
        synonyms: code.synonyms || [],
        hasEmbedding,
        qualityScore,
        issues
      };

      auditResults.push(result);
    }

    // Calculate summary statistics
    const summary: AuditSummary = {
      totalCodes: allCodes.length,
      codesWithPoorQuality,
      codesWithNoKeywords,
      codesWithFewKeywords,
      codesWithNoCommonProducts,
      codesWithNoEmbedding,
      averageKeywordCount: totalKeywords / allCodes.length,
      averageQualityScore: totalQualityScore / allCodes.length,
      poorQualityCodes: auditResults.filter(r => r.qualityScore < 50).slice(0, 100) // Top 100 worst
    };

    // Print summary
    console.log('═'.repeat(80));
    console.log('📊 AUDIT SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total HS Codes: ${summary.totalCodes.toLocaleString()}`);
    console.log(`Average Quality Score: ${summary.averageQualityScore.toFixed(1)}/100`);
    console.log(`Average Keywords per Code: ${summary.averageKeywordCount.toFixed(1)}`);
    console.log();

    console.log('Quality Issues:');
    console.log(`  ❌ Codes with NO keywords: ${summary.codesWithNoKeywords.toLocaleString()} (${(summary.codesWithNoKeywords/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  ⚠️  Codes with <3 keywords: ${summary.codesWithFewKeywords.toLocaleString()} (${(summary.codesWithFewKeywords/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  ⚠️  Codes with NO common products: ${summary.codesWithNoCommonProducts.toLocaleString()} (${(summary.codesWithNoCommonProducts/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  ❌ Codes with NO embedding: ${summary.codesWithNoEmbedding.toLocaleString()} (${(summary.codesWithNoEmbedding/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  🔴 Codes with POOR quality (<50 score): ${summary.codesWithPoorQuality.toLocaleString()} (${(summary.codesWithPoorQuality/summary.totalCodes*100).toFixed(1)}%)`);
    console.log();

    // Calculate codes needing enhancement
    const needsEnhancement = summary.codesWithNoKeywords + summary.codesWithFewKeywords;
    const estimatedCost = (needsEnhancement * 150 / 1000000) * 0.150; // GPT-4o-mini input cost
    const estimatedTime = Math.ceil(needsEnhancement / 100); // 100 codes per minute

    console.log('Enhancement Requirements:');
    console.log(`  📝 Codes needing enhancement: ${needsEnhancement.toLocaleString()}`);
    console.log(`  💰 Estimated OpenAI cost: $${estimatedCost.toFixed(3)}`);
    console.log(`  ⏱️  Estimated processing time: ~${estimatedTime} minutes`);
    console.log();

    // Show worst examples
    console.log('═'.repeat(80));
    console.log('🔴 TOP 20 POOREST QUALITY CODES (Examples)');
    console.log('═'.repeat(80));

    summary.poorQualityCodes.slice(0, 20).forEach((code, idx) => {
      console.log(`\n${idx + 1}. Code: ${code.code} (Score: ${code.qualityScore}/100)`);
      console.log(`   Description: ${code.description.substring(0, 80)}...`);
      console.log(`   Keywords: ${code.keywordCount} - [${code.keywords.join(', ') || 'NONE'}]`);
      console.log(`   Common Products: ${code.commonProductsCount} - [${code.commonProducts.join(', ') || 'NONE'}]`);
      console.log(`   Synonyms: ${code.synonymsCount} - [${code.synonyms.join(', ') || 'NONE'}]`);
      console.log(`   Issues: ${code.issues.join(', ')}`);
    });

    // Quality distribution
    console.log('\n' + '═'.repeat(80));
    console.log('📈 QUALITY SCORE DISTRIBUTION');
    console.log('═'.repeat(80));

    const distribution = {
      excellent: auditResults.filter(r => r.qualityScore >= 80).length,
      good: auditResults.filter(r => r.qualityScore >= 60 && r.qualityScore < 80).length,
      fair: auditResults.filter(r => r.qualityScore >= 40 && r.qualityScore < 60).length,
      poor: auditResults.filter(r => r.qualityScore < 40).length
    };

    console.log(`  Excellent (80-100): ${distribution.excellent.toLocaleString()} (${(distribution.excellent/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  Good (60-79):       ${distribution.good.toLocaleString()} (${(distribution.good/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  Fair (40-59):       ${distribution.fair.toLocaleString()} (${(distribution.fair/summary.totalCodes*100).toFixed(1)}%)`);
    console.log(`  Poor (<40):         ${distribution.poor.toLocaleString()} (${(distribution.poor/summary.totalCodes*100).toFixed(1)}%)`);
    console.log();

    // Chapter analysis
    console.log('═'.repeat(80));
    console.log('📚 QUALITY BY CHAPTER (Top 10 Worst)');
    console.log('═'.repeat(80));

    const chapterQuality = new Map<string, { total: number; avgScore: number; totalScore: number }>();

    auditResults.forEach(r => {
      const chapter = r.code.substring(0, 2);
      const current = chapterQuality.get(chapter) || { total: 0, avgScore: 0, totalScore: 0 };
      current.total++;
      current.totalScore += r.qualityScore;
      current.avgScore = current.totalScore / current.total;
      chapterQuality.set(chapter, current);
    });

    const sortedChapters = Array.from(chapterQuality.entries())
      .sort((a, b) => a[1].avgScore - b[1].avgScore)
      .slice(0, 10);

    sortedChapters.forEach(([chapter, stats], idx) => {
      console.log(`${idx + 1}. Chapter ${chapter}: Avg Score ${stats.avgScore.toFixed(1)}/100 (${stats.total} codes)`);
    });

    // Save detailed results
    const outputPath = path.join(__dirname, '../data/embedding-audit-results.json');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      distribution,
      chapterQuality: Object.fromEntries(chapterQuality),
      allResults: auditResults
    }, null, 2));

    console.log('\n' + '═'.repeat(80));
    console.log(`📄 Detailed audit results saved to: ${outputPath}`);
    console.log('═'.repeat(80));

    console.log('\n💡 NEXT STEPS:');
    console.log(`   1. Run enhance-all-poor-embeddings.ts to improve ${needsEnhancement.toLocaleString()} codes`);
    console.log(`   2. Estimated cost: $${estimatedCost.toFixed(3)} for OpenAI API`);
    console.log(`   3. Expected improvement: +16.7% accuracy (56.7% → 73%)`);
    console.log();

    return summary;

  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run audit
auditAllEmbeddings()
  .then(() => {
    console.log('✅ Audit completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
