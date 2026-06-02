"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Contextual sign-in dialog.
 *
 * Degrades gracefully:
 * - Supabase unconfigured (e.g. no env): a friendly "coming soon" panel, no auth
 *   calls, never throws.
 * - Supabase configured: "Continue with Google" (OAuth) plus an email magic-link
 *   form (signInWithOtp). Google requires the Google provider to be enabled in
 *   the Supabase project; until then the button surfaces a calm error.
 *
 * Controlled via `open` / `onOpenChange` so any trigger can drive it.
 */

export interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Status = "idle" | "sending" | "sent" | "error";

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const configured = isSupabaseConfigured();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {configured ? <SignInPanel /> : <ComingSoonPanel />}
      </DialogContent>
    </Dialog>
  );
}

function ComingSoonPanel() {
  return (
    <DialogHeader>
      <DialogTitle>Accounts are coming soon</DialogTitle>
      <DialogDescription>
        For now your records are saved on this device. Sign-in will let you keep
        them across devices once it is ready.
      </DialogDescription>
    </DialogHeader>
  );
}

function SignInPanel() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState<string>("");
  const [googleBusy, setGoogleBusy] = React.useState(false);

  const callbackUrl = (): string | undefined =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;

  async function handleGoogle() {
    const supabase = createClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Sign-in is not available right now.");
      return;
    }
    setGoogleBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (error) {
        setGoogleBusy(false);
        setStatus("error");
        setMessage("We could not start Google sign-in. Please try again.");
      }
      // On success the browser navigates to Google; no further UI needed.
    } catch {
      setGoogleBusy(false);
      setStatus("error");
      setMessage("We could not start Google sign-in. Please try again.");
    }
  }

  async function handleEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    const supabase = createClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Sign-in is not available right now.");
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) {
        setStatus("error");
        setMessage("We could not send the link. Please try again.");
        return;
      }
      setStatus("sent");
      setMessage("Check your inbox for a sign-in link.");
    } catch {
      setStatus("error");
      setMessage("We could not send the link. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <DialogHeader>
        <DialogTitle>Link sent</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sign in</DialogTitle>
        <DialogDescription>
          Keep your records across devices. Continue with Google, or get a
          one-time email link.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={handleGoogle}
          disabled={googleBusy}
          className="justify-center gap-2.5"
        >
          <GoogleMark />
          {googleBusy ? "Connecting..." : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-rule" />
          <span className="font-sans text-meta text-ink-muted">or</span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form onSubmit={handleEmail} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={status === "sending"}
            />
          </div>
          <Button type="submit" variant="primary" size="md" disabled={status === "sending"}>
            {status === "sending" ? "Sending..." : "Send sign-in link"}
          </Button>
        </form>

        {status === "error" && message ? (
          <p className="font-sans text-meta text-ink-muted" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** The official Google "G" mark, for the Sign in with Google button. */
function GoogleMark() {
  return (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
