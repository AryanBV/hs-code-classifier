import { NextResponse } from "next/server";
import { mockClassify } from "@/lib/mock-data";
import { stripHiddenConfidence } from "@/lib/strip-confidence";
import { firstForwardedIp, verifyTurnstile } from "@/lib/turnstile-verify";

// Backend-for-frontend: keeps the real backend URL server-side; falls back to
// the deterministic mock so the UI runs with zero paid calls.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_API_URL;
const MOCK_DELAY = Number(process.env.MOCK_DELAY_MS ?? 2600);
const MAX_QUERY_LENGTH = 1000;

export async function POST(request: Request) {
  let body: { query?: string; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", retryable: false }, { status: 400 });
  }

  const query = (body.query ?? "").toString().trim();
  if (query.length < 2) {
    return NextResponse.json(
      { error: "Please describe your product.", retryable: false },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: "Product description is too long — please shorten it to under 1000 characters.",
        retryable: false,
      },
      { status: 400 },
    );
  }

  // Bot check. No-op (skipped) unless TURNSTILE_SECRET_KEY is set; only then is
  // a valid token required. The token is NEVER forwarded to the backend (the
  // proxied body is rebuilt as { query } below).
  const verification = await verifyTurnstile({
    token: body.turnstileToken,
    remoteip: firstForwardedIp(request.headers.get("x-forwarded-for")),
  });
  if (!verification.ok) {
    return NextResponse.json(
      { error: "Verification failed. Please try again.", retryable: false },
      { status: 403 },
    );
  }

  if (BACKEND) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        headers["x-internal-token"] = internalToken;
      }
      const res = await fetch(`${BACKEND}/api/classify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(90_000),
      });
      const data: unknown = await res.json();
      return NextResponse.json(stripHiddenConfidence(data), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Classification temporarily unavailable", retryable: true },
        { status: 503 },
      );
    }
  }

  await new Promise((r) => setTimeout(r, MOCK_DELAY));
  const outcome = mockClassify(query);
  return NextResponse.json(stripHiddenConfidence(outcome.body), {
    status: outcome.kind === "error" ? outcome.status : 200,
  });
}
