import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "accent" | "high" | "medium" | "low";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-rule bg-surface-sunk text-ink-muted",
  accent:
    "border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent-ink",
  high: "border-[color-mix(in_srgb,var(--band-high)_34%,var(--rule))] bg-[color-mix(in_srgb,var(--band-high)_10%,var(--surface))] text-band-high",
  medium:
    "border-[color-mix(in_srgb,var(--band-medium)_34%,var(--rule))] bg-[color-mix(in_srgb,var(--band-medium)_10%,var(--surface))] text-band-medium",
  low: "border-[color-mix(in_srgb,var(--band-low)_34%,var(--rule))] bg-[color-mix(in_srgb,var(--band-low)_10%,var(--surface))] text-band-low",
};

/**
 * Badge — a small status marker, sibling of Chip but tuned for statuses
 * (record state, policy status, band echoes). Hairline border, ledger feel.
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5",
        "font-sans text-[0.7rem] font-semibold uppercase tracking-[0.06em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
