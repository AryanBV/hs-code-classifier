import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "accent" | "high" | "medium" | "low";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-rule bg-surface-sunk text-ink-muted",
  accent:
    "border-[color-mix(in_oklab,var(--accent)_30%,var(--rule))] bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))] text-accent-ink",
  high: "border-[color-mix(in_oklab,var(--band-high)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-high)_10%,var(--surface))] text-band-high",
  medium:
    "border-[color-mix(in_oklab,var(--band-medium)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-medium)_10%,var(--surface))] text-band-medium",
  low: "border-[color-mix(in_oklab,var(--band-low)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-low)_10%,var(--surface))] text-band-low",
};

/**
 * Badge — a small status marker in the SAME flat tag idiom as Chip, tuned for
 * statuses (record state, policy status, band echoes). Hairline border, tracked
 * small-caps, no shadow. NOTE: a band Badge is a quiet echo only — the
 * load-bearing confidence signal is the band word + plain-English meaning line,
 * never the color alone (honesty: band is a category, not a gauge).
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5",
        "font-sans text-eyebrow font-semibold uppercase tracking-[0.08em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
