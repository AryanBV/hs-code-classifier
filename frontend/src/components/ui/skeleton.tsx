import * as React from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton — a calm, shift-neutral placeholder block. A gentle opacity pulse on
 * surface-sunk (no moving shimmer sweep, nothing that implies measured
 * progress). Gated behind motion-safe so users who prefer reduced motion see a
 * still block.
 */
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-surface-sunk motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
