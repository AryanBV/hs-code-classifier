import { NextResponse } from "next/server";
import { mockAnswer } from "@/lib/mock-data";
import { stripHiddenConfidence } from "@/lib/strip-confidence";
import type { AnswerRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_API_URL;
const MOCK_DELAY = Number(process.env.MOCK_DELAY_MS ?? 2200);
const MAX_QUERY_LENGTH = 1000;

export async function POST(request: Request) {
  let body: Partial<AnswerRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", retryable: false }, { status: 400 });
  }

  const { originalQuery, questionId, answerId } = body;
  if (!originalQuery || !questionId || !answerId) {
    return NextResponse.json(
      { error: "Missing required fields.", retryable: false, required: ["originalQuery", "questionId", "answerId"] },
      { status: 400 },
    );
  }
  if (originalQuery.trim().length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: "Product description is too long — please shorten it to under 1000 characters.",
        retryable: false,
      },
      { status: 400 },
    );
  }

  if (BACKEND) {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        headers["x-internal-token"] = internalToken;
      }
      const res = await fetch(`${BACKEND}/api/classify/answer`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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
  const outcome = mockAnswer(body as AnswerRequest);
  return NextResponse.json(stripHiddenConfidence(outcome.body), {
    status: outcome.kind === "error" ? outcome.status : 200,
  });
}
