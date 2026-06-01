import * as React from "react";

import { cn } from "@/lib/utils";

type SurfaceVariant = "raised" | "sunk" | "flat";

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  variant?: SurfaceVariant;
  as?: React.ElementType;
  /**
   * Promote a `raised` surface to THE one signature document sheet: lighter +
   * warmer paper, near-square corners, a directional cast shadow, a letterpress
   * top edge, and faint surface-local grain. Additive — defaults off, so
   * ordinary `raised` cards stay a calm resting card. Reserve `sheet` for the
   * single hero artifact; elevation must mean something.
   */
  sheet?: boolean;
}

const variantClasses: Record<SurfaceVariant, string> = {
  // A resting card: default paper, a load-bearing border, the resting shadow
  // + a letterpress top highlight. NOT the big lift — that is reserved for the
  // one document `sheet`.
  raised: "bg-surface border border-rule-strong elev-2",
  // A recessed well in the ledger you write into (inner shadow + light lip).
  sunk: "bg-surface-sunk border border-rule sunk",
  // No chrome — structure only.
  flat: "bg-transparent",
};

/**
 * Surface — the Customs-Ledger card shell. Defaults to a raised resting card.
 * Pass `sheet` (with the default `raised` variant) to render the single lifted
 * document sheet. Pure presentational; stays a server component.
 */
const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  ({ className, variant = "raised", as, sheet = false, ...props }, ref) => {
    const Comp = (as ?? "div") as React.ElementType;
    const asSheet = sheet && variant === "raised";
    return (
      <Comp
        ref={ref}
        className={cn(
          // The document sheet sets its own near-square radius + paper + grain
          // via `.doc-sheet`; everything else uses the standard 4px radius.
          asSheet ? "doc-sheet" : "rounded-md",
          asSheet ? "border border-rule" : variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Surface.displayName = "Surface";

export { Surface };
