import * as React from "react";

import { cn } from "@/lib/utils";

export interface SealEmblemProps {
  /** Pixel size of the square stamp. Live screen: keep small (~44–56px). */
  size?: number;
  /** Text inscribed around the ring. Keep it non-affirmative (archival, not "verified"). */
  label?: string;
  className?: string;
}

/**
 * SealEmblem — an archival deboss/letterpress mark in `accent-quiet`: concentric
 * rings inscribed with a registry label, pressed onto the page (inner-shadow
 * deboss + a 1px light top edge), rotated ~-4°, able to overlap a document edge.
 *
 * HONESTY: this is a register stamp, NEVER a checkmark and NEVER a "verified /
 * correct" claim. The centre carries a non-affirmative register cross + ledger
 * nib — the mark a clerk presses to say "this record was drawn", not "this
 * answer is right". Decorative by default (`aria-hidden`); render any meaning
 * as adjacent text. Reserve the formal stamp for the PDF/permalink; on the live
 * screen keep it small so it never outranks the code or the band.
 */
function SealEmblem({
  size = 52,
  label = "RECORDED · NOT A RULING",
  className,
}: SealEmblemProps) {
  // Stable id for the circular textPath, unique per instance. useId is the
  // pure, render-safe way to mint it; sanitize the colons it emits so the value
  // is a valid SVG/CSS id used in the `href="#…"` selector below.
  const rawId = React.useId();
  const pathId = `seal-arc-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ringText = `${label} · PREVYL · ITC-HS · `;

  return (
    <span
      className={cn(
        // Pressed-into-paper look: a soft deboss inner shadow + a light top
        // edge, rotated so it reads stamped (not parked in a box).
        "inline-grid place-items-center rounded-full text-accent-quiet",
        "shadow-[inset_0_2px_4px_color-mix(in_oklab,var(--ink)_22%,transparent),inset_0_-1px_0_var(--highlight)]",
        "-rotate-[4deg]",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor:
          "color-mix(in oklab, var(--accent-quiet) 7%, var(--surface))",
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" fill="none" className="block size-[92%]">
        {/* concentric emboss rings */}
        <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
        <circle cx="50" cy="50" r="39" stroke="currentColor" strokeWidth="2.2" opacity="0.85" />
        <circle cx="50" cy="50" r="33" stroke="currentColor" strokeWidth="0.7" opacity="0.45" />

        {/* inscribed ring label (non-affirmative registry text) */}
        <path
          id={pathId}
          d="M50 17 a33 33 0 0 1 0 66 a33 33 0 0 1 0 -66"
          fill="none"
        />
        <text className="fill-current font-mono" fontSize="6.4" letterSpacing="1.4" opacity="0.8">
          <textPath href={`#${pathId}`} startOffset="2%">
            {ringText}
          </textPath>
        </text>

        {/* centre: a register cross + a ledger nib — NEVER a checkmark.
            Two crossed register strokes (the surveyor/registry mark used to
            align a page), with a small nib lozenge. Non-affirmative by design. */}
        <g stroke="currentColor" strokeLinecap="round" opacity="0.92">
          <line x1="50" y1="40" x2="50" y2="60" strokeWidth="1.6" />
          <line x1="40" y1="50" x2="60" y2="50" strokeWidth="1.6" />
          <circle cx="50" cy="50" r="9" strokeWidth="1.2" opacity="0.6" fill="none" />
        </g>
        {/* nib lozenge — the ledger-nib monogram dot */}
        <path
          d="M50 46 l3 4 l-3 4 l-3 -4 z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}

export { SealEmblem };
