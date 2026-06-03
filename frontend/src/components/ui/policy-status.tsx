import * as React from "react";
import { AlertTriangle, Ban, Info, MinusCircle } from "lucide-react";

import type { PolicySeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PolicyStatusProps {
  /** Severity drives BOTH the color (band family) and the prominence. */
  severity: PolicySeverity;
  /** The DGFT enum word kept verbatim, e.g. "Free", "Restricted", "Prohibited". */
  statusWord: string;
  /** The pre-written plain-meaning sentence for this status category. */
  plain: string;
  /**
   * "alert" = a promoted, unmissable block (Prohibited/Restricted/STE).
   * "inline" = a calm compact chip + sentence (Free/null).
   */
  prominence: "alert" | "inline";
  /** Optional date line, e.g. "as on 12 May 2026". */
  asOn?: string | null;
  /** Optional source label for the link. */
  sourceLabel?: string | null;
  /** Optional official-source deep link. */
  sourceUrl?: string | null;
  /** Optional children rendered inside an alert block (verbatim source, action). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Per-severity spec. Color is drawn from the EXISTING confidence-band family so a
 * Prohibited rust and a Low-confidence rust are visually coherent (one palette,
 * not two). The band IS the page's one chromatic event; this borrows that family
 * deliberately. Severity maps:
 *   danger  -> rust (band-low)   — Prohibited
 *   warning -> amber (band-medium) — Restricted / STE
 *   notice  -> teal (band-high)  — Free (CALM, never celebratory)
 *   grey    -> ink-muted/rule    — null "not specified" (NEVER rendered as Free)
 */
const SEVERITY_SPEC: Record<
  PolicySeverity,
  {
    wash: string;
    color: string;
    borderL: string;
    chip: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  }
> = {
  danger: {
    wash: "band-wash-low",
    color: "text-band-low",
    borderL: "border-l-band-low",
    chip: "border-[color-mix(in_oklab,var(--band-low)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-low)_12%,var(--surface))] text-band-low",
    Icon: Ban,
  },
  warning: {
    wash: "band-wash-medium",
    color: "text-band-medium",
    borderL: "border-l-band-medium",
    chip: "border-[color-mix(in_oklab,var(--band-medium)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-medium)_12%,var(--surface))] text-band-medium",
    Icon: AlertTriangle,
  },
  notice: {
    wash: "band-wash-high",
    color: "text-band-high",
    borderL: "border-l-band-high",
    chip: "border-[color-mix(in_oklab,var(--band-high)_34%,var(--rule))] bg-[color-mix(in_oklab,var(--band-high)_10%,var(--surface))] text-band-high",
    Icon: Info,
  },
  grey: {
    wash: "border-rule bg-surface-sunk",
    color: "text-ink-muted",
    borderL: "border-l-rule-strong",
    chip: "border-rule bg-surface text-ink-muted",
    Icon: MinusCircle,
  },
};

function SourceLine({
  asOn,
  sourceLabel,
  sourceUrl,
}: {
  asOn?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
}) {
  const asOnText = (asOn ?? "").trim();
  const href = (sourceUrl ?? "").trim();
  const srcLabel = (sourceLabel ?? "").trim();
  if (!asOnText && !href && !srcLabel) return null;

  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-sans text-eyebrow text-ink-muted">
      {asOnText ? <span>{`as on ${asOnText}`}</span> : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 text-accent-ink underline-offset-4 hover:underline",
            "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          {srcLabel || "Source"}
        </a>
      ) : srcLabel ? (
        <span>{srcLabel}</span>
      ) : null}
    </span>
  );
}

/**
 * PolicyStatus — the severity-graded export-policy status. The status WORD is
 * kept verbatim; severity drives color (from the band family) and prominence.
 * "alert" promotes it to a washed, left-ruled block for Prohibited/Restricted/STE
 * (unmissable, ANSI Z535); "inline" is a calm chip + sentence for Free/null.
 * Presentational; server component.
 */
function PolicyStatus({
  severity,
  statusWord,
  plain,
  prominence,
  asOn,
  sourceLabel,
  sourceUrl,
  children,
  className,
}: PolicyStatusProps) {
  const spec = SEVERITY_SPEC[severity];
  const { Icon } = spec;
  const word = (statusWord ?? "").trim() || "Not specified";

  if (prominence === "alert") {
    return (
      <section
        aria-label={`Export policy: ${word}`}
        className={cn(
          "flex flex-col gap-2.5 rounded-md border border-l-[3px] p-card",
          spec.wash,
          spec.borderL,
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon aria-hidden className={cn("size-5 shrink-0", spec.color)} strokeWidth={2} />
          <span
            className={cn(
              "font-display opsz-section text-section font-[number:var(--weight-section)] leading-none",
              spec.color,
            )}
          >
            {word}
          </span>
        </div>
        <p className="max-w-read font-sans text-[0.98rem] leading-relaxed text-ink">{plain}</p>
        <SourceLine asOn={asOn} sourceLabel={sourceLabel} sourceUrl={sourceUrl} />
        {children}
      </section>
    );
  }

  // inline — calm chip + sentence (Free / null).
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
            "font-sans text-eyebrow font-semibold uppercase tracking-[0.08em]",
            spec.chip,
          )}
        >
          <Icon aria-hidden className="size-3.5" strokeWidth={2} />
          {word}
        </span>
        <span className="font-sans text-[0.92rem] leading-snug text-ink">{plain}</span>
      </div>
      <SourceLine asOn={asOn} sourceLabel={sourceLabel} sourceUrl={sourceUrl} />
      {children}
    </div>
  );
}

export { PolicyStatus };
