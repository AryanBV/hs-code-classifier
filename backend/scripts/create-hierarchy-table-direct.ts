/**
 * Create Hierarchy Table Directly via Prisma Client
 *
 * This script creates the hs_code_hierarchy table using raw SQL
 * through the Prisma connection pooler, bypassing migration issues.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createHierarchyTable() {
  console.log('🏗️  CREATING HS CODE HIERARCHY TABLE');
  console.log('═'.repeat(80));

  try {
    console.log('Connecting to database...');

    // Drop table if exists (for clean slate)
    console.log('\n1. Dropping existing table (if exists)...');
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS hs_code_hierarchy CASCADE;
    `);
    console.log('   ✅ Existing table dropped (if it existed)');

    // Create the table
    console.log('\n2. Creating hs_code_hierarchy table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE hs_code_hierarchy (
        code VARCHAR(20) PRIMARY KEY,
        parent_code VARCHAR(20),
        level INTEGER NOT NULL,
        children_codes TEXT[] NOT NULL DEFAULT '{}',
        all_children TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('   ✅ Table created successfully');

    // Create indexes
    console.log('\n3. Creating indexes...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX idx_parent_code ON hs_code_hierarchy(parent_code);
    `);
    console.log('   ✅ Index idx_parent_code created');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX idx_hierarchy_level ON hs_code_hierarchy(level);
    `);
    console.log('   ✅ Index idx_hierarchy_level created');

    // Add comments
    console.log('\n4. Adding table documentation...');
    await prisma.$executeRawUnsafe(`
      COMMENT ON TABLE hs_code_hierarchy IS 'Stores parent-child relationships for HS codes to enable hierarchy expansion';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN hs_code_hierarchy.code IS 'HS code (e.g., "8408", "8408.20", "8408.20.10")';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN hs_code_hierarchy.parent_code IS 'Parent code (e.g., "8408.20" -> parent is "8408")';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN hs_code_hierarchy.level IS 'Hierarchy level: 2=chapter, 4=heading, 6=subheading, 8/10=tariff';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN hs_code_hierarchy.children_codes IS 'Array of direct child codes';
    `);
    await prisma.$executeRawUnsafe(`
      COMMENT ON COLUMN hs_code_hierarchy.all_children IS 'Array of ALL descendant codes (recursive)';
    `);
    console.log('   ✅ Documentation added');

    // Verify table creation
    console.log('\n5. Verifying table creation...');
    const result: any = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'hs_code_hierarchy';
    `;

    if (result && result.length > 0) {
      console.log('   ✅ Table verified in database');
    } else {
      throw new Error('Table creation verification failed');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ HIERARCHY TABLE CREATED SUCCESSFULLY!');
    console.log('═'.repeat(80));
    console.log('\nNext steps:');
    console.log('  1. Run: npx prisma generate');
    console.log('  2. Run: npx ts-node scripts/build-hierarchy-table.ts');
    console.log('');

  } catch (error) {
    console.error('\n❌ Failed to create hierarchy table:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createHierarchyTable()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
