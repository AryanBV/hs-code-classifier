/**
 * Server-side enforcement of the band-only honesty rule. The hidden numeric
 * signals (`confidence`, `confidenceP`, `selfConfidence`) must NEVER reach the
 * browser — not even in the Network tab. The BFF routes call this on every
 * upstream/mock body before returning it, so the numbers are stripped on the
 * wire. `lib/api.ts` strips them again defensively client-side; both stand.
 *
 * Only `responseType: "classification"` bodies carry these keys; question and
 * refused bodies are returned untouched, as are non-object/error envelopes.
 */
export function stripHiddenConfidence(body: unknown): unknown {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { responseType?: unknown }).responseType !== "classification"
  ) {
    return body;
  }
  const { confidence: _c, confidenceP: _p, selfConfidence: _s, ...rest } = body as Record<
    string,
    unknown
  >;
  void _c;
  void _p;
  void _s;
  return rest;
}
