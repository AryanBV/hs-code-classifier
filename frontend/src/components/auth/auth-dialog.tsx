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
 * - Supabase unconfigured (current state): shows a friendly "coming soon" panel,
 *   makes no auth calls, never throws.
 * - Supabase configured: an email magic-link form via `signInWithOtp`.
 *
 * Self-contained and controlled via `open` / `onOpenChange` so it can be wired
 * to any trigger later.
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
        {configured ? (
          <MagicLinkForm />
        ) : (
          <ComingSoonPanel />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComingSoonPanel() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Accounts are coming soon</DialogTitle>
        <DialogDescription>
          For now your records are saved on this device. Sign-in will let you
          keep them across devices once it is ready.
        </DialogDescription>
      </DialogHeader>
    </>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState<string>("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Sign-in is not available right now.");
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo },
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
          Enter your email and we will send you a one-time sign-in link.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        {status === "error" && message && (
          <p className="text-sm text-ink-muted" aria-live="polite">
            {message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending..." : "Send sign-in link"}
        </Button>
      </form>
    </>
  );
}
