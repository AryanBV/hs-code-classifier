"use client";

import * as React from "react";

import { WHAT_YOU_TOLD_US_LABEL } from "@/lib/content";
import type { UiQuestion } from "@/lib/types";

/** A single submitted answer: the question that was asked and the chosen label. */
export interface ToldUsItem {
  /** The questionId the answer belongs to (stable key). */
  questionId: string;
  /** The human-readable label of the option the user chose. */
  label: string;
}

/**
 * Resolve the human label for a (questionId, optionId) pair against the question
 * that is/was on screen. Falls back to the raw optionId when the option is not
 * found (e.g. a question whose options are no longer in view), so a chip is
 * never blank and never fabricated.
 */
export function resolveToldUsLabel(
  question: UiQuestion | null | undefined,
  optionId: string,
): string {
  const opt = question?.options?.find((o) => o.id === optionId);
  if (opt) return opt.label;
  // Humanize a snake_case token as a last resort (never invent meaning).
  return optionId.replace(/_/g, " ");
}

export interface WhatYouToldUsProps {
  /** The user's OWN submitted answers, oldest first. Never engine-confirmed facts. */
  items: ToldUsItem[];
  className?: string;
}

/**
 * WhatYouToldUs — the cross-round chip strip. It accumulates the user's OWN
 * submitted answers and rides the wait + question interludes, so each round
 * carries the real detail the SESSION has gathered.
 *
 * Honesty: these are the user's inputs, framed as input ("what you told us"),
 * NOT the engine's locked state. There is no "Chapter fixed", no convergence
 * funnel, no implied monotonic narrowing — each answer triggers a full
 * re-classification that can re-route. Renders nothing on round one (empty).
 */
function WhatYouToldUs({ items, className }: WhatYouToldUsProps) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label={WHAT_YOU_TOLD_US_LABEL}
      className={["flex flex-col gap-2.5", className].filter(Boolean).join(" ")}
    >
      <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
        {WHAT_YOU_TOLD_US_LABEL}
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <li
            key={`${item.questionId}-${i}`}
            className="inline-flex items-center gap-2 rounded-md border border-rule-strong bg-surface px-2.5 py-1.5 elev-1"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-accent-quiet"
            />
            <span className="font-sans text-meta leading-snug text-ink">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { WhatYouToldUs };
