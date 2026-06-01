import Link from "next/link";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * Themed 404. Calm, centered Customs-Ledger card. Server component.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Surface
        variant="raised"
        className="flex w-full max-w-md flex-col items-center gap-6 px-8 py-12 text-center"
      >
        <Wordmark subtitle="record not found" />
        <div className="flex flex-col gap-2">
          <p className="font-display text-2xl font-medium tracking-[0.005em] text-ink">
            This page is not here.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            The record you were looking for may have moved or never existed.
            Let us take you back to the start.
          </p>
        </div>
        <Button asChild variant="primary" size="md">
          <Link href="/">Back to start</Link>
        </Button>
      </Surface>
    </div>
  );
}
