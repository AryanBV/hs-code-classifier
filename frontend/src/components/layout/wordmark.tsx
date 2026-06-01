import * as React from "react";

import { cn } from "@/lib/utils";

export interface WordmarkProps {
  /** Optional small-caps subtitle, e.g. "ITC-HS classification record". */
  subtitle?: string;
  className?: string;
}

/**
 * Wordmark — "Prevyl" in Fraunces with the accent ledger-dot, plus an optional
 * uppercase tracking-wide subtitle. Matches the masthead idiom in the mocks.
 */
function Wordmark({ subtitle, className }: WordmarkProps) {
  return (
    <span className={cn("flex items-baseline gap-[0.6ch]", className)}>
      <span className="font-display text-[1.34rem] font-semibold tracking-[0.005em] text-ink">
        Prevyl
      </span>
      <span
        aria-hidden="true"
        className="inline-block size-[0.46ch] -translate-y-[0.06em] rounded-full bg-accent"
      />
      {subtitle && (
        <span className="ml-[0.7ch] -translate-y-[0.18em] font-sans text-[0.62rem] font-medium uppercase tracking-[0.22em] text-ink-muted">
          {subtitle}
        </span>
      )}
    </span>
  );
}

export { Wordmark };
