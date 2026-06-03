import { ClassifyError } from "./types";
import type { AnswerRequest, ClassifyResult, UiClassification, WireResponse } from "./types";

/**
 * A classification that ran too long and was given up on. It is a kind of
 * transient error (retrying is reasonable), so it extends ClassifyError with
 * `kind: "transient"` to keep the base error shape 100% compatible with every
 * existing consumer. Callers that want to treat a timeout distinctly check
 * `instanceof ClassifyTimeoutError` (additive, no change to the ClassifyError
 * union). The classify run can take up to ~a minute; only a genuinely hung
 * request past the ceiling surfaces here.
 */
export class ClassifyTimeoutError extends ClassifyError {
  constructor(
    message = "This classification is taking longer than expected.",
  ) {
    super(message, "transient", true);
    this.name = "ClassifyTimeoutError";
  }
}

/**
 * How long the client waits before giving up on a single request. The
 * server-side BFF route already aborts upstream at ~90s; this client ceiling
 * sits just past it so a wholly hung chain still resolves into a timeout the
 * UI can speak to, rather than spinning forever.
 */
const REQUEST_TIMEOUT_MS = 95_000;

/** Heuristic: a server 503 whose message reads like an upstream timeout. */
function looksLikeTimeout(message: string | undefined): boolean {
  if (!message) return false;
  return /\b(timed?\s*out|timeout|took too long|deadline)\b/i.test(message);
}

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    // An abort from our own timeout means the run never came back in time.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ClassifyTimeoutError();
    }
    throw new ClassifyError(
      "We could not reach the classifier. Check your connection and try again.",
      "network",
      true,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.ok) {
    const data = (await res.json()) as WireResponse;
    return toUi(data);
  }

  const errBody = (await res.json().catch(() => null)) as
    | { error?: string; retryable?: boolean }
    | null;

  if (res.status === 503) {
    const retryable = errBody?.retryable !== false;
    // A retryable 503 whose message reads like an upstream timeout is surfaced
    // as a timeout so the UI can say so honestly rather than "interrupted".
    if (retryable && looksLikeTimeout(errBody?.error)) {
      throw new ClassifyTimeoutError(
        errBody?.error ?? "This classification took longer than expected.",
      );
    }
    throw new ClassifyError(
      errBody?.error ?? "Classification temporarily unavailable",
      retryable ? "transient" : "daily_limit",
      retryable,
    );
  }
  if (res.status === 400) {
    throw new ClassifyError(errBody?.error ?? "Please describe your product.", "bad_request", false);
  }
  throw new ClassifyError(errBody?.error ?? "Something went wrong.", "transient", true);
}

/**
 * Attach a Turnstile token to the request body ONLY when one was issued. When
 * `token` is null/undefined (the disabled no-op state, or a skipped check) the
 * returned body is byte-for-byte identical to the original — the key is never
 * added — so the wire payload is unchanged from before Turnstile existed.
 */
function withTurnstile<T extends object>(
  body: T,
  token: string | null | undefined,
): T | (T & { turnstileToken: string }) {
  if (!token) return body;
  return { ...body, turnstileToken: token };
}

export function classify(
  query: string,
  turnstileToken?: string | null,
): Promise<ClassifyResult> {
  return post("/api/classify", withTurnstile({ query }, turnstileToken));
}

export function answer(
  req: AnswerRequest,
  turnstileToken?: string | null,
): Promise<ClassifyResult> {
  return post("/api/classify/answer", withTurnstile(req, turnstileToken));
}
