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

/**
 * Insert payload. We send the LOCAL record id explicitly so the cloud row shares
 * the local record's id; this keeps `/r/{id}` resolvable from the cloud on any
 * device (cross-device id-consistency). `created_at` is still DB-defaulted.
 */
interface ClassificationInsert {
  id?: string;
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

/**
 * The `classifications.id` column is a uuid PRIMARY KEY. Local record ids are
 * normally `crypto.randomUUID()`, but lib/history.ts has a legacy `r_…` fallback
 * for environments without `crypto.randomUUID`. Sending a non-uuid id would fail
 * the uuid cast and (silently, via the fail-safe) drop the row, so we only carry
 * the id through when it is a valid uuid and otherwise let the DB mint one.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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
    // Same id as the local HistoryRecord, so the cloud row is addressable by the
    // exact same /r/{id} on every device (id-consistency). recordToRow is the
    // single insert builder, so this covers both the live save and migration.
    // Guarded: a legacy non-uuid local id is omitted so the DB mints one rather
    // than failing the uuid cast and silently dropping the row.
    ...(isUuid(rec.id) ? { id: rec.id } : {}),
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

/**
 * Best-effort save of one classification to the cloud. Never throws.
 *
 * Robust against the immediate post-save navigation (`router.replace("/r/…")`):
 * the owner id is read from the LOCAL session via `getSession()` (no network
 * round-trip) instead of `getUser()` (which revalidates against the auth server
 * and was the slow hop most likely to be cut off mid-navigation). RLS still
 * enforces `auth.uid() = user_id` server-side from the JWT, so security is
 * unchanged; the insert simply has a real chance to dispatch before unmount.
 */
export async function saveClassification(rec: HistoryRecord): Promise<void> {
  try {
    const supabase = createClient();
    if (!supabase) return;

    const { data, error } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (error || !userId) return;

    // Upsert (not insert) keyed on the id so a re-save of the same record — same
    // id, e.g. the save effect re-running, or a record already migrated — is a
    // clean no-op instead of a primary-key error that the fail-safe would hide.
    // RLS still enforces auth.uid() = user_id from the JWT on the write.
    await supabase
      .from(TABLE)
      .upsert(recordToRow(userId, rec), { onConflict: "id", ignoreDuplicates: true });
  } catch {
    /* fail-safe: cloud save is best-effort, never breaks the guest flow */
  }
}

/**
 * One cloud record by id for the signed-in owner. Returns null on any failure
 * (unconfigured / signed out / not found / RLS). Lets `/r/{id}` resolve from the
 * cloud on a device where the local copy is absent (e.g. after logout cleared
 * local, or a second device) — possible because the cloud row carries the SAME
 * id as the local record. RLS still scopes this to the owner.
 */
export async function getAccountRecord(id: string): Promise<HistoryRecord | null> {
  try {
    const supabase = createClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    return rowToRecord(data as ClassificationRow);
  } catch {
    return null;
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
    // Upsert keyed on id so re-running migration (or a record whose id already
    // exists in the cloud) never trips the primary-key constraint.
    await supabase
      .from(TABLE)
      .upsert(toInsert, { onConflict: "id", ignoreDuplicates: true });
  } catch {
    /* fail-safe: migration is best-effort, never breaks anything */
  }
}
