"use client";

import * as React from "react";
import { ShieldQuestion, X } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { QUERY_ECHO_LABEL } from "@/lib/content";

/** Real pipeline stages, in plain language (L0..L5). */
const STEP_LABELS = [
  "Reading your description",
  "Finding the right chapter",
  "Retrieving candidate headings",
  "Applying classification rules",
  "Choosing the tariff line",
  "Checking against the legal notes",
] as const;

/**
 * Honest pacing. We have NO real per-stage signal from the single backend call
 * yet, so this is NOT progress. It is a calm, deliberately-slow walk through the
 * ordered stages that weights the slow stages longest and then HOLDS on the
 * final stage indeterminately. It never completes, never stamps "Done", and the
 * final notes-check stage is never marked done by a timer. Each entry is the
 * ms-from-start at which that stage becomes the active one.
 */
const STAGE_ENTER_MS = [0, 2600, 7000, 13000, 20000, 27000] as const;

/** Rotating honest sub-status for the active stage. Never claims a fraction. */
const SUBSTATUS = [
  "Working through the schedule.",
  "Weighing the closest headings.",
  "Reading the chapter and section notes.",
  "Being careful with the boundary cases.",
] as const;
const SUBSTATUS_MS = 6500;

/** Elapsed-time escalation. Honest reassurance, not a deadline. */
const ESCALATE_SLOW_MS = 25000;
const ESCALATE_LONG_MS = 55000;
const SLOW_NOTE = "Taking a little longer. We are being thorough.";
const LONG_NOTE = "Complex products can take the full minute. Still working.";

export interface LoadingViewProps {
  query: string;
  /**
   * Cancel the in-flight run. Optional and additive: when wired, the wait is
   * never a trap. Omit it and the Cancel control is simply not shown.
   */
  onCancel?: () => void;
}

/**
 * LoadingView — the honest wait (D7). There is no progress bar, no percentage,
 * no countdown, and no timer-driven "Done". The stepper walks the real ordered
 * stages on a calm, deliberately-slow weighted cadence and then holds on the
 * final stage indeterminately until the parent swaps the real result in. A
 * rotating sub-status and an elapsed-time escalation line carry the honest
 * "still working" signal, and a Cancel makes the wait escapable.
 *
 * Accessibility: the parent owns the single role="status" live summary; this
 * view's stepper is not a live region (it would otherwise announce on every
 * cosmetic tick). The query echo and reassurance are static.
 */
function LoadingView({ query, onCancel }: LoadingViewProps) {
  // active = index of the stage currently shown as working. Walks the weighted
  // schedule, caps at the last stage, and holds there. NOT a completion signal.
  const [active, setActive] = React.useState(0);
  const [subIndex, setSubIndex] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const start = Date.now();
    const lastIndex = STEP_LABELS.length - 1;

    const tick = window.setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);

      // Advance the active stage per the weighted schedule, holding on the last.
      let next = 0;
      for (let i = 0; i < STAGE_ENTER_MS.length; i += 1) {
        if (ms >= STAGE_ENTER_MS[i]) next = i;
      }
      setActive(Math.min(next, lastIndex));

      setSubIndex(Math.floor(ms / SUBSTATUS_MS) % SUBSTATUS.length);
    }, 500);

    return () => window.clearInterval(tick);
  }, []);

  const lastIndex = STEP_LABELS.length - 1;
  const steps: StepperStep[] = STEP_LABELS.map((label, i) => ({
    label,
    // The final stage is never marked done here; only earlier stages settle as
    // the walk passes them. Done marks are non-affirmative nibs, not checkmarks.
    status:
      i < active ? "done" : i === active ? "active" : "pending",
  }));
  // Defensive: never let a timer mark the final notes-check stage as done.
  if (active >= lastIndex) {
    steps[lastIndex].status = "active";
  }

  const escalation =
    elapsed >= ESCALATE_LONG_MS
      ? LONG_NOTE
      : elapsed >= ESCALATE_SLOW_MS
        ? SLOW_NOTE
        : null;

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center py-2 sm:py-7">
      <div className="flex w-full max-w-focus flex-col items-center">
        <h1 className="sr-only">
          Classifying your description against the Indian ITC-HS schedule
        </h1>

        {/* working eyebrow — calm, indeterminate */}
        <p className="mb-3.5 flex items-center gap-2.5 font-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <span
            aria-hidden="true"
            className="size-[7px] rounded-full bg-accent motion-safe:breathe"
          />
          Classifying
        </p>

        {/* query echo — data, not a pull-quote */}
        <div className="mb-7 max-w-[40ch] text-center sm:mb-10">
          <span className="mb-2 block font-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {QUERY_ECHO_LABEL}
          </span>
          <span className="font-mono text-[clamp(0.98rem,2.4vw,1.18rem)] leading-snug text-ink">
            {query}
          </span>
        </div>

        {/* stepper card */}
        <Surface
          as="section"
          variant="raised"
          aria-label="Classification progress"
          aria-busy="true"
          className="w-full p-5 sm:p-card"
        >
          <p className="mb-1 font-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Checking against the legal notes
          </p>
          <p className="mb-5 font-sans text-meta text-ink-muted">
            Each stage is worked in order, then the whole result is checked.
          </p>

          <Stepper steps={steps} activeNote={SUBSTATUS[subIndex]} />

          {/* elapsed-time escalation — honest reassurance, appears only late */}
          <div aria-hidden="true" className="mt-5 min-h-[1.25rem] border-t border-rule pt-4">
            {escalation ? (
              <p className="font-sans text-meta leading-relaxed text-ink-muted motion-safe:reveal-ink">
                {escalation}
              </p>
            ) : (
              <p className="font-sans text-meta leading-relaxed text-ink-muted">
                This usually takes up to a minute. Nothing is shown until the
                notes check passes.
              </p>
            )}
          </div>
        </Surface>

        {/* Cancel — the wait is never a trap */}
        {onCancel ? (
          <div className="mt-5 flex">
            <Button variant="ghost" onClick={onCancel} className="gap-2.5">
              <X aria-hidden="true" strokeWidth={1.9} />
              Cancel
            </Button>
          </div>
        ) : null}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center font-sans text-meta tracking-[0.02em] text-ink-muted">
          <ShieldQuestion
            aria-hidden="true"
            strokeWidth={1.7}
            className="size-3.5 text-accent-quiet opacity-80"
          />
          Prevyl · Schedule 2 · ITC(HS) 2022
        </p>
      </div>
    </div>
  );
}

export { LoadingView };
