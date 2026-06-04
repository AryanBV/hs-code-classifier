"use client";

import * as React from "react";
import { ArrowRight, CircleHelp, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QUERY_ECHO_LABEL } from "@/lib/content";
import type { QuestionOption, UiQuestion } from "@/lib/types";

/**
 * The backend's honest escape-option id. For a divergence/sibling/cross-sub
 * question the engine appends an option with THIS id as the LAST option, whose
 * label is the REAL residual leaf description (within-sub, e.g. "Coffee, not
 * roasted, not decaffeinated") or "Other / not listed (please describe)"
 * (cross-sub). It is a REAL answerId the backend understands — NOT a fabricated
 * sentinel. We render it as the calm "none of these" escape and submit its real
 * id verbatim. Triage (`ask_<attr>`) questions carry NO such option; we render
 * no fabricated escape for them.
 */
const ESCAPE_OPTION_ID = "other";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export interface QuestionViewProps {
  question: UiQuestion;
  /**
   * Legacy immediate-submit callback. Preserved for compatibility. Used only as
   * a fallback when the decoupled props below are not supplied.
   */
  onAnswer: (optionId: string) => void;
  /** The original query, echoed back so the person keeps their bearings. */
  query?: string;
  /**
   * Decoupled-selection mode (preferred). When `value`, `onSelect` and
   * `onSubmit` are supplied, selecting an option ONLY updates the selection
   * (no ~40-60s run is fired); an explicit Continue button submits. This keeps
   * keyboard, touch and screen-reader use safe and reversible. Additive: omit
   * them and the component falls back to the legacy immediate `onAnswer`.
   */
  value?: string | null;
  onSelect?: (optionId: string) => void;
  onSubmit?: (optionId: string) => void;
  /** Disables Continue + the controls while the submitted run is in flight. */
  submitting?: boolean;
}

/**
 * QuestionView — the calm clarifying-question state (state-ask.html, D4). One
 * question rendered as an accessible native radio group (arrow-key nav, visible
 * focus, 44px+ targets, touch-safe). Selecting an option does NOT submit;
 * submission is an explicit, guarded Continue. The query is echoed back, no
 * confidence is shown, and a quiet "not sure" escape is always available.
 */
function QuestionView({
  question,
  onAnswer,
  query,
  value,
  onSelect,
  onSubmit,
  submitting = false,
}: QuestionViewProps) {
  const allOptions = Array.isArray(question.options) ? question.options : [];

  // Detect the backend's honest escape WITHIN the offered options: the option
  // whose id is 'other' (appended last for divergence/sibling/cross-sub). This
  // is the robust primary signal — `question.trigger` only corroborates it. When
  // no such option exists (triage `ask_<attr>` questions), there is NO escape to
  // render and NO token to fabricate: the user picks among the real options,
  // which already include the model's fallback choices.
  // FOLLOW-UP: if a triage "skip / not sure" path is ever wanted, it must be a
  // REAL backend-understood id — do NOT reintroduce a client-side sentinel, which
  // is serialized verbatim into the L1-triage LLM prompt and corrupts re-triage.
  const escapeOption: QuestionOption | null =
    allOptions.find((o) => o.id === ESCAPE_OPTION_ID) ?? null;
  // The real radio options are everything except the escape (which renders as a
  // visually-distinct, separated control below the radio group).
  const options = escapeOption
    ? allOptions.filter((o) => o.id !== ESCAPE_OPTION_ID)
    : allOptions;

  const groupId = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);

  // Decoupled when the parent drives selection + submission explicitly.
  const decoupled = Boolean(onSelect && onSubmit);

  // Uncontrolled fallback selection so the radio group still works (and Continue
  // still has something to submit) when used without the decoupled props.
  const [localSelected, setLocalSelected] = React.useState<string | null>(null);
  const selected = decoupled ? (value ?? null) : localSelected;

  // Move focus to the question on mount so SR/keyboard users land on the prompt.
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleSelect = React.useCallback(
    (optionId: string) => {
      if (decoupled) {
        onSelect?.(optionId);
      } else {
        setLocalSelected(optionId);
      }
    },
    [decoupled, onSelect],
  );

  const handleSubmit = React.useCallback(() => {
    if (submitting || !selected) return;
    if (decoupled) {
      onSubmit?.(selected);
    } else {
      onAnswer(selected);
    }
  }, [submitting, selected, decoupled, onSubmit, onAnswer]);

  const canSubmit = Boolean(selected) && !submitting;

  return (
    <section
      className="mx-auto max-w-list pb-8"
      aria-labelledby={`${groupId}-q`}
      aria-busy={submitting || undefined}
    >
      {/* echoed query — data, not a pull-quote */}
      <div className="mb-block flex flex-col gap-1.5">
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {QUERY_ECHO_LABEL}
        </span>
        {query ? (
          <span className="font-mono text-body leading-snug text-ink">{query}</span>
        ) : null}
      </div>

      {/* honest framing */}
      <p className="mb-4 flex items-center gap-3 font-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-accent-ink motion-safe:reveal-ink">
        <span
          aria-hidden="true"
          className="grid size-[26px] shrink-0 place-items-center rounded-md border border-rule-strong bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] text-accent"
        >
          <CircleHelp className="size-[15px]" strokeWidth={1.9} />
        </span>
        One detail will sharpen this
      </p>

      <h1
        id={`${groupId}-q`}
        ref={headingRef}
        tabIndex={-1}
        className="mb-section max-w-[24ch] text-balance font-display text-title font-medium leading-[1.12] text-ink outline-none motion-safe:reveal-rise"
      >
        {question.question}
      </h1>

      {/* option cards — native radios, label cards. Selecting does NOT submit. */}
      <fieldset
        className="mb-block grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2"
        disabled={submitting}
      >
        <legend className="sr-only">{question.question}</legend>
        {options.map((opt, i) => {
          const isChecked = selected === opt.id;
          return (
            <label key={opt.id} className="relative block">
              <input
                type="radio"
                name={`${groupId}-options`}
                value={opt.id}
                checked={isChecked}
                onChange={() => handleSelect(opt.id)}
                className="peer absolute size-px opacity-0"
              />
              <span
                className={[
                  "flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-lg border border-rule-strong bg-surface p-4 elev-1 sm:min-h-[84px] sm:p-[18px]",
                  "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-[var(--ease-ledger)]",
                  "hover:-translate-y-px hover:border-accent hover:bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-focus",
                  "peer-checked:border-accent peer-checked:bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))]",
                  "peer-checked:[&_.opt-marker]:border-accent peer-checked:[&_.opt-marker]:bg-accent peer-checked:[&_.opt-marker]:text-accent-contrast",
                ].join(" ")}
              >
                {/* ledger letter — stays a letter when checked (no affirming check) */}
                <span
                  aria-hidden="true"
                  className={[
                    "opt-marker grid size-8 shrink-0 place-items-center rounded-md border border-rule-strong bg-surface-sunk",
                    "font-mono text-[0.86rem] font-semibold text-ink-muted",
                    "transition-colors duration-150 ease-[var(--ease-ledger)]",
                  ].join(" ")}
                >
                  {LETTERS[i] ?? i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-label font-semibold leading-snug text-ink">
                    {opt.label}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* honest escape — rendered ONLY when the backend offers an `id:'other'`
          residual option. It is separated from the real radios and labelled with
          the backend's REAL option label; selecting it submits its real id
          ('other'), which the engine understands. Triage questions have no such
          option, so nothing fabricated is rendered. */}
      {escapeOption ? (
        <div className="mb-block flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSelect(escapeOption.id)}
            aria-pressed={selected === escapeOption.id}
            className={[
              "inline-flex min-h-11 items-center gap-2.5 rounded-md border px-3.5 py-2 font-sans text-body font-semibold text-accent-ink",
              "transition-colors disabled:pointer-events-none disabled:opacity-55",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              selected === escapeOption.id
                ? "border-accent bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))]"
                : "border-transparent bg-transparent hover:border-rule-strong hover:bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]",
            ].join(" ")}
          >
            <HelpCircle aria-hidden="true" strokeWidth={1.9} className="size-4 text-accent" />
            <span className="text-left underline decoration-[color-mix(in_oklab,var(--accent)_45%,var(--rule))] underline-offset-[3px]">
              {escapeOption.label}
            </span>
          </button>
          <span className="font-sans text-meta text-ink-muted">
            Pick this if none of the options above fit; we will continue with what we have.
          </span>
        </div>
      ) : null}

      {/* EXPLICIT submit — selecting an option never fires the run */}
      <div className="flex flex-wrap items-center gap-3.5 border-t border-rule pt-block">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
          className="gap-3"
        >
          <span>{submitting ? "Working" : "Continue"}</span>
          {submitting ? null : (
            <ArrowRight aria-hidden="true" strokeWidth={2} className="opacity-85" />
          )}
        </Button>
        <span className="font-sans text-meta text-ink-muted">
          {selected
            ? "Continue runs the classification with this detail."
            : "Pick the closest option, then continue."}
        </span>
      </div>
    </section>
  );
}

export { QuestionView };
