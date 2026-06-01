import * as React from "react";

import { cn } from "@/lib/utils";

export interface DocumentMarginProps {
  /** The primary document pane (left / top). */
  document: React.ReactNode;
  /** The living margin / assessment pane (right / bottom). */
  margin: React.ReactNode;
  className?: string;
}

/**
 * DocumentMargin — the adaptive two-pane (D2). Below `lg` it's a single column
 * (document, then margin). At `lg` (>=1024px) it becomes a CSS grid:
 * document ~62% beside the margin ~38% with a wide gutter, top-aligned; the
 * margin sticks. Matches hero-B's two-pane composition.
 */
function DocumentMargin({ document, margin, className }: DocumentMarginProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6",
        "lg:grid-cols-[minmax(0,62%)_minmax(0,38%)] lg:items-start lg:gap-x-[clamp(48px,4.5vw,64px)] lg:gap-y-0",
        className,
      )}
    >
      <div className="min-w-0">{document}</div>
      <aside className="min-w-0 lg:sticky lg:top-6">{margin}</aside>
    </div>
  );
}

export { DocumentMargin };
