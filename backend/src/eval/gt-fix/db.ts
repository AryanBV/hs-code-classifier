// backend/src/eval/gt-fix/db.ts
// Self-contained DB helpers for the gt-fix tooling, targeting the post-migration
// normalized schema (tariff_lines / headings / chapters). The legacy `hs_codes`
// table was DROPPED, so the old `../../database/hs-codes.ts` helpers (which still
// query `hs_codes`) and OpenAI-embedding semantic search are no longer usable here.
//
// Candidate generation uses Postgres full-text search + ILIKE against
// tariff_lines descriptions (no external embedding API required).
//
// chapter = LEFT(code,2), heading = LEFT(code,4) for the 'NNNN.NN.NN' format.

import { Client } from 'pg';

export interface TariffRow {
  code: string;
  description: string;
  similarity?: number; // ts_rank score when produced by FTS search
}

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set (load backend/.env via dotenv before calling gt-fix DB helpers)');
  }
  client = new Client({ connectionString });
  await client.connect();
  return client;
}

export async function closeClient(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

export function stripDots(code: string): string {
  return code.replace(/\./g, '');
}

/** Derive 4-digit heading from a dotted or undotted code. */
export function heading4(code: string): string {
  return stripDots(code).substring(0, 4);
}

/** Derive 2-digit chapter from a dotted or undotted code. */
export function chapter2(code: string): string {
  return stripDots(code).substring(0, 2);
}

/** Look up a single 8-digit tariff line by exact code ('NNNN.NN.NN'). */
export async function getTariffLine(code: string): Promise<TariffRow | null> {
  const c = await getClient();
  const res = await c.query<TariffRow>(
    `SELECT code, description FROM tariff_lines WHERE code = $1 LIMIT 1`,
    [code]
  );
  return res.rows[0] ?? null;
}

/** Batch existence + description lookup for a set of codes. */
export async function getTariffLines(codes: string[]): Promise<Map<string, TariffRow>> {
  const map = new Map<string, TariffRow>();
  if (codes.length === 0) return map;
  const c = await getClient();
  const res = await c.query<TariffRow>(
    `SELECT code, description FROM tariff_lines WHERE code = ANY($1::text[])`,
    [codes]
  );
  for (const row of res.rows) map.set(row.code, row);
  return map;
}

/** All 8-digit tariff lines under a 4-digit heading prefix. */
export async function getCodesUnderHeading(heading: string): Promise<TariffRow[]> {
  const c = await getClient();
  const res = await c.query<TariffRow>(
    `SELECT code, description FROM tariff_lines WHERE LEFT(code, 4) = $1 ORDER BY code`,
    [heading]
  );
  return res.rows;
}

/**
 * Full-text candidate search within a 2-digit chapter (optionally any chapter when
 * chapter is null). Returns up to `limit` tariff lines ranked by ts_rank. Used as
 * the embedding-free replacement for the old pgvector semantic search.
 */
export async function searchTariffLines(
  query: string,
  chapter: string | null,
  limit: number = 10
): Promise<TariffRow[]> {
  const c = await getClient();
  const chapterClause = chapter ? `AND LEFT(code, 2) = $2` : '';
  const params: unknown[] = chapter ? [query, chapter, limit] : [query, limit];
  const limitParam = chapter ? '$3' : '$2';
  const sql = `
    SELECT code, description,
      ts_rank(
        to_tsvector('english', coalesce(fts_search_text, description)),
        plainto_tsquery('english', $1)
      ) AS similarity
    FROM tariff_lines
    WHERE to_tsvector('english', coalesce(fts_search_text, description)) @@ plainto_tsquery('english', $1)
      ${chapterClause}
    ORDER BY similarity DESC
    LIMIT ${limitParam}`;
  const res = await c.query<TariffRow>(sql, params);
  return res.rows.map((r) => ({ ...r, similarity: r.similarity != null ? Number(r.similarity) : undefined }));
}

/**
 * Full-text heading candidate search within a 2-digit chapter. Returns 4-digit
 * heading rows ranked by ts_rank. The `code` field holds the 4-digit heading.
 */
export async function searchHeadings(
  query: string,
  chapter: string,
  limit: number = 5
): Promise<TariffRow[]> {
  const c = await getClient();
  const res = await c.query<TariffRow>(
    `SELECT heading AS code, description,
       ts_rank(to_tsvector('english', description), plainto_tsquery('english', $1)) AS similarity
     FROM headings
     WHERE LEFT(heading, 2) = $2
       AND to_tsvector('english', description) @@ plainto_tsquery('english', $1)
     ORDER BY similarity DESC
     LIMIT $3`,
    [query, chapter, limit]
  );
  return res.rows.map((r) => ({ ...r, similarity: r.similarity != null ? Number(r.similarity) : undefined }));
}
