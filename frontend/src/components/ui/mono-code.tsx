"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type MonoCodeSize = "sm" | "md" | "lg" | "display";

export interface MonoCodeProps {
  /** A dotted HS code, e.g. "7318.15.00" (or a bare segment). */
  code: string;
  size?: MonoCodeSize;
  className?: string;
  /**
   * Show a one-click copy affordance (copies the raw dotted code; a secondary
   * action copies it without dots). Additive — defaults off so existing
   * call-sites are unchanged. Intended for the hero `display` code.
   */
  copyable?: boolean;
  /**
   * Seat the code on a hairline ledger baseline rule with a letterpress top
   * bevel, so it reads struck-into-paper. Additive — defaults off.
   */
  baseline?: boolean;
}

const sizeClasses: Record<MonoCodeSize, string> = {
  sm: "text-[0.95rem] tracking-[0.01em]",
  md: "text-body tracking-[0.01em]",
  lg: "text-section tracking-[0.005em]",
  // The hero code — uses the role-named display scale (clamp ~2.6 → 4.25rem).
  display: "text-code leading-[var(--leading-tight)]",
};

/** Group an HS code into its 4-2-2 segments, splitting on the literal ".". */
function segmentCode(code: string): string[] {
  const trimmed = code.trim();
  if (trimmed.includes(".")) return trimmed.split(".");
  // Bare digits: best-effort 4-2-2 grouping (e.g. "73181500" -> 7318 15 00).
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 4) return [trimmed];
  const groups = [digits.slice(0, 4)];
  if (digits.length > 4) groups.push(digits.slice(4, 6));
  if (digits.length > 6) groups.push(digits.slice(6, 8));
  return groups;
}

/**
 * MonoCode — the HS code as the page's hero object, set in Commit Mono with
 * tabular figures. Segmented 4-2-2 with a quiet grouping GAP (not a loud dot):
 * the separator dots are demoted (smaller, baseline-nudged, ink-muted) so the
 * gap separates, and the final group (the `.00` a broker confirms) is muted.
 *
 * Honesty: this is data, not a verdict — no tick, no color claim. The whole
 * code is `user-select: all` so a CHA can grab it in one gesture; `copyable`
 * adds an explicit copy button (raw + without-dots) for the hero.
 */
function MonoCode({
  code,
  size = "md",
  className,
  copyable = false,
  baseline = false,
}: MonoCodeProps) {
  const isDisplay = size === "display";
  const segments = segmentCode(code);
  const lastIndex = segments.length - 1;

  // Screen-reader reading: grouped, no spelled-out "period".
  const ariaLabel = `HS code ${segments.join(", ")}`;

  const codeEl = (
    <span
      className={cn(
        "inline-flex select-all items-baseline font-mono text-ink",
        isDisplay
          ? "font-[number:var(--weight-label)] tracking-[var(--tracking-display)]"
          : "font-medium",
        sizeClasses[size],
      )}
      style={{ userSelect: "all" }}
      aria-label={ariaLabel}
    >
      {segments.map((part, i) => {
        // The trailing group is the part a broker confirms — keep it muted.
        const isTail = i === lastIndex && segments.length > 1;
        return (
          <React.Fragment key={`${part}-${i}`}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "text-ink-muted",
                  // Demote the dot: smaller, quiet — the GAP does the separating.
                  isDisplay ? "mx-[0.16em] text-[0.62em]" : "mx-[0.06em] text-[0.7em]",
                )}
              >
                .
              </span>
            )}
            <span
              aria-hidden="true"
              className={cn(isTail && "text-ink-muted")}
            >
              {part}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );

  if (!copyable && !baseline) {
    return <span className={cn("inline-block", className)}>{codeEl}</span>;
  }

  if (!copyable) {
    // Baseline rule only (no copy affordance).
    return (
      <span
        className={cn(
          "inline-flex flex-col items-start",
          baseline && "border-b border-rule-strong pb-1.5 letterpress-top",
          className,
        )}
      >
        {codeEl}
      </span>
    );
  }

  return (
    <CopyableCode
      code={code}
      segments={segments}
      baseline={baseline}
      className={className}
    >
      {codeEl}
    </CopyableCode>
  );
}

/** The copyable hero treatment: code + a quiet two-action copy control. */
function CopyableCode({
  code,
  segments,
  baseline,
  className,
  children,
}: {
  code: string;
  segments: string[];
  baseline: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState<null | "dotted" | "plain">(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dotted = segments.join(".");
  const plain = segments.join("");

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = React.useCallback(
    async (value: string, which: "dotted" | "plain") => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(which);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 1600);
      } catch {
        // Clipboard unavailable — the code is user-select:all as a fallback.
      }
    },
    [],
  );

  return (
    <div className={cn("inline-flex flex-col items-start gap-2", className)}>
      <div
        className={cn(
          "self-stretch",
          baseline && "border-b border-rule-strong pb-1.5 letterpress-top",
        )}
      >
        {children}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => copy(dotted, "dotted")}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-rule-strong px-2.5 py-1",
            "font-sans text-meta text-ink-muted",
            "transition-colors hover:text-ink hover:border-ink-muted",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
          aria-label={`Copy code ${code}`}
        >
          {copied === "dotted" ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => copy(plain, "plain")}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-md px-1.5 py-1",
            "font-mono text-meta text-ink-muted",
            "transition-colors hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
          aria-label={`Copy code without dots, ${plain}`}
        >
          {copied === "plain" ? "Copied" : "no dots"}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? `Copied ${copied === "plain" ? plain : dotted}` : ""}
        </span>
      </div>
    </div>
  );
}

export { MonoCode };
