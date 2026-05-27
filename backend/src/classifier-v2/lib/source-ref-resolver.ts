/**
 * Source-ref grammar parser + resolver for L5 Verifier Rule 3.
 *
 * Grammar (locked in sub-spec 01 §"Rule 3"):
 *
 *   <source_ref> ::= <table>:<key_column>=<key_value>[:<json_path>]
 *
 *   <table>      ::= [a-z_.]+        (e.g., "chapters.notes", "tariff_lines")
 *   <key_column> ::= [a-z_]+         (e.g., "chapter", "section", "id", "code")
 *   <key_value>  ::= [\w.]+          (e.g., "72", "XVI", "842", "7318.15.00")
 *   <json_path>  ::= [\w\[\].]+      (e.g., "notes[0].text", "description")
 *
 * Examples (from sub-spec 01 table):
 *   chapters.notes:chapter=72:notes[0].text
 *   sections.notes:section=XVI:notes[1].text
 *   chapter_exclusions:id=842:source_note_text
 *   tariff_lines:code=7318.15.00:description
 *   subheadings:subheading=7318.15:title (informational — verifier rarely cites)
 *   headings:heading=7318:title         (informational — verifier rarely cites)
 *
 * On malformed source_ref → returns `{resolved_text: null, ...}` so Rule 3 can
 * emit `MALFORMED_SOURCE_REF`.
 *
 * Spec references:
 *   - backend/docs/sub-specs/01-verifier-rules.md §"Rule 3"
 *   - backend/src/classifier-v2/lib/supabase-client.ts (QueryRunner interface)
 */
import type { QueryRunner } from './supabase-client';

/* ---------------------------------------------------------------------------
 * Public type
 * --------------------------------------------------------------------------- */

export interface ResolvedSourceRef {
  /** Raw source_ref string supplied by the caller. */
  raw:           string;
  /** True when the regex parse succeeded; false → malformed. */
  parsed_ok:     boolean;
  /** Table segment (everything before the first ':'). */
  table:         string;
  /** Key column (between first ':' and '='). */
  key_column:    string;
  /** Key value (between '=' and second ':'). */
  key_value:     string;
  /** JSON path segment (after second ':'); null when source_ref had only 2 segments. */
  json_path:     string | null;
  /** DB-resolved text after json_path traversal; null when row not found / path absent. */
  resolved_text: string | null;
}

/* ---------------------------------------------------------------------------
 * Grammar (sub-spec 01 §"Rule 3" — locked 2026-05-26)
 *
 *   Table segment allows '.' so we can express "chapters.notes" as a logical
 *   pointer; column key remains alphanumeric+underscore only.
 * --------------------------------------------------------------------------- */

const SOURCE_REF_RE = /^([a-z_.]+):([a-z_]+)=([\w.]+)(?::([\w[\].]+))?$/;

/* ---------------------------------------------------------------------------
 * JSON path traversal — supports "notes[0].text" / "notes[1]" / "description".
 *
 * We only need a tiny subset: an alpha key, optional [N] index, optional
 * dotted suffix (".text"). Tokens are extracted greedily.
 * --------------------------------------------------------------------------- */

type PathToken =
  | { kind: 'key';   key:   string }
  | { kind: 'index'; index: number };

function tokenizeJsonPath(jsonPath: string): PathToken[] | null {
  const tokens: PathToken[] = [];
  let i = 0;
  while (i < jsonPath.length) {
    // Key (alphanumeric + underscore)
    if (/[A-Za-z_]/.test(jsonPath[i] as string)) {
      let j = i;
      while (j < jsonPath.length && /[A-Za-z0-9_]/.test(jsonPath[j] as string)) j++;
      tokens.push({ kind: 'key', key: jsonPath.slice(i, j) });
      i = j;
      continue;
    }
    // Index: [N]
    if (jsonPath[i] === '[') {
      const close = jsonPath.indexOf(']', i);
      if (close < 0) return null;
      const numStr = jsonPath.slice(i + 1, close);
      const num = Number.parseInt(numStr, 10);
      if (!Number.isFinite(num) || numStr.length === 0) return null;
      tokens.push({ kind: 'index', index: num });
      i = close + 1;
      continue;
    }
    // Separator: '.'
    if (jsonPath[i] === '.') {
      i += 1;
      continue;
    }
    // Anything else is an error.
    return null;
  }
  return tokens;
}

function traverseJson(root: unknown, tokens: PathToken[]): string | null {
  let cur: unknown = root;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return null;
    if (t.kind === 'key') {
      if (typeof cur !== 'object' || Array.isArray(cur)) return null;
      const rec = cur as Record<string, unknown>;
      if (!(t.key in rec)) return null;
      cur = rec[t.key];
    } else {
      if (!Array.isArray(cur)) return null;
      if (t.index < 0 || t.index >= cur.length) return null;
      cur = cur[t.index];
    }
  }
  if (cur === null || cur === undefined) return null;
  if (typeof cur === 'string') return cur;
  // Some notes structures store the text directly under the index (no
  // ".text"). Be lenient: if final node is an object with a .text field,
  // return that.
  if (typeof cur === 'object' && !Array.isArray(cur)) {
    const rec = cur as Record<string, unknown>;
    if (typeof rec.text === 'string') return rec.text;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Lookup dispatch
 *
 * One entry per table the verifier may need to cite. Each entry produces the
 * SQL + parameters to fetch the row, plus a `extract(row, json_path)` step
 * applied to the result.
 * --------------------------------------------------------------------------- */

interface LookupResult {
  resolved_text: string | null;
}

async function lookupChaptersNotes(
  runner:    QueryRunner,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  const res = await runner.query<{ notes: unknown }>(
    'SELECT notes FROM chapters WHERE chapter = $1',
    [keyValue],
  );
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  const notes = firstRow.notes;
  if (jsonPath === null) {
    // Whole-notes citation without a path — emit JSON-stringified for fallback.
    return { resolved_text: notes === null ? null : JSON.stringify(notes) };
  }
  const tokens = tokenizeJsonPath(jsonPath);
  if (tokens === null) return { resolved_text: null };
  // Root object has shape { notes, ... } at the row level, but `notes` is the
  // JSONB we already extracted. The path "notes[0].text" therefore traverses
  // root.notes[0].text — so we wrap notes back into a dummy parent:
  const rootForPath: Record<string, unknown> = { notes };
  const text = traverseJson(rootForPath, tokens);
  return { resolved_text: text };
}

async function lookupSectionsNotes(
  runner:    QueryRunner,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  const res = await runner.query<{ notes: unknown }>(
    'SELECT notes FROM sections WHERE section = $1',
    [keyValue],
  );
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  const notes = firstRow.notes;
  if (jsonPath === null) {
    return { resolved_text: notes === null ? null : JSON.stringify(notes) };
  }
  const tokens = tokenizeJsonPath(jsonPath);
  if (tokens === null) return { resolved_text: null };
  const rootForPath: Record<string, unknown> = { notes };
  return { resolved_text: traverseJson(rootForPath, tokens) };
}

async function lookupChapterExclusions(
  runner:    QueryRunner,
  keyColumn: string,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  if (keyColumn !== 'id') return { resolved_text: null };
  const idNum = Number.parseInt(keyValue, 10);
  if (!Number.isFinite(idNum)) return { resolved_text: null };

  // Default to source_note_text (the canonical citation column). The
  // sub-spec 01 grammar permits other column names via json_path-as-column,
  // but the locked grammar only enumerates source_note_text — we honour that.
  const column = jsonPath ?? 'source_note_text';
  // Whitelist columns to avoid SQL-injection via unbound identifier.
  const allowed = new Set(['source_note_text', 'excluded_product_text']);
  if (!allowed.has(column)) return { resolved_text: null };
  const sql = `SELECT ${column} AS val FROM chapter_exclusions WHERE id = $1`;
  const res = await runner.query<{ val: string | null }>(sql, [idNum]);
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  return { resolved_text: firstRow.val ?? null };
}

async function lookupTariffLines(
  runner:    QueryRunner,
  keyColumn: string,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  if (keyColumn !== 'code') return { resolved_text: null };
  const column = jsonPath ?? 'description';
  const allowed = new Set(['description', 'policy_condition', 'export_policy']);
  if (!allowed.has(column)) return { resolved_text: null };
  const sql = `SELECT ${column} AS val FROM tariff_lines WHERE code = $1`;
  const res = await runner.query<{ val: string | null }>(sql, [keyValue]);
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  return { resolved_text: firstRow.val ?? null };
}

async function lookupSubheadings(
  runner:    QueryRunner,
  keyColumn: string,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  if (keyColumn !== 'subheading') return { resolved_text: null };
  const column = jsonPath ?? 'description';
  const allowed = new Set(['description', 'india_specific_note']);
  if (!allowed.has(column)) return { resolved_text: null };
  const sql = `SELECT ${column} AS val FROM subheadings WHERE subheading = $1`;
  const res = await runner.query<{ val: string | null }>(sql, [keyValue]);
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  return { resolved_text: firstRow.val ?? null };
}

async function lookupHeadings(
  runner:    QueryRunner,
  keyColumn: string,
  keyValue:  string,
  jsonPath:  string | null,
): Promise<LookupResult> {
  if (keyColumn !== 'heading') return { resolved_text: null };
  const column = jsonPath ?? 'description';
  const allowed = new Set(['description']);
  if (!allowed.has(column)) return { resolved_text: null };
  const sql = `SELECT ${column} AS val FROM headings WHERE heading = $1`;
  const res = await runner.query<{ val: string | null }>(sql, [keyValue]);
  if (res.rows.length === 0) return { resolved_text: null };
  const firstRow = res.rows[0];
  if (firstRow === undefined) return { resolved_text: null };
  return { resolved_text: firstRow.val ?? null };
}

/* ---------------------------------------------------------------------------
 * Public entry point
 * --------------------------------------------------------------------------- */

/**
 * Parse a source_ref string and fetch the cited text from the DB.
 *
 * The verifier's Rule 3 calls this and then passes `resolved_text` to the
 * TF-IDF similarity check. A null result is propagated as a "MALFORMED_SOURCE_REF"
 * or "CITATION_SOURCE_NOT_FOUND" depending on `parsed_ok`.
 */
export async function resolveSourceRef(
  sourceRef: string,
  runner:    QueryRunner,
): Promise<ResolvedSourceRef> {
  const match = SOURCE_REF_RE.exec(sourceRef);
  if (!match) {
    return {
      raw:           sourceRef,
      parsed_ok:     false,
      table:         '',
      key_column:    '',
      key_value:     '',
      json_path:     null,
      resolved_text: null,
    };
  }
  const [, table, keyColumn, keyValue, jsonPathRaw] = match;
  const jsonPath = jsonPathRaw ?? null;

  // Dispatch on table.
  let result: LookupResult = { resolved_text: null };
  if (table === 'chapters.notes' || table === 'chapters') {
    result = await lookupChaptersNotes(runner, keyValue as string, jsonPath);
  } else if (table === 'sections.notes' || table === 'sections') {
    result = await lookupSectionsNotes(runner, keyValue as string, jsonPath);
  } else if (table === 'chapter_exclusions') {
    result = await lookupChapterExclusions(runner, keyColumn as string, keyValue as string, jsonPath);
  } else if (table === 'tariff_lines') {
    result = await lookupTariffLines(runner, keyColumn as string, keyValue as string, jsonPath);
  } else if (table === 'subheadings') {
    result = await lookupSubheadings(runner, keyColumn as string, keyValue as string, jsonPath);
  } else if (table === 'headings') {
    result = await lookupHeadings(runner, keyColumn as string, keyValue as string, jsonPath);
  } else {
    // Unknown table — treat as not-found; Rule 3 emits CITATION_SOURCE_NOT_FOUND.
    result = { resolved_text: null };
  }

  return {
    raw:           sourceRef,
    parsed_ok:     true,
    table:         table as string,
    key_column:    keyColumn as string,
    key_value:     keyValue as string,
    json_path:     jsonPath,
    resolved_text: result.resolved_text,
  };
}

/* ---------------------------------------------------------------------------
 * Test-only exports
 * --------------------------------------------------------------------------- */

export const _internal = {
  SOURCE_REF_RE,
  tokenizeJsonPath,
  traverseJson,
};
