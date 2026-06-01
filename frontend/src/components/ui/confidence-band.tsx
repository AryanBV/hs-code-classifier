import * as React from "react";
import { Shield, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";

import type { ConfidenceBand as ConfidenceBandValue } from "@/lib/types";
import { cn } from "@/lib/utils";

type BandVariant = "chip" | "meter" | "inline";

export interface ConfidenceBandProps {
  band: ConfidenceBandValue;
  variant?: BandVariant;
  className?: string;
}

/**
 * Per-band visual spec. Confidence is conveyed by WORD + ICON + SHAPE
 * (filled-segment position), never by a number and never by color alone.
 * `filled` = which of the 3 stacked segments (top→bottom) are inked.
 */
const BAND_SPEC: Record<
  ConfidenceBandValue,
  {
    word: string;
    label: string;
    Icon: LucideIcon;
    color: string;
    edge: string;
    tint: string;
    filled: [boolean, boolean, boolean];
  }
> = {
  high: {
    word: "High",
    label: "High confidence",
    Icon: ShieldCheck,
    color: "text-band-high",
    edge: "border-[color-mix(in_srgb,var(--band-high)_38%,var(--rule))]",
    tint: "bg-[color-mix(in_srgb,var(--band-high)_12%,var(--surface))]",
    filled: [true, false, false],
  },
  medium: {
    word: "Medium",
    label: "Medium confidence",
    Icon: Shield,
    color: "text-band-medium",
    edge: "border-[color-mix(in_srgb,var(--band-medium)_38%,var(--rule))]",
    tint: "bg-[color-mix(in_srgb,var(--band-medium)_12%,var(--surface))]",
    filled: [true, true, false],
  },
  low: {
    word: "Low",
    label: "Low confidence",
    Icon: ShieldAlert,
    color: "text-band-low",
    edge: "border-[color-mix(in_srgb,var(--band-low)_38%,var(--rule))]",
    tint: "bg-[color-mix(in_srgb,var(--band-low)_12%,var(--surface))]",
    filled: [true, true, true],
  },
};

/** Per-band fill color for the inked meter segments. */
const SEG_FILL: Record<ConfidenceBandValue, string> = {
  high: "bg-band-high border-band-high",
  medium: "bg-band-medium border-band-medium",
  low: "bg-band-low border-band-low",
};

function ConfidenceBand({ band, variant = "chip", className }: ConfidenceBandProps) {
  const spec = BAND_SPEC[band];
  const { Icon } = spec;
  const ariaLabel = `Confidence: ${band}`;

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5", spec.color, className)}
        aria-label={ariaLabel}
      >
        <Icon className="size-[1.05em]" aria-hidden="true" strokeWidth={1.9} />
        <span className="font-sans text-sm font-semibold">{spec.word}</span>
      </span>
    );
  }

  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
          spec.edge,
          spec.tint,
          spec.color,
          className,
        )}
        aria-label={ariaLabel}
      >
        <Icon className="size-3.5" aria-hidden="true" strokeWidth={1.9} />
        <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em]">
          {spec.word}
        </span>
      </span>
    );
  }

  // meter — the 3-segment stacked shape from hero-B + worded readout.
  return (
    <div
      className={cn("flex flex-col gap-3.5", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="flex max-w-[150px] flex-col gap-1.5">
        {spec.filled.map((isFilled, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "h-4 rounded-sm border",
              isFilled
                ? cn(
                    SEG_FILL[band],
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_0_rgba(35,33,28,0.04)]",
                  )
                : "border-rule bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8.5 shrink-0 place-items-center rounded-md border",
            spec.edge,
            spec.tint,
            spec.color,
          )}
        >
          <Icon className="size-[1.1rem]" strokeWidth={1.9} />
        </span>
        <span className="leading-tight">
          <span
            className={cn(
              "flex items-center gap-1.5 font-display text-lg font-semibold",
              spec.color,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-0 border-x-[5px] border-b-[8px] border-x-transparent",
                band === "high" && "border-b-band-high",
                band === "medium" && "border-b-band-medium",
                band === "low" && "border-b-band-low",
              )}
            />
            {spec.word}
          </span>
          <span className="text-xs text-ink-muted">{spec.label} · band only</span>
        </span>
      </div>
    </div>
  );
}

export { ConfidenceBand };
