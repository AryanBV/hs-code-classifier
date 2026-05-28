/**
 * Single-query TRACE CLI for the v2 HS-code classifier.
 *
 * Usage:
 *   npm run classify:trace -- "your product description"
 *
 * Runs classify() with captureTrace:true, then pretty-prints:
 *   1. Per-event trace (every layer event + payload)
 *   2. Final result (decision + classification/question/refusal)
 *   3. Diagnostics (escalation_path, llm_calls, latency_ms, system_error)
 *
 * This makes REAL Gemini/Cohere/Supabase calls — intended for one-off
 * root-cause debugging of the Phase 4.3 pipeline. The decision may be
 * REFUSE if the current verifier floor is not met; that is fine — the
 * CLI's job is to RUN and print the trace, not guarantee a correct answer.
 */

import { classify } from './index';

/* ---------------------------------------------------------------------------
 * ANSI colour helpers (graceful no-op when stdout is not a TTY)
 * --------------------------------------------------------------------------- */
const isTTY = process.stdout.isTTY;

function bold(s: string): string  { return isTTY ? `\x1b[1m${s}\x1b[0m`  : s; }
function cyan(s: string): string  { return isTTY ? `\x1b[36m${s}\x1b[0m` : s; }
function green(s: string): string { return isTTY ? `\x1b[32m${s}\x1b[0m` : s; }
function yellow(s: string): string{ return isTTY ? `\x1b[33m${s}\x1b[0m` : s; }
function red(s: string): string   { return isTTY ? `\x1b[31m${s}\x1b[0m` : s; }
function dim(s: string): string   { return isTTY ? `\x1b[2m${s}\x1b[0m`  : s; }

function hr(char = '─', width = 72): string {
  return dim(char.repeat(width));
}

/* ---------------------------------------------------------------------------
 * Pretty-print helpers
 * --------------------------------------------------------------------------- */

function printSection(title: string): void {
  console.log('');
  console.log(bold(cyan(title)));
  console.log(hr());
}

function printTrace(trace: import('./types').PipelineTraceEvent[]): void {
  printSection('PIPELINE TRACE');
  if (trace.length === 0) {
    console.log(dim('  (no trace events)'));
    return;
  }
  for (const evt of trace) {
    const header = `  [${String(evt.t_ms).padStart(6)}ms]  ${bold(evt.layer.padEnd(10))}  ${evt.event}`;
    console.log(header);
    if (evt.payload !== undefined && Object.keys(evt.payload).length > 0) {
      const lines = JSON.stringify(evt.payload, null, 2).split('\n');
      for (const line of lines) {
        console.log(dim(`              ${line}`));
      }
    }
  }
}

function printResult(result: import('./index').ClassifyResult): void {
  printSection('FINAL RESULT');

  const decisionColour =
    result.decision === 'CLASSIFY' ? green :
    result.decision === 'ASK'      ? yellow :
    red;

  console.log(`  decision: ${decisionColour(bold(result.decision))}`);

  if (result.decision === 'CLASSIFY' && result.classification) {
    const c = result.classification;
    console.log(`  code:               ${bold(c.code)}`);
    console.log(`  is_six_digit:       ${c.is_six_digit}`);
    console.log(`  export_policy:      ${c.export_policy ?? '(none)'}`);
    console.log(`  policy_condition:   ${c.policy_condition ?? '(none)'}`);
    console.log(`  india_specific:     ${c.india_specific}`);
    console.log(`  self_confidence:    ${c.self_confidence}`);
    console.log(`  escalated_deep:     ${c.escalated_to_deep_think}`);
    console.log(`  reasoning_chain:`);
    for (const r of c.reasoning_chain) {
      console.log(`    • ${r}`);
    }
    console.log(`  citation:`);
    console.log(`    gir_applied:      ${c.citation.gir_applied}`);
    console.log(`    type:             ${c.citation.primary.type}`);
    console.log(`    source_ref:       ${c.citation.primary.source_ref}`);
    console.log(`    verbatim_text:    ${c.citation.primary.verbatim_text}`);
    if (c.alternatives_considered.length > 0) {
      console.log(`  alternatives:       ${c.alternatives_considered.join(', ')}`);
    }
    if (c.components && c.components.length > 0) {
      console.log(`  components:`);
      for (const comp of c.components) {
        console.log(`    • ${comp.name} (${comp.material}, role=${comp.role})`);
      }
    }
  }

  if (result.decision === 'ASK' && result.question) {
    const q = result.question;
    console.log(`  question_id:              ${q.question_id}`);
    console.log(`  discriminating_attribute: ${q.discriminating_attribute}`);
    console.log(`  question_text:            ${q.question_text}`);
    console.log(`  options:`);
    for (const opt of q.options) {
      console.log(`    • ${opt.id}: ${opt.label}`);
    }
  }

  if (result.decision === 'REFUSE' && result.refusal) {
    const r = result.refusal;
    console.log(`  reason:            ${red(r.reason)}`);
    console.log(`  out_of_scope_class:${r.out_of_scope_class ? ` ${r.out_of_scope_class}` : ' (none)'}`);
    if (r.verifier_failures.length > 0) {
      console.log(`  verifier_failures:`);
      for (const f of r.verifier_failures) {
        console.log(`    • [${f.rule_id}] ${f.rule_name}: ${f.failure_detail}`);
        if (f.suggested_fix) {
          console.log(`      fix: ${f.suggested_fix}`);
        }
      }
    }
  }

  if (result.system_error) {
    const e = result.system_error;
    console.log('');
    console.log(`  ${red(bold('SYSTEM ERROR'))}`);
    console.log(`  stage:     ${e.stage}`);
    console.log(`  retryable: ${e.retryable}`);
    console.log(`  message:   ${e.message}`);
  }
}

function printDiagnostics(result: import('./index').ClassifyResult): void {
  printSection('DIAGNOSTICS');
  const d = result.diagnostics;
  console.log(`  escalation_path: ${bold(d.escalation_path.join(' → '))}`);
  console.log(`  llm_calls:       ${d.llm_calls}`);
  console.log(`  latency_ms:      ${d.latency_ms}`);
}

/* ---------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------- */

async function main(): Promise<void> {
  // Parse query from CLI args (everything after `--`)
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(red('Usage: npm run classify:trace -- "your product description"'));
    process.exit(1);
  }
  const query = args.join(' ');

  console.log('');
  console.log(bold(`classify:trace`));
  console.log(hr('═'));
  console.log(`  query: ${bold(query)}`);
  console.log(hr('═'));

  let result: import('./index').ClassifyResult;
  try {
    result = await classify(query, { captureTrace: true });
  } catch (err) {
    console.error(red('\nFATAL: classify() threw an unhandled error:'));
    console.error(err);
    process.exit(1);
  }

  const trace = result.diagnostics.trace ?? [];
  printTrace(trace);
  printResult(result);
  printDiagnostics(result);

  console.log('');
  console.log(hr('═'));
  console.log(dim('Done.'));
  console.log('');
}

main().catch((err) => {
  console.error(red('\nUnhandled error in trace-cli:'), err);
  process.exit(1);
});

// Export ClassifyResult for the import type references above
export type { ClassifyResult } from './index';
