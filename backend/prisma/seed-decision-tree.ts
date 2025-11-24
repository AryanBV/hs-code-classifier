/**
 * Seed Decision Tree Data
 *
 * Inserts automotive parts decision tree into decision_trees table
 *
 * Run: npx ts-node backend/prisma/seed-decision-tree.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Automotive Parts Decision Tree
 *
 * This decision tree helps classify automotive parts into appropriate HS codes
 * based on product characteristics like material, function, and application.
 */
const automotivePartsDecisionTree = {
  questions: [
    {
      id: 'q1',
      text: 'What is the primary function of this automotive part?',
      type: 'single_choice',
      options: [
        'Braking system',
        'Engine component',
        'Filtration system',
        'Electrical/Lighting',
        'Suspension system',
        'Transmission component',
        'Exhaust system',
        'Cooling system',
        'Bearing/Rotation'
      ]
    },
    {
      id: 'q2_brake',
      text: 'What type of brake component is it?',
      type: 'single_choice',
      options: [
        'Brake pads/shoes',
        'Brake disc/rotor',
        'Brake fluid',
        'Brake assembly/parts'
      ]
    },
    {
      id: 'q3_engine',
      text: 'What type of engine component is it?',
      type: 'single_choice',
      options: [
        'Piston/piston rings',
        'Spark plug',
        'Fuel pump',
        'Other engine parts'
      ]
    },
    {
      id: 'q4_filter',
      text: 'What type of filter is it?',
      type: 'single_choice',
      options: [
        'Oil filter',
        'Air filter',
        'Fuel filter',
        'Other filter'
      ]
    },
    {
      id: 'q5_electrical',
      text: 'What type of electrical/lighting component is it?',
      type: 'single_choice',
      options: [
        'Headlight/lamp assembly',
        'Light bulb',
        'Wiper blade',
        'Alternator/generator',
        'Other electrical'
      ]
    },
    {
      id: 'q6_material',
      text: 'What is the primary material?',
      type: 'single_choice',
      options: [
        'Rubber',
        'Metal (steel/iron)',
        'Metal (aluminum)',
        'Ceramic',
        'Plastic',
        'Composite/Multiple materials'
      ]
    }
  ],
  rules: [
    // ========================================
    // Braking System Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['brake', 'pad']
      },
      suggestedCodes: ['8708.30.00'],
      confidenceBoost: 90
    },
    {
      conditions: {
        keywords: ['brake', 'disc']
      },
      suggestedCodes: ['8708.30.00'],
      confidenceBoost: 90
    },
    {
      conditions: {
        keywords: ['brake', 'rotor']
      },
      suggestedCodes: ['8708.30.00'],
      confidenceBoost: 90
    },
    {
      conditions: {
        keywords: ['brake', 'fluid']
      },
      suggestedCodes: ['3819.00.10'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['brake']
      },
      suggestedCodes: ['8708.30.00'],
      confidenceBoost: 80
    },

    // ========================================
    // Engine Component Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['piston']
      },
      suggestedCodes: ['8409.91.13'],
      confidenceBoost: 90
    },
    {
      conditions: {
        keywords: ['spark', 'plug']
      },
      suggestedCodes: ['8511.10.00'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['fuel', 'pump']
      },
      suggestedCodes: ['8413.30.20'],
      confidenceBoost: 90
    },

    // ========================================
    // Filtration System Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['oil', 'filter']
      },
      suggestedCodes: ['8421.23.00'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['air', 'filter']
      },
      suggestedCodes: ['8421.31.00'],
      confidenceBoost: 95
    },

    // ========================================
    // Electrical/Lighting Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['headlight']
      },
      suggestedCodes: ['8512.20.10'],
      confidenceBoost: 90
    },
    {
      conditions: {
        keywords: ['bulb', 'light']
      },
      suggestedCodes: ['8539.29.40'],
      confidenceBoost: 85
    },
    {
      conditions: {
        keywords: ['wiper']
      },
      suggestedCodes: ['8512.40.00'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['alternator']
      },
      suggestedCodes: ['8511.50.00'],
      confidenceBoost: 90
    },

    // ========================================
    // Suspension System Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['suspension']
      },
      suggestedCodes: ['8708.80.00'],
      confidenceBoost: 85
    },
    {
      conditions: {
        keywords: ['shock', 'absorber']
      },
      suggestedCodes: ['8708.80.00'],
      confidenceBoost: 90
    },

    // ========================================
    // Transmission Component Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['transmission']
      },
      suggestedCodes: ['8708.93.00'],
      confidenceBoost: 80
    },
    {
      conditions: {
        keywords: ['clutch']
      },
      suggestedCodes: ['8708.93.00'],
      confidenceBoost: 85
    },

    // ========================================
    // Exhaust System Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['exhaust']
      },
      suggestedCodes: ['8708.92.00'],
      confidenceBoost: 85
    },
    {
      conditions: {
        keywords: ['muffler']
      },
      suggestedCodes: ['8708.92.00'],
      confidenceBoost: 90
    },

    // ========================================
    // Cooling System Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['coolant']
      },
      suggestedCodes: ['3820.00.00'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['antifreeze']
      },
      suggestedCodes: ['3820.00.00'],
      confidenceBoost: 95
    },
    {
      conditions: {
        keywords: ['radiator', 'hose']
      },
      suggestedCodes: ['4009.31.00'],
      confidenceBoost: 85
    },

    // ========================================
    // Bearing/Rotation Rules (Keyword-based)
    // ========================================
    {
      conditions: {
        keywords: ['bearing']
      },
      suggestedCodes: ['8482.10.20'],
      confidenceBoost: 85
    },

    // ========================================
    // Material-Based Fallback Rules
    // ========================================
    {
      conditions: {
        q6_material: 'Rubber',
        keywords: ['belt', 'timing']
      },
      suggestedCodes: ['4010.32.90'],
      confidenceBoost: 80
    },
    {
      conditions: {
        q6_material: 'Rubber',
        keywords: ['boot', 'joint', 'cv']
      },
      suggestedCodes: ['4016.93.90'],
      confidenceBoost: 85
    }
  ]
};

/**
 * Main seed function
 */
async function main() {
  console.log('');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + 'SEEDING DECISION TREE DATA' + ' '.repeat(17) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('');

  console.log('Inserting Automotive Parts decision tree...');

  try {
    // Upsert decision tree (insert or update if exists)
    const result = await prisma.decisionTree.upsert({
      where: {
        categoryName: 'Automotive Parts'
      },
      update: {
        decisionFlow: automotivePartsDecisionTree,
        updatedAt: new Date()
      },
      create: {
        categoryName: 'Automotive Parts',
        decisionFlow: automotivePartsDecisionTree
      }
    });

    console.log(`✓ Decision tree inserted successfully`);
    console.log(`  Category: ${result.categoryName}`);
    console.log(`  Questions: ${automotivePartsDecisionTree.questions.length}`);
    console.log(`  Rules: ${automotivePartsDecisionTree.rules.length}`);
    console.log(`  ID: ${result.id}`);
    console.log('');

    // Verify by loading it back
    console.log('Verifying decision tree...');
    const loaded = await prisma.decisionTree.findUnique({
      where: { categoryName: 'Automotive Parts' }
    });

    if (loaded) {
      const flow = loaded.decisionFlow as any;
      console.log(`✓ Verification successful`);
      console.log(`  Loaded ${flow.questions.length} questions`);
      console.log(`  Loaded ${flow.rules.length} rules`);
    } else {
      console.log(`✗ Verification failed: Could not load decision tree`);
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('SEED COMPLETE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Decision tree is ready for use in classification service.');
    console.log('');

  } catch (error) {
    console.error('✗ Error seeding decision tree:', error);
    throw error;
  }
}

// Run the seed function
main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
