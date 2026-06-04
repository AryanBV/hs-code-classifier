/**
 * Reusable GoogleAuth client for Vertex AI calls (raw HTTPS path).
 *
 * Lazy-initializes a singleton GoogleAuth instance so we hit the SA JSON once
 * per process. `auth.getClient()` returns an AuthClient whose `.request(...)`
 * method auto-attaches the OAuth2 Bearer access token for the cloud-platform
 * scope.
 *
 * Auth source: `GOOGLE_APPLICATION_CREDENTIALS` env var (resolved by
 * google-auth-library) pointing at `backend/.gcp/vertex-sa.json`.
 *
 * Pattern mirrors `backend/scripts/verify-vertex-sa.ts` (the reference probe).
 */
import 'dotenv/config';
import { GoogleAuth, AuthClient } from 'google-auth-library';

let authSingleton: GoogleAuth | null = null;
let clientPromise: Promise<AuthClient> | null = null;

function getAuth(): GoogleAuth {
  if (!authSingleton) {
    // Credentials resolve via google-auth-library's Application Default
    // Credentials chain: a service-account JSON if GOOGLE_APPLICATION_CREDENTIALS
    // is set, OTHERWISE the local user ADC from `gcloud auth application-default
    // login`. Either works for the Vertex path; ADC (gcloud) is preferred for a
    // local eval run (no secret key file to manage). getClient() throws a clear
    // ADC error downstream if NEITHER source is available. (Production runs
    // LLM_PROVIDER=developer and never reaches this Vertex auth path.)
    authSingleton = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return authSingleton;
}

/**
 * Returns a cached GoogleAuth AuthClient. The client auto-refreshes Bearer
 * tokens; callers should `await getAuthClient()` once per request and call
 * `.request(...)` on the result.
 *
 * If the underlying `getClient()` rejects (e.g., bad SA JSON path), the cached
 * promise is reset to `null` BEFORE re-throwing so a subsequent call (after
 * env fix) gets a fresh attempt rather than re-throwing the cached rejection.
 */
export async function getAuthClient(): Promise<AuthClient> {
  if (!clientPromise) {
    clientPromise = getAuth().getClient().catch((err: unknown) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Resolves the GCP project ID. Prefers `GOOGLE_CLOUD_PROJECT` env var; falls
 * back to reading `project_id` from the SA JSON pointed at by
 * `GOOGLE_APPLICATION_CREDENTIALS`. Throws if neither is resolvable.
 */
let cachedProjectId: string | null = null;
export async function getProjectId(): Promise<string> {
  if (cachedProjectId) return cachedProjectId;
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    cachedProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    return cachedProjectId;
  }
  const resolved = await getAuth().getProjectId();
  if (!resolved) {
    throw new Error(
      'classifier-v2/auth: unable to resolve GCP project ID. Set GOOGLE_CLOUD_PROJECT or ensure the SA JSON contains project_id.',
    );
  }
  cachedProjectId = resolved;
  return cachedProjectId;
}
