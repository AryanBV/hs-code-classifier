import { NextResponse } from "next/server";
import { mockClassify } from "@/lib/mock-data";

// Backend-for-frontend: keeps the real backend URL server-side; falls back to
// the deterministic mock so the UI runs with zero paid calls.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_API_URL;
const MOCK_DELAY = Number(process.env.MOCK_DELAY_MS ?? 2600);

export async function POST(request: Request) {
  let body: { query?: string };
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

  if (BACKEND) {
    try {
      const res = await fetch(`${BACKEND}/api/classify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Classification temporarily unavailable", retryable: true },
        { status: 503 },
      );
    }
  }

  await new Promise((r) => setTimeout(r, MOCK_DELAY));
  const outcome = mockClassify(query);
  return NextResponse.json(outcome.body, {
    status: outcome.kind === "error" ? outcome.status : 200,
  });
}
