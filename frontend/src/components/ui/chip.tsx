import * as React from "react";

import { cn } from "@/lib/utils";

type ChipVariant = "neutral" | "accent" | "policy" | "india";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

const variantClasses: Record<ChipVariant, string> = {
  neutral: "border-rule bg-surface text-ink-muted",
  accent:
    "border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent-ink",
  // "Free" / cleared-policy idiom — verdigris, the cleared-ledger color.
  policy:
    "border-[color-mix(in_srgb,var(--band-high)_30%,var(--rule))] bg-[color-mix(in_srgb,var(--band-high)_10%,var(--surface))] text-band-high",
  india:
    "border-[color-mix(in_srgb,var(--band-medium)_32%,var(--rule))] bg-[color-mix(in_srgb,var(--band-medium)_10%,var(--surface))] text-band-medium",
};

/**
 * Chip — a small ledger label pill with a hairline border. Uppercase-ish,
 * tight tracking. Presentational; stays a server component.
 */
const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant = "neutral", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
          "font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em]",
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Chip.displayName = "Chip";

export { Chip };
