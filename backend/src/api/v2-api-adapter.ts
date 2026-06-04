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

import {
  getTariffLineParentChains,
  getSubheadingDescriptions,
  getTariffLinesForSubheadings,
} from '../classifier-v2/lib/supabase-client';
import type { ClassifyResult, SelectComponent, SelectCitation } from '../classifier-v2/types';
import {
  assembleTradeIntelligenceForCode,
  type TradeIntelligence,
} from './trade-intel-assembler';

/* ---------------------------------------------------------------------------
 * External DTO (the FLAT shape returned to the frontend)
 * --------------------------------------------------------------------------- */

/** One hydrated alternative code suggestion (only entries resolving to a real tariff_lines row). */
export interface ApiAlternative {
  code:        string;
  description: string;
}

/** Coarse confidence band rendered as a 3-state UI (B5 frozen wire contract). */
export type ApiConfidenceBand = 'high' | 'medium' | 'low';

/** Wizard-facing classification payload (FLAT — frontend renders these top-level). */
export interface ApiClassificationResponse {
  responseType:    'classification';
  hsCode:          string;
  /** LEAF tariff-line description hydrated from the DB (falls back to '' if the code has no row). */
  description:     string;
  /** 0-100 integer derived from self_confidence. */
  confidence:      number;
  /**
   * REQUIRED coarse band (B5 freeze) derived NOW from self_confidence
   * (HIGH→high, MEDIUM→medium, LOW→low). Honest coarse signal at launch; the
   * calibrated value lands later in `confidenceP` without a breaking change.
   */
  confidenceBand:  ApiConfidenceBand;
  /**
   * OPTIONAL reserved field (B5 freeze) for the post-launch ECE/Brier-calibrated
   * probability (0..1). Absent at launch — adding it later is additive/non-breaking.
   */
  confidenceP?:    number;
  /** reasoning_chain joined with newlines. */
  reasoning:       string;
  /** Alternatives hydrated to {code, description}; non-code entries filtered out. Capped at 3 (B1c/B5). */
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
  /**
   * Server-side wall-clock for this call, attached by the route (NOT the mapper).
   * OPTIONAL (B5): the legacy answer path omits it, so it is not guaranteed.
   */
  processingTimeMs?: number;
  /**
   * ADDITIVE (Track A): dated/indicative trade-intelligence for the final code —
   * export policy + duty + RoSCTL/RoDTEP incentive + UQC + the §6 disclaimer.
   * Best-effort and OPTIONAL: null/absent when the trade-intel tables hold no data
   * (Phase-1 pre-ingest) or a query fails. It NEVER blocks or delays the
   * classification — the existing fields above are unaffected. Shape:
   * `TradeIntelligence` from `trade-intel-assembler.ts` (EXPERIENCE-DESIGN §4.4).
   */
  tradeIntelligence?: TradeIntelligence | null;
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
  /**
   * OPTIONAL: which lever raised this question (`'triage'` | `'sibling'` |
   * `'cross_subheading'` | `'divergence'`). Surfaced so the wizard can render the
   * honest residual escape (the last option, `id:'other'`) appropriately and so a
   * divergence ASK is distinguishable. Absent when the underlying question carries
   * no trigger (legacy triage/QGS fallback). ADDITIVE — never removes a field.
   */
  trigger?:                'triage' | 'sibling' | 'cross_subheading' | 'divergence';
  /** Server-side wall-clock, attached by the route (NOT the mapper). OPTIONAL (B5). */
  processingTimeMs?:       number;
}

/** Wizard-facing refusal payload (FLAT). */
export interface ApiRefusedResponse {
  responseType: 'refused';
  message:      string;
  /** out_of_scope_class enum (or null for non-triage refusals). */
  reason:       string | null;
  /** Server-side wall-clock, attached by the route (NOT the mapper). OPTIONAL (B5). */
  processingTimeMs?: number;
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

/** Map the coarse self_confidence enum to the frozen wire band (B5). */
const CONFIDENCE_BAND: Record<'HIGH' | 'MEDIUM' | 'LOW', ApiConfidenceBand> = {
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
};

/** Max alternatives surfaced — the literal "top-3" product promise (B1c/B5). */
const MAX_ALTERNATIVES = 3;

/**
 * Max 8-digit children listed under a 6-digit result. These are the lines the
 * exporter must CHOOSE FROM (not a top-3 sibling promise), so the cap is wider.
 */
const MAX_SIX_DIGIT_CHILDREN = 8;

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

/**
 * Fetch subheading (6-digit) descriptions. Defaults to the real
 * `getSubheadingDescriptions`; used only on the 6-digit CLASSIFY branch.
 */
export type SubheadingRowFetcher = (codes: string[]) => Promise<HydratedChainRow[]>;

/**
 * Fetch the REAL 8-digit children of a set of subheadings, as {code,description}.
 * Defaults to a thin wrapper over `getTariffLinesForSubheadings`; used only on
 * the 6-digit CLASSIFY branch to list the lines the exporter must choose from.
 */
export type SubheadingChildrenFetcher = (subheadings: string[]) => Promise<HydratedChainRow[]>;

/**
 * Best-effort trade-intelligence assembler shape. Defaults to the live
 * `assembleTradeIntelligenceForCode`; tests inject a stub so no Postgres (or
 * trade-intel data) is required. MUST be fail-safe — it returns null on any
 * failure and never throws, so the classification is emitted regardless.
 */
export type TradeIntelligenceFetcher = (code: string) => Promise<TradeIntelligence | null>;

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
 * @param fetchChains DB hydration fn for 8-digit leaf + alternatives (injectable).
 * @param fetchSubheadingRows DB hydration fn for a 6-digit subheading's OWN title.
 * @param fetchSubheadingChildren DB fn for a 6-digit subheading's real 8-digit children.
 * @param fetchTradeIntelligence Best-effort trade-intel assembler (injectable for
 *   tests). Defaults to the live assembler; on any failure it returns null and the
 *   classification is emitted WITHOUT a `tradeIntelligence` field (never throws).
 */
export async function mapV2Result(
  result: ClassifyResult,
  fetchChains: TariffLineChainFetcher = getTariffLineParentChains,
  fetchSubheadingRows: SubheadingRowFetcher = getSubheadingDescriptions,
  fetchSubheadingChildren: SubheadingChildrenFetcher = (subs) =>
    getTariffLinesForSubheadings(subs).then((rows) =>
      rows.map((r) => ({ code: r.code, description: r.description })),
    ),
  fetchTradeIntelligence: TradeIntelligenceFetcher = (code) =>
    assembleTradeIntelligenceForCode(code),
): Promise<ApiClassifyResponse> {
  if (result.decision === 'CLASSIFY' && result.classification) {
    const c = result.classification;

    let description: string;
    let alternatives: ApiAlternative[];

    if (c.is_six_digit) {
      // 6-DIGIT branch: the headline code's own description lives in `subheadings`
      // (NOT `tariff_lines`), and the "alternatives" are the REAL 8-digit children
      // the exporter must choose from — NOT the model's sibling list. When the
      // subheading has no children, alternatives is [] so the frontend renders an
      // accurate empty state (no misleading "top-3" promise).
      const [subRows, childRows] = await Promise.all([
        fetchSubheadingRows([c.code]),
        fetchSubheadingChildren([c.code]),
      ]);
      description = new Map(subRows.map((r) => [r.code, r.description])).get(c.code) ?? '';
      alternatives = childRows
        .map((r) => ({ code: r.code, description: r.description }))
        .slice(0, MAX_SIX_DIGIT_CHILDREN);
    } else {
      // 8-DIGIT branch (UNCHANGED): hydrate the leaf + every alternative in ONE
      // DB round trip. The alternatives list is FREE TEXT (model may emit
      // non-codes like "n/a"); only those resolving to a real tariff_lines row
      // survive into the response.
      const codesToHydrate = dedupe([c.code, ...c.alternatives_considered]);
      const rows = await fetchChains(codesToHydrate);
      const descByCode = new Map(rows.map((r) => [r.code, r.description]));

      // LEAF description from the DB — NOT the citation verbatim_text (note text).
      description = descByCode.get(c.code) ?? '';

      // Hydrate alternatives, in original order, FILTERED to real tariff rows and
      // excluding the selected leaf itself (it is already `hsCode`).
      const resolvedAlternatives: ApiAlternative[] = [];
      const seenAlts = new Set<string>();
      for (const alt of c.alternatives_considered) {
        if (alt === c.code) continue;
        if (seenAlts.has(alt)) continue;
        const altDesc = descByCode.get(alt);
        if (altDesc === undefined) continue; // non-code / unresolved → filtered out
        seenAlts.add(alt);
        resolvedAlternatives.push({ code: alt, description: altDesc });
      }

      // B1c/B5: cap at the first 3 (preserve model order, NEVER pad to reach 3) —
      // the literal "top-3" product promise. Slicing happens AFTER leaf-drop +
      // dedup + real-tariff-row filtering, so the 3 are 3 resolvable siblings.
      alternatives = resolvedAlternatives.slice(0, MAX_ALTERNATIVES);
    }

    // ADDITIVE trade-intelligence (best-effort). The assembler is fail-safe
    // (returns null, never throws), so this can never break or delay the
    // classification. We attach the field ONLY when a non-null block is produced,
    // keeping the DTO key set unchanged when there is no trade-intel data (the
    // Phase-1 pre-ingest default), so the frozen contract is preserved.
    const tradeIntelligence = await fetchTradeIntelligence(c.code);

    const response: ApiClassificationResponse = {
      responseType:    'classification',
      hsCode:          c.code,
      description,
      confidence:      CONFIDENCE_PCT[c.self_confidence],
      confidenceBand:  CONFIDENCE_BAND[c.self_confidence],
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
    if (tradeIntelligence !== null) {
      response.tradeIntelligence = tradeIntelligence;
    }
    return response;
  }

  if (result.decision === 'ASK' && result.question) {
    const q = result.question;
    // `q.options` already carries the honest residual escape as its LAST option
    // (`id:'other'`, a REAL leaf description) for a divergence question — it was
    // appended by the engine's `toClarifyingQuestion`. We pass the options through
    // verbatim (MECE real options + the escape), so no special-casing is needed.
    const response: ApiQuestionResponse = {
      responseType:            'question',
      question:                q.question_text,
      options:                 q.options.map((o) => ({ id: o.id, label: o.label })),
      questionId:              q.question_id,
      discriminatingAttribute: q.discriminating_attribute,
    };
    // Surface the lever (incl. 'divergence') so the wizard can distinguish it.
    if (q.trigger !== undefined) response.trigger = q.trigger;
    return response;
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
