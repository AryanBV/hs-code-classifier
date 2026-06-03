"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";

import { createClient, isSupabaseConfigured } from "./client";
import { clearHistory } from "@/lib/history";

/**
 * Current-user hook.
 *
 * Degrades gracefully: when Supabase is unconfigured (the current state),
 * `createClient()` returns `null`, the hook reports `{ user: null, loading: false }`
 * immediately, and the effect is a no-op. Nothing throws, and no auth call is made.
 *
 * `loading` uses a LAZY initializer so we never call setState synchronously in the
 * effect body (react-hooks/set-state-in-effect): when unconfigured we are not
 * loading; when configured we start loading and resolve inside the async
 * getUser().then callback (guarded by an `active` flag) and the onAuthStateChange
 * subscription. State is only ever set from callbacks, never the effect body.
 */
export function useUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState<boolean>(() =>
    isSupabaseConfigured(),
  );

  React.useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setUser(data.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // Cross-account privacy: device-global guest history (lib/history.ts) must
      // not survive a sign-out, or the next account on a shared device would both
      // SEE the prior user's records and have them copied up by the login-sync
      // (account.ts migrateLocalHistory). Gate STRICTLY on SIGNED_OUT — never on
      // INITIAL_SESSION or a null session at load, which would wipe a legitimate
      // guest's history on every page load.
      if (event === "SIGNED_OUT") {
        clearHistory();
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

/**
 * Sign the current user out. Best-effort and never throws: a no-op when
 * unconfigured, and swallows any error so the UI cannot break.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  } catch {
    /* never let sign-out break the UI */
  }
}
