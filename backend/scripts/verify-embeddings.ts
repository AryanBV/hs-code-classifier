/**
 * Post-population embedding validation gate — Phase 3 Strategy 3.
 *
 * Runs 5 tests against the populated 4-level hierarchical embeddings. If any
 * test fails the spike must HALT before subagent dispatch — the gate is hard.
 *
 * Tests:
 *  T1 — No identical vectors per level (cos < 0.9999 for all non-self pairs)
 *  T2 — Self nearest-neighbour: every row's #1 NN is itself
 *  T3 — Sibling spread within each subheading is below an empirical threshold
 *  T4 — Cross-chapter "Other" rows have meaningful spread (no leftover collapse)
 *  T5 — 15 spike-case queries each find their expected HS code in retrieval top-K
 *
 * Run: cd backend && npx tsx scripts/verify-embeddings.ts
 *      cd backend && npx tsx scripts/verify-embeddings.ts --skip-t5  (no Cohere calls)
 *
 * Exit code: 0 if all tests pass, 1 if any fail.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../src/utils/prisma';

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_URL = 'https://api.cohere.com/v2/embed';

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
  evidence?: unknown;
}

interface SpikeCase {
  caseId: number;
  query: string;
  expectedChapter?: string;
  expectedHeading?: string;
  expectedSubheading?: string;
  expectedCode?: string;
  isRefusal?: boolean;
  isAsk?: boolean;
}

// The 15 spike cases per the plan. Refusal/ask cases skip retrieval check.
const SPIKE_CASES: SpikeCase[] = [
  { caseId: 1, query: 'rubber suspension bushings for trucks', expectedHeading: '8708' },
  { caseId: 2, query: 'freeze-dried instant coffee powder in jars', expectedHeading: '2101' },
  { caseId: 3, query: 'fibre cement boards for construction', expectedHeading: '6811' },
  { caseId: 4, query: 'mens knitted cotton ensemble', expectedHeading: '6103' },
  { caseId: 5, query: 'windscreen wiper motor 12V automotive', expectedHeading: '8512' },
  { caseId: 6, query: 'brake pads', isAsk: true },
  { caseId: 7, query: 'vintage motorcycle 1939 collectible', expectedSubheading: '8711.00' },
  { caseId: 8, query: 'synthetic leather imitation polyurethane sheet', expectedChapter: '39' },
  { caseId: 9, query: 'leather shoes with rubber outer sole, leather upper, lace-up', expectedCode: '6403.99' },
  { caseId: 10, query: 'stainless steel watch bracelet replacement strap', expectedCode: '9113.20' },
  { caseId: 11, query: 'crude petroleum oil', expectedSubheading: '2709.00' },
  { caseId: 12, query: 'jasmine essential oil', expectedSubheading: '3301.22' },
  { caseId: 13, query: 'moon rock samples for research', isRefusal: true },
  { caseId: 14, query: 'engine filter for diesel truck', expectedHeading: '8421' },
  { caseId: 15, query: 'stnls stl hex bolt M10 grade 8.8 zinc plated', expectedCode: '7318.15' },
];

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(COHERE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'embed-v4.0',
      texts: [text],
      input_type: 'search_query', // asymmetric encoding — pulls query toward documents
      embedding_types: ['float'],
      output_dimension: 1536,
    }),
  });
  if (!res.ok) throw new Error(`Cohere ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const parsed = await res.json();
  return parsed.embeddings.float[0];
}

// ===== T1: No identical vectors per level =====

async function t1_noIdenticalVectors(): Promise<TestResult> {
  const levels = [
    { table: 'chapters', pk: 'chapter' },
    { table: 'headings', pk: 'heading' },
    { table: 'subheadings', pk: 'subheading' },
    { table: 'tariff_lines', pk: 'code' },
  ];

  // EXPECTED duplicates = pairs of rows whose embed_input (the text we fed to
  // Cohere) is IDENTICAL. Identical inputs → identical embeddings is a model
  // property, not a bug. T1 only flags UNEXPECTED collisions (different text
  // but somehow identical embeddings — that'd be a real embedding bug).
  //
  // The embed_input SQL must match the population script's level-specific
  // construction.
  const knownDupSet = new Set<string>();

  // Tariff line dups: same subheading + same description + same india_note +
  // same policy_condition (matches the leaf embed_input formula).
  const tlDups = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT
        t.subheading,
        t.description,
        s.india_specific_note,
        t.policy_condition,
        ARRAY_AGG(t.code ORDER BY t.code) AS codes
      FROM tariff_lines t
      JOIN subheadings s ON t.subheading = s.subheading
      WHERE t.embedding IS NOT NULL
      GROUP BY t.subheading, t.description, s.india_specific_note, t.policy_condition
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b
    FROM grp,
         unnest(grp.codes) WITH ORDINALITY AS a(code, i),
         unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i < j
  `;
  for (const r of tlDups) knownDupSet.add(`tariff_lines|${r.a}|${r.b}`);

  // Subheading dups: same heading + same title + same india_note.
  const shDups = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT
        heading,
        COALESCE(title, '') AS title,
        COALESCE(india_specific_note, '') AS note,
        ARRAY_AGG(subheading ORDER BY subheading) AS codes
      FROM subheadings
      WHERE embedding IS NOT NULL
      GROUP BY heading, COALESCE(title, ''), COALESCE(india_specific_note, '')
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b
    FROM grp,
         unnest(grp.codes) WITH ORDINALITY AS a(code, i),
         unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i < j
  `;
  for (const r of shDups) knownDupSet.add(`subheadings|${r.a}|${r.b}`);

  // Headings + chapters: title is the only differentiator. Group by title.
  const hDups = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT chapter, title, ARRAY_AGG(heading ORDER BY heading) AS codes
      FROM headings
      WHERE embedding IS NOT NULL
      GROUP BY chapter, title
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b
    FROM grp,
         unnest(grp.codes) WITH ORDINALITY AS a(code, i),
         unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i < j
  `;
  for (const r of hDups) knownDupSet.add(`headings|${r.a}|${r.b}`);

  const unexpected: Array<{ level: string; a: string; b: string; cos: number }> = [];
  const expected: Array<{ level: string; a: string; b: string; cos: number }> = [];

  for (const lvl of levels) {
    // Index-friendly: for each row, find its nearest neighbour using HNSW,
    // flag if cos >= 0.9999. O(N log N) instead of O(N²).
    const rows = await prisma.$queryRawUnsafe<
      Array<{ a: string; b: string; cos: number }>
    >(`
      SELECT t.${lvl.pk} AS a, nn.${lvl.pk} AS b, (1 - (t.embedding <=> nn.embedding))::float AS cos
      FROM ${lvl.table} t
      CROSS JOIN LATERAL (
        SELECT ${lvl.pk}, embedding
        FROM ${lvl.table} t2
        WHERE t2.embedding IS NOT NULL AND t2.${lvl.pk} <> t.${lvl.pk}
        ORDER BY t.embedding <=> t2.embedding
        LIMIT 1
      ) nn
      WHERE t.embedding IS NOT NULL
        AND (1 - (t.embedding <=> nn.embedding)) >= 0.9999
        AND t.${lvl.pk} < nn.${lvl.pk}
      LIMIT 1000
    `);
    for (const r of rows) {
      const isKnown = knownDupSet.has(`${lvl.table}|${r.a}|${r.b}`);
      const bucket = isKnown ? expected : unexpected;
      bucket.push({ level: lvl.table, a: r.a, b: r.b, cos: r.cos });
    }
  }

  return {
    name: 'T1 — No UNEXPECTED identical vectors per level (cos < 0.9999)',
    pass: unexpected.length === 0,
    detail:
      unexpected.length === 0
        ? `No unexpected collisions. Known data-level duplicates (same subheading+description): ${expected.length} pairs in tariff_lines — expected, model cannot distinguish identical input text.`
        : `${unexpected.length} unexpected violation${unexpected.length === 1 ? '' : 's'} (data-level dups: ${expected.length}).`,
    evidence: {
      unexpected_sample: unexpected.slice(0, 10),
      known_dup_sample: expected.slice(0, 5),
      known_dup_total: expected.length,
    },
  };
}

// ===== T2: Self-NN test =====

async function t2_selfNN(): Promise<TestResult> {
  const levels = [
    { table: 'chapters', pk: 'chapter' },
    { table: 'headings', pk: 'heading' },
    { table: 'subheadings', pk: 'subheading' },
    { table: 'tariff_lines', pk: 'code' },
  ];

  // Known data-duplicate sibling map — pairs of rows whose embed_input is
  // identical so distance is 0 and tie-breaking is non-deterministic. Spans all
  // 4 levels (different per-level embed_input formulas).
  type DupKey = string; // "level|pk"
  const dupMap = new Map<DupKey, Set<string>>();
  function addDup(level: string, a: string, b: string) {
    const ka = `${level}|${a}`;
    const kb = `${level}|${b}`;
    if (!dupMap.has(ka)) dupMap.set(ka, new Set());
    if (!dupMap.has(kb)) dupMap.set(kb, new Set());
    dupMap.get(ka)!.add(b);
    dupMap.get(kb)!.add(a);
  }

  const tlDupRows = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT t.subheading, t.description, s.india_specific_note, t.policy_condition,
             ARRAY_AGG(t.code ORDER BY t.code) AS codes
      FROM tariff_lines t JOIN subheadings s ON t.subheading = s.subheading
      WHERE t.embedding IS NOT NULL
      GROUP BY t.subheading, t.description, s.india_specific_note, t.policy_condition
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b FROM grp,
      unnest(grp.codes) WITH ORDINALITY AS a(code, i),
      unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i <> j
  `;
  for (const r of tlDupRows) addDup('tariff_lines', r.a, r.b);

  const shDupRows = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT heading, COALESCE(title, '') AS title, COALESCE(india_specific_note, '') AS note,
             ARRAY_AGG(subheading ORDER BY subheading) AS codes
      FROM subheadings WHERE embedding IS NOT NULL
      GROUP BY heading, COALESCE(title, ''), COALESCE(india_specific_note, '')
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b FROM grp,
      unnest(grp.codes) WITH ORDINALITY AS a(code, i),
      unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i <> j
  `;
  for (const r of shDupRows) addDup('subheadings', r.a, r.b);

  const hDupRows = await prisma.$queryRaw<Array<{ a: string; b: string }>>`
    WITH grp AS (
      SELECT chapter, title, ARRAY_AGG(heading ORDER BY heading) AS codes
      FROM headings WHERE embedding IS NOT NULL
      GROUP BY chapter, title
      HAVING COUNT(*) > 1
    )
    SELECT a.code AS a, b.code AS b FROM grp,
      unnest(grp.codes) WITH ORDINALITY AS a(code, i),
      unnest(grp.codes) WITH ORDINALITY AS b(code, j)
    WHERE i <> j
  `;
  for (const r of hDupRows) addDup('headings', r.a, r.b);

  const unexpected: Array<{ level: string; pk: string; nn: string }> = [];
  const expected: Array<{ level: string; pk: string; nn: string }> = [];

  for (const lvl of levels) {
    // Index-friendly: per-row top-1 NN via LATERAL. For non-self NN to be #1,
    // the sibling must be at distance 0 (identical embedding). Otherwise self
    // wins.
    const rows = await prisma.$queryRawUnsafe<Array<{ pk: string; nn_pk: string }>>(
      `
      SELECT t.${lvl.pk} AS pk, nn.${lvl.pk} AS nn_pk
      FROM ${lvl.table} t
      CROSS JOIN LATERAL (
        SELECT ${lvl.pk}
        FROM ${lvl.table} t2
        WHERE t2.embedding IS NOT NULL
        ORDER BY t.embedding <=> t2.embedding
        LIMIT 1
      ) nn
      WHERE t.embedding IS NOT NULL
        AND t.${lvl.pk} <> nn.${lvl.pk}
      LIMIT 1000
      `,
    );
    for (const r of rows) {
      const isKnown = dupMap.get(`${lvl.table}|${r.pk}`)?.has(r.nn_pk) ?? false;
      const bucket = isKnown ? expected : unexpected;
      bucket.push({ level: lvl.table, pk: r.pk, nn: r.nn_pk });
    }
  }

  return {
    name: 'T2 — Self nearest-neighbour (every row\'s #1 NN is itself OR a known data-duplicate sibling)',
    pass: unexpected.length === 0,
    detail:
      unexpected.length === 0
        ? `All rows: NN is self or known sibling. Known-sibling-NN count: ${expected.length} (expected — identical input text → distance 0, tie-broken non-deterministically).`
        : `${unexpected.length} rows have unexpected non-self NN.`,
    evidence: {
      unexpected_sample: unexpected.slice(0, 10),
      known_dup_nn_sample: expected.slice(0, 5),
      known_dup_nn_total: expected.length,
    },
  };
}

// ===== T3: Sibling spread within subheadings =====

async function t3_siblingSpread(threshold: number): Promise<TestResult> {
  // Measure sibling discrimination AFTER excluding pairs with identical
  // embed_input (those are forced collisions by data, not embedding failure).
  // Only siblings with DIFFERENT input text count toward the threshold.
  const rows = await prisma.$queryRaw<
    Array<{ subheading: string; sibling_count: number; max_sim: number }>
  >`
    WITH per_sub AS (
      SELECT t.subheading, t.code, t.description, s.india_specific_note,
             t.policy_condition, t.embedding
      FROM tariff_lines t
      JOIN subheadings s ON t.subheading = s.subheading
      WHERE t.embedding IS NOT NULL
    ),
    pairs AS (
      SELECT
        a.subheading AS subheading,
        (1 - (a.embedding <=> b.embedding))::float AS cos_sim
      FROM per_sub a
      JOIN per_sub b ON a.subheading = b.subheading AND a.code < b.code
      WHERE NOT (
        a.description = b.description
        AND COALESCE(a.india_specific_note, '') = COALESCE(b.india_specific_note, '')
        AND COALESCE(a.policy_condition, '') = COALESCE(b.policy_condition, '')
      )
    )
    SELECT
      subheading,
      COUNT(*)::int AS sibling_count,
      MAX(cos_sim)::float AS max_sim
    FROM pairs
    GROUP BY subheading
    ORDER BY max_sim DESC
    LIMIT 50
  `;

  const overThreshold = rows.filter((r) => r.max_sim > threshold);

  return {
    name: `T3 — Sibling spread within subheadings, distinct-input pairs only (max cos ≤ ${threshold})`,
    pass: overThreshold.length === 0,
    detail:
      overThreshold.length === 0
        ? `All distinct-input sibling pairs satisfy cos ≤ ${threshold}. Top max_sim observed: ${rows[0]?.max_sim?.toFixed(4) ?? 'n/a'}.`
        : `${overThreshold.length} subheadings have distinct-input sibling pairs at cos > ${threshold}.`,
    evidence: overThreshold.slice(0, 10),
  };
}

// ===== T4: Cross-chapter separation =====

async function t4_crossChapterSeparation(): Promise<TestResult> {
  // Sample 20 random "Other" rows across distinct chapters, check pairwise cosine.
  // After the v3 pivot they should have varied embeddings (each anchored to a
  // different chapter context).
  const rows = await prisma.$queryRaw<
    Array<{ chapter: string; code: string; embedding_text: string }>
  >`
    SELECT DISTINCT ON (LEFT(t.code, 2))
      LEFT(t.code, 2) AS chapter,
      t.code,
      t.embedding::text AS embedding_text
    FROM tariff_lines t
    WHERE t.embedding IS NOT NULL
      AND lower(trim(t.description)) = 'other'
    ORDER BY LEFT(t.code, 2), t.code
    LIMIT 20
  `;

  if (rows.length < 4) {
    return {
      name: 'T4 — Cross-chapter "Other" row separation',
      pass: false,
      detail: `Only ${rows.length} 'Other' rows embedded yet — need at least 4 from distinct chapters.`,
    };
  }

  // Compute pairwise via SQL
  const codes = rows.map((r) => r.code);
  const pairwise = await prisma.$queryRaw<Array<{ a: string; b: string; cos_sim: number }>>`
    WITH src AS (
      SELECT code, embedding FROM tariff_lines WHERE code = ANY(${codes})
    )
    SELECT
      a.code AS a,
      b.code AS b,
      (1 - (a.embedding <=> b.embedding))::float AS cos_sim
    FROM src a
    JOIN src b ON a.code < b.code
    ORDER BY cos_sim DESC
  `;

  const median = pairwise[Math.floor(pairwise.length / 2)]?.cos_sim ?? 1;
  const max = pairwise[0]?.cos_sim ?? 1;
  const overThreshold = pairwise.filter((p) => p.cos_sim > 0.85);

  return {
    name: 'T4 — Cross-chapter "Other" rows: median cos ≤ 0.85',
    pass: median <= 0.85,
    detail: `Sampled ${rows.length} "Other" rows across distinct chapters. Median pairwise cos = ${median.toFixed(4)}, max = ${max.toFixed(4)}.`,
    evidence: {
      median_cos: median,
      max_cos: max,
      pairs_above_0_85: overThreshold.length,
      sample_high: pairwise.slice(0, 5),
      sample_low: pairwise.slice(-5),
    },
  };
}

// ===== T5: Spike-query retrieval =====

async function t5_spikeQueryRetrieval(): Promise<TestResult> {
  const classifyCases = SPIKE_CASES.filter((c) => !c.isAsk && !c.isRefusal);
  const fails: Array<{ case: SpikeCase; reason: string; top5?: unknown[] }> = [];

  for (const c of classifyCases) {
    let queryVec: number[];
    try {
      queryVec = await embedQuery(c.query);
    } catch (err) {
      fails.push({ case: c, reason: `Cohere embed failed: ${(err as Error).message}` });
      continue;
    }
    const vecLiteral = `[${queryVec.join(',')}]`;

    // Determine which level to query against based on expected outcome.
    let topRows: Array<{ pk: string; sim: number }>;
    let target = '';
    let table = '';

    let textColumn = '';
    if (c.expectedCode) {
      table = 'tariff_lines';
      target = c.expectedCode;
      textColumn = 'description';
    } else if (c.expectedSubheading) {
      table = 'subheadings';
      target = c.expectedSubheading;
      textColumn = 'title';
    } else if (c.expectedHeading) {
      table = 'headings';
      target = c.expectedHeading;
      textColumn = 'title';
    } else if (c.expectedChapter) {
      table = 'chapters';
      target = c.expectedChapter;
      textColumn = 'title';
    } else {
      continue;
    }

    const pkColumn =
      table === 'tariff_lines' ? 'code' :
      table === 'subheadings' ? 'subheading' :
      table === 'headings'    ? 'heading'    : 'chapter';

    // Vector retrieval: top-30 by cosine
    const vecRows = await prisma.$queryRawUnsafe<Array<{ pk: string; sim: number }>>(
      `
      SELECT ${pkColumn} AS pk, (1 - (embedding <=> $1::vector))::float AS sim
      FROM ${table}
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 30
      `,
      vecLiteral,
    );
    // FTS leg: top-30 by ts_rank — matches the pipeline's parallel non-cascading leg
    const ftsRows = await prisma.$queryRawUnsafe<Array<{ pk: string }>>(
      `
      SELECT ${pkColumn} AS pk
      FROM ${table}
      WHERE ${textColumn} IS NOT NULL
        AND to_tsvector('english', ${textColumn}) @@ websearch_to_tsquery('english', $1)
      ORDER BY ts_rank(to_tsvector('english', ${textColumn}), websearch_to_tsquery('english', $1)) DESC
      LIMIT 30
      `,
      c.query,
    );

    const vecHit = vecRows.findIndex((r) => r.pk.startsWith(target));
    const ftsHit = ftsRows.findIndex((r) => r.pk.startsWith(target));

    if (vecHit < 0 && ftsHit < 0) {
      fails.push({
        case: c,
        reason: `Expected ${target} NOT found in vec top-30 OR fts top-30 of ${table}`,
        top5: vecRows.slice(0, 5),
      });
    } else {
      const vecMsg = vecHit >= 0 ? `vec rank ${vecHit + 1}` : 'vec MISS';
      const ftsMsg = ftsHit >= 0 ? `fts rank ${ftsHit + 1}` : 'fts MISS';
      console.log(`  [T5] case-${c.caseId} "${c.query.slice(0, 40)}" → ${table}: ${vecMsg}, ${ftsMsg}`);
    }
  }

  return {
    name: `T5 — Spike-query retrieval (${classifyCases.length} cases, target in top-30)`,
    pass: fails.length === 0,
    detail:
      fails.length === 0
        ? `All ${classifyCases.length} classify cases find target in top-30 at appropriate level.`
        : `${fails.length}/${classifyCases.length} cases failed to find target.`,
    evidence: fails,
  };
}

// ===== Main =====

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('Phase 3 — Embedding validation gate');
  console.log('='.repeat(70));

  const skipT5 = process.argv.includes('--skip-t5');

  if (!skipT5 && (!COHERE_API_KEY || COHERE_API_KEY === 'your-cohere-api-key')) {
    console.error('FAIL: COHERE_API_KEY not set; --skip-t5 to bypass.');
    process.exit(1);
  }

  // Empirical sibling-spread threshold: 0.97 to start (we'll tune from baseline
  // if T3 fails persistently).
  const SIBLING_SPREAD_THRESHOLD = 0.97;

  const tests: TestResult[] = [];

  console.log('\nRunning T1 — identical vectors...');
  tests.push(await t1_noIdenticalVectors());

  console.log('Running T2 — self-NN... (may take 1-2 min for full corpus)');
  tests.push(await t2_selfNN());

  console.log('Running T3 — sibling spread...');
  tests.push(await t3_siblingSpread(SIBLING_SPREAD_THRESHOLD));

  console.log('Running T4 — cross-chapter "Other" separation...');
  tests.push(await t4_crossChapterSeparation());

  if (skipT5) {
    console.log('Skipping T5 — flagged via --skip-t5');
  } else {
    console.log('Running T5 — spike-query retrieval...');
    tests.push(await t5_spikeQueryRetrieval());
  }

  console.log('\n' + '='.repeat(70));
  console.log('VALIDATION GATE RESULTS');
  console.log('='.repeat(70));

  let allPass = true;
  for (const t of tests) {
    const symbol = t.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`\n${symbol}  ${t.name}`);
    console.log(`        ${t.detail}`);
    if (!t.pass && t.evidence) {
      console.log(`        Evidence (first items): ${JSON.stringify(t.evidence).slice(0, 500)}`);
    }
    if (!t.pass) allPass = false;
  }

  console.log('\n' + '='.repeat(70));
  if (allPass) {
    console.log('GATE PASSED — embeddings are validated. Spike may proceed.');
    console.log('='.repeat(70));
    await prisma.$disconnect();
    process.exit(0);
  } else {
    console.log('GATE FAILED — halt before spike dispatch. Fix root cause first.');
    console.log('='.repeat(70));
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('Verification crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
