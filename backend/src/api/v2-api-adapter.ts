// backend/src/api/v2-api-adapter.ts
//
// API-facing adapter: maps a v2 `ClassifyResult` (the rich, layer-internal
// discriminated union) onto the FLAT external DTO the frontend wizard consumes.
//
// This is the API counterpart to `src/eval/v2-adapter.ts` (which maps onto the
// LEGACY scorer shape). It deliberately does NOT reuse that adapter: the eval
// adapter is pure and decision-driven for SCORING (CLASSIFY/ASK/REFUSE → the
// legacy `ClassificationResult`), whereas this one hydrates DB descriptions for
// the LEAF code + alternatives and emits trade-intelligence fields the frontend
// renders. It mirrors the eval adapter's injectable-deps pattern so unit tests
// can run without a live Postgres.
//
// KEY CONTRACTS:
//   - The external DTO is FLAT (top-level fields) so the existing frontend
//     `use-wizard.ts` keeps working — only ADD fields, never nest/rename.
//   - `confidence` is a 0-100 INTEGER (HIGH=90, MEDIUM=60, LOW=30), distinct
//     from the eval adapter's 0..1 float (different consumer).
//   - `description` is the LEAF tariff-line description hydrated from the DB
//     (`getTariffLineParentChains`), NOT the citation verbatim_text (which is
//     note/exclusion text, not the product line).
//   - `system_error` is NOT handled here — the route inspects it and returns 503.

import { getTariffLineParentChains } from '../classifier-v2/lib/supabase-client';
import type { ClassifyResult, SelectComponent, SelectCitation } from '../classifier-v2/types';

/* ---------------------------------------------------------------------------
 * External DTO (the FLAT shape returned to the frontend)
 * --------------------------------------------------------------------------- */

/** One hydrated alternative code suggestion (only entries resolving to a real tariff_lines row). */
export interface ApiAlternative {
  code:        string;
  description: string;
}

/** Wizard-facing classification payload (FLAT — frontend renders these top-level). */
export interface ApiClassificationResponse {
  responseType:    'classification';
  hsCode:          string;
  /** LEAF tariff-line description hydrated from the DB (falls back to '' if the code has no row). */
  description:     string;
  /** 0-100 integer derived from self_confidence. */
  confidence:      number;
  /** reasoning_chain joined with newlines. */
  reasoning:       string;
  /** Alternatives hydrated to {code, description}; non-code entries filtered out. */
  alternatives:    ApiAlternative[];
  isSixDigit:      boolean;
  exportPolicy:    string | null;
  policyCondition: string | null;
  indiaSpecific:   boolean;
  /** Raw enum, surfaced for clients that want the original signal alongside the 0-100 number. */
  selfConfidence:  'HIGH' | 'MEDIUM' | 'LOW';
  /** GIR + verbatim citation surface (passed through for the legally-defensible answer view). */
  citation:        SelectCitation;
  /** GIR-3(b) component breakdown when present; null otherwise. */
  components:      SelectComponent[] | null;
}

/** One clarifying-question option. */
export interface ApiQuestionOption {
  id:    string;
  label: string;
}

/** Wizard-facing clarifying-question payload (FLAT). */
export interface ApiQuestionResponse {
  responseType:            'question';
  question:                string;
  options:                 ApiQuestionOption[];
  questionId:              string;
  discriminatingAttribute: string;
}

/** Wizard-facing refusal payload (FLAT). */
export interface ApiRefusedResponse {
  responseType: 'refused';
  message:      string;
  /** out_of_scope_class enum (or null for non-triage refusals). */
  reason:       string | null;
}

/** The full external response discriminated union. */
export type ApiClassifyResponse =
  | ApiClassificationResponse
  | ApiQuestionResponse
  | ApiRefusedResponse;

/* ---------------------------------------------------------------------------
 * Confidence mapping
 * --------------------------------------------------------------------------- */

/** Map the coarse self_confidence enum to a 0-100 integer for the frontend gauge. */
const CONFIDENCE_PCT: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH:   90,
  MEDIUM: 60,
  LOW:    30,
};

/* ---------------------------------------------------------------------------
 * DB hydration seam (injectable for tests — mirrors v2-adapter deps pattern)
 * --------------------------------------------------------------------------- */

/** Subset of a hydrated tariff-line row the adapter needs (matches ParentChainRow). */
export interface HydratedChainRow {
  code:        string;
  description: string;
}

/**
 * Fetch function shape the adapter depends on. Defaults to the real
 * `getTariffLineParentChains`; tests inject a mock so no Postgres is required.
 */
export type TariffLineChainFetcher = (codes: string[]) => Promise<HydratedChainRow[]>;

/* ---------------------------------------------------------------------------
 * mapV2Result
 * --------------------------------------------------------------------------- */

/**
 * Map a v2 `ClassifyResult` onto the flat external `ApiClassifyResponse`.
 *
 * Only the THREE MODEL decisions are mapped here:
 *   - CLASSIFY → an `ApiClassificationResponse` with the LEAF description +
 *     hydrated, code-filtered alternatives + trade-intelligence fields.
 *   - ASK      → an `ApiQuestionResponse` from the primary clarifying question.
 *   - REFUSE   → an `ApiRefusedResponse` from the refusal reason + class.
 *
 * `system_error` is intentionally NOT handled — the route detects it (via
 * `result.system_error`) and returns a 503 BEFORE calling this mapper. A
 * `system_error` result still carries decision:'REFUSE', so if it ever reached
 * here it would map as a refusal; the route's guard ensures it never does.
 *
 * @param result The v2 result.
 * @param fetchChains DB hydration fn (injectable). Defaults to the real query.
 */
export async function mapV2Result(
  result: ClassifyResult,
  fetchChains: TariffLineChainFetcher = getTariffLineParentChains,
): Promise<ApiClassifyResponse> {
  if (result.decision === 'CLASSIFY' && result.classification) {
    const c = result.classification;

    // Codes to hydrate in ONE DB round trip: the leaf + every alternative. The
    // alternatives list is FREE TEXT (model may emit non-codes like "n/a"); only
    // those resolving to a real tariff_lines row survive into the response.
    const codesToHydrate = dedupe([c.code, ...c.alternatives_considered]);
    const rows = await fetchChains(codesToHydrate);
    const descByCode = new Map(rows.map((r) => [r.code, r.description]));

    // LEAF description from the DB — NOT the citation verbatim_text (note text).
    const description = descByCode.get(c.code) ?? '';

    // Hydrate alternatives, in original order, FILTERED to real tariff rows and
    // excluding the selected leaf itself (it is already `hsCode`).
    const alternatives: ApiAlternative[] = [];
    const seenAlts = new Set<string>();
    for (const alt of c.alternatives_considered) {
      if (alt === c.code) continue;
      if (seenAlts.has(alt)) continue;
      const altDesc = descByCode.get(alt);
      if (altDesc === undefined) continue; // non-code / unresolved → filtered out
      seenAlts.add(alt);
      alternatives.push({ code: alt, description: altDesc });
    }

    return {
      responseType:    'classification',
      hsCode:          c.code,
      description,
      confidence:      CONFIDENCE_PCT[c.self_confidence],
      reasoning:       c.reasoning_chain.join('\n'),
      alternatives,
      isSixDigit:      c.is_six_digit,
      exportPolicy:    c.export_policy,
      policyCondition: c.policy_condition,
      indiaSpecific:   c.india_specific,
      selfConfidence:  c.self_confidence,
      citation:        c.citation,
      components:      c.components,
    };
  }

  if (result.decision === 'ASK' && result.question) {
    const q = result.question;
    return {
      responseType:            'question',
      question:                q.question_text,
      options:                 q.options.map((o) => ({ id: o.id, label: o.label })),
      questionId:              q.question_id,
      discriminatingAttribute: q.discriminating_attribute,
    };
  }

  // REFUSE (and any other decision shape) → refusal. A genuine model REFUSE
  // carries `refusal`; we surface its reason + out_of_scope_class.
  const reason = result.refusal?.reason ?? 'Unable to classify this product.';
  const outOfScope = result.refusal?.out_of_scope_class ?? null;
  return {
    responseType: 'refused',
    message:      reason,
    reason:       outOfScope,
  };
}

/** Stable order-preserving de-dupe. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
