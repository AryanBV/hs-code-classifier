import * as React from "react";

import { cn } from "@/lib/utils";

type ChipVariant = "neutral" | "accent" | "policy" | "india";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

const variantClasses: Record<ChipVariant, string> = {
  neutral: "border-rule bg-surface text-ink-muted",
  accent:
    "border-[color-mix(in_oklab,var(--accent)_30%,var(--rule))] bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface))] text-accent-ink",
  // "Free" / cleared-policy idiom — verdigris, the cleared-ledger color.
  policy:
    "border-[color-mix(in_oklab,var(--band-high)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-high)_10%,var(--surface))] text-band-high",
  india:
    "border-[color-mix(in_oklab,var(--band-medium)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-medium)_10%,var(--surface))] text-band-medium",
};

/**
 * Chip — a small ledger label, sibling of Badge in one unified tag idiom: a
 * hairline border, tracked small-caps, FLAT (no shadow, near-square corners).
 * It is a tone-carrying annotation, never a card. Presentational; stays a
 * server component. Sizing/typography matches Badge so the two read as one
 * family (the audit's "one small-label idiom").
 */
const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant = "neutral", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
          "font-sans text-eyebrow font-semibold uppercase tracking-[0.08em]",
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
