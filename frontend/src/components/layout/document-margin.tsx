import * as React from "react";

import { cn } from "@/lib/utils";

export interface DocumentMarginProps {
  /** The primary document pane (left / top) — the one lifted sheet. */
  document: React.ReactNode;
  /** The living margin / assessment pane (right / bottom) — attached marginalia. */
  margin: React.ReactNode;
  className?: string;
}

/**
 * DocumentMargin — the adaptive two-pane (D2). Below `lg` it's a single column
 * (document, then margin). At `lg` (>=1024px) it becomes a CSS grid: the
 * document sheet ~64% beside the margin ~36%, top-aligned; the margin sticks.
 *
 * The margin is rendered as TRUE attached marginalia, NOT a co-equal sidebar
 * card: it is hung off a vertical gutter rule, sits in a subordinate sunk wash
 * with smaller meta type, and carries NO big shadow. It reads as a clerk's
 * annotations alongside the same sheet, never as a second equal-weight card.
 */
function DocumentMargin({ document, margin, className }: DocumentMarginProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6",
        "lg:grid-cols-[minmax(0,64%)_minmax(0,36%)] lg:items-start lg:gap-x-[clamp(40px,4vw,60px)] lg:gap-y-0",
        className,
      )}
    >
      <div className="min-w-0">{document}</div>
      <aside
        className={cn(
          "marginalia min-w-0",
          // hung off a gutter rule, sticky alongside the sheet on desktop
          "lg:sticky lg:top-6",
        )}
        aria-label="Assessment and notes"
      >
        {margin}
      </aside>
    </div>
  );
}

export { DocumentMargin };
