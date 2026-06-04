import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DatedValueRowProps {
  /** The row label, e.g. "Export duty", "RoDTEP". */
  label: string;
  /** The headline value, e.g. "NIL", "0.8%". Never a bare rate when withheld. */
  value: string;
  /** Optional cap or qualifying condition, shown muted under the value. */
  detail?: string | null;
  /** When the datum was last checked, e.g. "01 Feb 2026". */
  asOn?: string | null;
  /** The official source label, e.g. "Customs Tariff". */
  sourceLabel?: string | null;
  /** The official source deep link. */
  sourceUrl?: string | null;
  /**
   * A calm secondary advisory line shown under the date/source when the datum is
   * past its freshness budget, e.g. "Verify the current rate on CBIC". The value
   * itself is still shown in full — this never replaces it.
   */
  advisory?: string | null;
  className?: string;
}

/**
 * DatedValueRow — a single dated/sourced datum in the existing dl-row idiom used
 * by the "Export policy detail" expander (a left label, an inked value, then
 * muted marginalia for the cap, the as-on date, and the source link). Every
 * money/value row in the trade-intel block rides this so each number carries its
 * date + source visibly (the §0 honesty rule). Presentational; server component.
 */
function DatedValueRow({
  label,
  value,
  detail,
  asOn,
  sourceLabel,
  sourceUrl,
  advisory,
  className,
}: DatedValueRowProps) {
  const asOnText = (asOn ?? "").trim();
  const detailText = (detail ?? "").trim();
  const srcLabel = (sourceLabel ?? "").trim();
  const href = (sourceUrl ?? "").trim();
  const advisoryText = (advisory ?? "").trim();

  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-rule py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4",
        className,
      )}
    >
      <span className="font-sans text-meta text-ink-muted sm:min-w-[8.5rem] sm:shrink-0">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[0.95rem] font-medium text-ink">{value}</span>
        {detailText ? (
          <span className="font-sans text-meta leading-snug text-ink-muted">{detailText}</span>
        ) : null}
        {/* the date + source marginalia — every datum is dated + sourced */}
        {(asOnText || href) ? (
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
                <ArrowUpRight aria-hidden="true" strokeWidth={1.9} className="size-3" />
              </a>
            ) : srcLabel ? (
              <span>{srcLabel}</span>
            ) : null}
          </span>
        ) : null}
        {/* stale advisory — a calm secondary line; the value above is still shown in full */}
        {advisoryText ? (
          <span className="font-sans text-eyebrow italic leading-snug text-ink-muted">
            {advisoryText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { DatedValueRow };
