/**
 * Cloud history-sync helpers (client-only).
 *
 * Every function here is FAIL-SAFE by contract: it is wrapped so that ANY error
 * — Supabase unconfigured, signed out, network failure, RLS rejection, malformed
 * row — resolves to a safe fallback (null / [] / no-op) and NEVER throws into the
 * UI. The guest localStorage flow (lib/history.ts) is the source of truth and is
 * never touched by a failure here; cloud sync is strictly additive best-effort.
 *
 * Maps the `public.classifications` table (snake_case, owner-RLS) to/from the
 * local `HistoryRecord` shape. The browser anon client is used; RLS scopes every
 * read to the signed-in user, and inserts carry the user's id explicitly.
 */
import type {
  Alternative,
  Citation,
  ClassificationComponent,
  ConfidenceBand,
} from "./types";
import { createClient } from "./supabase/client";
import { listHistory, type HistoryRecord } from "./history";

const TABLE = "classifications";

/** Shape of a `public.classifications` row as returned by the DB (snake_case). */
interface ClassificationRow {
  id: string;
  user_id: string;
  query: string | null;
  hs_code: string | null;
  is_six_digit: boolean | null;
  confidence_band: string | null;
  description: string | null;
  reasoning: string | null;
  alternatives: Alternative[] | null;
  citation: Citation | null;
  components: ClassificationComponent[] | null;
  export_policy: string | null;
  policy_condition: string | null;
  india_specific: boolean | null;
  created_at: string | null;
}

/** Insert payload (no id / created_at — DB defaults those). */
interface ClassificationInsert {
  user_id: string;
  query: string;
  hs_code: string;
  is_six_digit: boolean;
  confidence_band: ConfidenceBand;
  description: string;
  reasoning: string;
  alternatives: Alternative[];
  citation: Citation | null;
  components: ClassificationComponent[] | null;
  export_policy: string | null;
  policy_condition: string | null;
  india_specific: boolean;
}

function normalizeBand(band: string | null): ConfidenceBand {
  return band === "high" || band === "medium" || band === "low"
    ? band
    : "low";
}

/** Map a DB row -> the local HistoryRecord shape consumed by the UI. */
export function rowToRecord(row: ClassificationRow): HistoryRecord {
  const createdAt = row.created_at ? Date.parse(row.created_at) : NaN;
  return {
    id: row.id,
    query: row.query ?? "",
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    result: {
      responseType: "classification",
      hsCode: row.hs_code ?? "",
      isSixDigit: row.is_six_digit ?? false,
      confidenceBand: normalizeBand(row.confidence_band),
      description: row.description ?? "",
      reasoning: row.reasoning ?? "",
      alternatives: row.alternatives ?? [],
      citation: row.citation ?? (null as unknown as Citation),
      components: row.components ?? null,
      exportPolicy: row.export_policy,
      policyCondition: row.policy_condition,
      indiaSpecific: row.india_specific ?? false,
    },
  };
}

/** Build the insert payload (camel -> snake) for a local record + owner id. */
export function recordToRow(
  userId: string,
  rec: HistoryRecord,
): ClassificationInsert {
  const r = rec.result;
  return {
    user_id: userId,
    query: rec.query,
    hs_code: r.hsCode,
    is_six_digit: r.isSixDigit,
    confidence_band: r.confidenceBand,
    description: r.description,
    reasoning: r.reasoning,
    alternatives: r.alternatives ?? [],
    citation: r.citation ?? null,
    components: r.components ?? null,
    export_policy: r.exportPolicy,
    policy_condition: r.policyCondition,
    india_specific: r.indiaSpecific,
  };
}

/** Best-effort save of one classification to the cloud. Never throws. */
export async function saveClassification(rec: HistoryRecord): Promise<void> {
  try {
    const supabase = createClient();
    if (!supabase) return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return;

    await supabase.from(TABLE).insert(recordToRow(data.user.id, rec));
  } catch {
    /* fail-safe: cloud save is best-effort, never breaks the guest flow */
  }
}

/** The signed-in user's cloud records, newest first. Returns [] on any failure. */
export async function listAccountHistory(): Promise<HistoryRecord[]> {
  try {
    const supabase = createClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return (data as ClassificationRow[]).map(rowToRecord);
  } catch {
    return [];
  }
}

/**
 * One-time migration of guest (localStorage) records into the cloud on sign-in.
 *
 * Best-effort and idempotent: reads existing cloud (query, hs_code) pairs and
 * inserts only the local records not already present. Never throws, and never
 * clears localStorage (the guest records stay put so the local flow is unchanged).
 */
export async function migrateLocalHistory(): Promise<void> {
  try {
    const supabase = createClient();
    if (!supabase) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return;
    const userId = userData.user.id;

    const local = listHistory();
    if (local.length === 0) return;

    const { data: existing, error: existingError } = await supabase
      .from(TABLE)
      .select("query, hs_code");
    if (existingError) return;

    const present = new Set<string>(
      (existing ?? []).map(
        (row: { query: string | null; hs_code: string | null }) =>
          `${row.query ?? ""}::${row.hs_code ?? ""}`,
      ),
    );

    const toInsert = local
      .filter((rec) => !present.has(`${rec.query}::${rec.result.hsCode}`))
      .map((rec) => recordToRow(userId, rec));

    if (toInsert.length === 0) return;
    await supabase.from(TABLE).insert(toInsert);
  } catch {
    /* fail-safe: migration is best-effort, never breaks anything */
  }
}
