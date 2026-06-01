import * as React from "react";

import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Skeleton — a calm placeholder block. A gentle opacity pulse on surface-sunk
 * (no moving shimmer sweep). The global reduced-motion guard stops the pulse
 * for users who prefer reduced motion.
 */
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-sunk", className)}
      {...props}
    />
  );
}

export { Skeleton };
