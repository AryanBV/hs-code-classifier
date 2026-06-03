/**
 * Unit tests for the durable usage counter (`recordUsageEvent` + `getUsageSummary`).
 *
 * Uses the `_setQueryRunnerForTesting` injection hook so no live Postgres is
 * needed. We assert:
 *   - recordUsageEvent issues a PARAMETERIZED INSERT into usage_events with the
 *     right values + jsonb-serialized by_model, and swallows DB errors (never throws)
 *   - getUsageSummary issues the three aggregate queries and returns the
 *     { today, last7Days, allTime } contract shape with numeric coercion
 *
 * Run: cd backend && npx vitest run src/classifier-v2/lib/usage-events.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  _setQueryRunnerForTesting,
  recordUsageEvent,
  getUsageSummary,
} from './supabase-client';

interface RecordedCall {
  sql:    string;
  params: unknown[];
}

type Handler = (sql: string, params: unknown[]) => { rows: QueryResultRow[]; rowCount?: number };

/** Fake QueryRunner that records (sql, params) and returns scripted rows by SQL substring. */
class FakeRunner {
  public calls: RecordedCall[] = [];
  private handlers: Array<{ match: string; handler: Handler }> = [];

  on(match: string, handler: Handler): this {
    this.handlers.push({ match, handler });
    return this;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    this.calls.push({ sql: text, params });
    for (const { match, handler } of this.handlers) {
      if (text.includes(match)) {
        const { rows, rowCount } = handler(text, params);
        return { rows: rows as T[], rowCount: rowCount ?? rows.length, command: '', oid: 0, fields: [] };
      }
    }
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
  }
}

/** A runner whose query() always rejects — to prove recordUsageEvent swallows errors. */
class ThrowingRunner {
  public calls = 0;
  async query<T extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<T>> {
    this.calls += 1;
    throw new Error('simulated DB outage');
  }
}

let runner: FakeRunner;

beforeEach(() => {
  runner = new FakeRunner();
  _setQueryRunnerForTesting(runner);
});

afterEach(() => {
  _setQueryRunnerForTesting(null);
  vi.restoreAllMocks();
});

describe('recordUsageEvent', () => {
  it('issues a parameterized INSERT into usage_events with the right values', async () => {
    runner.on('INSERT INTO usage_events', () => ({ rows: [], rowCount: 1 }));

    await recordUsageEvent({
      decision:    'CLASSIFY',
      llmCalls:    5,
      totalTokens: 1234,
      byModel:     { 'gemini-3.5-flash': { calls: 5, totalTokens: 1234 } },
      reqId:       'abc12345',
    });

    const call = runner.calls.find((c) => c.sql.includes('INSERT INTO usage_events'));
    expect(call).toBeDefined();
    // Parameterized: placeholders present, by_model cast to jsonb.
    expect(call!.sql).toContain('$1');
    expect(call!.sql).toContain('$4::jsonb');
    expect(call!.params[0]).toBe('CLASSIFY');
    expect(call!.params[1]).toBe(5);
    expect(call!.params[2]).toBe(1234);
    expect(call!.params[3]).toBe(JSON.stringify({ 'gemini-3.5-flash': { calls: 5, totalTokens: 1234 } }));
    expect(call!.params[4]).toBe('abc12345');
    // The jsonb value must not be string-interpolated into the SQL text.
    expect(call!.sql.includes('gemini-3.5-flash')).toBe(false);
  });

  it('serializes a null/undefined by_model as "{}" (never leaks undefined into pg)', async () => {
    runner.on('INSERT INTO usage_events', () => ({ rows: [], rowCount: 1 }));

    await recordUsageEvent({
      decision:    'REFUSE',
      llmCalls:    0,
      totalTokens: 0,
      byModel:     undefined,
      reqId:       'r0',
    });

    const call = runner.calls.find((c) => c.sql.includes('INSERT INTO usage_events'))!;
    expect(call.params[3]).toBe('{}');
  });

  it('swallows DB errors (best-effort: never throws, logs instead)', async () => {
    const throwing = new ThrowingRunner();
    _setQueryRunnerForTesting(throwing);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Must resolve, NOT reject — the classify hot-path depends on this.
    await expect(
      recordUsageEvent({ decision: 'CLASSIFY', llmCalls: 1, totalTokens: 10, byModel: {}, reqId: 'x' }),
    ).resolves.toBeUndefined();

    expect(throwing.calls).toBe(1);
    expect(errSpy).toHaveBeenCalledOnce();
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('recordUsageEvent failed');
  });
});

describe('getUsageSummary', () => {
  it('returns the { today, last7Days, allTime } contract with numeric coercion', async () => {
    runner
      // today: utc_day = current date
      .on("utc_day = (now() AT TIME ZONE 'utc')::date", () => ({
        rows: [{ classifications: '3', llm_calls: '17', total_tokens: '4200' }],
      }))
      // last7Days: grouped per-day series (string-typed numerics from pg)
      .on('GROUP BY utc_day', () => ({
        rows: [
          { utc_day: '2026-06-03', classifications: '3', llm_calls: '17', total_tokens: '4200' },
          { utc_day: '2026-06-02', classifications: '10', llm_calls: '55', total_tokens: '13000' },
        ],
      }))
      // allTime: the bare SELECT with no WHERE / GROUP BY (matched last)
      .on('FROM usage_events', () => ({
        rows: [{ classifications: '13', llm_calls: '72', total_tokens: '17200' }],
      }));

    const summary = await getUsageSummary();

    expect(summary.today).toEqual({ classifications: 3, llmCalls: 17, totalTokens: 4200 });
    expect(summary.allTime).toEqual({ classifications: 13, llmCalls: 72, totalTokens: 17200 });
    expect(summary.last7Days).toEqual([
      { utcDay: '2026-06-03', classifications: 3, llmCalls: 17, totalTokens: 4200 },
      { utcDay: '2026-06-02', classifications: 10, llmCalls: 55, totalTokens: 13000 },
    ]);
  });

  it('defaults missing aggregate rows to zeros (empty table)', async () => {
    // No handlers registered → every query returns { rows: [] }.
    const summary = await getUsageSummary();
    expect(summary.today).toEqual({ classifications: 0, llmCalls: 0, totalTokens: 0 });
    expect(summary.allTime).toEqual({ classifications: 0, llmCalls: 0, totalTokens: 0 });
    expect(summary.last7Days).toEqual([]);
  });
});
