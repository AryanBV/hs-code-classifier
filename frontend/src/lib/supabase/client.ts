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

export function createClient(): SupabaseClient | null {
  if (!url || !anonKey) {
    return null;
  }
  return createBrowserClient(url, anonKey);
}
