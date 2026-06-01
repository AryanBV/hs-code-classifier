"use client";

import { useEffect } from "react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * Route error boundary. Calm, no leaked error details.
 * `reset()` clears the error state and re-renders the segment's children.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the console (a real reporter can be wired here later). The user
    // never sees the raw message.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Surface
        variant="raised"
        className="flex w-full max-w-md flex-col items-center gap-6 px-8 py-12 text-center"
      >
        <Wordmark subtitle="something interrupted" />
        <div className="flex flex-col gap-2">
          <p className="font-display text-2xl font-medium tracking-[0.005em] text-ink">
            Something went wrong on our end.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            This is on us, not you. Please try again in a moment.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => reset()}>
          Try again
        </Button>
      </Surface>
    </div>
  );
}
