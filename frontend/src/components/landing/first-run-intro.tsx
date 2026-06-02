"use client";

import * as React from "react";

import { Surface } from "@/components/ui/surface";
import { MonoCode } from "@/components/ui/mono-code";
import { ConfidenceBand } from "@/components/ui/confidence-band";
import { Button } from "@/components/ui/button";
import { BAND_MEANING } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Once-only flag. Bump the suffix to re-show the intro after a redesign. */
const SEEN_KEY = "prevyl.intro.v2.seen";

/** Fired by ExampleTrigger to (re)open the example on demand. */
const EXAMPLE_EVENT = "prevyl:open-example";

/**
 * The shown sample — a real, high-volume Indian export product (per the
 * research: a recognised product, never a toy). Every value is true to the
 * corpus and shown EXACTLY as a live result would be: a word band (never a
 * number), a verbatim citation, a verify line. This is presented as a finished
 * EXAMPLE, not a live or sped-up run, so nothing about it is misleading.
 */
const SAMPLE = {
  query: "stainless steel hex bolts M10",
  code: "7318.15.00",
  description: "Other screws and bolts, whether or not with their nuts or washers",
  source: "Heading 7318",
  gir: "GIR-1",
  verbatim:
    "Screws, bolts, nuts, coach screws ... washers ... and similar articles, of iron or steel.",
} as const;

export interface FirstRunIntroProps {
  /** Suppress on recovery round-trips (arriving with a carried ?q=). */
  suppressed?: boolean;
}

/**
 * FirstRunIntro — the once-only first-run preview (deliverable #1).
 *
 * It shows a first-time visitor a finished EXAMPLE of what Prevyl returns: a
 * real product, its 8-digit code, the confidence band, and the cited basis,
 * with one honest line about how the tool works and how long a real run takes.
 *
 * Honesty (deliberate, after review): it is framed as an EXAMPLE, not the
 * visitor's own run. It does NOT simulate a fast or live classification, so it
 * cannot set a false speed expectation; the real, honest ~40s wait is shown only
 * when the person runs their own. It is skippable at every step (Skip, Esc,
 * backdrop), shown once, never on a recovery round-trip. Entrance motion is
 * calm; reduced-motion settles instantly (handled by the CSS reveal utilities).
 */
export function FirstRunIntro({ suppressed = false }: FirstRunIntroProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Read the once-only flag exactly once, client-side, via an external store
  // (SSR returns "seen" so nothing renders on the server; no hydration flash).
  // The snapshot is cached so writing the flag later does not flip it back.
  const seenCache = React.useRef<boolean | null>(null);
  const subscribe = React.useCallback(() => () => {}, []);
  const getSeen = React.useCallback(() => {
    if (seenCache.current === null) {
      try {
        seenCache.current = window.localStorage.getItem(SEEN_KEY) === "1";
      } catch {
        // storage blocked: treat as seen so we never block the tool
        seenCache.current = true;
      }
    }
    return seenCache.current;
  }, []);
  const seen = React.useSyncExternalStore(subscribe, getSeen, () => true);

  // Auto-show once for newcomers; the manual trigger re-opens it for anyone.
  const firstRun = !suppressed && !seen && !dismissed;
  const show = manualOpen || firstRun;

  // Mark as seen the moment it is shown (external write, truly once).
  React.useEffect(() => {
    if (!show) return;
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [show]);

  // Re-open on demand from the quiet "See an example" trigger, for anyone who
  // skipped the first-run preview or came straight to the hero.
  React.useEffect(() => {
    const open = () => setManualOpen(true);
    window.addEventListener(EXAMPLE_EVENT, open);
    return () => window.removeEventListener(EXAMPLE_EVENT, open);
  }, []);

  // Scroll-lock + initial focus while open.
  React.useEffect(() => {
    if (!show) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    setManualOpen(false);
    document.body.style.overflow = "";
    // Hand off to the field so the person can start typing immediately.
    window.requestAnimationFrame(() => {
      const el = document.getElementById(
        "product-description",
      ) as HTMLTextAreaElement | null;
      el?.focus();
    });
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button,[href],[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [dismiss],
  );

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      role="presentation"
    >
      {/* backdrop — click to dismiss */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-[color-mix(in_oklab,var(--ink)_42%,transparent)] backdrop-blur-[2px] motion-safe:reveal-ink"
      />

      {/* dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="An example of what Prevyl returns"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-[34rem] outline-none motion-safe:reveal-rise"
      >
        <Surface
          variant="raised"
          sheet
          className="surface-grain flex max-h-[88dvh] flex-col gap-5 overflow-y-auto p-[clamp(1.25rem,3.5vw,2rem)]"
        >
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
              An example result
            </p>
            <button
              type="button"
              onClick={dismiss}
              className={cn(
                "-mr-1 -mt-1 shrink-0 rounded-sm px-2 py-1 font-sans text-meta font-semibold text-ink-muted",
                "transition-colors hover:text-accent-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              Skip
            </button>
          </div>

          {/* honest lead — what this is, and how long a real run takes */}
          <p className="max-w-[48ch] font-sans text-body leading-relaxed text-ink">
            Here is what Prevyl returns for one product. Your own classification
            reads the full ITC-HS schedule and can take up to a minute.
          </p>

          {/* the product this example is for (an example, NOT the visitor's input) */}
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-t border-rule pt-4">
            <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
              Example product
            </span>
            <span className="font-mono text-[0.95rem] text-ink">
              {SAMPLE.query}
            </span>
          </div>

          {/* the resolved triad: code, description, band (word + meaning), basis */}
          <div className="flex flex-col gap-4">
            <MonoCode
              code={SAMPLE.code}
              size="lg"
              baseline
              className="motion-safe:reveal-clip"
            />
            <p className="max-w-[42ch] font-sans text-meta leading-snug text-ink-muted">
              {SAMPLE.description}
            </p>

            <div className="band-wash-high flex flex-col gap-1.5 rounded-md border px-3.5 py-3 motion-safe:reveal-ink">
              <ConfidenceBand band="high" variant="inline" />
              <span className="font-sans text-meta leading-snug text-ink-muted">
                {BAND_MEANING.high}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-rule pt-3.5 motion-safe:reveal-ink">
              <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
                Basis in the schedule
              </span>
              <blockquote className="m-0 border-l-[3px] border-accent-quiet pl-3 font-display opsz-citation text-meta italic leading-snug text-ink">
                {SAMPLE.verbatim}
              </blockquote>
              <span className="font-sans text-meta text-ink-muted">
                {SAMPLE.source} · {SAMPLE.gir}
              </span>
            </div>
          </div>

          {/* the handoff + the honesty line */}
          <div className="flex flex-col gap-3 border-t border-rule pt-4">
            <Button
              variant="primary"
              size="lg"
              onClick={dismiss}
              className="w-full justify-center"
            >
              Classify your own product
            </Button>
            <p className="font-sans text-meta leading-relaxed text-ink-muted">
              Indicative classification. Verify any code against the schedule
              before filing.
            </p>
          </div>
        </Surface>
      </div>
    </div>
  );
}

/**
 * ExampleTrigger — a quiet, always-available control that re-opens the example,
 * for anyone who skipped the first-run preview or came straight to the hero.
 * Deliberately a subtle text link so it never re-clutters the simplified hero.
 */
export function ExampleTrigger({ className }: { className?: string }) {
  const onClick = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent(EXAMPLE_EVENT));
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm font-sans text-meta text-ink-muted underline-offset-4",
        "transition-colors hover:text-accent-ink hover:underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
    >
      <PlayMark />
      See an example result
    </button>
  );
}

/** A small play-in-circle mark. Decorative; signals "watch the example", not a tick. */
function PlayMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-3.5 text-accent-quiet"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9l5 3-5 3z" />
    </svg>
  );
}
