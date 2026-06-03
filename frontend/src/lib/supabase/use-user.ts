"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";

import { createClient, isSupabaseConfigured } from "./client";
import { clearHistoryForSignOut, reconcileHistoryOwner } from "@/lib/history";

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
      // Cross-account privacy via an OWNER SENTINEL (lib/history.ts). The local
      // history store is device-global, so it must never carry across accounts.
      // Clearing only on SIGNED_OUT left a leak: a silent session EXPIRY / tab
      // hand-over does NOT fire SIGNED_OUT, so account A's records survived for
      // account B. We reconcile ownership on EVERY authenticated event
      // (INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED): if a different uid is now
      // signed in, the prior owner's local store is wiped before the new user is
      // adopted (below) and before account-menu's migrate effect (keyed on the
      // user) can run. A first-time guest sign-in has NO stored owner, so their
      // local records are preserved for migration. Runs synchronously before
      // setUser so the migrate effect never copies a prior account's records.
      if (event === "SIGNED_OUT") {
        clearHistoryForSignOut();
      } else if (session?.user?.id) {
        reconcileHistoryOwner(session.user.id);
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
