import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 *
 * Next 16: `cookies()` is async and must be awaited.
 *
 * Degrades gracefully: returns `null` when the public env vars are absent (the
 * current state), so nothing throws at import or render with no env configured.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

export async function createClient(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` is called from a Server Component where mutating cookies is
          // not allowed. Safe to ignore when a Proxy/middleware refreshes the
          // session, which is where writes actually take effect.
        }
      },
    },
  });
}
