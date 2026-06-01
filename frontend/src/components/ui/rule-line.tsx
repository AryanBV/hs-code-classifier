import * as React from "react";

import { cn } from "@/lib/utils";

export interface RuleLineProps {
  /** When present, renders a ruled section header; otherwise a plain hairline. */
  label?: string;
  /**
   * Optional ledger line-number (e.g. "01" → renders "§01") shown in mono before
   * the label, so a section header reads as an entry in the grid, not just a
   * title. Additive; omit for a plain header.
   */
  lineNumber?: string;
  className?: string;
}

/**
 * RuleLine — a Customs-Ledger hairline. With a `label`, it's a section header:
 * an optional `§NN` line-number, a mid-tier Fraunces label (the register the
 * hierarchy was missing — not all-caps, not a big section title), then a
 * hairline rule that fills the row. Without a label, a plain semantic `<hr>`.
 */
function RuleLine({ label, lineNumber, className }: RuleLineProps) {
  if (!label) {
    return <hr className={cn("h-px border-0 border-t border-rule", className)} />;
  }

  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      {lineNumber && (
        <span
          aria-hidden="true"
          className="font-mono text-eyebrow font-medium tracking-[0.02em] text-ink-muted"
        >
          §{lineNumber}
        </span>
      )}
      <h2 className="m-0 font-display text-label font-medium tracking-[0.005em] text-ink">
        {label}
      </h2>
      <span
        aria-hidden="true"
        className="h-px flex-1 -translate-y-[0.18em] bg-rule"
      />
    </div>
  );
}

export { RuleLine };
