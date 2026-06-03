"use client";

import * as React from "react";
import { Clock, Hourglass, RotateCcw, Plus } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { CLASSIFY_ANOTHER_LABEL } from "@/lib/content";

export type ErrorKind = "transient" | "daily_limit" | "network" | "timeout";

export interface ErrorViewProps {
  kind: ErrorKind;
  onRetry: () => void;
  /**
   * Forward action so no terminal state dead-ends. Optional and additive: when
   * provided, every screen offers "Classify another product" as a way out (the
   * sole action on the no-retry daily-limit screen, a quiet secondary elsewhere).
   */
  onClassifyAnother?: () => void;
}

const COPY: Record<
  ErrorKind,
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
  timeout: {
    eyebrow: "Paused · this one ran long",
    title: "This is taking longer than usual.",
    body: "Tricky products can take the full minute, and this one passed it. Your description is saved. Running it again often clears it.",
    canRetry: true,
  },
  daily_limit: {
    eyebrow: "At capacity · free daily limit reached",
    title: "We have reached today's free limit.",
    body: "Prevyl is free, so we cap how many classifications we run each day. We have reached that cap for today. Please try again tomorrow.",
    canRetry: false,
  },
};

/**
 * ErrorView — a warm, non-scary interruption notice. Retryable kinds
 * (transient, network, timeout) offer a Retry; the daily-limit case is a calm
 * "come back tomorrow" with no retry. Either way, when a forward action is
 * wired, every screen also offers "Classify another product" so nothing
 * dead-ends. The same archival card idiom as the refuse state. No global
 * "verify before filing" advisory here: nothing was filed, there is no code to
 * verify.
 */
function ErrorView({ kind, onRetry, onClassifyAnother }: ErrorViewProps) {
  const copy = COPY[kind];
  const Icon = kind === "timeout" ? Hourglass : copy.canRetry ? RotateCcw : Clock;
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);

  // Move focus to the outcome heading when this view appears, so screen-reader
  // and keyboard users land on the new state rather than a stale control.
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-focus pb-8">
      <Surface
        as="section"
        variant="raised"
        role="alert"
        aria-live="assertive"
        className="p-card motion-safe:reveal-rise"
      >
        <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {copy.eyebrow}
        </p>

        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-[46px] shrink-0 place-items-center rounded-md border border-rule-strong bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] text-accent elev-1"
          >
            <Icon className="size-6" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="m-0 font-display text-title font-medium leading-[1.2] text-ink outline-none"
            >
              {copy.title}
            </h1>
            <p className="mt-3 max-w-[48ch] font-sans text-body leading-relaxed text-ink-muted">
              {copy.body}
            </p>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {copy.canRetry ? (
            <Button variant="primary" size="lg" onClick={onRetry} className="gap-2.5">
              <RotateCcw aria-hidden="true" strokeWidth={1.9} />
              Try again
            </Button>
          ) : null}

          {onClassifyAnother ? (
            <Button
              variant={copy.canRetry ? "ghost" : "primary"}
              size="lg"
              onClick={onClassifyAnother}
              className="gap-2.5"
            >
              <Plus aria-hidden="true" strokeWidth={1.9} />
              {CLASSIFY_ANOTHER_LABEL}
            </Button>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

export { ErrorView };
