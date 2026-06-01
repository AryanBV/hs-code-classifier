import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PageShell — the ONE shared rail.
 *
 * Header, footer, and every page body run through this single component so the
 * masthead rule, the content edge, and the footer rule all share one left gutter
 * at every breakpoint. The outer gutter (`px`) is constant everywhere; only the
 * inner measure changes between states, never the frame. This is what turns a
 * "template" (chrome and content aligned on no page) into a "product".
 *
 * Full-bleed border rules (the masthead underline, the footer overline) stay
 * edge-to-edge by putting the border on a full-width wrapper and the content in
 * a PageShell inside it. The shell itself never carries a region border.
 */

/** Inner-measure tokens. Only the measure changes between states. */
const measure = {
  /** 1180px — the default working width (result, history, list views). */
  wide: "max-w-wide",
  /** 760px — narrow reading column (about, privacy, history list). */
  list: "max-w-list",
  /** 68ch — long-form prose measure. */
  read: "max-w-read",
  /** 560px — the focused single-task column (landing field, ASK, refuse). */
  focus: "max-w-focus",
} as const;

export type PageShellWidth = keyof typeof measure;

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inner measure. Defaults to the full working width. */
  width?: PageShellWidth;
  /** Render as a different element (e.g. "section"). Defaults to "div". */
  as?: "div" | "section" | "header" | "footer" | "nav";
  children?: React.ReactNode;
}

/**
 * The shared gutter. `px-[clamp(16px,4vw,44px)]` is the single source of truth
 * for the page rail; do not re-declare it per page.
 */
function PageShell({
  width = "wide",
  as = "div",
  className,
  children,
  ...props
}: PageShellProps) {
  const Comp = as;
  return (
    <Comp
      className={cn(
        "mx-auto w-full px-[clamp(16px,4vw,44px)]",
        measure[width],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { PageShell };
