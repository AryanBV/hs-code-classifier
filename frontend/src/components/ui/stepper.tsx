import * as React from "react";

import { cn } from "@/lib/utils";

type StepStatus = "done" | "active" | "pending";

export interface StepperStep {
  label: string;
  status: StepStatus;
}

export interface StepperProps {
  steps: StepperStep[];
  className?: string;
  /**
   * Honest sub-status for the ACTIVE stage (e.g. a rotating "still working"
   * note). Rendered as quiet text under the active label. Additive; omit it and
   * the stepper shows only the indeterminate active state. This component never
   * fabricates progress: it renders exactly the status it is given and the
   * active stage is shown as an INDETERMINATE, calm state, never a filling bar.
   */
  activeNote?: string;
}

const STATE_WORD: Record<StepStatus, string> = {
  done: "Checked",
  active: "Working",
  pending: "Next",
};

/**
 * Stepper — the honest staged loading list (D7). It is a pure view over a
 * "done / active / pending" model the parent derives from REAL signals; it does
 * not advance itself and shows no percentage, countdown, or filling bar. The
 * active stage is an indeterminate calm pulse (work is happening, duration
 * unknown). The done mark is a letterpress nib press, NEVER a checkmark — this
 * is a process record, not a "verified correct" claim.
 *
 * The parent owns the single live-region summary (role="status"); this list is
 * not a live region (no aria-live) to avoid an announcement firehose. Markers
 * and the connecting rail are decorative (aria-hidden); each row carries its own
 * accessible label.
 */
function Stepper({ steps, className, activeNote }: StepperProps) {
  return (
    <ol className={cn("relative m-0 list-none p-0", className)} role="list">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const word = STATE_WORD[step.status];
        return (
          <li
            key={`${step.label}-${i}`}
            className="relative grid grid-cols-[34px_1fr] items-start gap-x-4 pb-5 last:pb-0"
            aria-current={step.status === "active" ? "step" : undefined}
            aria-label={`${step.label} — ${word.toLowerCase()}`}
          >
            {/* rail cell: marker + connecting line to the next step (decorative) */}
            <div className="relative flex min-h-[34px] flex-col items-center">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-[34px] bottom-[-20px] w-px -translate-x-1/2",
                    step.status === "done"
                      ? "bg-accent-quiet opacity-60"
                      : "bg-rule",
                  )}
                />
              )}
              <Marker status={step.status} index={i + 1} />
            </div>

            {/* body: label + per-step state word + (active) honest sub-status */}
            <div className="min-h-[34px] pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span
                  className={cn(
                    "leading-snug",
                    step.status === "done" && "font-sans font-medium text-ink",
                    step.status === "active" &&
                      "font-display text-label font-semibold text-ink",
                    step.status === "pending" &&
                      "font-sans font-medium text-ink-muted opacity-80",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "font-sans text-eyebrow font-semibold uppercase tracking-[0.12em]",
                    step.status === "done" && "text-accent-quiet",
                    step.status === "active" && "text-band-high",
                    step.status === "pending" && "text-ink-muted opacity-60",
                  )}
                >
                  {word}
                </span>
              </div>

              {step.status === "active" && (
                <>
                  {/* Indeterminate marker: a calm row of ledger nibs that fade
                      in sequence. NOT a filling bar — no fraction is implied. */}
                  <div
                    aria-hidden="true"
                    className="mt-2.5 flex items-center gap-1.5"
                  >
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-1.5 rounded-full bg-accent-quiet motion-safe:breathe"
                        style={{ animationDelay: `${dot * 320}ms` }}
                      />
                    ))}
                  </div>
                  {activeNote && (
                    <p className="mt-1.5 font-sans text-meta text-ink-muted">
                      {activeNote}
                    </p>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({ status, index }: { status: StepStatus; index: number }) {
  if (status === "done") {
    // A letterpress nib PRESS — a non-affirmative archival mark. NEVER a
    // checkmark: a completed stage is "this step ran", not "this is correct".
    return (
      <span
        aria-hidden="true"
        className={cn(
          "relative z-[1] grid size-[34px] place-items-center rounded-full border",
          "border-[color-mix(in_oklab,var(--accent)_28%,var(--rule))]",
          "bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]",
          "elev-1",
        )}
      >
        <span className="size-2 rounded-full bg-accent-quiet" />
      </span>
    );
  }

  if (status === "active") {
    // A ledger nib resting on the page: a quiet halo, indeterminate pulse.
    return (
      <span
        aria-hidden="true"
        className={cn(
          "relative z-[1] grid size-[34px] place-items-center rounded-full border border-accent bg-surface",
          "ring-4 ring-[color-mix(in_oklab,var(--accent)_9%,transparent)]",
        )}
      >
        <span className="size-[9px] rounded-full bg-accent motion-safe:breathe" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="relative z-[1] grid size-[34px] place-items-center rounded-full border border-rule bg-transparent"
    >
      <span className="font-mono text-meta font-medium text-ink-muted opacity-70">
        {index}
      </span>
    </span>
  );
}

export { Stepper };
