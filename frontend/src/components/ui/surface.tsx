import * as React from "react";

import { cn } from "@/lib/utils";

type SurfaceVariant = "raised" | "sunk" | "flat";

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  variant?: SurfaceVariant;
  as?: React.ElementType;
}

const variantClasses: Record<SurfaceVariant, string> = {
  // A pressed-paper card: warm surface, hairline rule, soft archival shadow.
  raised: cn(
    "bg-surface border border-rule",
    "shadow-[0_1px_0_rgba(35,33,28,0.03),0_18px_44px_-28px_rgba(35,33,28,0.34)]",
  ),
  // A recessed well in the ledger.
  sunk: "bg-surface-sunk border border-rule",
  // No chrome — structure only.
  flat: "bg-transparent",
};

/**
 * Surface — the Customs-Ledger card shell. Defaults to a raised paper card.
 * Pure presentational; stays a server component.
 */
const Surface = React.forwardRef<HTMLElement, SurfaceProps>(
  ({ className, variant = "raised", as, ...props }, ref) => {
    const Comp = (as ?? "div") as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn("rounded-md", variantClasses[variant], className)}
        {...props}
      />
    );
  },
);
Surface.displayName = "Surface";

export { Surface };
