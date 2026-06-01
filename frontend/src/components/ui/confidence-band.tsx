import * as React from "react";

import type { ConfidenceBand as ConfidenceBandValue } from "@/lib/types";
import { cn } from "@/lib/utils";

type BandVariant = "chip" | "meter" | "inline";

export interface ConfidenceBandProps {
  band: ConfidenceBandValue;
  variant?: BandVariant;
  className?: string;
}

/**
 * Per-band spec. Confidence is a CATEGORY we admit to, conveyed by WORD +
 * STEPPED-INK SHAPE + a plain-English meaning line — never a number, never by
 * color alone, never with a "verified / correct" icon.
 *
 * `inked` = how many of the 3 stacked segments are filled, DE-INVERTED so that
 * MORE ink = MORE confidence (high = 3, medium = 2, low = 1). The band is the
 * page's one chromatic event, on the colorblind-safe teal -> amber -> rust arc.
 */
const BAND_SPEC: Record<
  ConfidenceBandValue,
  {
    word: string;
    label: string;
    /** Plain-English consequence line shown under the word. */
    meaning: string;
    color: string;
    wash: string;
    /** AA-safe ink-toned swatch — used in the small chip/inline tick marks. */
    seg: string;
    /** Saturated FILL swatch — the chromatic event in the meter segments.
     *  Carries no text-contrast duty (shape + word do the colorblind-safe work),
     *  so it can be the one saturated color moment on the page. */
    fill: string;
    /** Filled segments, top -> bottom; the FIRST `inked` are filled. */
    inked: 1 | 2 | 3;
  }
> = {
  high: {
    word: "High",
    label: "High confidence",
    meaning: "A strong, well-supported match. Confirm it against your product before filing.",
    color: "text-band-high",
    wash: "band-wash-high",
    seg: "bg-band-high border-band-high",
    fill: "bg-band-high-fill border-band-high-fill",
    inked: 3,
  },
  medium: {
    word: "Medium",
    label: "Medium confidence",
    meaning: "A reasonable match with some uncertainty. Check the basis and the close alternatives.",
    color: "text-band-medium",
    wash: "band-wash-medium",
    seg: "bg-band-medium border-band-medium",
    fill: "bg-band-medium-fill border-band-medium-fill",
    inked: 2,
  },
  low: {
    word: "Low",
    label: "Low confidence",
    meaning: "A weak reading. Treat it as a starting point and verify carefully before you rely on it.",
    color: "text-band-low",
    wash: "band-wash-low",
    seg: "bg-band-low border-band-low",
    fill: "bg-band-low-fill border-band-low-fill",
    inked: 1,
  },
};

/** The accessible reading carries the honesty framing, not a bare value. */
function bandAriaLabel(band: ConfidenceBandValue): string {
  return `Confidence band: ${BAND_SPEC[band].label}. ${BAND_SPEC[band].meaning}`;
}

/**
 * Three stacked bars, filled TOP-DOWN; more filled = more confidence.
 * `prominent` swaps the AA-safe ink swatch for the SATURATED fill swatch and a
 * taller bar — the meter's one chromatic moment. Default keeps the quiet tick.
 */
function Segments({
  band,
  className,
  prominent = false,
}: {
  band: ConfidenceBandValue;
  className?: string;
  prominent?: boolean;
}) {
  const { inked, seg, fill } = BAND_SPEC[band];
  const filledClass = prominent ? fill : seg;
  return (
    <span
      aria-hidden="true"
      className={cn("flex flex-col-reverse gap-1.5", className)}
    >
      {[0, 1, 2].map((i) => {
        const isFilled = i < inked;
        return (
          <span
            key={i}
            className={cn(
              "rounded-sm border",
              prominent ? "h-5 w-7" : "h-3.5",
              isFilled
                ? cn(filledClass, "elev-1")
                : "border-rule-strong bg-transparent",
            )}
          />
        );
      })}
    </span>
  );
}

function ConfidenceBand({ band, variant = "chip", className }: ConfidenceBandProps) {
  const spec = BAND_SPEC[band];
  const ariaLabel = bandAriaLabel(band);

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-2", spec.color, className)}
        aria-label={ariaLabel}
      >
        <Segments band={band} className="h-[1.05em] flex-row gap-[2px]" />
        <span className="font-sans text-[0.95rem] font-semibold">{spec.word}</span>
      </span>
    );
  }

  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1",
          spec.wash,
          spec.color,
          className,
        )}
        aria-label={ariaLabel}
      >
        <span aria-hidden="true" className="flex flex-row items-end gap-[2px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "w-[3px] rounded-[1px]",
                // stepped heights echo "more ink = more"
                i === 0 ? "h-2" : i === 1 ? "h-2.5" : "h-3",
                i < spec.inked ? spec.seg : "border border-rule-strong bg-transparent",
              )}
            />
          ))}
        </span>
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)]">
          {spec.word}
        </span>
      </span>
    );
  }

  // meter — the band IS the page's one chromatic event: a band-KEYED wash
  // container, SATURATED stepped-ink fill swatches, the band word in display
  // type, and a plain-English meaning line. No icon, no triangle, no number.
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border p-4",
        spec.wash,
        className,
      )}
      aria-label={ariaLabel}
    >
      <p className="font-sans text-meta uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
        Confidence
      </p>
      <div className="flex items-stretch gap-3.5">
        <Segments band={band} prominent />
        <div className="flex flex-col justify-center gap-1">
          <span
            className={cn(
              "font-display opsz-section text-section font-[number:var(--weight-section)] leading-none",
              spec.color,
            )}
          >
            {spec.word}
          </span>
        </div>
      </div>
      <p className="max-w-[34ch] font-sans text-meta leading-snug text-ink-muted">
        {spec.meaning}
      </p>
    </div>
  );
}

export { ConfidenceBand };
