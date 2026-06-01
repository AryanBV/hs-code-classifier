import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type StepStatus = "done" | "active" | "pending";

export interface StepperStep {
  label: string;
  status: StepStatus;
}

export interface StepperProps {
  steps: StepperStep[];
  className?: string;
}

const STATE_WORD: Record<StepStatus, string> = {
  done: "Done",
  active: "Working",
  pending: "Next",
};

/**
 * Stepper — the honest staged loading list (state-loading.html, D7). Each stage
 * is worked in order then checked; no percentages, no countdown.
 *   done    = a letterpress accent tick (NOT a green check)
 *   active  = a calm ledger nib + a slow inscribing line (entrance/loop subtle)
 *   pending = a muted hollow marker
 * The keyframes are co-located; the global reduced-motion guard in globals.css
 * neutralizes them (duration→0) when the user prefers reduced motion.
 */
function Stepper({ steps, className }: StepperProps) {
  return (
    <ol
      className={cn("relative m-0 list-none p-0", className)}
      role="list"
      aria-live="polite"
    >
      <style>{stepperKeyframes}</style>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const word = STATE_WORD[step.status];
        return (
          <li
            key={`${step.label}-${i}`}
            className={cn(
              "relative grid grid-cols-[34px_1fr] items-start gap-x-4 pb-5 last:pb-0",
            )}
            aria-current={step.status === "active" ? "step" : undefined}
            aria-label={`${step.label} — ${word.toLowerCase()}`}
          >
            {/* rail cell: marker + connecting line to the next step */}
            <div className="relative flex min-h-[34px] flex-col items-center">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-[34px] w-0.5 -translate-x-1/2",
                    "bottom-[-20px]",
                    step.status === "done"
                      ? "bg-accent opacity-55"
                      : step.status === "active"
                        ? "bg-[linear-gradient(to_bottom,var(--accent)_0_14px,var(--rule)_14px_100%)]"
                        : "bg-rule",
                  )}
                />
              )}
              <Marker status={step.status} index={i + 1} />
            </div>

            {/* body: label + per-step state word + (active) inscribing line */}
            <div className="min-h-[34px] pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span
                  className={cn(
                    "leading-snug",
                    step.status === "done" && "font-sans font-medium text-ink",
                    step.status === "active" &&
                      "font-display text-[1.06rem] font-semibold text-ink",
                    step.status === "pending" &&
                      "font-sans font-medium text-ink-muted opacity-80",
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    "font-sans text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
                    step.status === "done" && "text-accent",
                    step.status === "active" && "text-band-high",
                    step.status === "pending" && "text-ink-muted opacity-60",
                  )}
                >
                  {word}
                </span>
              </div>

              {step.status === "active" && (
                <div
                  aria-hidden="true"
                  className="relative mt-2.5 h-[3px] max-w-[230px] overflow-hidden rounded-sm bg-surface-sunk"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-[46%] rounded-sm bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_18%,transparent)_0%,var(--accent)_55%,var(--accent-ink)_100%)]"
                    style={{
                      animation: "prevyl-inscribe 2.8s cubic-bezier(0.4,0,0.2,1) infinite",
                    }}
                  />
                </div>
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
    return (
      <span
        aria-hidden="true"
        className={cn(
          "relative z-[1] grid size-[34px] place-items-center rounded-full border",
          "border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))]",
          "bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent-ink",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_0_rgba(35,33,28,0.04)]",
          "before:absolute before:inset-[3px] before:rounded-full before:border before:border-[color-mix(in_srgb,var(--accent)_26%,transparent)] before:opacity-70",
        )}
      >
        <Check className="size-[17px]" strokeWidth={2.2} />
      </span>
    );
  }

  if (status === "active") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "relative z-[1] grid size-[34px] place-items-center rounded-full border border-accent bg-surface",
          "shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_9%,transparent),inset_0_1px_0_rgba(255,255,255,0.4)]",
        )}
        style={{ animation: "prevyl-nibpulse 2.4s ease-in-out infinite" }}
      >
        <span
          className="size-[9px] rounded-full bg-accent"
          style={{ animation: "prevyl-dotpulse 2.4s ease-in-out infinite" }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="relative z-[1] grid size-[34px] place-items-center rounded-full border border-rule bg-transparent"
    >
      <span className="font-mono text-[0.78rem] font-medium text-ink-muted opacity-70">
        {index}
      </span>
    </span>
  );
}

const stepperKeyframes = `
@keyframes prevyl-inscribe {
  0% { transform: translateX(-115%); }
  100% { transform: translateX(235%); }
}
@keyframes prevyl-nibpulse {
  0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 9%, transparent), inset 0 1px 0 rgba(255,255,255,0.4); }
  50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent) 4%, transparent), inset 0 1px 0 rgba(255,255,255,0.4); }
}
@keyframes prevyl-dotpulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.82); opacity: 0.78; }
}
`;

export { Stepper };
