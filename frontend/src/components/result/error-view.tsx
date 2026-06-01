"use client";

import * as React from "react";
import { Clock, RotateCcw } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";

export interface ErrorViewProps {
  kind: "transient" | "daily_limit" | "network";
  onRetry: () => void;
}

const COPY: Record<
  ErrorViewProps["kind"],
  { eyebrow: string; title: string; body: string; canRetry: boolean }
> = {
  transient: {
    eyebrow: "Paused · the line was interrupted",
    title: "The connection was interrupted.",
    body: "Your product description is saved. This usually clears on a second try.",
    canRetry: true,
  },
  network: {
    eyebrow: "Paused · could not reach the classifier",
    title: "We could not reach the classifier.",
    body: "Your product description is saved. Check your connection and try again.",
    canRetry: true,
  },
  daily_limit: {
    eyebrow: "At capacity · free daily limit reached",
    title: "We have hit today's free limit.",
    body: "Prevyl is free, so we cap how many classifications we run each day. Please come back tomorrow and we will pick up right where you left off.",
    canRetry: false,
  },
};

/**
 * ErrorView — a warm, non-scary interruption notice. Transient/network offer a
 * Retry; the daily-limit case is a calm "come back tomorrow" with no retry. The
 * same archival card idiom as the refuse state.
 */
function ErrorView({ kind, onRetry }: ErrorViewProps) {
  const copy = COPY[kind];
  const Icon = copy.canRetry ? RotateCcw : Clock;

  return (
    <div className="mx-auto w-full max-w-[560px] pb-8">
      <style>{settleKeyframes}</style>

      <Surface
        as="section"
        variant="raised"
        role="alert"
        aria-live="assertive"
        className="p-[clamp(24px,4vw,40px)] motion-safe:animate-[prevyl-settle_0.44s_ease_both]"
      >
        <p className="mb-4.5 flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <span aria-hidden="true" className="h-px w-[18px] bg-accent" />
          {copy.eyebrow}
        </p>

        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-[46px] shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--rule))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent"
          >
            <Icon className="size-6" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-medium leading-[1.2] text-ink">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-[48ch] font-sans text-[0.96rem] leading-relaxed text-ink-muted">
              {copy.body}
            </p>
          </div>
        </div>

        {copy.canRetry ? (
          <div className="mt-7 flex">
            <Button
              variant="primary"
              onClick={onRetry}
              className="h-12 min-h-12 gap-2.5 px-5"
            >
              <RotateCcw aria-hidden="true" strokeWidth={1.9} />
              Try again
            </Button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}

const settleKeyframes = `
@keyframes prevyl-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;

export { ErrorView };
