/**
 * Unit tests for source-ref grammar parser + DB resolver.
 *
 * Spec: sub-spec 01 §"Rule 3" grammar block.
 * Run: cd backend && npx vitest run src/classifier-v2/lib/source-ref-resolver.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveSourceRef, _internal } from './source-ref-resolver';
import type { QueryRunner } from './supabase-client';

/* ---------------------------------------------------------------------------
 * Mock runner factory
 * --------------------------------------------------------------------------- */

interface MockQueryRecord {
  text:   string;
  params: unknown[];
}

function mockRunner(rowsBySQL: Record<string, unknown[]>): {
  runner: QueryRunner;
  calls:  MockQueryRecord[];
} {
  const calls: MockQueryRecord[] = [];
  const runner: QueryRunner = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params: params ?? [] });
      // Match by substring (the test sets keys = SQL fragments).
      for (const [pattern, rows] of Object.entries(rowsBySQL)) {
        if (text.includes(pattern)) {
          return { rows, rowCount: rows.length } as unknown as ReturnType<QueryRunner['query']> extends Promise<infer R> ? R : never;
        }
      }
      return { rows: [], rowCount: 0 } as unknown as ReturnType<QueryRunner['query']> extends Promise<infer R> ? R : never;
    }) as unknown as QueryRunner['query'],
  };
  return { runner, calls };
}

/* ===========================================================================
 * Grammar parser
 * =========================================================================== */

describe('source-ref-resolver — grammar', () => {
  const RE = _internal.SOURCE_REF_RE;

  it('parses canonical chapters.notes:chapter=72:notes[0].text', () => {
    const m = RE.exec('chapters.notes:chapter=72:notes[0].text');
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('chapters.notes');
    expect(m?.[2]).toBe('chapter');
    expect(m?.[3]).toBe('72');
    expect(m?.[4]).toBe('notes[0].text');
  });
  it('parses sections.notes:section=XVI:notes[1].text', () => {
    const m = RE.exec('sections.notes:section=XVI:notes[1].text');
    expect(m?.[1]).toBe('sections.notes');
    expect(m?.[3]).toBe('XVI');
  });
  it('parses chapter_exclusions:id=842:source_note_text', () => {
    const m = RE.exec('chapter_exclusions:id=842:source_note_text');
    expect(m?.[1]).toBe('chapter_exclusions');
    expect(m?.[2]).toBe('id');
    expect(m?.[3]).toBe('842');
    expect(m?.[4]).toBe('source_note_text');
  });
  it('parses tariff_lines:code=7318.15.00:description', () => {
    const m = RE.exec('tariff_lines:code=7318.15.00:description');
    expect(m?.[3]).toBe('7318.15.00');
    expect(m?.[4]).toBe('description');
  });
  it('parses without trailing json_path (2 segments)', () => {
    const m = RE.exec('tariff_lines:code=7318.15.00');
    expect(m?.[4]).toBeUndefined();
  });
  it('rejects malformed source_ref (missing colons)', () => {
    expect(RE.exec('garbage')).toBeNull();
    expect(RE.exec('chapters.notes')).toBeNull();
    expect(RE.exec('chapters.notes:chapter')).toBeNull();
  });
  it('rejects malformed source_ref (uppercase key column)', () => {
    expect(RE.exec('chapters.notes:CHAPTER=72:notes[0].text')).toBeNull();
  });
});

/* ===========================================================================
 * JSON path tokenizer + traversal
 * =========================================================================== */

describe('source-ref-resolver — json path tokenize', () => {
  it('tokenizes notes[0].text', () => {
    const t = _internal.tokenizeJsonPath('notes[0].text');
    expect(t).toEqual([
      { kind: 'key', key: 'notes' },
      { kind: 'index', index: 0 },
      { kind: 'key', key: 'text' },
    ]);
  });
  it('tokenizes notes[5]', () => {
    expect(_internal.tokenizeJsonPath('notes[5]')).toEqual([
      { kind: 'key', key: 'notes' },
      { kind: 'index', index: 5 },
    ]);
  });
  it('tokenizes description (single key)', () => {
    expect(_internal.tokenizeJsonPath('description')).toEqual([
      { kind: 'key', key: 'description' },
    ]);
  });
  it('returns null on malformed path (unclosed bracket)', () => {
    expect(_internal.tokenizeJsonPath('notes[0')).toBeNull();
  });
});

/* ===========================================================================
 * Full resolution against DB-mock
 * =========================================================================== */

describe('source-ref-resolver — DB lookup', () => {
  it('resolves chapters.notes:chapter=72:notes[0].text → notes[0].text text', async () => {
    const { runner } = mockRunner({
      'SELECT notes FROM chapters': [
        { notes: [{ number: '1', text: 'Iron and steel notes paragraph.' }] },
      ],
    });
    const r = await resolveSourceRef('chapters.notes:chapter=72:notes[0].text', runner);
    expect(r.parsed_ok).toBe(true);
    expect(r.table).toBe('chapters.notes');
    expect(r.resolved_text).toBe('Iron and steel notes paragraph.');
  });

  it('resolves sections.notes:section=XVI:notes[1].text', async () => {
    const { runner } = mockRunner({
      'SELECT notes FROM sections': [
        { notes: [
          { number: '1', text: 'Section XVI Note 1.' },
          { number: '2', text: 'Parts and accessories.' },
        ] },
      ],
    });
    const r = await resolveSourceRef('sections.notes:section=XVI:notes[1].text', runner);
    expect(r.resolved_text).toBe('Parts and accessories.');
  });

  it('resolves chapter_exclusions:id=842:source_note_text', async () => {
    const { runner } = mockRunner({
      'FROM chapter_exclusions': [{ val: 'Articles of plastic are excluded.' }],
    });
    const r = await resolveSourceRef('chapter_exclusions:id=842:source_note_text', runner);
    expect(r.resolved_text).toBe('Articles of plastic are excluded.');
  });

  it('resolves tariff_lines:code=7318.15.00:description', async () => {
    const { runner } = mockRunner({
      'FROM tariff_lines': [{ val: 'Other screws, bolts and nuts.' }],
    });
    const r = await resolveSourceRef('tariff_lines:code=7318.15.00:description', runner);
    expect(r.resolved_text).toBe('Other screws, bolts and nuts.');
  });

  it('resolves subheadings:subheading=7318.15:description', async () => {
    const { runner } = mockRunner({
      'FROM subheadings': [{ val: 'Other screws and bolts.' }],
    });
    const r = await resolveSourceRef('subheadings:subheading=7318.15:description', runner);
    expect(r.resolved_text).toBe('Other screws and bolts.');
  });

  it('resolves headings:heading=7318:description', async () => {
    const { runner } = mockRunner({
      'FROM headings': [{ val: 'Screws, bolts, nuts ... of iron or steel.' }],
    });
    const r = await resolveSourceRef('headings:heading=7318:description', runner);
    expect(r.resolved_text).toBe('Screws, bolts, nuts ... of iron or steel.');
  });

  it('returns resolved_text=null when row not found', async () => {
    const { runner } = mockRunner({});
    const r = await resolveSourceRef('chapters.notes:chapter=99:notes[0].text', runner);
    expect(r.parsed_ok).toBe(true);
    expect(r.resolved_text).toBeNull();
  });

  it('returns parsed_ok=false on malformed source_ref', async () => {
    const { runner } = mockRunner({});
    const r = await resolveSourceRef('not-a-valid-ref', runner);
    expect(r.parsed_ok).toBe(false);
    expect(r.resolved_text).toBeNull();
  });

  it('returns resolved_text=null when json_path traversal goes out of bounds', async () => {
    const { runner } = mockRunner({
      'SELECT notes FROM chapters': [
        { notes: [{ number: '1', text: 'Only one note here.' }] },
      ],
    });
    const r = await resolveSourceRef('chapters.notes:chapter=72:notes[9].text', runner);
    expect(r.resolved_text).toBeNull();
  });

  it('unknown table → resolved_text null', async () => {
    const { runner } = mockRunner({});
    const r = await resolveSourceRef('mystery_table:k=v:desc', runner);
    expect(r.parsed_ok).toBe(true);
    expect(r.resolved_text).toBeNull();
  });

  it('whitelists tariff_lines columns — rejects arbitrary column name', async () => {
    const { runner } = mockRunner({
      'FROM tariff_lines': [{ val: 'should not be returned' }],
    });
    const r = await resolveSourceRef('tariff_lines:code=7318.15.00:embedding', runner);
    expect(r.resolved_text).toBeNull();
  });
});
