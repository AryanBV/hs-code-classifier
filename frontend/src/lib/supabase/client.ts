import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * Degrades gracefully: when the public env vars are absent (the current state),
 * `createClient()` returns `null` and `isSupabaseConfigured()` returns `false`.
 * Nothing throws at import time, so the app builds and renders with no env set.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

/**
 * Memoized so every caller (save, list, migrate, auth hook) shares ONE browser
 * client. `@supabase/ssr` already singletons internally in the browser, but a
 * module-level cache is the documented pattern and makes the shared, cookie-backed
 * session unambiguous: the client that holds the auth session is the same one
 * that dispatches the insert, so the request carries the JWT RLS needs.
 */
let cached: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  if (!url || !anonKey) {
    return null;
  }
  if (cached) return cached;
  cached = createBrowserClient(url, anonKey);
  return cached;
}
