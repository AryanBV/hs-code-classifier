"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { signOut, useUser } from "@/lib/supabase/use-user";
import { migrateLocalHistory } from "@/lib/account";

/**
 * Header account island.
 *
 * Degrades to render NOTHING when Supabase is unconfigured (the current state),
 * so today's header is byte-identical. When configured:
 * - signed out -> a small "Sign in" control that opens the magic-link dialog.
 * - signed in  -> the user's email + a "Sign out" control.
 *
 * On the first transition to signed-in (per mount), it runs migrateLocalHistory()
 * exactly once (ref-guarded) so guest records sync to the cloud. The migration is
 * best-effort and never throws; the call is fired from inside the effect (not
 * awaited in the body) so no setState happens synchronously in the effect.
 */
function AccountMenu() {
  const configured = isSupabaseConfigured();
  const { user } = useUser();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const migratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!user) return;
    if (migratedRef.current) return;
    migratedRef.current = true;
    void migrateLocalHistory();
  }, [user]);

  // Keep the header identical to today when Supabase is not configured.
  if (!configured) return null;

  if (user) {
    const email = user.email ?? "";
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        {email ? (
          <span
            className="hidden max-w-[16ch] truncate font-sans text-sm text-ink-muted sm:inline"
            title={email}
          >
            {email}
          </span>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
        Sign in
      </Button>
      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export { AccountMenu };
