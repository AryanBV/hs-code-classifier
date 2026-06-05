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
    const scopes = ['https://www.googleapis.com/auth/cloud-platform'];
    // Credential resolution, in order:
    //  1. GOOGLE_APPLICATION_CREDENTIALS_JSON — the service-account key JSON
    //     supplied INLINE as an env var (no file on disk). This is how PRODUCTION
    //     (Railway) authenticates to Vertex: the SA key lives only in the platform
    //     env, never on disk or in git.
    //  2. else google-auth-library's ADC chain: a SA JSON file at
    //     GOOGLE_APPLICATION_CREDENTIALS if set, OTHERWISE the local user ADC from
    //     `gcloud auth application-default login` (the local-eval path).
    //     getClient() throws a clear ADC error downstream if none exist.
    // Only reached when LLM/EMBEDDING_PROVIDER=vertex; the developer-API path
    // never calls this.
    const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (inlineJson && inlineJson.trim() !== '') {
      authSingleton = new GoogleAuth({
        credentials: JSON.parse(inlineJson) as Record<string, unknown>,
        scopes,
      });
    } else {
      authSingleton = new GoogleAuth({ scopes });
    }
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
