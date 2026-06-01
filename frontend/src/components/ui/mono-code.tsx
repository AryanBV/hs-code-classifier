import * as React from "react";

import { cn } from "@/lib/utils";

type MonoCodeSize = "sm" | "md" | "lg" | "display";

export interface MonoCodeProps {
  /** A dotted HS code, e.g. "7318.15.00" (or a bare segment). */
  code: string;
  size?: MonoCodeSize;
  className?: string;
}

const sizeClasses: Record<MonoCodeSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  // The big certificate headline — clamps ~2rem → ~3rem, weight 600.
  display: "text-[clamp(2rem,7vw,3rem)] font-semibold leading-[0.98] tracking-[-0.018em]",
};

/**
 * MonoCode — renders an HS code in Commit Mono with tabular figures and a
 * faint accent tint on the separating dots (the hero "seg-dim" treatment),
 * so dots stay visible and evenly spaced. Splits on the literal ".".
 */
function MonoCode({ code, size = "md", className }: MonoCodeProps) {
  const parts = code.split(".");
  // Build a screen-reader-friendly spaced reading of the code.
  const ariaLabel = `HS code ${code.split("").join(" ")}`;

  return (
    <span
      className={cn(
        "inline-block font-mono tabular-nums tracking-[-0.01em] text-ink",
        size !== "display" && "tracking-[0.01em]",
        sizeClasses[size],
        className,
      )}
      aria-label={ariaLabel}
    >
      {parts.map((part, i) => (
        <React.Fragment key={`${part}-${i}`}>
          {i > 0 && (
            <span aria-hidden="true" className="text-accent">
              .
            </span>
          )}
          <span aria-hidden="true">{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export { MonoCode };
