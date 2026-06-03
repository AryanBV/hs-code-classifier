import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Backend-for-frontend: persist one piece of result feedback.
 *
 * Writes to the live `public.feedback` table (migration 0001):
 *   id, classification_id (uuid fk, nullable), user_id (uuid fk, nullable),
 *   rating (text), comment (text), created_at.
 *
 * Mapping to that schema (the table has no query/hs_code columns):
 *   - rating  <- the verdict ("up" | "down" | "report")
 *   - comment <- the code under review + the user's optional note, so the
 *                query/hsCode association is preserved inside the row.
 *   - user_id <- the signed-in user's id (from the server Supabase client),
 *                left to the DB default (null) for guests.
 *
 * RLS: a SIGNED-IN insert is owner-only (auth.uid() = user_id); a GUEST insert
 * is allowed by the anon-guest policy when user_id IS NULL (so guest feedback now
 * persists). Either way this route fails SAFE: it returns a calm JSON status and
 * never throws, so the result view can show "couldn't save, try again" without
 * breaking.
 *
 * No new PII: we store only the query + code (already in the record) and the
 * optional note the user chose to write.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Verdict = "up" | "down" | "report";

const VERDICTS: ReadonlySet<string> = new Set<Verdict>(["up", "down", "report"]);
const NOTE_MAX = 500;
const QUERY_MAX = 1000;
const CODE_MAX = 32;

interface FeedbackBody {
  classificationId?: unknown;
  query?: unknown;
  hsCode?: unknown;
  verdict?: unknown;
  note?: unknown;
}

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asUuidOrNull(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const verdict = asString(body.verdict, 16);
  if (!VERDICTS.has(verdict)) {
    return NextResponse.json({ error: "Invalid verdict." }, { status: 400 });
  }

  const query = asString(body.query, QUERY_MAX);
  const hsCode = asString(body.hsCode, CODE_MAX);
  const note = asString(body.note, NOTE_MAX);
  const classificationId = asUuidOrNull(body.classificationId);

  // No DB configured: succeed silently so the UI is never blocked in local/dev.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ ok: true }, { status: 202 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Compose the comment so the row carries the code context the table has no
    // dedicated column for, plus the user's optional note.
    const context = `code=${hsCode || "n/a"} | query=${query || "n/a"}`;
    const comment = note ? `${context}\n${note}` : context;

    const { error } = await supabase.from("feedback").insert({
      classification_id: classificationId,
      user_id: user?.id ?? null,
      rating: verdict,
      comment,
    });

    if (error) {
      // Guest inserts are now ALLOWED by the anon-guest RLS policy (user_id IS
      // NULL), so an error here is no longer the expected "guests are rejected"
      // case — it is a genuine transient failure for guest and signed-in alike.
      // Surface it as a retryable 503 so the UI can offer a retry rather than
      // silently swallowing a failed save and thanking the user for nothing.
      return NextResponse.json({ error: "Could not save feedback." }, { status: 503 });
    }

    return NextResponse.json({ ok: true, saved: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save feedback." }, { status: 503 });
  }
}
