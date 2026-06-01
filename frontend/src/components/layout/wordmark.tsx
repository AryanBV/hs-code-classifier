import * as React from "react";

import { cn } from "@/lib/utils";

export interface WordmarkProps {
  /**
   * Optional small-caps subtitle, e.g. "ITC-HS classification". Set with a
   * register that reads as a clerk's annotation, never a co-equal headline.
   */
  subtitle?: string;
  /** Slightly larger lockup for hero / masthead-prominent placements. */
  size?: "sm" | "md";
  className?: string;
}

const root: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "text-[1.18rem]",
  md: "text-[1.34rem]",
};

/**
 * Wordmark — "Prevyl" set in Fraunces at the display register, with the low-opsz
 * sturdy cut so the mark holds at masthead size. The accent is no longer a stray
 * floating dot (an off-brief decorative tick); it is a hairline ledger-nib rule
 * struck under the first letter, reading as a mark of the instrument rather than
 * an ornament. The name carries the brand voice on its own.
 */
function Wordmark({ subtitle, size = "md", className }: WordmarkProps) {
  return (
    <span className={cn("flex items-baseline gap-[0.62ch]", className)}>
      <span
        className={cn(
          "relative font-display font-[var(--weight-title)] tracking-[-0.012em] text-ink",
          "[font-variation-settings:'opsz'_40,'SOFT'_28,'WONK'_0]",
          root[size],
        )}
      >
        Prevyl
        {/* Ledger-nib rule: a struck mark under the stem, not a free dot. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-[0.04em] left-0 h-[0.085em] w-[0.62ch] rounded-full bg-accent-quiet"
        />
      </span>
      {subtitle && (
        <span className="hidden font-sans text-[0.62rem] font-medium uppercase tracking-[0.2em] text-ink-muted sm:inline">
          {subtitle}
        </span>
      )}
    </span>
  );
}

export { Wordmark };
