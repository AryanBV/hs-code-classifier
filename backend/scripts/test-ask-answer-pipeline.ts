/**
 * End-to-end pipeline test: ask -> answer -> final code.
 *
 * Tests TWO things for each ASK case, separately, so we can tell a broken
 * pipeline from a simulator-derivation gap:
 *
 *   (A) EVAL auto-answer (runAnswerSimulation): does the eval derive the gold
 *       answer from tariff_line_attributes and reach the gold code? This is what
 *       --simulate-answers does. If this fails, the EVAL can't auto-test the ask.
 *
 *   (B) MANUAL/live answer (continueWithAnswers with the option a real user would
 *       pick): given the RIGHT answer, does the pipeline reach the gold code? This
 *       is what a real user triggers on the live site.
 *
 * Run from backend/ with the asker on:
 *   DIVERGENCE_ASK_ENABLED=true npx tsx scripts/test-ask-answer-pipeline.ts
 */
import 'dotenv/config';
import { classify, continueWithAnswers } from '../src/classifier-v2';
import { runAnswerSimulation } from '../src/eval/answer-simulator';
import type { ClassifyResult, ClarifyingQuestion } from '../src/classifier-v2/types';

interface Case {
  query: string;
  gold: string;
  /** substring (lowercase) identifying the option a real user matching gold would pick */
  hint: string;
}

const CASES: Case[] = [
  { query: 'frozen chicken', gold: '0207.12.00', hint: 'whole' },
  { query: 'fresh chicken', gold: '0207.11.00', hint: 'whole' },
];

function questionsOf(r: ClassifyResult): ClarifyingQuestion[] {
  if (r.questions && r.questions.questions.length > 0) return r.questions.questions;
  if (r.question) return [r.question];
  return [];
}

const norm = (c: string): string => c.replace(/[^0-9]/g, '');

async function main(): Promise<void> {
  for (const c of CASES) {
    console.log('\n==================================================');
    console.log(`QUERY: "${c.query}"   (gold ${c.gold})`);

    const first = await classify(c.query);
    console.log(`  round-1 decision: ${first.decision}`);
    if (first.decision !== 'ASK') {
      console.log(`  -> classified directly to ${first.classification?.code ?? '?'} (NO question). Asker did not fire.`);
      continue;
    }

    const qs = questionsOf(first);
    const q = qs[0]!;
    console.log(`  ASKED  axis=${q.discriminating_attribute}`);
    console.log(`  options: ${q.options.map((o) => `${o.label}[${o.id}]`).join(' | ')}`);

    // (A) EVAL auto-answer path
    try {
      const sim = await runAnswerSimulation(c.query, first, c.gold);
      console.log(`  [A | EVAL auto-answer] final=${sim.final_decision} code=${sim.final_code_if_classify ?? '-'} CORRECT=${sim.code_correct_after_recovery} rounds=${sim.rounds_attempted}`);
      console.log(`        derived: ${JSON.stringify(sim.answer_matches.map((m) => ({ attr: m.discriminating_attribute, gold_val: m.gold_attribute_value, derived: m.derived_answer_id, found: m.answer_found })))}`);
    } catch (e) {
      console.log(`  [A | EVAL auto-answer] THREW: ${(e as Error).message}`);
    }

    // (B) MANUAL/live answer path
    const opt = q.options.find((o) => o.id.toLowerCase().includes(c.hint) || o.label.toLowerCase().includes(c.hint));
    if (!opt) {
      console.log(`  [B | MANUAL] no option matched hint "${c.hint}" — cannot feed a live answer`);
      continue;
    }
    try {
      const cont = await continueWithAnswers(c.query, { [q.question_id]: opt.id });
      const code = cont.classification?.code ?? '-';
      const correct = norm(code) === norm(c.gold);
      console.log(`  [B | MANUAL answer="${opt.label}"] decision=${cont.decision} code=${code} CORRECT=${correct}`);
    } catch (e) {
      console.log(`  [B | MANUAL] THREW: ${(e as Error).message}`);
    }
  }
  console.log('\n== done ==');
}

main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
