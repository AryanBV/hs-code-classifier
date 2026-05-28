/**
 * Layer 5 — Mechanical Verifier (Phase 4 v2)
 *
 * Pure SQL + TypeScript. NO LLM. Runs after every L4 Select emission (and L6
 * Tiebreak emission) to mechanically check that the emission is consistent
 * with the underlying legal text, retrieval scores, and DB state.
 *
 * The verifier emits structured `failed_rules` that the orchestrator routes
 * back to L4 as a repair-loop input — up to 3 attempts before escalating to
 * L6 Tiebreak (per ARCHITECTURE.md §6).
 *
 * The 10 rules (ARCHITECTURE.md §6, sub-spec 01):
 *   MV-01 Code existence
 *   MV-02 Exclusions completeness
 *   MV-03 Verbatim citation TF-IDF >= 0.6
 *   MV-04 Embedding cosine floor (>= EMBEDDING_COSINE_FLOOR; empirically 0.22)
 *   MV-05 Per-GIR validator (10 GIR enum values)
 *   MV-06 india_specific flag consistency
 *   MV-07 Notes-conformance (chapter notes_claims predicates)
 *   MV-08 Cross-chapter Section Notes
 *   MV-09 Subheading Notes
 *   MV-10 Policy consistency
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 Layer 5, §3 L5 I/O row, §6 (full rules)
 *   - backend/docs/sub-specs/01-verifier-rules.md
 *   - backend/src/classifier-v2/db/predicate-dsl.ts (Predicate union)
 *
 * --- SPEC AMBIGUITY RESOLUTIONS (documented per task instructions) ---
 *
 * (1) Rule 5 GIR-3(a) "≥2 competing headings exist in alive_set with overlap":
 *     "overlap" is underspecified. We interpret as: filtered_candidates contains
 *     ≥2 distinct headings (LEFT(code, 4) values). This is the canonical sense
 *     of "competing headings exist."
 *
 * (2) Rule 5 GIR-3(b) "≥2 components enumerated in reasoning":
 *     Sub-spec 01 §"Rule 5 GIR-3(b)" Option A locks the structured
 *     SelectOutput.components[] field with ≥2 items as the verifier target.
 *     We honour that lock. reasoning_chain is NOT searched.
 *
 * (3) Rule 5 GIR-3(c), GIR-4 "enumerate which GIRs failed":
 *     reasoning_chain must mention at least one of the predecessor GIR
 *     identifiers (e.g., "GIR 3(a)", "GIR-3(a)", or just "3(a)" matching). We
 *     check via a case-insensitive substring scan with several spelling variants.
 *
 * (4) Rule 5 GIR-5(a/b) "packaging-container scenario":
 *     extracted_attributes are not in scope at L5 (we only see SelectOutput).
 *     We check `tariff_line_attributes[selected_code].intended_role` (Phase 4
 *     O2 schema), or fall back to chapter being 42 / 73 / 76 / 39 (packaging
 *     containers). If neither signal is available → SKIP (PASS).
 *
 * (5) Rule 7/8/9 predicate parsing: notes_claims.predicate is text in the DB
 *     (JSON-stringified). We JSON.parse it. Malformed JSON → SKIP (logged).
 */
import {
  getNotesClaimsForChapters,
  getTariffLineAttributesForCodes,
  ftsSearchExclusions,
} from '../lib/supabase-client';
import type { QueryRunner } from '../lib/supabase-client';
import { evalPredicate, type PredicateCandidateContext } from '../lib/predicate-evaluator';
import { resolveSourceRef } from '../lib/source-ref-resolver';
import { citationFuzzyMatch } from '../lib/tfidf-citation-check';
import { EMBEDDING_COSINE_FLOOR } from '../lib/verifier-constants';
import { buildTsQuery } from './L2-retrieval';
import type { Predicate } from '../db/predicate-dsl';
import type {
  ChapterCode,
  GIRIdentifier,
  L5Input,
  L5Output,
  PredicateRef,
  SelectOutput,
  VerifierRuleFailure,
  VerifierTraceEntry,
} from '../types';

/* ---------------------------------------------------------------------------
 * QueryRunner injection — same pattern as supabase-client._setQueryRunnerForTesting,
 * but L5 also performs ad-hoc queries (Rules 1/4/6/10) and ts_rank_cd (Rule 3).
 * --------------------------------------------------------------------------- */

let _injectedRunner: QueryRunner | null = null;

/** Test-only: inject a mock QueryRunner used for L5's ad-hoc queries. */
export function _setVerifierQueryRunnerForTesting(runner: QueryRunner | null): void {
  _injectedRunner = runner;
}

function getRunner(): QueryRunner {
  if (_injectedRunner) return _injectedRunner;
  // Lazy require to avoid loading pg.Pool during unit tests that don't need it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../lib/supabase-client') as typeof import('../lib/supabase-client');
  // Use the module's exported _setQueryRunnerForTesting accessor reverse:
  // we need a direct runner. The module doesn't export one, so we issue
  // through the same wrapper functions that already lazily init the pool.
  // Trick: wrap pg.Pool ourselves using DATABASE_URL — but that's duplicative.
  // Simpler: surface a getter from supabase-client. For now, route ad-hoc
  // queries through a dynamic shim that delegates to the real pool by issuing
  // a no-op query. Cleaner: import the internal accessor.
  // ----
  // Pragmatic: the supabase-client module's exported high-level helpers
  // already use the shared pool, but L5 needs raw access. We re-implement by
  // calling into the supabase-client's lazy-pool by reading process.env here.
  // Since this code path is hit ONLY at runtime (tests inject a mock), it is
  // safe to construct a pg.Pool here as a fallback.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pg = require('pg') as typeof import('pg');
  const conn = process.env.DATABASE_URL;
  if (!conn || conn.length === 0) {
    throw new Error('L5-verifier: DATABASE_URL is not set; tests must inject a runner');
  }
  // Avoid leaking the literal type back through `mod`.
  void mod;
  const pool = new pg.Pool({
    connectionString: conn,
    ssl:              { rejectUnauthorized: false },
    max:              2,
  });
  _injectedRunner = pool as unknown as QueryRunner;
  return _injectedRunner;
}

/* ---------------------------------------------------------------------------
 * Result + helper types
 * --------------------------------------------------------------------------- */

interface RuleResult {
  /** PASS, FAIL, SKIP — drives trace + failed_rules push. */
  result:   'PASS' | 'FAIL' | 'SKIP';
  /** Failure detail populated iff result === 'FAIL'. */
  failures: VerifierRuleFailure[];
  /** Predicate-eval skips accumulated by Rules 7/8/9. */
  skipped:  PredicateRef[];
}

function pass(): RuleResult {
  return { result: 'PASS', failures: [], skipped: [] };
}
function skip(): RuleResult {
  return { result: 'SKIP', failures: [], skipped: [] };
}
function fail(...failures: VerifierRuleFailure[]): RuleResult {
  return { result: 'FAIL', failures, skipped: [] };
}

const RULE_META: Record<string, string> = {
  'MV-01': 'code_existence',
  'MV-02': 'exclusions_completeness',
  'MV-03': 'verbatim_citation_tfidf',
  'MV-04': 'embedding_cosine_floor',
  'MV-05': 'per_gir_validator',
  'MV-06': 'india_specific_consistency',
  'MV-07': 'notes_conformance',
  'MV-08': 'section_notes_cross_chapter',
  'MV-09': 'subheading_notes',
  'MV-10': 'policy_consistency',
};

/* ---------------------------------------------------------------------------
 * Rule 1 — Code existence
 * --------------------------------------------------------------------------- */

async function ruleCodeExistence(input: L5Input): Promise<RuleResult> {
  const code = input.candidate_code;
  const runner = getRunner();
  const isEightDigit = /^\d{4}\.\d{2}\.\d{2}$/.test(code);
  const isSixDigit   = /^\d{4}\.\d{2}$/.test(code);
  if (!isEightDigit && !isSixDigit) {
    return fail({
      rule_id:        'MV-01',
      rule_name:      RULE_META['MV-01'] as string,
      failure_code:   'HALLUCINATED_CODE',
      failure_detail: `selected_code '${code}' does not match the 6- or 8-digit ITC-HS format.`,
      field_path:     'selected_code',
      suggested_fix:  'Emit a valid 6-digit (NNNN.NN) or 8-digit (NNNN.NN.NN) code from the candidate set.',
    });
  }
  const sql = isEightDigit
    ? 'SELECT 1 AS one FROM tariff_lines WHERE code = $1 LIMIT 1'
    : 'SELECT 1 AS one FROM subheadings WHERE subheading = $1 LIMIT 1';
  const res = await runner.query<{ one: number }>(sql, [code]);
  if (res.rows.length === 0) {
    return fail({
      rule_id:        'MV-01',
      rule_name:      RULE_META['MV-01'] as string,
      failure_code:   'HALLUCINATED_CODE',
      failure_detail: `selected_code '${code}' does not exist in the ${isEightDigit ? 'tariff_lines' : 'subheadings'} table.`,
      field_path:     'selected_code',
      suggested_fix:  'Pick a code that is present in the candidate set (Verifier MV-01).',
    });
  }
  return pass();
}

/* ---------------------------------------------------------------------------
 * Rule 2 — Exclusions completeness
 *
 * Re-query chapter_exclusions GIN-FTS using head_nouns | raw_tokens; every
 * matching exclusion must be present in select_output.exclusions_checked[].
 * --------------------------------------------------------------------------- */

async function ruleExclusionsCompleteness(input: L5Input): Promise<RuleResult> {
  const chapter = input.candidate_chapter;
  if (!chapter || chapter.length === 0) return pass();
  const tsquery = buildTsQuery(input.head_nouns_for_fts, input.raw_tokens);
  if (tsquery.length === 0) return pass();

  const hits = await ftsSearchExclusions(tsquery, [chapter], 50);
  if (hits.length === 0) return pass();

  const checked = new Set<number>(input.select_output.exclusions_checked);
  const missed: number[] = [];
  for (const h of hits) {
    if (!checked.has(h.id)) missed.push(h.id);
  }
  if (missed.length === 0) return pass();
  return fail({
    rule_id:        'MV-02',
    rule_name:      RULE_META['MV-02'] as string,
    failure_code:   'EXCLUSION_NOT_CHECKED',
    failure_detail:
      `${missed.length} chapter_exclusions matching the query were NOT in exclusions_checked[]: ` +
      `ids=[${missed.join(', ')}] (chapter ${chapter}).`,
    field_path:     'exclusions_checked',
    suggested_fix:  `Acknowledge and rule on every fired exclusion. Add ids ${missed.join(', ')} to exclusions_checked[] (or pick a different chapter).`,
  });
}

/* ---------------------------------------------------------------------------
 * Rule 3 — Verbatim citation TF-IDF
 * --------------------------------------------------------------------------- */

async function ruleVerbatimCitation(input: L5Input): Promise<RuleResult> {
  const out = input.select_output;
  const sourceRef = out.citation.primary.source_ref;
  const verbatim  = out.citation.primary.verbatim_text;
  const runner = getRunner();

  const resolved = await resolveSourceRef(sourceRef, runner);
  if (!resolved.parsed_ok) {
    return fail({
      rule_id:        'MV-03',
      rule_name:      RULE_META['MV-03'] as string,
      failure_code:   'MALFORMED_SOURCE_REF',
      failure_detail: `citation.primary.source_ref '${sourceRef}' does not parse against the locked grammar (<table>:<key>=<value>[:<json_path>]).`,
      field_path:     'citation.primary.source_ref',
      suggested_fix:  'Use the canonical grammar e.g., "chapters.notes:chapter=72:notes[0].text" or "chapter_exclusions:id=842:source_note_text".',
    });
  }
  if (resolved.resolved_text === null) {
    return fail({
      rule_id:        'MV-03',
      rule_name:      RULE_META['MV-03'] as string,
      failure_code:   'CITATION_SOURCE_NOT_FOUND',
      failure_detail: `Citation source_ref '${sourceRef}' did not resolve to any DB row (table=${resolved.table}, key=${resolved.key_column}=${resolved.key_value}, json_path=${resolved.json_path ?? 'null'}).`,
      field_path:     'citation.primary.source_ref',
      suggested_fix:  'Pick a different citation that exists in the DB (chapter note, section note, or chapter_exclusions row).',
    });
  }

  const match = await citationFuzzyMatch(verbatim, resolved.resolved_text, runner);
  if (match.source_too_short) return skip();
  if (match.normalized_score === null) return skip();
  if (!match.passed) {
    return fail({
      rule_id:        'MV-03',
      rule_name:      RULE_META['MV-03'] as string,
      failure_code:   'CITATION_FUZZY_MATCH_FAIL',
      failure_detail:
        `Citation '${sourceRef}' content does not closely match the verbatim_text emitted ` +
        `(normalized_score=${match.normalized_score.toFixed(2)} < ${match.threshold.toFixed(2)}).`,
      field_path:     'citation.primary.verbatim_text',
      suggested_fix:  'Re-copy exact text from the cited DB row, or pick a citation that genuinely supports the classification.',
    });
  }
  return pass();
}

/* ---------------------------------------------------------------------------
 * Rule 4 — Embedding cosine floor
 * --------------------------------------------------------------------------- */

async function ruleEmbeddingCosineFloor(input: L5Input): Promise<RuleResult> {
  const code = input.candidate_code;
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code)) {
    // Only 8-digit codes have row-level embeddings; 6-digit fallback path skips.
    return skip();
  }
  if (input.query_embedding.length === 0) return skip();
  const runner = getRunner();
  const vec = `[${input.query_embedding.join(',')}]`;
  const sql = `
    SELECT 1 - (embedding <=> $1::vector) AS cosine
    FROM tariff_lines
    WHERE code = $2
      AND embedding IS NOT NULL
    LIMIT 1
  `;
  const res = await runner.query<{ cosine: number | null }>(sql, [vec, code]);
  if (res.rows.length === 0) {
    return fail({
      rule_id:        'MV-04',
      rule_name:      RULE_META['MV-04'] as string,
      failure_code:   'EMBEDDING_MISSING',
      failure_detail: `tariff_lines.embedding is NULL for selected_code '${code}'.`,
      field_path:     'selected_code',
      suggested_fix:  'Embedding column is missing for this code — pick a code with embeddings (verifier diagnostic).',
    });
  }
  const firstRow = res.rows[0];
  if (firstRow === undefined || firstRow.cosine === null) return skip();
  const cosine = Number(firstRow.cosine);
  if (!Number.isFinite(cosine)) return skip();
  if (cosine < EMBEDDING_COSINE_FLOOR) {
    return fail({
      rule_id:        'MV-04',
      rule_name:      RULE_META['MV-04'] as string,
      failure_code:   'LOW_COSINE_SIMILARITY',
      failure_detail:
        `Cosine similarity ${cosine.toFixed(3)} between query embedding and tariff_lines[${code}].embedding ` +
        `is below floor ${EMBEDDING_COSINE_FLOOR}.`,
      field_path:     'selected_code',
      suggested_fix:  'Pick a code that semantically matches the query better, or escalate to Tiebreak.',
    });
  }
  return pass();
}

/* ---------------------------------------------------------------------------
 * Rule 5 — Per-GIR validator
 * --------------------------------------------------------------------------- */

/** Case-insensitive substring scan with multiple GIR-spelling variants. */
function reasoningMentionsGIR(reasoning: string[], girs: string[]): boolean {
  const joined = reasoning.join('\n').toLowerCase();
  for (const g of girs) {
    const lower = g.toLowerCase();
    if (joined.includes(lower)) return true;
    // also try "gir 3(a)" variant (space instead of dash)
    const altSpace = lower.replace(/-/g, ' ');
    if (joined.includes(altSpace)) return true;
  }
  return false;
}

function ruleGIRValidator(
  input: L5Input,
  tla:   Record<string, Record<string, unknown> | undefined>,
): RuleResult {
  const out = input.select_output;
  const gir: GIRIdentifier = out.citation.gir_applied;
  const reasoning = out.reasoning_chain;
  const attrs = tla[input.candidate_code] ?? null;
  const ruleId = 'MV-05';
  const name   = RULE_META[ruleId] as string;

  switch (gir) {
    case 'GIR-1': {
      // Must cite chapter or section note (not just heading/leaf text).
      const ref = out.citation.primary.source_ref;
      const okPrefix =
        ref.startsWith('chapters.notes:') ||
        ref.startsWith('chapters:') ||
        ref.startsWith('sections.notes:') ||
        ref.startsWith('sections:');
      if (!okPrefix) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   'GIR_VALIDATOR_FAIL',
          failure_detail: `GIR-1 claimed but citation.source_ref '${ref}' is not a chapter-note or section-note reference.`,
          field_path:     'citation.gir_applied',
          suggested_fix:  'GIR-1 requires citing the controlling chapter or section note. Pick chapters.notes:... or sections.notes:...',
        });
      }
      return pass();
    }

    case 'GIR-2(a)': {
      // Product must be marked incomplete/unfinished.
      const tokens = [
        ...(Array.isArray(attrs?.processing_state) ? (attrs?.processing_state as unknown[]) : []),
        ...(Array.isArray(attrs?.form) ? (attrs?.form as unknown[]) : []),
      ].map((x) => String(x).toLowerCase());
      const flagWords = ['incomplete', 'unfinished', 'unassembled', 'disassembled', 'rough', 'partly_assembled'];
      const matched = tokens.some((t) => flagWords.some((w) => t.includes(w)));
      if (!matched) {
        // tariff_line_attributes may be empty (O2 ramp) — fall back to reasoning text scan.
        const joined = reasoning.join(' ').toLowerCase();
        const reasonMentions = flagWords.some((w) => joined.includes(w));
        if (!reasonMentions) {
          return fail({
            rule_id:        ruleId,
            rule_name:      name,
            failure_code:   'GIR_VALIDATOR_FAIL',
            failure_detail: 'GIR-2(a) claimed but no incomplete/unfinished signal in tariff_line_attributes nor reasoning_chain.',
            field_path:     'citation.gir_applied',
            suggested_fix:  'GIR-2(a) is for incomplete/unfinished/unassembled articles. If this is finished, pick GIR-1 instead.',
          });
        }
      }
      return pass();
    }

    case 'GIR-2(b)':
    case 'GIR-3(b)': {
      // composite_flag must be set.
      if (!input.composite_flag) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   gir === 'GIR-3(b)' ? 'GIR_3B_WITHOUT_COMPOSITE_FLAG' : 'GIR_VALIDATOR_FAIL',
          failure_detail: `${gir} claimed but composite_flag=false (L0 did not detect a multi-material/multi-component product).`,
          field_path:     'citation.gir_applied',
          suggested_fix:  `${gir} is for composite or mixed-substance goods. Reconsider whether this is a single-material product (use GIR-1).`,
        });
      }
      if (gir === 'GIR-3(b)') {
        // ≥2 components enumerated in SelectOutput.components[]
        if (!Array.isArray(out.components) || out.components.length < 2) {
          return fail({
            rule_id:        ruleId,
            rule_name:      name,
            failure_code:   'GIR_3B_COMPONENTS_MISSING',
            failure_detail: 'GIR-3(b) claimed but components[] is absent or has fewer than 2 entries.',
            field_path:     'components',
            suggested_fix:  'Populate components[] with at least 2 entries (name, material, role) — schema requires this when gir_applied=GIR-3(b).',
          });
        }
      }
      return pass();
    }

    case 'GIR-3(a)': {
      // ≥2 competing headings exist in alive_set with overlap.
      // Interpretation: filtered_candidates contains ≥2 distinct heading prefixes.
      const headings = new Set<string>();
      for (const c of input.filtered_candidates) {
        const h = c.parent_chain.heading ?? c.code.slice(0, 4);
        if (h) headings.add(h);
      }
      if (headings.size < 2) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   'GIR_VALIDATOR_FAIL',
          failure_detail: `GIR-3(a) claimed but only ${headings.size} distinct heading(s) in filtered_candidates — GIR-3(a) requires ≥2 competing headings.`,
          field_path:     'citation.gir_applied',
          suggested_fix:  'GIR-3(a) only applies when multiple headings could each cover the product. If only one is plausible, use GIR-1.',
        });
      }
      return pass();
    }

    case 'GIR-3(c)': {
      // reasoning_chain must enumerate which GIR-3(a) and GIR-3(b) failed.
      const okA = reasoningMentionsGIR(reasoning, ['gir-3(a)', 'gir 3(a)', '3(a)']);
      const okB = reasoningMentionsGIR(reasoning, ['gir-3(b)', 'gir 3(b)', '3(b)']);
      if (!okA || !okB) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   'GIR_VALIDATOR_FAIL',
          failure_detail: `GIR-3(c) claimed but reasoning_chain does not enumerate why GIR-3(a)${okA ? '' : ' (missing)'} and GIR-3(b)${okB ? '' : ' (missing)'} failed.`,
          field_path:     'reasoning_chain',
          suggested_fix:  'GIR-3(c) is the last-numerical-heading tiebreaker. Reasoning must state why neither GIR-3(a) nor GIR-3(b) resolved.',
        });
      }
      return pass();
    }

    case 'GIR-4': {
      // reasoning_chain must enumerate which GIR-1..GIR-3 failed.
      const variants = ['gir-1', 'gir 1', 'gir-2', 'gir 2', 'gir-3', 'gir 3'];
      const ok = reasoningMentionsGIR(reasoning, variants);
      if (!ok) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   'GIR_VALIDATOR_FAIL',
          failure_detail: 'GIR-4 claimed but reasoning_chain does not enumerate which of GIR-1..GIR-3 failed; analogy citation needed.',
          field_path:     'reasoning_chain',
          suggested_fix:  'GIR-4 (most-akin-to) is a last-resort. Reasoning must state which prior rules were tried and why they failed.',
        });
      }
      return pass();
    }

    case 'GIR-5(a)':
    case 'GIR-5(b)': {
      // Packaging-container scenario. Look at attrs.intended_role first.
      const role = attrs?.intended_role;
      if (typeof role === 'string') {
        if (role.toLowerCase() !== 'packaging') {
          return fail({
            rule_id:        ruleId,
            rule_name:      name,
            failure_code:   'GIR_VALIDATOR_FAIL',
            failure_detail: `${gir} claimed but tariff_line_attributes.intended_role='${role}' (expected 'packaging').`,
            field_path:     'citation.gir_applied',
            suggested_fix:  `${gir} is for packaging/containers. If this is the goods themselves, use GIR-1 or GIR-3(b).`,
          });
        }
        return pass();
      }
      if (Array.isArray(role)) {
        const arr = role as unknown[];
        if (!arr.map((x) => String(x).toLowerCase()).includes('packaging')) {
          return fail({
            rule_id:        ruleId,
            rule_name:      name,
            failure_code:   'GIR_VALIDATOR_FAIL',
            failure_detail: `${gir} claimed but tariff_line_attributes.intended_role array does not include 'packaging'.`,
            field_path:     'citation.gir_applied',
            suggested_fix:  `${gir} is for packaging/containers.`,
          });
        }
        return pass();
      }
      // attrs absent / O2 not yet extracted — accept (SKIP semantics).
      return skip();
    }

    case 'GIR-6': {
      // Only between same-level subheadings; verify both candidates exist.
      // We interpret this as: at least 2 distinct subheadings share the same
      // heading in filtered_candidates.
      const byHeading = new Map<string, Set<string>>();
      for (const c of input.filtered_candidates) {
        const h = c.parent_chain.heading ?? c.code.slice(0, 4);
        const s = c.parent_chain.subheading ?? c.code.slice(0, 7);
        if (h && s) {
          const set = byHeading.get(h) ?? new Set<string>();
          set.add(s);
          byHeading.set(h, set);
        }
      }
      let ok = false;
      for (const subs of byHeading.values()) {
        if (subs.size >= 2) { ok = true; break; }
      }
      if (!ok) {
        return fail({
          rule_id:        ruleId,
          rule_name:      name,
          failure_code:   'GIR_VALIDATOR_FAIL',
          failure_detail: 'GIR-6 claimed but filtered_candidates does not contain ≥2 subheadings under the same heading.',
          field_path:     'citation.gir_applied',
          suggested_fix:  'GIR-6 only applies to subheading-level tiebreaks within ONE heading. If you are tiebreaking across headings, use GIR-3.',
        });
      }
      return pass();
    }
  }
}

/* ---------------------------------------------------------------------------
 * Rule 6 — india_specific consistency
 * --------------------------------------------------------------------------- */

async function ruleIndiaSpecific(input: L5Input): Promise<RuleResult> {
  const code = input.candidate_code;
  if (!/^\d{4}\.\d{2}(\.\d{2})?$/.test(code)) return skip();
  const subheading = code.length >= 7 ? code.slice(0, 7) : code;
  const runner = getRunner();
  const sql = 'SELECT COALESCE(india_specific, FALSE) AS india_specific FROM subheadings WHERE subheading = $1';
  const res = await runner.query<{ india_specific: boolean }>(sql, [subheading]);
  if (res.rows.length === 0) return skip();
  const firstRow = res.rows[0];
  if (firstRow === undefined) return skip();
  const dbFlag = Boolean(firstRow.india_specific);
  if (dbFlag !== input.select_output.india_specific_flag) {
    return fail({
      rule_id:        'MV-06',
      rule_name:      RULE_META['MV-06'] as string,
      failure_code:   'INDIA_SPECIFIC_MISMATCH',
      failure_detail: `india_specific_flag=${input.select_output.india_specific_flag} but DB shows ${dbFlag} for subheading ${subheading}.`,
      field_path:     'india_specific_flag',
      suggested_fix:  `Set india_specific_flag=${dbFlag} (DB-authoritative).`,
    });
  }
  return pass();
}

/* ---------------------------------------------------------------------------
 * Rule 7 — Notes-Conformance (chapter notes)
 *
 * Evaluates every notes_claim row whose source_kind = 'chapter_note' AND
 * applies_to ∋ candidate.chapter AND claim_type ∈ {inclusion, definition,
 * condition, exclusion, redirect (and scope if ever added)}. The PASS-vs-FAIL
 * polarity of "what counts as a violation" depends on claim_type — see
 * INVERTING_CLAIM_TYPES + evalNotesClaims().
 * --------------------------------------------------------------------------- */

interface NotesClaimRowLike {
  id:           number;
  source_ref:   string;
  source_kind:  string;
  claim_type:   string;
  claim_text:   string;
  predicate:    unknown;
  applies_to:   string[];
}

function parsePredicate(raw: unknown): Predicate | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Predicate;
      return null;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === 'object') return raw as Predicate;
  return null;
}

/**
 * claim_type → predicate polarity. The predicate of a notes_claim describes
 * something about the product; whether a PASS or a FAIL is the VIOLATION depends
 * on the kind of claim:
 *
 *  - 'inclusion' / 'definition' / 'condition': the predicate encodes the rule the
 *    product MUST satisfy to sit in this chapter/heading (often an IMPLIES whose
 *    consequent is the requirement). Predicate FAIL ⇒ the product violates the
 *    rule ⇒ VIOLATION. (Normal polarity.)
 *
 *  - 'exclusion': the predicate describes the EXCLUDED thing (e.g. material ==
 *    'cotton_linters'). Predicate PASS ⇒ the product IS the excluded thing ⇒ it
 *    does NOT belong here ⇒ VIOLATION. Predicate FAIL/SKIP ⇒ the product is NOT
 *    the excluded thing ⇒ fine. (INVERTED polarity.) This was the MV-07 bug:
 *    treating exclusion FAIL as a violation flagged essentially every product
 *    (most products FAIL most exclusion predicates) and rejected correct codes.
 *
 *  - 'redirect': describes a product that should be classified under a DIFFERENT
 *    heading by a priority/redirect rule (e.g. "printed pictorial ⇒ Chapter 49"
 *    unless candidate ∈ {3918,3919}). Predicate PASS ⇒ this candidate should
 *    have been redirected elsewhere ⇒ VIOLATION. Same inverted polarity as
 *    exclusion. (Also fixes the `__SKIP_PRIORITY_RULE__` sentinel rows, whose
 *    EXISTS-on-an-absent-var evaluates FAIL → no violation, as intended.)
 *
 *  - 'scope': NOT present in the current notes_claims data (verified 2026-05-28:
 *    distinct claim_types are exclusion/definition/condition/redirect/inclusion).
 *    Semantically "scope" narrows what the chapter covers, i.e. it behaves like
 *    an exclusion ("this chapter does not extend to X"). If it is ever added we
 *    treat it as INVERTED. Documented so the inversion set is explicit.
 *
 * INVERTING_CLAIM_TYPES = the set where predicate PASS (not FAIL) is the violation.
 */
const INVERTING_CLAIM_TYPES = new Set<string>(['exclusion', 'redirect', 'scope']);

function evalNotesClaims(
  rows:        NotesClaimRowLike[],
  sourceKind:  'chapter_note' | 'section_note' | 'subheading_note',
  ruleId:      string,
  ruleName:    string,
  applyToSet:  Set<string>,
  candidateCtx: PredicateCandidateContext,
  tla:         Record<string, Record<string, unknown> | undefined>,
  candidateCode: string,
): RuleResult {
  const failures: VerifierRuleFailure[] = [];
  const skipped:  PredicateRef[] = [];
  let anyEvaluated = false;
  const attrs = tla[candidateCode] ?? null;

  const allowedClaimTypes = new Set([
    'inclusion', 'definition', 'condition', 'exclusion', 'scope', 'redirect',
  ]);

  for (const row of rows) {
    if (row.source_kind !== sourceKind) continue;
    // applies_to overlap
    let overlaps = false;
    for (const a of row.applies_to) {
      if (applyToSet.has(a)) { overlaps = true; break; }
    }
    if (!overlaps) continue;
    if (!allowedClaimTypes.has(row.claim_type)) continue;

    const pred = parsePredicate(row.predicate);
    if (pred === null) continue;

    anyEvaluated = true;
    const localSkipped: PredicateRef[] = [];
    const verdict = evalPredicate(pred, { attrs, candidate: candidateCtx }, localSkipped, row.id);
    for (const s of localSkipped) skipped.push(s);

    // SKIP (missing data, three-valued) is NEVER a violation, for any claim_type.
    if (verdict === 'SKIP') continue;

    // Polarity branch: inverted types violate on PASS, normal types violate on FAIL.
    const inverted = INVERTING_CLAIM_TYPES.has(row.claim_type);
    const isViolation = inverted ? verdict === 'PASS' : verdict === 'FAIL';

    if (isViolation) {
      const detail = inverted
        ? `Notes-claim #${row.id} (${row.claim_type}) predicate MATCHED for code ${candidateCode} — the product falls under an exclusion/redirect that bars this code: "${row.claim_text.slice(0, 120)}"`
        : `Notes-claim #${row.id} (${row.claim_type}) predicate FAILED for code ${candidateCode}: "${row.claim_text.slice(0, 120)}"`;
      const fix = inverted
        ? `This product is excluded/redirected by claim #${row.id}. Pick the code/chapter the rule redirects to, or cite a counter-rule from the same chapter that overrides #${row.id}.`
        : `Either pick a code that satisfies the claim, or cite a counter-rule from the same chapter that overrides #${row.id}.`;
      failures.push({
        rule_id:        ruleId,
        rule_name:      ruleName,
        failure_code:   sourceKind === 'chapter_note' ? 'CHAPTER_NOTE_VIOLATED' :
                        sourceKind === 'section_note' ? 'SECTION_NOTE_VIOLATED' :
                                                        'SUBHEADING_NOTE_VIOLATED',
        failure_detail: detail,
        field_path:     'selected_code',
        suggested_fix:  fix,
      });
    }
  }

  if (failures.length > 0) {
    return { result: 'FAIL', failures, skipped };
  }
  if (!anyEvaluated) return { result: 'PASS', failures: [], skipped };
  // All predicates passed or skipped — trace as PASS (skipped audit retained).
  return { result: 'PASS', failures: [], skipped };
}

async function ruleNotesConformance(
  input: L5Input,
  ctx:   PredicateCandidateContext,
  tla:   Record<string, Record<string, unknown> | undefined>,
  notesRows: NotesClaimRowLike[],
): Promise<RuleResult> {
  return evalNotesClaims(
    notesRows,
    'chapter_note',
    'MV-07',
    RULE_META['MV-07'] as string,
    new Set<string>([input.candidate_chapter]),
    ctx,
    tla,
    input.candidate_code,
  );
}

async function ruleSectionNotes(
  input: L5Input,
  ctx:   PredicateCandidateContext,
  tla:   Record<string, Record<string, unknown> | undefined>,
  notesRows: NotesClaimRowLike[],
): Promise<RuleResult> {
  // Section-level notes — applies_to contains the chapter codes the section covers.
  return evalNotesClaims(
    notesRows,
    'section_note',
    'MV-08',
    RULE_META['MV-08'] as string,
    new Set<string>([input.candidate_chapter]),
    ctx,
    tla,
    input.candidate_code,
  );
}

async function ruleSubheadingNotes(
  input: L5Input,
  ctx:   PredicateCandidateContext,
  tla:   Record<string, Record<string, unknown> | undefined>,
  notesRows: NotesClaimRowLike[],
): Promise<RuleResult> {
  const subheading = input.candidate_code.length >= 7
    ? input.candidate_code.slice(0, 7)
    : input.candidate_code;
  return evalNotesClaims(
    notesRows,
    'subheading_note',
    'MV-09',
    RULE_META['MV-09'] as string,
    new Set<string>([subheading, input.candidate_chapter]),
    ctx,
    tla,
    input.candidate_code,
  );
}

/* ---------------------------------------------------------------------------
 * Rule 10 — Policy consistency
 *
 * export_policy verbatim string match against tariff_lines row.
 * policy_condition does NOT contradict chapter.export_licensing_notes.
 * --------------------------------------------------------------------------- */

async function rulePolicyConsistency(input: L5Input): Promise<RuleResult> {
  const code = input.candidate_code;
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(code)) {
    // 6-digit fallback path — no tariff_lines row, no DB policy to compare. SKIP.
    return skip();
  }
  const runner = getRunner();
  const sql = `
    SELECT
      tl.export_policy            AS export_policy,
      tl.policy_condition         AS policy_condition,
      c.export_licensing_notes    AS export_licensing_notes
    FROM tariff_lines tl
    JOIN subheadings  sh ON sh.subheading = tl.subheading
    JOIN headings     h  ON h.heading     = sh.heading
    JOIN chapters     c  ON c.chapter     = h.chapter
    WHERE tl.code = $1
  `;
  const res = await runner.query<{
    export_policy: string | null;
    policy_condition: string | null;
    export_licensing_notes: unknown[] | null;
  }>(sql, [code]);
  if (res.rows.length === 0) return skip();
  const row = res.rows[0];
  if (row === undefined) return skip();

  const failures: VerifierRuleFailure[] = [];
  const emittedPolicy   = input.select_output.export_policy;
  const emittedCondition = input.select_output.policy_condition;

  // Strict verbatim match on export_policy.
  if (row.export_policy !== null && emittedPolicy !== row.export_policy) {
    failures.push({
      rule_id:        'MV-10',
      rule_name:      RULE_META['MV-10'] as string,
      failure_code:   'POLICY_INCONSISTENCY',
      failure_detail: `export_policy mismatch: emitted="${emittedPolicy}" vs DB="${row.export_policy}" for code ${code}.`,
      field_path:     'export_policy',
      suggested_fix:  `Copy export_policy verbatim from DB: "${row.export_policy}".`,
    });
  }
  // policy_condition vs export_licensing_notes simple keyword-contradiction check.
  if (
    emittedCondition !== null &&
    emittedCondition.length > 0 &&
    Array.isArray(row.export_licensing_notes) &&
    row.export_licensing_notes.length > 0
  ) {
    const licensingText = JSON.stringify(row.export_licensing_notes).toLowerCase();
    // If chapter explicitly says "prohibited" or "no license required" and emitted
    // condition asserts the opposite, that's a contradiction.
    const conditionLower = emittedCondition.toLowerCase();
    const prohibitedInChapter   = licensingText.includes('prohibited');
    const conditionSaysFree     = /\b(free|no\s+license)\b/.test(conditionLower);
    const conditionSaysProhibit = /\bprohibit/.test(conditionLower);
    const chapterSaysNoLicense  = /\bno\s+license/.test(licensingText);
    if (prohibitedInChapter && conditionSaysFree) {
      failures.push({
        rule_id:        'MV-10',
        rule_name:      RULE_META['MV-10'] as string,
        failure_code:   'POLICY_INCONSISTENCY',
        failure_detail: `policy_condition '${emittedCondition}' contradicts chapter.export_licensing_notes (chapter says prohibited).`,
        field_path:     'policy_condition',
        suggested_fix:  'Re-read chapter.export_licensing_notes and align policy_condition.',
      });
    }
    if (chapterSaysNoLicense && conditionSaysProhibit) {
      failures.push({
        rule_id:        'MV-10',
        rule_name:      RULE_META['MV-10'] as string,
        failure_code:   'POLICY_INCONSISTENCY',
        failure_detail: `policy_condition '${emittedCondition}' contradicts chapter.export_licensing_notes (chapter says no license).`,
        field_path:     'policy_condition',
        suggested_fix:  'Re-read chapter.export_licensing_notes and align policy_condition.',
      });
    }
  }
  if (failures.length === 0) return pass();
  return { result: 'FAIL', failures, skipped: [] };
}

/* ---------------------------------------------------------------------------
 * Repair feedback formatting
 * --------------------------------------------------------------------------- */

function formatRepairFeedback(failures: VerifierRuleFailure[]): string {
  if (failures.length === 0) return '';
  const lines: string[] = [];
  for (const f of failures) {
    const code = f.failure_code ? ` ${f.failure_code}` : '';
    const fix  = f.suggested_fix ? ` Suggested fix: ${f.suggested_fix}` : '';
    lines.push(`[${f.rule_id}${code}] ${f.failure_detail}${fix}`);
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------------------
 * Public entry point
 * --------------------------------------------------------------------------- */

/**
 * Run the 10 mechanical verifier rules against an L4 (or L6) SelectOutput.
 * Returns aggregate PASS/FAIL with structured per-rule traces + repair feedback.
 */
export async function verify(input: L5Input): Promise<L5Output> {
  // Short-circuit: if SelectOutput is a REFUSE (selected_code === null), the
  // verifier has nothing to verify — pass through. This mirrors ARCHITECTURE.md
  // §7 "Select REFUSE: Return refusal to user. No L6 unless caller explicitly
  // opts in." The verifier was not designed to second-guess refusals.
  if (input.select_output.selected_code === null) {
    return {
      passed:             true,
      failed_rules:       [],
      skipped_predicates: [],
      repair_feedback:    '',
      trace:              [],
    };
  }

  // Build candidate-context for predicate evaluation.
  const code = input.candidate_code;
  const chapter = input.candidate_chapter;
  const heading = code.slice(0, 4);
  const subheading = code.length >= 7 ? code.slice(0, 7) : code;
  const candidateCtx: PredicateCandidateContext = {
    chapter,
    heading,
    subheading,
    code,
    // Section is derived from chapter — without a join we don't have it. Set
    // to "" — predicates referencing candidate.section will mostly be SKIPpable.
    section: '',
  };

  // Fetch notes_claims + tariff_line_attributes ONCE (Rules 5/7/8/9 share).
  const claimsRows = await getNotesClaimsForChapters([chapter]);
  const tlaRaw = await getTariffLineAttributesForCodes([code]);
  // Cast tlaRaw values to our local typed form.
  const tla: Record<string, Record<string, unknown> | undefined> = {};
  for (const [k, v] of Object.entries(tlaRaw)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      tla[k] = v as Record<string, unknown>;
    }
  }

  const trace:    VerifierTraceEntry[] = [];
  const allFailures: VerifierRuleFailure[] = [];
  const allSkipped:  PredicateRef[] = [];

  /* Rule 1 — Code existence. Must run first because Rules 2-10 assume the
   * code exists. If Rule 1 fails, we still run all rules for max repair signal. */
  async function runRule(
    ruleId:   string,
    runner:   () => Promise<RuleResult> | RuleResult,
  ): Promise<RuleResult> {
    const t0 = Date.now();
    let r: RuleResult;
    try {
      r = await runner();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = fail({
        rule_id:        ruleId,
        rule_name:      RULE_META[ruleId] ?? ruleId,
        failure_code:   'VERIFIER_INTERNAL_ERROR',
        failure_detail: `Verifier rule ${ruleId} threw: ${msg}`,
      });
    }
    trace.push({ rule_id: ruleId, latencyMs: Date.now() - t0, result: r.result });
    return r;
  }

  // Independent rules — run roughly in declaration order. Rules 1, 4, 6, 10
  // are independent ad-hoc SQL; Rules 2, 7, 8, 9 share notesRows. We could
  // parallelize, but for predictable trace order + simpler debugging we run
  // sequentially. Latency: ~6-8 SQL calls @ 20ms each = 120-160ms is well
  // under the 8s p95 target.
  const r1  = await runRule('MV-01', () => ruleCodeExistence(input));
  const r2  = await runRule('MV-02', () => ruleExclusionsCompleteness(input));
  const r3  = await runRule('MV-03', () => ruleVerbatimCitation(input));
  const r4  = await runRule('MV-04', () => ruleEmbeddingCosineFloor(input));
  const r5  = await runRule('MV-05', () => ruleGIRValidator(input, tla));
  const r6  = await runRule('MV-06', () => ruleIndiaSpecific(input));
  const r7  = await runRule('MV-07', () => ruleNotesConformance(input, candidateCtx, tla, claimsRows));
  const r8  = await runRule('MV-08', () => ruleSectionNotes(input, candidateCtx, tla, claimsRows));
  const r9  = await runRule('MV-09', () => ruleSubheadingNotes(input, candidateCtx, tla, claimsRows));
  const r10 = await runRule('MV-10', () => rulePolicyConsistency(input));

  for (const r of [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10]) {
    for (const f of r.failures) allFailures.push(f);
    for (const s of r.skipped)  allSkipped.push(s);
  }

  return {
    passed:             allFailures.length === 0,
    failed_rules:       allFailures,
    skipped_predicates: allSkipped,
    repair_feedback:    formatRepairFeedback(allFailures),
    trace,
  };
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  ruleCodeExistence,
  ruleExclusionsCompleteness,
  ruleVerbatimCitation,
  ruleEmbeddingCosineFloor,
  ruleGIRValidator,
  ruleIndiaSpecific,
  ruleNotesConformance,
  ruleSectionNotes,
  ruleSubheadingNotes,
  rulePolicyConsistency,
  formatRepairFeedback,
  reasoningMentionsGIR,
  parsePredicate,
  evalNotesClaims,
  INVERTING_CLAIM_TYPES,
};

/** Re-export for orchestrator wiring. */
export type { L5Input, L5Output, SelectOutput } from '../types';
