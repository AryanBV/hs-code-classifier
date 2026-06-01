import * as React from "react";

import { cn } from "@/lib/utils";

export interface SealEmblemProps {
  /** Pixel size of the square stamp. */
  size?: number;
  /** Text inscribed around the ring. */
  label?: string;
  className?: string;
}

let sealUid = 0;

/**
 * SealEmblem — a CSS/SVG-drawn circular emboss stamp in `accent`: concentric
 * rings with the label inscribed around the top arc and an embossed mark in the
 * centre. This is an archival stamp, NOT a green check. Decorative by default
 * (`aria-hidden`); render the label as adjacent text where meaning is needed.
 */
function SealEmblem({
  size = 74,
  label = "RULE-CHECKED",
  className,
}: SealEmblemProps) {
  // Stable id for the circular textPath, unique per instance.
  const pathId = React.useMemo(() => `seal-arc-${(sealUid += 1)}`, []);
  const ringText = `${label} · PREVYL · ITC-HS · `;

  return (
    <span
      className={cn("inline-block text-accent", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" fill="none" className="block size-full">
        {/* concentric emboss rings */}
        <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
        <circle cx="50" cy="50" r="39" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="50" cy="50" r="33" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />

        {/* inscribed ring label */}
        <path
          id={pathId}
          d="M50 17 a33 33 0 0 1 0 66 a33 33 0 0 1 0 -66"
          fill="none"
        />
        <text
          className="fill-[var(--accent-ink)] font-mono"
          fontSize="7"
          letterSpacing="1.8"
        >
          <textPath href={`#${pathId}`} startOffset="2%">
            {ringText}
          </textPath>
        </text>

        {/* embossed centre mark — an inscribed stamp stroke, not a UI checkmark */}
        <path
          d="M38 50 l8 8 l16 -18"
          stroke="var(--accent-ink)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

export { SealEmblem };
