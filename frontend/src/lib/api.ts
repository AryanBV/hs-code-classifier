import { ClassifyError } from "./types";
import type { AnswerRequest, ClassifyResult, UiClassification, WireResponse } from "./types";

/**
 * Strip the hidden numeric signals (`confidence`, `confidenceP`, `selfConfidence`)
 * so components physically cannot render the percentage. Components only ever
 * see the band.
 */
function toUi(w: WireResponse): ClassifyResult {
  if (w.responseType === "classification") {
    const { confidence: _c, confidenceP: _p, selfConfidence: _s, ...rest } = w;
    void _c;
    void _p;
    void _s;
    return rest as UiClassification;
  }
  return w;
}

async function post(url: string, payload: unknown): Promise<ClassifyResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ClassifyError(
      "We could not reach the classifier. Check your connection and try again.",
      "network",
      true,
    );
  }

  if (res.ok) {
    const data = (await res.json()) as WireResponse;
    return toUi(data);
  }

  const err = (await res.json().catch(() => null)) as
    | { error?: string; retryable?: boolean }
    | null;

  if (res.status === 503) {
    const retryable = err?.retryable !== false;
    throw new ClassifyError(
      err?.error ?? "Classification temporarily unavailable",
      retryable ? "transient" : "daily_limit",
      retryable,
    );
  }
  if (res.status === 400) {
    throw new ClassifyError(err?.error ?? "Please describe your product.", "bad_request", false);
  }
  throw new ClassifyError(err?.error ?? "Something went wrong.", "transient", true);
}

export function classify(query: string): Promise<ClassifyResult> {
  return post("/api/classify", { query });
}

export function answer(req: AnswerRequest): Promise<ClassifyResult> {
  return post("/api/classify/answer", req);
}
