"use client";

import * as React from "react";
import { Check, CircleHelp, Info, ShieldCheck } from "lucide-react";

import type { UiQuestion } from "@/lib/types";

/** Sentinel answer id for the "None of these / not sure" escape. */
export const UNSURE_ANSWER_ID = "__unsure__";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export interface QuestionViewProps {
  question: UiQuestion;
  onAnswer: (optionId: string) => void;
}

/**
 * QuestionView — the calm clarifying-question state (state-ask.html). One
 * question, an accessible radio group of option cards (keyboard nav, visible
 * focus, 44px+ targets), a quiet escape, and a reassuring sub-note. No
 * confidence is shown. Selecting an option submits immediately.
 */
function QuestionView({ question, onAnswer }: QuestionViewProps) {
  const options = Array.isArray(question.options) ? question.options : [];
  const groupId = React.useId();

  return (
    <section
      className="mx-auto max-w-[660px] pb-8 lg:max-w-[720px]"
      aria-labelledby={`${groupId}-q`}
    >
      <style>{askKeyframes}</style>

      {/* echoed query — quiet */}
      <div className="mb-[clamp(20px,3vw,30px)] flex flex-wrap items-center gap-2.5">
        <span className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Your product
        </span>
      </div>

      {/* honest framing */}
      <p className="mb-4 flex items-center gap-3 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-ink motion-safe:animate-[prevyl-settle_0.42s_ease_both]">
        <span
          aria-hidden="true"
          className="grid size-[26px] shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent"
        >
          <CircleHelp className="size-[15px]" strokeWidth={1.9} />
        </span>
        One detail will sharpen this
      </p>

      <p className="mb-2.5 font-display text-[clamp(1.02rem,2.1vw,1.22rem)] font-normal italic text-ink-muted motion-safe:animate-[prevyl-settle_0.44s_ease_both]">
        We can place this more precisely with one fact.
      </p>

      <h1
        id={`${groupId}-q`}
        className="mb-[clamp(24px,3.4vw,34px)] max-w-[22ch] text-balance font-display text-[clamp(1.7rem,3.6vw,2.55rem)] font-medium leading-[1.12] text-ink motion-safe:animate-[prevyl-settle_0.46s_ease_both]"
      >
        {question.question}
      </h1>

      {/* option cards — native radios, label cards */}
      <fieldset className="mb-[clamp(18px,2.4vw,24px)] grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">{question.question}</legend>
        {options.map((opt, i) => (
          <label key={opt.id} className="relative block">
            <input
              type="radio"
              name={`${groupId}-options`}
              value={opt.id}
              className="peer absolute size-px opacity-0"
              onChange={() => onAnswer(opt.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAnswer(opt.id);
                }
              }}
            />
            <span
              className={[
                "flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-lg border border-rule bg-surface p-4 sm:min-h-[84px] sm:p-[18px]",
                "shadow-[0_1px_0_rgba(35,33,28,0.02),0_10px_28px_-22px_rgba(35,33,28,0.28)]",
                "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-[var(--ease-ledger)]",
                "hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-focus",
                "peer-checked:border-band-high peer-checked:bg-[color-mix(in_srgb,var(--band-high)_12%,var(--surface))]",
                // Nested marker toggles are driven from the checked peer via
                // arbitrary descendant variants on this sibling span.
                "peer-checked:[&_.opt-marker]:border-band-high peer-checked:[&_.opt-marker]:bg-band-high peer-checked:[&_.opt-marker]:text-accent-contrast",
                "peer-checked:[&_.opt-ltr]:hidden peer-checked:[&_.opt-chk]:block",
              ].join(" ")}
            >
              {/* ledger letter / check marker */}
              <span
                aria-hidden="true"
                className={[
                  "opt-marker grid size-8 shrink-0 place-items-center rounded-lg border border-rule bg-surface-sunk",
                  "font-mono text-[0.86rem] font-semibold text-ink-muted",
                  "transition-colors duration-150 ease-[var(--ease-ledger)]",
                ].join(" ")}
              >
                <span className="opt-ltr">{LETTERS[i] ?? i + 1}</span>
                <Check className="opt-chk hidden size-[17px]" strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[1.02rem] font-semibold leading-snug text-ink">
                  {opt.label}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* tertiary escape — never trapped */}
      <div className="mb-[clamp(22px,3vw,30px)] flex flex-wrap items-center gap-x-3.5 gap-y-2 motion-safe:animate-[prevyl-settle_0.44s_ease_both]">
        <button
          type="button"
          onClick={() => onAnswer(UNSURE_ANSWER_ID)}
          className="inline-flex min-h-11 items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-3.5 py-2 font-sans text-[0.92rem] font-semibold text-accent-ink transition-colors hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] hover:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Info aria-hidden="true" strokeWidth={1.9} className="size-4 text-accent" />
          <span className="underline decoration-[color-mix(in_srgb,var(--accent)_30%,var(--rule))] underline-offset-[3px]">
            None of these / not sure
          </span>
        </button>
        <span className="font-sans text-[0.8rem] text-ink-muted">
          We will classify with what we have and flag the uncertainty.
        </span>
      </div>

      {/* reassuring sub-note */}
      <p className="mt-[clamp(18px,2.6vw,26px)] flex max-w-[54ch] items-start gap-3 border-t border-rule pt-[clamp(16px,2.2vw,20px)] font-sans text-[0.88rem] leading-relaxed text-ink-muted motion-safe:animate-[prevyl-settle_0.44s_ease_both]">
        <ShieldCheck aria-hidden="true" strokeWidth={1.7} className="mt-0.5 size-[17px] shrink-0 text-accent" />
        <span>
          We only ask when <b className="font-semibold text-ink">one fact changes the code</b>,
          never to stall.
        </span>
      </p>
    </section>
  );
}

const askKeyframes = `
@keyframes prevyl-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;

export { QuestionView };
