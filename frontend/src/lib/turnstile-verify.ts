/**
 * Server-side Cloudflare Turnstile verification for the BFF routes.
 *
 * THE NO-OP INVARIANT (verified hard by review):
 * When `TURNSTILE_SECRET_KEY` is UNSET or empty, `verifyTurnstile` returns
 * `{ ok: true }` WITHOUT reading the token, calling Cloudflare, or otherwise
 * touching the request — verification is skipped entirely. Only when the secret
 * IS set does a missing/invalid token produce `{ ok: false }`, which the routes
 * translate into a 403. The token is never forwarded to the backend (the routes
 * strip it from the proxied body).
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** How long to wait on Cloudflare's siteverify before failing closed. */
const VERIFY_TIMEOUT_MS = 10_000;

export type TurnstileVerifyResult = { ok: true } | { ok: false };

interface SiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * The first hop of an `x-forwarded-for` chain, when present — the client IP as
 * Cloudflare expects it for `remoteip`. Absent/blank → undefined (omitted).
 */
export function firstForwardedIp(forwardedFor: string | null): string | undefined {
  if (!forwardedFor) return undefined;
  const first = forwardedFor.split(",")[0]?.trim();
  return first ? first : undefined;
}

/**
 * Verify a Turnstile token against Cloudflare. No-op (returns ok) when the
 * secret is unset/empty. Fails closed (`ok:false`) on a missing token or any
 * verification failure/network error while the secret is set.
 */
export async function verifyTurnstile(args: {
  token: unknown;
  remoteip?: string;
}): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // No secret configured → skip entirely. This is the deploy-safe default.
  if (!secret) return { ok: true };

  // Secret is set, so a token is required and must be a non-empty string.
  if (typeof args.token !== "string" || args.token.length === 0) {
    return { ok: false };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", args.token);
  if (args.remoteip) form.set("remoteip", args.remoteip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as SiteVerifyResponse;
    return data.success === true ? { ok: true } : { ok: false };
  } catch {
    // Network error / timeout while verification is REQUIRED → fail closed.
    return { ok: false };
  }
}
