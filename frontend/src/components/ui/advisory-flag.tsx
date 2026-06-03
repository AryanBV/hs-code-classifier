import * as React from "react";
import { ArrowUpRight, Flag } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AdvisoryFlagProps {
  /** The advisory message (a "may apply, verify" screening line, never a yes/no). */
  message: string;
  /** The standing "absence of this flag is not a clearance" line. */
  absenceNote: string;
  /** The flag-list version date, e.g. "App.3 v.2026". */
  versionDate?: string | null;
  /** The official source deep link. */
  sourceUrl?: string | null;
  /** Short source label for the link. */
  sourceLabel?: string | null;
  className?: string;
}

/**
 * AdvisoryFlag — a flag-only advisory row (SCOMET / BIS-QCO / AD-CVD). It NEVER
 * asserts a yes/no for a line: it surfaces a "may apply, verify" screening note,
 * the standing "absence is not a clearance" caveat, the flag-list version date,
 * and a source link. Uses the amber band family at low chroma (it is a watch
 * note, not the danger/warning status), in the existing flat hairline idiom.
 * Presentational; server component.
 */
function AdvisoryFlag({
  message,
  absenceNote,
  versionDate,
  sourceUrl,
  sourceLabel,
  className,
}: AdvisoryFlagProps) {
  const version = (versionDate ?? "").trim();
  const href = (sourceUrl ?? "").trim();
  const srcLabel = (sourceLabel ?? "").trim();

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-sm border border-l-[3px] border-rule-strong border-l-band-medium bg-surface-sunk px-3.5 py-3",
        className,
      )}
    >
      <Flag
        aria-hidden="true"
        strokeWidth={1.9}
        className="mt-0.5 size-4 shrink-0 text-band-medium"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-sans text-[0.92rem] leading-snug text-ink">{message}</p>
        <p className="font-sans text-meta leading-snug text-ink-muted">{absenceNote}</p>
        {(version || href) ? (
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-sans text-eyebrow text-ink-muted">
            {version ? <span>{version}</span> : null}
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
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { AdvisoryFlag };
