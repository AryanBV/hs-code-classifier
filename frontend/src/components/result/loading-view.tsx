"use client";

import * as React from "react";
import { Clock, ShieldCheck } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Stepper, type StepperStep } from "@/components/ui/stepper";

/** Real pipeline stages, in plain language (L0..L5). */
const STEP_LABELS = [
  "Reading your description",
  "Finding the right chapter",
  "Retrieving candidate headings",
  "Applying classification rules",
  "Choosing the tariff line",
  "Checking it against the legal notes",
] as const;

const ADVANCE_MS = 520;

export interface LoadingViewProps {
  query: string;
}

/**
 * LoadingView — the honest staged stepper (D7). Advances one stage at a time on
 * a calm timer, marking earlier stages done and the current one active. It HOLDS
 * on the final stage (never shows everything done) until the parent swaps the
 * result in. No percentages, no countdown.
 */
function LoadingView({ query }: LoadingViewProps) {
  // active = index of the currently-working stage. Caps at the last stage and
  // holds there until the parent unmounts this view.
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const lastIndex = STEP_LABELS.length - 1;
    if (active >= lastIndex) return;
    const id = window.setTimeout(() => {
      setActive((i) => Math.min(i + 1, lastIndex));
    }, ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [active]);

  const steps: StepperStep[] = STEP_LABELS.map((label, i) => ({
    label,
    status: i < active ? "done" : i === active ? "active" : "pending",
  }));

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-2 sm:py-7">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        {/* working eyebrow + query echo */}
        <h1 className="sr-only">
          Classifying your description against the Indian ITC-HS schedule
        </h1>
        <p className="mb-3.5 flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <span
            aria-hidden="true"
            className="size-[7px] rounded-full bg-accent motion-safe:animate-pulse"
          />
          Classifying
        </p>

        <div className="mb-7 max-w-[38ch] text-center sm:mb-10">
          <span className="mb-2 block font-sans text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Description filed
          </span>
          <span className="font-display text-[clamp(1.25rem,3.4vw,1.7rem)] font-normal italic leading-snug text-ink">
            <span aria-hidden="true" className="text-accent">
              &ldquo;
            </span>
            {query}
            <span aria-hidden="true" className="text-accent">
              &rdquo;
            </span>
          </span>
        </div>

        {/* stepper card */}
        <Surface
          as="section"
          variant="raised"
          aria-label="Classification progress"
          aria-busy="true"
          className="w-full p-5 sm:p-[clamp(20px,3vw,30px)]"
        >
          <p className="mb-1 flex items-center gap-2.5 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            <span aria-hidden="true" className="h-px w-[18px] bg-accent" />
            Inscribing the record
          </p>
          <p className="mb-5 font-sans text-[0.78rem] text-ink-muted">
            Each stage is worked in order, then checked.
          </p>

          <Stepper steps={steps} />

          <p className="mt-5 flex items-start gap-2.5 border-t border-rule pt-4 font-sans text-[0.85rem] leading-relaxed text-ink-muted sm:mt-6">
            <Clock
              aria-hidden="true"
              strokeWidth={1.7}
              className="mt-0.5 size-[17px] shrink-0 text-accent"
            />
            <span>
              This usually takes up to a minute. We{" "}
              <b className="font-semibold text-ink">
                check every result against the legal notes
              </b>{" "}
              before showing it.
            </span>
          </p>
        </Surface>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center font-sans text-[0.74rem] tracking-[0.02em] text-ink-muted">
          <ShieldCheck
            aria-hidden="true"
            strokeWidth={1.7}
            className="size-3.5 text-accent opacity-80"
          />
          Prevyl · Schedule 2 · ITC(HS) 2022 · nothing is shown until the notes
          check passes
        </p>
      </div>
    </div>
  );
}

export { LoadingView };
