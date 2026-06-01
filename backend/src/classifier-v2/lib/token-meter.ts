/**
 * Request-scoped token meter (Phase A3).
 *
 * Reconnects the real per-call Gemini token usage that the v2 pipeline was
 * capturing-then-DISCARDING. Each `generateContent` call (L1 Triage, L4 Select,
 * the Gemini-Flash reranker) returns `result.usage` (promptTokens, outputTokens,
 * thoughtsTokens, totalTokens, and cachedTokens on the Developer API). Before A3
 * callers threw that away; the orchestrator tracked only `state.llm_calls` (a
 * count) and the eval multiplied that count by a flat representative USD.
 *
 * This module accumulates the REAL token sums for the duration of ONE
 * `classify()` / `continueWithAnswer()` invocation via `AsyncLocalStorage`, so
 * the totals can be attached to `ClassifyResult.diagnostics.token_usage` and the
 * eval can compute real per-token cost.
 *
 * WHY AsyncLocalStorage: it lets the single capture point (the
 * `lib/llm-provider.ts` facade) record usage into the CURRENT request's meter
 * WITHOUT threading a meter argument through every layer signature. L1/L4/reranker
 * are NOT modified — the facade reads the ambient meter via `recordUsage`. Two
 * concurrent `classify()` calls (the eval runs cases in a bounded pool) each get
 * their OWN meter because `als.run` establishes a distinct async context per
 * invocation; no cross-contamination.
 *
 * BEHAVIOR-PRESERVING: metering is purely additive. `recordUsage` is a no-op when
 * no meter is active (e.g. a layer called directly in a unit test without the
 * orchestrator wrapper), so nothing breaks outside a metered scope.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The usage shape the meter accepts — the `GenerateContentUsage` contract plus
 * the optional `cachedTokens` superset the Developer-API client returns. Vertex
 * leaves `cachedTokens` undefined; the meter treats undefined as 0.
 */
export interface RecordableUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

/** Per-model token sub-totals (one entry per distinct model id seen). */
export interface PerModelTotals {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

/**
 * Suite-wide token totals for ONE metered scope. `byModel` keys are the model
 * ids passed to `add` (e.g. 'gemini-3.5-flash', 'gemini-embedding-001').
 * `llmCalls` is the number of `add` invocations — i.e. every metered
 * generateContent call (L1 triage + L4 select + repair/backtrack selects + the
 * L2 Gemini-Flash reranker). It is therefore a SUPERSET of (>=) the
 * orchestrator's `diagnostics.llm_calls`, which by long-standing semantics counts
 * only L1/L4 (and would-be L6/L7) decision calls and intentionally excludes
 * retrieval/reranking.
 */
export interface TokenUsageTotals {
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  cachedTokens: number;
  llmCalls: number;
  byModel: Record<string, PerModelTotals>;
}

/**
 * Accumulates token usage across the calls made within one request scope.
 * Mutable; `snapshot()` returns a deep, frozen-shape copy safe to attach to a
 * result without later mutations leaking in.
 */
export class TokenMeter {
  private promptTokens = 0;
  private outputTokens = 0;
  private thoughtsTokens = 0;
  private totalTokens = 0;
  private cachedTokens = 0;
  private llmCalls = 0;
  private readonly byModel = new Map<string, PerModelTotals>();

  /** Add one call's usage to the running totals (and the per-model bucket). */
  add(model: string, usage: RecordableUsage): void {
    const cached = usage.cachedTokens ?? 0;

    this.promptTokens += usage.promptTokens;
    this.outputTokens += usage.outputTokens;
    this.thoughtsTokens += usage.thoughtsTokens;
    this.totalTokens += usage.totalTokens;
    this.cachedTokens += cached;
    this.llmCalls += 1;

    const bucket = this.byModel.get(model);
    if (bucket === undefined) {
      this.byModel.set(model, {
        calls: 1,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        thoughtsTokens: usage.thoughtsTokens,
        totalTokens: usage.totalTokens,
        cachedTokens: cached,
      });
    } else {
      bucket.calls += 1;
      bucket.promptTokens += usage.promptTokens;
      bucket.outputTokens += usage.outputTokens;
      bucket.thoughtsTokens += usage.thoughtsTokens;
      bucket.totalTokens += usage.totalTokens;
      bucket.cachedTokens += cached;
    }
  }

  /** Deep-copy snapshot of the running totals — detached from this meter. */
  snapshot(): TokenUsageTotals {
    const byModel: Record<string, PerModelTotals> = {};
    for (const [model, t] of this.byModel) {
      byModel[model] = { ...t };
    }
    return {
      promptTokens: this.promptTokens,
      outputTokens: this.outputTokens,
      thoughtsTokens: this.thoughtsTokens,
      totalTokens: this.totalTokens,
      cachedTokens: this.cachedTokens,
      llmCalls: this.llmCalls,
      byModel,
    };
  }
}

/** Module-singleton ALS — holds the active meter for the current request scope. */
const als = new AsyncLocalStorage<TokenMeter>();

/**
 * Run `fn` inside a fresh metered scope and return BOTH its result and the token
 * totals accumulated during it. Wrap the WHOLE pipeline body so every awaited
 * LLM call (no matter how deep) records into THIS meter; `als.run` keeps the
 * context alive across awaits for the duration of `fn`.
 */
export async function runWithMeter<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; totals: TokenUsageTotals }> {
  const meter = new TokenMeter();
  const result = await als.run(meter, fn);
  return { result, totals: meter.snapshot() };
}

/**
 * Record one call's usage into the meter active in the current scope. No-op when
 * called outside a `runWithMeter` scope (no ambient meter) — so a layer invoked
 * directly in a test, or any code path without the orchestrator wrapper, is
 * unaffected. This is the single capture seam the `generateContent` facade calls.
 */
export function recordUsage(model: string, usage: RecordableUsage): void {
  const meter = als.getStore();
  if (meter === undefined) return;
  meter.add(model, usage);
}
