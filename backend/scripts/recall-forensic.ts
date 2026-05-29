/**
 * recall-forensic.ts
 *
 * Retrieval-recall partition forensic for the ITC-HS v2 classifier.
 *
 * For each test case, runs L0 → L1 → L2 → L3 (NO L4/L5) and partitions the
 * result into one of three buckets:
 *
 *   A = NOT-SURFACED: gold's 6-digit subheading was NOT among the cosine-cascade
 *       subheadings emitted by L2 (debug_surfaced_subheadings). Requires
 *       chapter/heading/subheading recall improvement (triage or RRF).
 *
 *   B = LEAF-FLOOR-ADDRESSABLE: gold subheading WAS surfaced AND is multi-leaf
 *       (child_count >= 2) AND gold code is NOT in the final candidates that
 *       reach L4 (filtered_candidates). A per-subheading leaf-floor (L-E) would
 *       surface the missing leaf.
 *
 *   C = TRUE-SELECTION: gold code IS in the final candidates that reach L4.
 *       L4 saw the gold code and still didn't pick it — information/selection
 *       problem, not retrieval.
 *
 * Usage:
 *   cd backend && RECALL_FORENSIC_DEBUG=1 npx tsx --require dotenv/config \
 *     scripts/recall-forensic.ts --ids TC001,TC009,...
 *
 * Prints per-case JSONL to stdout + an aggregate summary.
 *
 * Requires: DATABASE_URL and Vertex credentials in env (for L1 + L2).
 * Does NOT call L4 or L5.
 */

import 'dotenv/config';

// ── Force debug flag before any L2 import ──
process.env.RECALL_FORENSIC_DEBUG = '1';

import { normalize }    from '../src/classifier-v2/layers/L0-normalization';
import { triage }       from '../src/classifier-v2/layers/L1-triage';
import { retrieve }     from '../src/classifier-v2/layers/L2-retrieval';
import { rulesFilter }  from '../src/classifier-v2/layers/L3-rules-filter';
import { getSubheadingChildCounts } from '../src/classifier-v2/lib/supabase-client';
import { masterSuite }  from '../src/eval/test-suites/master-suite';
import type {
  RetrievalCandidate,
} from '../src/classifier-v2/types';

/* ---------------------------------------------------------------------------
 * CLI: parse --ids flag
 * --------------------------------------------------------------------------- */

function parseCLI(): string[] {
  const argv = process.argv.slice(2);
  const idxFlag = argv.indexOf('--ids');
  if (idxFlag === -1 || !argv[idxFlag + 1]) {
    console.error('Usage: recall-forensic.ts --ids ID1,ID2,...');
    process.exit(1);
  }
  return (argv[idxFlag + 1] as string).split(',').map(s => s.trim()).filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

type Bucket = 'A' | 'B' | 'C';

interface ForensicRow {
  test_case_id:                     string;
  query:                            string;
  gold_code:                        string;
  gold_subheading:                  string;
  retrieval_strategy:               string;
  gold_subheading_surfaced:         boolean;
  gold_subheading_child_count:      number;
  gold_in_rerank_union:             boolean;
  gold_in_final_candidates:         boolean;
  sibling_count_in_final_candidates:number;
  bucket:                           Bucket;
  error?:                           string;
}

/* ---------------------------------------------------------------------------
 * Case lookup: masterSuite keyed by id
 * --------------------------------------------------------------------------- */

const suiteById = new Map(masterSuite.map(tc => [tc.id, tc]));

/* ---------------------------------------------------------------------------
 * Main per-case runner
 * --------------------------------------------------------------------------- */

async function runCase(caseId: string): Promise<ForensicRow> {
  const tc = suiteById.get(caseId);
  if (!tc) {
    return {
      test_case_id:                      caseId,
      query:                             '',
      gold_code:                         '',
      gold_subheading:                   '',
      retrieval_strategy:                'unknown',
      gold_subheading_surfaced:          false,
      gold_subheading_child_count:       0,
      gold_in_rerank_union:              false,
      gold_in_final_candidates:          false,
      sibling_count_in_final_candidates: 0,
      bucket:                            'A',
      error:                             `case not found in masterSuite`,
    };
  }

  const goldCode = tc.expected_code ?? '';
  if (!goldCode) {
    return {
      test_case_id:                      caseId,
      query:                             tc.query,
      gold_code:                         '',
      gold_subheading:                   '',
      retrieval_strategy:                'unknown',
      gold_subheading_surfaced:          false,
      gold_subheading_child_count:       0,
      gold_in_rerank_union:              false,
      gold_in_final_candidates:          false,
      sibling_count_in_final_candidates: 0,
      bucket:                            'A',
      error:                             `no expected_code for case`,
    };
  }

  // Gold subheading = NNNN.NN (first 7 chars of NNNN.NN.NN)
  const goldSubheading = goldCode.substring(0, 7);

  try {
    // ── L0 ──
    const normalized = await normalize(tc.query, {});

    // ── L1 ──
    const triageOut = await triage({
      normalized_query:    normalized.normalized_query,
      previousAnswers:     {},
      q_budget_remaining:  3,
      constraint_hint:     null,
    });

    // If triage returns ASK or REFUSE, no L2 candidate set. Mark as bucket A
    // (gold was never retrieved because we didn't even attempt retrieval).
    if (triageOut.decision !== 'CLASSIFY') {
      return {
        test_case_id:                      caseId,
        query:                             tc.query,
        gold_code:                         goldCode,
        gold_subheading:                   goldSubheading,
        retrieval_strategy:                'triage_no_classify',
        gold_subheading_surfaced:          false,
        gold_subheading_child_count:       0,
        gold_in_rerank_union:              false,
        gold_in_final_candidates:          false,
        sibling_count_in_final_candidates: 0,
        bucket:                            'A',
        error:                             `triage returned ${triageOut.decision} — no retrieval`,
      };
    }

    // ── L2 ──
    const retrievalOut = await retrieve({
      normalized_query:    normalized.normalized_query,
      raw_tokens:          normalized.raw_tokens,
      composite_flag:      normalized.composite_flag,
      candidate_chapters:  triageOut.candidate_chapters,
      head_nouns_for_fts:  triageOut.extracted_attributes.head_nouns_for_fts,
    });

    // ── L3 ──
    const rulesOut = await rulesFilter({
      l2_output:           retrievalOut,
      normalized_query:    normalized.normalized_query,
      raw_tokens:          normalized.raw_tokens,
      head_nouns_for_fts:  triageOut.extracted_attributes.head_nouns_for_fts,
      candidate_chapters:  triageOut.candidate_chapters,
      backtrack_attempted: false,
    });

    // ── Derive measurements ──
    // (1) Was gold subheading surfaced in the cosine cascade?
    const surfacedSubheadings: string[] = retrievalOut.debug_surfaced_subheadings ?? [];
    const goldSubheadingSurfaced = surfacedSubheadings.includes(goldSubheading);

    // (2) Is gold code in the rerank union? (retrieval_scores keys = all codes
    //     that entered the reranker OR were scored via cosine/FTS)
    const rerankUnionKeys = new Set(Object.keys(retrievalOut.retrieval_scores));
    const goldInRerankUnion = rerankUnionKeys.has(goldCode);

    // (3) Is gold code in L3 filtered_candidates?
    const finalCandidates: RetrievalCandidate[] = rulesOut.filtered_candidates;
    const finalCodes = new Set(finalCandidates.map(c => c.code));
    const goldInFinalCandidates = finalCodes.has(goldCode);

    // (4) How many siblings of gold subheading are in final candidates?
    const siblingCount = finalCandidates.filter(
      c => c.parent_chain.subheading === goldSubheading,
    ).length;

    // (5) Gold subheading child count (needed for bucket B test)
    let goldSubheadingChildCount = 0;
    try {
      const counts = await getSubheadingChildCounts([goldSubheading]);
      goldSubheadingChildCount = counts[0]?.child_count ?? 0;
    } catch {
      // Leave at 0 — will conservatively not fire B
    }

    // ── Bucket assignment ──
    let bucket: Bucket;
    if (!goldSubheadingSurfaced) {
      // Gold subheading was not reached in the cosine cascade → NOT-SURFACED
      bucket = 'A';
    } else if (!goldInFinalCandidates && goldSubheadingChildCount >= 2) {
      // Gold subheading was surfaced, is multi-leaf, but gold code not in final → LEAF-FLOOR-ADDRESSABLE
      bucket = 'B';
    } else {
      // Gold code IS in final candidates (or is a singleton subheading so leaf
      // floor can't help) → TRUE-SELECTION
      bucket = 'C';
    }

    return {
      test_case_id:                      caseId,
      query:                             tc.query,
      gold_code:                         goldCode,
      gold_subheading:                   goldSubheading,
      retrieval_strategy:                retrievalOut.retrieval_strategy,
      gold_subheading_surfaced:          goldSubheadingSurfaced,
      gold_subheading_child_count:       goldSubheadingChildCount,
      gold_in_rerank_union:              goldInRerankUnion,
      gold_in_final_candidates:          goldInFinalCandidates,
      sibling_count_in_final_candidates: siblingCount,
      bucket,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      test_case_id:                      caseId,
      query:                             tc.query,
      gold_code:                         goldCode,
      gold_subheading:                   goldSubheading,
      retrieval_strategy:                'error',
      gold_subheading_surfaced:          false,
      gold_subheading_child_count:       0,
      gold_in_rerank_union:              false,
      gold_in_final_candidates:          false,
      sibling_count_in_final_candidates: 0,
      bucket:                            'A',
      error:                             msg,
    };
  }
}

/* ---------------------------------------------------------------------------
 * Aggregate
 * --------------------------------------------------------------------------- */

type SetLabel = 'RETRIEVAL' | 'SELECTION' | 'CONTROL';

const RETRIEVAL_SET = new Set([
  'TC001','TC009','EC017','EC024','DB008','DB058','DB061','DB064','DB067','DB068',
  'DB070','DB071','DB072','DB074','DB075','DB077','DB080','DB102','DB116','DB129',
  'DB161','DB192','S5-AMB-014','S5-AUTO-012','S5-AUTO-024','S5-SIMP-015',
]);

const SELECTION_SET = new Set([
  'TC010','TC102','TC107','TC111','TC112','TC116','TC117','TC119','TC201',
  'EC005','EC007','EC012','EC013','EC015','EC018','EC020','EC034','EC037',
  'EC042','EC044','DB028','DB051','DB056','DB087','DB133','DB134','DB135',
  'DB139','DB140','DB172','DB200','S5-AMB-015','S5-SIMP-014','S5-SIMP-025','S5-SIMP-037',
]);

function setLabel(id: string): SetLabel {
  if (RETRIEVAL_SET.has(id)) return 'RETRIEVAL';
  if (SELECTION_SET.has(id)) return 'SELECTION';
  return 'CONTROL';
}

/* ---------------------------------------------------------------------------
 * Entry point
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const caseIds = parseCLI();
  console.error(`Running forensic on ${caseIds.length} cases...`);

  const rows: ForensicRow[] = [];

  for (const id of caseIds) {
    process.stderr.write(`  ${id}...`);
    const row = await runCase(id);
    rows.push(row);
    process.stderr.write(` bucket=${row.bucket}${row.error ? ` ERROR:${row.error.substring(0,60)}` : ''}\n`);
    // Emit JSONL per-case
    console.log(JSON.stringify({ ...row, _set: setLabel(id) }));
  }

  // ── Per-set aggregate ──
  const aggregate: Record<SetLabel, { A: number; B: number; C: number; error: number; total: number }> = {
    RETRIEVAL: { A: 0, B: 0, C: 0, error: 0, total: 0 },
    SELECTION: { A: 0, B: 0, C: 0, error: 0, total: 0 },
    CONTROL:   { A: 0, B: 0, C: 0, error: 0, total: 0 },
  };

  for (const r of rows) {
    const s = setLabel(r.test_case_id);
    aggregate[s].total++;
    if (r.error && r.bucket === 'A' && r.retrieval_strategy === 'error') {
      aggregate[s].error++;
    } else {
      aggregate[s][r.bucket]++;
    }
  }

  // Control pass-rate: CONTROL cases where gold_in_final_candidates = true
  const controls = rows.filter(r => setLabel(r.test_case_id) === 'CONTROL');
  const controlPass = controls.filter(r => r.gold_in_final_candidates && !r.error).length;
  const controlTotal = controls.filter(r => !r.error).length;

  // Summary
  console.error('\n===== AGGREGATE SUMMARY =====');
  for (const s of ['RETRIEVAL', 'SELECTION', 'CONTROL'] as SetLabel[]) {
    const ag = aggregate[s];
    console.error(
      `${s.padEnd(10)} total=${ag.total}  A=${ag.A}  B=${ag.B}  C=${ag.C}  errors=${ag.error}`,
    );
  }
  const allNonControl = rows.filter(r => setLabel(r.test_case_id) !== 'CONTROL');
  const totalA = allNonControl.filter(r => r.bucket === 'A').length;
  const totalB = allNonControl.filter(r => r.bucket === 'B').length;
  const totalC = allNonControl.filter(r => r.bucket === 'C').length;
  console.error(`COMBINED(R+S)  total=${allNonControl.length}  A=${totalA}  B=${totalB}  C=${totalC}`);
  console.error(`\nControl pass-rate (gold_in_final): ${controlPass}/${controlTotal} = ${controlTotal>0?(controlPass/controlTotal*100).toFixed(1):'n/a'}%`);
  console.error('=============================\n');

  // Also print a table to stderr
  console.error('test_case_id       | gold_code       | strategy              | sh_surf | child | in_union | in_final | sibling_cnt | bucket | set');
  console.error('-'.repeat(145));
  for (const r of rows) {
    const s = setLabel(r.test_case_id);
    if (r.error && r.retrieval_strategy === 'error') {
      console.error(`${r.test_case_id.padEnd(18)} | ${r.gold_code.padEnd(15)} | ERROR: ${r.error.substring(0,45)}`);
    } else {
      console.error(
        `${r.test_case_id.padEnd(18)} | ${r.gold_code.padEnd(15)} | ${r.retrieval_strategy.padEnd(21)} | ${String(r.gold_subheading_surfaced).padEnd(7)} | ${String(r.gold_subheading_child_count).padEnd(5)} | ${String(r.gold_in_rerank_union).padEnd(8)} | ${String(r.gold_in_final_candidates).padEnd(8)} | ${String(r.sibling_count_in_final_candidates).padEnd(11)} | ${r.bucket}      | ${s}`,
      );
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
