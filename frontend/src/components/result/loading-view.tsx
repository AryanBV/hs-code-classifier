"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import { DocumentMargin } from "@/components/layout/document-margin";
import { QUERY_ECHO_LABEL, WAIT_LESSONS } from "@/lib/content";

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
 * Honest pacing. We have NO real per-stage signal from the single backend call,
 * so this is NOT progress. It is a calm, deliberately-slow walk through the
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

/** The "while you wait" marginalia rotates slower than the sub-status. */
const LESSON_MS = 8000;

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
 * LoadingView — the signature wait, built as the result CARD ASSEMBLING (D7).
 *
 * It mirrors the result's exact two-pane shape (the same query echo, the same
 * lifted sheet + attached marginalia), so when the real payload lands the
 * skeleton RESOLVES into the answer instead of being replaced by a different
 * screen. There is no progress bar, no percentage, no countdown, and no
 * timer-driven "Done": the empty code slot is anticipation (never a fake code),
 * the stepper walks the real ordered stages on a calm weighted cadence and holds
 * on the final stage, and the margin turns the genuine ~40s into honest domain
 * micro-lessons (occupied time + just-in-time onboarding). A Cancel makes the
 * wait escapable.
 *
 * Accessibility: the parent owns the single role="status" live summary; this
 * view's stepper and rotating lesson are not live regions (they would otherwise
 * announce on every cosmetic tick). The query echo and reassurance are static.
 */
function LoadingView({ query, onCancel }: LoadingViewProps) {
  // active = index of the stage currently shown as working. Walks the weighted
  // schedule, caps at the last stage, and holds there. NOT a completion signal.
  const [active, setActive] = React.useState(0);
  const [subIndex, setSubIndex] = React.useState(0);
  const [lessonIndex, setLessonIndex] = React.useState(0);
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
      setLessonIndex(Math.floor(ms / LESSON_MS) % WAIT_LESSONS.length);
    }, 500);

    return () => window.clearInterval(tick);
  }, []);

  const lastIndex = STEP_LABELS.length - 1;
  const steps: StepperStep[] = STEP_LABELS.map((label, i) => ({
    label,
    // The final stage is never marked done here; only earlier stages settle as
    // the walk passes them. Done marks are non-affirmative nibs, not checkmarks.
    status: i < active ? "done" : i === active ? "active" : "pending",
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
    <div className="pb-12">
      <h1 className="sr-only">
        Classifying your description against the Indian ITC-HS schedule
      </h1>

      {/* query echo — same shape and place as the result, so it is already here
          when the answer resolves in (data, not a pull-quote). */}
      <div className="mb-[clamp(16px,2.4vw,26px)] flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {QUERY_ECHO_LABEL}
        </span>
        <span className="font-mono text-[0.95rem] text-ink">{query}</span>
      </div>

      <DocumentMargin
        document={<LoadingDocument steps={steps} subnote={SUBSTATUS[subIndex]} />}
        margin={
          <LoadingMargin
            lesson={WAIT_LESSONS[lessonIndex]}
            lessonIndex={lessonIndex}
            escalation={escalation}
            onCancel={onCancel}
          />
        }
      />
    </div>
  );
}

/**
 * The document sheet, mid-assembly. The same lifted sheet the result uses, with
 * an empty code slot (anticipation) above the honest staged work log.
 */
function LoadingDocument({
  steps,
  subnote,
}: {
  steps: StepperStep[];
  subnote: string;
}) {
  return (
    <Surface
      as="section"
      variant="raised"
      sheet
      role="region"
      aria-label="Assembling the classification record"
      aria-busy="true"
      className="p-card"
    >
      <div className="doc-margin-rule">
        <p className="mb-5 flex items-center gap-2.5 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          <span
            aria-hidden="true"
            className="size-[7px] rounded-full bg-accent motion-safe:breathe"
          />
          Reading the schedule
        </p>

        {/* the code slot: a skeleton in the 4-2-2 shape. Anticipation, never a
            fake code. It is exactly where the real code clip-reveals in. */}
        <CodeSlotSkeleton />

        <p className="mt-4 max-w-[42ch] font-sans text-meta leading-snug text-ink-muted">
          Your 8-digit tariff line will appear here, with its description.
        </p>

        {/* the honest staged work log */}
        <div className="mt-7 border-t border-rule pt-6">
          <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
            Working through the stages
          </p>
          <Stepper steps={steps} activeNote={subnote} />
        </div>
      </div>
    </Surface>
  );
}

/** The 4-2-2 code placeholder, sized to the display code so the reveal lands in place. */
function CodeSlotSkeleton() {
  const block = "skeleton-calm rounded-sm bg-surface-sunk h-[clamp(2.1rem,5.5vw,3.1rem)]";
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-[0.2em] leading-none"
    >
      <span className={`${block} w-[4.2ch]`} />
      <Dot />
      <span className={`${block} w-[2.2ch]`} />
      <Dot />
      <span className={`${block} w-[2.2ch]`} />
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="mx-[0.06em] size-1.5 rounded-full bg-ink-muted/35"
    />
  );
}

/**
 * The attached marginalia, mid-assembly: an assessment-forming placeholder, then
 * the genuine wait turned into a rotating domain micro-lesson, the honest
 * expectation line (escalating with elapsed time), a Cancel, and the source line.
 */
function LoadingMargin({
  lesson,
  lessonIndex,
  escalation,
  onCancel,
}: {
  lesson: string;
  lessonIndex: number;
  escalation: string | null;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-1 py-1">
      {/* assessment forming — a placeholder for the band, never a fake band */}
      <section aria-label="Assessment forming">
        <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          Assessment
        </p>
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          <div className="skeleton-calm h-3 w-28 rounded-sm bg-surface-sunk" />
          <div className="flex gap-1.5">
            <div className="skeleton-calm h-2 flex-1 rounded-full bg-surface-sunk" />
            <div className="skeleton-calm h-2 flex-1 rounded-full bg-surface-sunk" />
            <div className="skeleton-calm h-2 flex-1 rounded-full bg-surface-sunk" />
          </div>
        </div>
        <p className="mt-4 border-t border-rule pt-3.5 font-sans text-meta leading-relaxed text-ink-muted">
          The confidence band appears once the reading settles.
        </p>
      </section>

      {/* While you wait — the honest, checkable domain note (marginalia voice).
          Keyed by index so each new note fades in (reduced-motion: instant). */}
      <section aria-label="While you wait" className="border-t border-rule pt-4">
        <p className="mb-2 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          While you wait
        </p>
        <p
          key={lessonIndex}
          className="font-display opsz-citation text-meta leading-relaxed text-ink motion-safe:reveal-ink"
        >
          {lesson}
        </p>
      </section>

      {/* honest expectation, escalating with elapsed time */}
      <div className="min-h-[1.5rem] border-t border-rule pt-4">
        <p className="font-sans text-meta leading-relaxed text-ink-muted">
          {escalation ??
            "This usually takes up to a minute. Prevyl is reading the schedule, not guessing."}
        </p>
      </div>

      {/* Cancel — the wait is never a trap */}
      {onCancel ? (
        <Button variant="ghost" onClick={onCancel} className="gap-2.5 self-start">
          <X aria-hidden="true" strokeWidth={1.9} />
          Cancel
        </Button>
      ) : null}

      <p className="flex items-center gap-1.5 font-sans text-meta tracking-[0.02em] text-ink-muted">
        <span
          aria-hidden="true"
          className="font-display text-[0.95rem] leading-none text-accent-quiet opacity-80"
        >
          §
        </span>
        Prevyl · Schedule 2 · ITC(HS) 2022
      </p>
    </div>
  );
}

export { LoadingView };
