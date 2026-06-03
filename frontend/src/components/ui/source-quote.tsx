import * as React from "react";

import { cn } from "@/lib/utils";

export interface SourceQuoteProps {
  /** The verbatim official text. Rendered as a quote, never paraphrased. */
  text: string;
  /** Small-caps label above the quote, e.g. "Official text (verbatim)". */
  label?: string;
  className?: string;
}

/**
 * SourceQuote — the verbatim "official text" blockquote, in the exact
 * verbatim-citation idiom already in force in result-view's "Basis in the
 * schedule" (a left oxblood rule, sunk paper, Fraunces italic). Italic here is
 * the verbatim-only rule: this is the official text you can look up, never
 * generated reasoning. Presentational; server component.
 */
function SourceQuote({ text, label, className }: SourceQuoteProps) {
  const quote = (text ?? "").trim();
  const labelText = (label ?? "").trim();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {labelText ? (
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {labelText}
        </span>
      ) : null}
      <blockquote
        className={cn(
          "m-0 rounded-sm border-l-[3px] border-accent-quiet bg-surface-sunk px-3.5 py-3",
          "font-display text-[0.95rem] font-normal italic leading-snug text-ink opsz-citation",
        )}
      >
        {quote || "No verbatim text was recorded for this line."}
      </blockquote>
    </div>
  );
}

export { SourceQuote };
