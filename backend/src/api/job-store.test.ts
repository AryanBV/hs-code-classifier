import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { _setQueryRunnerForTesting } from '../classifier-v2/lib/supabase-client';
import {
  createJob,
  claimNextQueued,
  appendProgress,
  completeJob,
  failJob,
  getJob,
  countQueuedAhead,
  sweepExpired,
} from './job-store';
import type { ApiClassifyResponse } from './v2-api-adapter';

/* ---------------------------------------------------------------------------
 * Fake QueryRunner — records (sql, params) and returns scripted result rows.
 * Each scripted handler matches on a SQL substring and may inspect params.
 * --------------------------------------------------------------------------- */

interface RecordedCall {
  sql:    string;
  params: unknown[];
}

type Handler = (sql: string, params: unknown[]) => { rows: QueryResultRow[]; rowCount?: number };

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
        return {
          rows: rows as T[],
          rowCount: rowCount ?? rows.length,
          command: '',
          oid: 0,
          fields: [],
        };
      }
    }
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
  }
}

function makeRawRow(over: Record<string, unknown> = {}): QueryResultRow {
  return {
    id:               'job-1',
    status:           'queued',
    kind:             'classify',
    query:            'stainless steel hex bolts',
    previous_answers: {},
    rounds:           0,
    question_id:      null,
    answer_id:        null,
    stage:            null,
    progress:         [],
    queue_position:   null,
    result:           null,
    error:            null,
    attempts:         0,
    client_token:     null,
    created_at:       '2026-06-01T00:00:00.000Z',
    started_at:       null,
    finished_at:      null,
    expires_at:       '2026-06-02T00:00:00.000Z',
    ...over,
  };
}

let runner: FakeRunner;

beforeEach(() => {
  runner = new FakeRunner();
  _setQueryRunnerForTesting(runner);
});

afterEach(() => {
  _setQueryRunnerForTesting(null);
});

/** Assert no string-interpolated values leaked into the SQL: every value is a $n placeholder. */
function assertParameterized(call: RecordedCall): void {
  // No single-quoted literals beyond the empty-jsonb defaults that are part of the schema text.
  // The query text should reference $1.. and pass values via params.
  const userValues = call.params;
  for (const v of userValues) {
    if (typeof v === 'string' && v.length > 0) {
      // The value must NOT appear inline in the SQL text.
      expect(call.sql.includes(v)).toBe(false);
    }
  }
  // Any non-default value implies at least one placeholder in the SQL.
  if (userValues.length > 0) {
    expect(/\$\d/.test(call.sql)).toBe(true);
  }
}

describe('job-store — createJob', () => {
  it('inserts a queued row and returns {id,status,queue_position}', async () => {
    runner
      .on('INSERT INTO classification_jobs', () => ({ rows: [makeRawRow({ id: 'new-job' })] }))
      .on('COUNT(*)', () => ({ rows: [{ ahead: 1 }] }));

    const created = await createJob({ kind: 'classify', query: 'hex bolts' });

    expect(created.id).toBe('new-job');
    expect(created.status).toBe('queued');
    expect(created.queue_position).toBe(1);

    const insertCall = runner.calls.find((c) => c.sql.includes('INSERT INTO classification_jobs'));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params[0]).toBe('classify'); // kind
    expect(insertCall!.params[1]).toBe('hex bolts'); // query
    assertParameterized(insertCall!);
  });

  it('serializes previous_answers as a JSON string param (parameterized, not interpolated)', async () => {
    runner
      .on('INSERT INTO classification_jobs', () => ({ rows: [makeRawRow()] }))
      .on('COUNT(*)', () => ({ rows: [{ ahead: 1 }] }));

    await createJob({
      kind: 'answer',
      query: 'q',
      question_id: 'qid',
      answer_id: 'aid',
      previous_answers: { material: 'steel' },
      rounds: 2,
    });

    const insertCall = runner.calls.find((c) => c.sql.includes('INSERT INTO'))!;
    expect(insertCall.params[2]).toBe(JSON.stringify({ material: 'steel' })); // previous_answers
    expect(insertCall.params[3]).toBe(2); // rounds
    expect(insertCall.params[4]).toBe('qid'); // question_id
    expect(insertCall.params[5]).toBe('aid'); // answer_id
    // The jsonb value must not be inlined into the SQL.
    expect(insertCall.sql.includes('steel')).toBe(false);
  });

  it('idempotency: returns the EXISTING non-expired row on a duplicate client_token (no insert)', async () => {
    runner
      .on('WHERE client_token = $1', (_sql, params) => {
        expect(params[0]).toBe('tok-123');
        return { rows: [makeRawRow({ id: 'existing-job', client_token: 'tok-123' })] };
      })
      .on('COUNT(*)', () => ({ rows: [{ ahead: 3 }] }));

    const created = await createJob({ kind: 'classify', query: 'x', client_token: 'tok-123' });

    expect(created.id).toBe('existing-job');
    expect(created.queue_position).toBe(3);
    // No INSERT should have been issued.
    expect(runner.calls.some((c) => c.sql.includes('INSERT INTO'))).toBe(false);
    // The idempotency lookup is parameterized + filters on expires_at.
    const lookup = runner.calls.find((c) => c.sql.includes('client_token'))!;
    expect(lookup.sql).toContain('expires_at > now()');
    expect(lookup.params[0]).toBe('tok-123');
  });

  it('inserts when the client_token has no existing non-expired row', async () => {
    runner
      .on('WHERE client_token = $1', () => ({ rows: [] })) // no existing row
      .on('INSERT INTO classification_jobs', (_sql, params) => {
        expect(params[6]).toBe('tok-new'); // client_token passed through
        return { rows: [makeRawRow({ id: 'fresh', client_token: 'tok-new' })] };
      })
      .on('COUNT(*)', () => ({ rows: [{ ahead: 1 }] }));

    const created = await createJob({ kind: 'classify', query: 'x', client_token: 'tok-new' });
    expect(created.id).toBe('fresh');
    expect(runner.calls.some((c) => c.sql.includes('INSERT INTO'))).toBe(true);
  });

  it('uses an ON CONFLICT DO NOTHING insert (atomic idempotency for the concurrent race)', async () => {
    runner
      .on('WHERE client_token = $1', () => ({ rows: [] })) // fast-path miss
      .on('INSERT INTO classification_jobs', () => ({ rows: [makeRawRow({ id: 'fresh' })] }))
      .on('COUNT(*)', () => ({ rows: [{ ahead: 1 }] }));

    await createJob({ kind: 'classify', query: 'x', client_token: 'tok-1' });

    const insertCall = runner.calls.find((c) => c.sql.includes('INSERT INTO classification_jobs'))!;
    expect(insertCall.sql).toContain('ON CONFLICT (client_token)');
    expect(insertCall.sql).toContain('DO NOTHING');
    expect(insertCall.sql).toContain('WHERE client_token IS NOT NULL');
  });

  it('ON CONFLICT path: empty RETURNING (concurrent insert won) → re-SELECT the winning row, no 500', async () => {
    // First client_token lookup misses (fast-path), INSERT returns NOTHING (a
    // concurrent same-token insert won the unique index), then the post-conflict
    // re-SELECT returns the winning row. createJob must return THAT row, not throw.
    let tokenLookups = 0;
    runner
      .on('WHERE client_token = $1', (_sql, params) => {
        tokenLookups += 1;
        expect(params[0]).toBe('tok-race');
        // 1st lookup (fast-path) = miss; 2nd lookup (post-conflict) = the winner.
        if (tokenLookups === 1) return { rows: [] };
        return { rows: [makeRawRow({ id: 'winner', client_token: 'tok-race' })] };
      })
      .on('INSERT INTO classification_jobs', () => ({ rows: [] })) // DO NOTHING → empty RETURNING
      .on('COUNT(*)', () => ({ rows: [{ ahead: 4 }] }));

    const created = await createJob({ kind: 'classify', query: 'x', client_token: 'tok-race' });

    expect(created.id).toBe('winner');
    expect(created.queue_position).toBe(4);
    expect(tokenLookups).toBe(2); // fast-path miss + post-conflict re-SELECT
  });

  it('ON CONFLICT path: empty RETURNING AND no conflicting row found → throws (does not fabricate)', async () => {
    runner
      .on('WHERE client_token = $1', () => ({ rows: [] })) // miss both times
      .on('INSERT INTO classification_jobs', () => ({ rows: [] })); // DO NOTHING

    await expect(
      createJob({ kind: 'classify', query: 'x', client_token: 'tok-ghost' }),
    ).rejects.toThrow(/no conflicting row/);
  });
});

describe('job-store — claimNextQueued', () => {
  it('claims+locks the oldest queued row (UPDATE ... FOR UPDATE SKIP LOCKED) or null', async () => {
    runner.on('UPDATE classification_jobs', () => ({
      rows: [makeRawRow({ id: 'claimed', status: 'running', attempts: 1, started_at: 'now' })],
    }));

    const job = await claimNextQueued();
    expect(job).not.toBeNull();
    expect(job!.id).toBe('claimed');
    expect(job!.status).toBe('running');
    expect(job!.attempts).toBe(1);

    const call = runner.calls[0]!;
    expect(call.sql).toContain("SET status = 'running'");
    expect(call.sql).toContain('attempts = attempts + 1');
    expect(call.sql).toContain("status = 'queued'");
    expect(call.sql).toContain('ORDER BY created_at');
    expect(call.sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('returns null when the queue is empty', async () => {
    runner.on('UPDATE classification_jobs', () => ({ rows: [] }));
    const job = await claimNextQueued();
    expect(job).toBeNull();
  });
});

describe('job-store — appendProgress / completeJob / failJob', () => {
  it('appendProgress jsonb-appends the event and sets stage (parameterized)', async () => {
    runner.on('UPDATE classification_jobs', () => ({ rows: [], rowCount: 1 }));
    await appendProgress('job-1', { stage: 'L4', event: 'select', t_ms: 1234 });

    const call = runner.calls[0]!;
    expect(call.sql).toContain('progress = COALESCE(progress');
    expect(call.sql).toContain('|| $2::jsonb');
    expect(call.params[0]).toBe('job-1');
    expect(call.params[1]).toBe(JSON.stringify([{ stage: 'L4', event: 'select', t_ms: 1234 }]));
    expect(call.params[2]).toBe('L4'); // stage scalar
  });

  it('completeJob sets done + stores the DTO as a json param', async () => {
    runner.on('UPDATE classification_jobs', () => ({ rows: [], rowCount: 1 }));
    const dto: ApiClassifyResponse = {
      responseType: 'refused',
      message: 'nope',
      reason: null,
    };
    await completeJob('job-1', dto);

    const call = runner.calls[0]!;
    expect(call.sql).toContain("SET status = 'done'");
    expect(call.sql).toContain('result = $2::jsonb');
    expect(call.sql).toContain('finished_at = now()');
    expect(call.params[0]).toBe('job-1');
    expect(call.params[1]).toBe(JSON.stringify(dto));
  });

  it('failJob sets failed + stores the error json param', async () => {
    runner.on('UPDATE classification_jobs', () => ({ rows: [], rowCount: 1 }));
    await failJob('job-1', { message: 'boom', retryable: true });

    const call = runner.calls[0]!;
    expect(call.sql).toContain("SET status = 'failed'");
    expect(call.sql).toContain('error = $2::jsonb');
    expect(call.params[1]).toBe(JSON.stringify({ message: 'boom', retryable: true }));
  });
});

describe('job-store — getJob', () => {
  it('returns the poll view shape with a live queue position while pending', async () => {
    runner
      .on('SELECT * FROM classification_jobs WHERE id = $1', () => ({
        rows: [makeRawRow({ id: 'job-1', status: 'queued', stage: 'L1', progress: [{ stage: 'L1', event: 'triage', t_ms: 5 }] })],
      }))
      .on('COUNT(*)', () => ({ rows: [{ ahead: 2 }] }));

    const view = await getJob('job-1');
    expect(view).not.toBeNull();
    expect(view!.id).toBe('job-1');
    expect(view!.status).toBe('queued');
    expect(view!.stage).toBe('L1');
    expect(view!.progress).toEqual([{ stage: 'L1', event: 'triage', t_ms: 5 }]);
    expect(view!.queue_position).toBe(2);
    expect(view!.result).toBeNull();
    expect(view!.error).toBeNull();
  });

  it('returns the result + error fields when present, queue position 0 when done', async () => {
    const dto: ApiClassifyResponse = { responseType: 'refused', message: 'm', reason: null };
    runner.on('SELECT * FROM classification_jobs WHERE id = $1', () => ({
      rows: [makeRawRow({ id: 'job-2', status: 'done', result: dto })],
    }));

    const view = await getJob('job-2');
    expect(view!.status).toBe('done');
    expect(view!.result).toEqual(dto);
    expect(view!.queue_position).toBe(0);
    // No COUNT(*) should be issued for a terminal job.
    expect(runner.calls.some((c) => c.sql.includes('COUNT(*)'))).toBe(false);
  });

  it('returns null when the id is unknown', async () => {
    runner.on('SELECT * FROM classification_jobs WHERE id = $1', () => ({ rows: [] }));
    const view = await getJob('does-not-exist');
    expect(view).toBeNull();
  });
});

describe('job-store — countQueuedAhead / sweepExpired', () => {
  it('countQueuedAhead counts pending rows created at-or-before the timestamp (parameterized)', async () => {
    runner.on('COUNT(*)', (sql, params) => {
      expect(sql).toContain("status IN ('queued','running')");
      expect(sql).toContain('created_at <= $1');
      expect(params[0]).toBe('2026-06-01T00:00:00.000Z');
      return { rows: [{ ahead: 7 }] };
    });
    const ahead = await countQueuedAhead('2026-06-01T00:00:00.000Z');
    expect(ahead).toBe(7);
  });

  it('sweepExpired deletes rows past expires_at and returns the count', async () => {
    runner.on('DELETE FROM classification_jobs', (sql) => {
      expect(sql).toContain('expires_at < now()');
      return { rows: [], rowCount: 4 };
    });
    const removed = await sweepExpired();
    expect(removed).toBe(4);
  });
});
