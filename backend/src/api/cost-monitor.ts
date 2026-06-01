// backend/src/api/cost-monitor.ts
//
// In-memory daily cost/usage counter (B1b — maps directly to the May 2026
// real-money overspend whose root cause was "the token meter was captured then
// DISCARDED": the runtime flew blind on tokens). This module is the in-app guard
// rail: it counts classifications + tokens per UTC day, exposes a snapshot for
// /health, and (when MAX_CLASSIFICATIONS_PER_DAY is set) enforces a HARD daily
// ceiling so a runaway loop cannot silently repeat that overspend.
//
// SINGLE-REPLICA INVARIANT: the counter lives in ONE Node process (in-memory),
// which is correct for the launch's pinned single Railway replica. A restart
// resets the day; an accidental 2nd replica would double-count silently — that
// is a known, documented launch risk (see PHASE-B-PLAN residual risks), not a
// problem this module solves.
//
// PURE + UNIT-TESTABLE: the clock is injectable so the UTC-day rollover and the
// ceiling are deterministic in tests with NO real time dependence. Default clock
// is `Date.now`. The default ceiling reads MAX_CLASSIFICATIONS_PER_DAY lazily on
// each query so tests/dev that never set it are unaffected (no ceiling).

import type { TokenUsageTotals, PerModelTotals } from '../classifier-v2/lib/token-meter';

/** Injectable clock: returns epoch milliseconds (UTC). Default: Date.now. */
export type Clock = () => number;

/** One classification's metered usage to record. */
export interface RecordInput {
  /** Metered generateContent calls for this request (token_usage.llmCalls). */
  llmCalls:    number;
  /** Total tokens across all metered calls (token_usage.totalTokens). */
  totalTokens: number;
  /** Per-model breakdown (token_usage.byModel). */
  byModel:     Record<string, PerModelTotals>;
  /** The pipeline decision for this request (CLASSIFY/ASK/REFUSE/system_error). */
  decision:    string;
}

/** Per-model running totals exposed in the daily stats snapshot. */
export interface DailyModelTotals {
  calls:       number;
  totalTokens: number;
}

/** Snapshot of the current UTC day's usage (surfaced on /health). */
export interface DailyStats {
  /** UTC day key 'YYYY-MM-DD' the counters belong to. */
  utcDay:           string;
  /** Number of recorded classifications today. */
  requests:         number;
  /** Sum of metered LLM calls today. */
  llmCalls:         number;
  /** Sum of total tokens today. */
  totalTokens:      number;
  /** Per-model {calls,totalTokens} today. */
  byModel:          Record<string, DailyModelTotals>;
  /** Decision tally today (CLASSIFY/ASK/REFUSE/...). */
  byDecision:       Record<string, number>;
  /** Configured hard ceiling (null = no ceiling configured). */
  maxPerDay:        number | null;
  /** True when the ceiling is set AND today's requests have reached it. */
  overLimit:        boolean;
}

/** Derive the UTC day key 'YYYY-MM-DD' for an epoch-ms instant. */
function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Read the optional hard daily ceiling from env. null when unset/invalid/<=0. */
function readMaxPerDay(): number | null {
  const raw = process.env.MAX_CLASSIFICATIONS_PER_DAY;
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Daily usage counter with a UTC-day rollover and an optional hard ceiling.
 * The clock is injected so rollover/ceiling behavior is fully deterministic in
 * tests. Construct your own instance in tests; the module also exports a process
 * singleton for the live route + /health.
 */
export class CostMonitor {
  private day: string;
  private requests = 0;
  private llmCalls = 0;
  private totalTokens = 0;
  private byModel: Record<string, DailyModelTotals> = {};
  private byDecision: Record<string, number> = {};

  constructor(private readonly clock: Clock = Date.now) {
    this.day = utcDayKey(this.clock());
  }

  /** Roll the counters over to a fresh UTC day if the clock has crossed midnight UTC. */
  private rolloverIfNeeded(): void {
    const today = utcDayKey(this.clock());
    if (today !== this.day) {
      this.day = today;
      this.requests = 0;
      this.llmCalls = 0;
      this.totalTokens = 0;
      this.byModel = {};
      this.byDecision = {};
    }
  }

  /** Record one classification's metered usage into today's counters. */
  recordClassification(input: RecordInput): void {
    this.rolloverIfNeeded();
    this.requests += 1;
    this.llmCalls += input.llmCalls;
    this.totalTokens += input.totalTokens;
    this.byDecision[input.decision] = (this.byDecision[input.decision] ?? 0) + 1;
    for (const [model, t] of Object.entries(input.byModel)) {
      const bucket = this.byModel[model] ?? { calls: 0, totalTokens: 0 };
      bucket.calls += t.calls;
      bucket.totalTokens += t.totalTokens;
      this.byModel[model] = bucket;
    }
  }

  /** Snapshot of today's usage (rolls over first so a stale day reads zero). */
  getDailyStats(): DailyStats {
    this.rolloverIfNeeded();
    const maxPerDay = readMaxPerDay();
    return {
      utcDay:      this.day,
      requests:    this.requests,
      llmCalls:    this.llmCalls,
      totalTokens: this.totalTokens,
      byModel:     { ...this.byModel },
      byDecision:  { ...this.byDecision },
      maxPerDay,
      overLimit:   maxPerDay !== null && this.requests >= maxPerDay,
    };
  }

  /**
   * True when a hard daily ceiling is configured AND today's recorded
   * classifications have reached it. Always false when MAX_CLASSIFICATIONS_PER_DAY
   * is unset (default: no ceiling, so dev/tests are unaffected).
   */
  isOverDailyLimit(): boolean {
    this.rolloverIfNeeded();
    const maxPerDay = readMaxPerDay();
    if (maxPerDay === null) return false;
    return this.requests >= maxPerDay;
  }
}

/** Process singleton used by the live route + /health (single-replica invariant). */
export const costMonitor = new CostMonitor();

/** Convenience: extract the recordable shape from a v2 token_usage total. */
export function recordInputFromTokenUsage(
  usage: TokenUsageTotals | undefined,
  decision: string,
): RecordInput {
  return {
    llmCalls:    usage?.llmCalls ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    byModel:     usage?.byModel ?? {},
    decision,
  };
}
