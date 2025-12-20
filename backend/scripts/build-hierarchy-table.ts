/**
 * Build HS Code Hierarchy Table
 *
 * Creates parent-child relationships for all 15,818 HS codes.
 *
 * Hierarchy Structure:
 * - Level 2: Chapter (e.g., "84")
 * - Level 4: Heading (e.g., "8408")
 * - Level 6: Subheading (e.g., "8408.20")
 * - Level 8-10: Tariff Code (e.g., "8408.20.10")
 *
 * Example:
 * - "84" (chapter) → children: ["8401", "8402", ..., "8487"]
 * - "8408" (heading) → parent: "84", children: ["8408.10", "8408.20", ...]
 * - "8408.20" (subheading) → parent: "8408", children: ["8408.20.10", "8408.20.20", ...]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface HierarchyNode {
  code: string;
  parentCode: string | null;
  level: number;
  childrenCodes: string[];
  allChildren: string[];
}

/**
 * Determine hierarchy level from code structure
 * @param code - HS code (e.g., "8408.20.10")
 * @returns Level (2, 4, 6, 8, or 10)
 */
function determineLevel(code: string): number {
  // Remove dots and count digits
  const digitsOnly = code.replace(/\./g, '');
  return digitsOnly.length;
}

/**
 * Get parent code from current code
 * @param code - Current HS code
 * @returns Parent code or null if this is a chapter (top level)
 */
function getParentCode(code: string): string | null {
  const digitsOnly = code.replace(/\./g, '');
  const level = digitsOnly.length;

  if (level <= 2) {
    return null; // Chapters have no parent
  }

  // Parent is the code with 2 fewer digits
  // Examples:
  // - "8408.20.10" (10 digits) → "8408.20" (8 digits) → "840820"
  // - "8408.20" (6 digits without dots) → "8408" (4 digits)
  // - "8408" (4 digits) → "84" (2 digits)

  if (level === 4) {
    // Heading → Chapter
    return digitsOnly.substring(0, 2);
  } else if (level === 6) {
    // Subheading → Heading
    const parentDigits = digitsOnly.substring(0, 4);
    return parentDigits;
  } else if (level === 8) {
    // Tariff 8 → Subheading
    const parentDigits = digitsOnly.substring(0, 6);
    // Format as "XXXX.XX"
    return `${parentDigits.substring(0, 4)}.${parentDigits.substring(4, 6)}`;
  } else if (level === 10) {
    // Tariff 10 → Tariff 8 or Subheading
    const parentDigits = digitsOnly.substring(0, 8);
    // Format as "XXXX.XX.XX"
    return `${parentDigits.substring(0, 4)}.${parentDigits.substring(4, 6)}.${parentDigits.substring(6, 8)}`;
  }

  return null;
}

/**
 * Find all direct children of a code
 * @param code - Parent code
 * @param allCodes - All HS codes in database
 * @returns Array of direct child codes
 */
function getDirectChildren(code: string, allCodes: string[]): string[] {
  const digitsOnly = code.replace(/\./g, '');
  const level = digitsOnly.length;

  return allCodes.filter(candidateCode => {
    const candidateDigits = candidateCode.replace(/\./g, '');
    const candidateLevel = candidateDigits.length;

    // Direct child must be exactly 2 levels deeper
    if (candidateLevel !== level + 2) {
      return false;
    }

    // Must start with parent code
    return candidateDigits.startsWith(digitsOnly);
  });
}

/**
 * Find ALL descendants of a code (recursive)
 * @param code - Parent code
 * @param allCodes - All HS codes in database
 * @returns Array of all descendant codes
 */
function getAllDescendants(code: string, allCodes: string[]): string[] {
  const digitsOnly = code.replace(/\./g, '');

  return allCodes.filter(candidateCode => {
    const candidateDigits = candidateCode.replace(/\./g, '');

    // Descendant must be longer and start with parent
    return candidateDigits.length > digitsOnly.length &&
           candidateDigits.startsWith(digitsOnly);
  });
}

async function buildHierarchyTable() {
  console.log('🏗️  BUILDING HS CODE HIERARCHY TABLE');
  console.log('═'.repeat(80));

  try {
    // Fetch all HS codes
    const allHsCodes = await prisma.hsCode.findMany({
      select: { code: true }
    });

    const codes = allHsCodes.map(c => c.code);
    console.log(`✅ Loaded ${codes.length} HS codes\n`);

    // Build hierarchy nodes
    const hierarchyNodes: HierarchyNode[] = [];

    console.log('Building hierarchy relationships...');
    let processed = 0;

    for (const code of codes) {
      const level = determineLevel(code);
      const parentCode = getParentCode(code);
      const childrenCodes = getDirectChildren(code, codes);
      const allChildren = getAllDescendants(code, codes);

      hierarchyNodes.push({
        code,
        parentCode,
        level,
        childrenCodes,
        allChildren
      });

      processed++;
      if (processed % 1000 === 0) {
        console.log(`  Processed ${processed}/${codes.length} codes...`);
      }
    }

    console.log(`✅ Built ${hierarchyNodes.length} hierarchy nodes\n`);

    // Statistics
    const byLevel = {
      2: hierarchyNodes.filter(n => n.level === 2).length,
      4: hierarchyNodes.filter(n => n.level === 4).length,
      6: hierarchyNodes.filter(n => n.level === 6).length,
      8: hierarchyNodes.filter(n => n.level === 8).length,
      10: hierarchyNodes.filter(n => n.level === 10).length
    };

    console.log('Hierarchy Statistics:');
    console.log(`  Chapters (level 2): ${byLevel[2]}`);
    console.log(`  Headings (level 4): ${byLevel[4]}`);
    console.log(`  Subheadings (level 6): ${byLevel[6]}`);
    console.log(`  Tariff codes 8 (level 8): ${byLevel[8]}`);
    console.log(`  Tariff codes 10 (level 10): ${byLevel[10]}`);
    console.log();

    // Insert into database
    console.log('Inserting hierarchy data into database...');

    // Clear existing data
    await prisma.hsCodeHierarchy.deleteMany({});
    console.log('  Cleared existing hierarchy data');

    // Batch insert (500 at a time to avoid memory issues)
    const batchSize = 500;
    for (let i = 0; i < hierarchyNodes.length; i += batchSize) {
      const batch = hierarchyNodes.slice(i, i + batchSize);

      await prisma.hsCodeHierarchy.createMany({
        data: batch.map(node => ({
          code: node.code,
          parentCode: node.parentCode,
          level: node.level,
          childrenCodes: node.childrenCodes,
          allChildren: node.allChildren
        }))
      });

      console.log(`  Inserted ${Math.min(i + batchSize, hierarchyNodes.length)}/${hierarchyNodes.length} nodes`);
    }

    console.log('\n✅ Hierarchy table built successfully!\n');

    // Show examples
    console.log('═'.repeat(80));
    console.log('📋 EXAMPLE HIERARCHY RELATIONSHIPS');
    console.log('═'.repeat(80));

    // Example 1: Chapter 84 (Machinery)
    const chapter84 = hierarchyNodes.find(n => n.code === '84');
    if (chapter84) {
      console.log('\n1. Chapter 84 (Machinery):');
      console.log(`   Level: ${chapter84.level}`);
      console.log(`   Parent: ${chapter84.parentCode || 'None (top level)'}`);
      console.log(`   Direct children: ${chapter84.childrenCodes.length} headings`);
      console.log(`   All descendants: ${chapter84.allChildren.length} codes`);
      console.log(`   Sample children: ${chapter84.childrenCodes.slice(0, 5).join(', ')}...`);
    }

    // Example 2: Heading 8408 (Diesel engines)
    const heading8408 = hierarchyNodes.find(n => n.code === '8408');
    if (heading8408) {
      console.log('\n2. Heading 8408 (Diesel engines):');
      console.log(`   Level: ${heading8408.level}`);
      console.log(`   Parent: ${heading8408.parentCode}`);
      console.log(`   Direct children: ${heading8408.childrenCodes.length} subheadings`);
      console.log(`   All descendants: ${heading8408.allChildren.length} codes`);
      console.log(`   Sample children: ${heading8408.childrenCodes.slice(0, 5).join(', ')}...`);
    }

    // Example 3: Subheading 8408.20
    const subheading840820 = hierarchyNodes.find(n => n.code === '8408.20');
    if (subheading840820) {
      console.log('\n3. Subheading 8408.20 (Compression-ignition engines for vehicles):');
      console.log(`   Level: ${subheading840820.level}`);
      console.log(`   Parent: ${subheading840820.parentCode}`);
      console.log(`   Direct children: ${subheading840820.childrenCodes.length} tariff codes`);
      console.log(`   All descendants: ${subheading840820.allChildren.length} codes`);
      console.log(`   Sample children: ${subheading840820.childrenCodes.slice(0, 5).join(', ')}...`);
    }

    console.log('\n' + '═'.repeat(80));

  } catch (error) {
    console.error('❌ Failed to build hierarchy:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
buildHierarchyTable()
  .then(() => {
    console.log('✅ Hierarchy table build completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Hierarchy table build failed:', error);
    process.exit(1);
  });
