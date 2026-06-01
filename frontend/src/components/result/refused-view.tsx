"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, Plus } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { getRefuseCopy } from "@/lib/refuse-copy";
import { CLASSIFY_ANOTHER_LABEL } from "@/lib/content";
import type { UiRefused } from "@/lib/types";

export interface RefusedViewProps {
  reason: UiRefused["reason"];
  /** Routes back to the start so the user can re-describe their product. */
  onReset: () => void;
  /**
   * Forward way out, threaded with the original query so the field returns
   * prefilled. Optional and additive: when provided, the screen always offers
   * "Classify another product" so a refusal never dead-ends. Falls back to
   * onReset when omitted.
   */
  onClassifyAnother?: () => void;
}

/**
 * RefusedView — a respectful dead-end with a way forward (state-refuse.html,
 * D4). Calm warm card, NOT a red error. The copy comes from the pre-written
 * bucket map (never the model's free text). One bucket-specific recovery action
 * (a primary re-input button for "reinput", or a quiet scope link for "scope"),
 * plus a "Classify another" forward action so the person is never trapped.
 * Nothing was filed here, so there is no "verify before filing" advisory.
 */
function RefusedView({ reason, onReset, onClassifyAnother }: RefusedViewProps) {
  const copy = getRefuseCopy(reason);
  const isReinput = copy.recovery === "reinput";
  const another = onClassifyAnother ?? onReset;
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-list pb-8">
      <Surface
        as="section"
        variant="raised"
        role="region"
        aria-label="Classification outcome"
        className="relative overflow-hidden p-card motion-safe:reveal-rise"
      >
        {/* faint archival register mark (decorative, never an affirmation) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-7 -top-7 size-[188px] text-accent-quiet opacity-[0.07]"
        >
          <svg viewBox="0 0 100 100" fill="none" className="block size-full">
            <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="50" cy="50" r="39" stroke="currentColor" strokeWidth="2.2" />
            <circle cx="50" cy="50" r="33" stroke="currentColor" strokeWidth="0.8" />
            <path
              d="M40 50 h20 M50 40 v20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.5"
            />
          </svg>
        </span>

        {/* eyebrow — neutral, NOT a red error label */}
        <p className="relative z-[1] mb-[22px] font-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Reviewed · no tariff line to assign
        </p>

        {/* subject: calm ledger glyph + headline */}
        <div className="relative z-[1] mb-4 flex items-start gap-4 sm:gap-[18px]">
          <span
            aria-hidden="true"
            className="grid size-[46px] shrink-0 place-items-center rounded-md border border-rule-strong bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))] text-accent elev-1 sm:size-[54px]"
          >
            <FileText className="size-6 sm:size-7" strokeWidth={1.7} />
          </span>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="m-0 max-w-[22ch] font-display text-title font-medium leading-[1.2] text-ink outline-none"
          >
            {copy.title}
          </h1>
        </div>

        {/* pre-written bucket body */}
        <p className="relative z-[1] mt-4 max-w-[54ch] font-sans text-body leading-relaxed text-ink">
          {copy.body}
        </p>

        {/* hairline divider before the actions */}
        <hr className="relative z-[1] my-block h-px border-0 border-t border-rule" />

        {/* recovery actions: the bucket action + a forward "Classify another" */}
        <div className="relative z-[1] flex flex-col gap-3">
          <p className="font-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Where to go next
          </p>

          {isReinput ? (
            <Button
              variant="primary"
              size="lg"
              layout="row"
              onClick={onReset}
              className="gap-3"
            >
              <FileText aria-hidden="true" strokeWidth={1.9} />
              <span className="flex-1 text-left">{copy.recoveryLabel}</span>
              <ArrowRight aria-hidden="true" strokeWidth={2} className="opacity-80" />
            </Button>
          ) : (
            <Button asChild variant="link" className="w-fit justify-start gap-1.5 px-0">
              <Link href="/">
                {copy.recoveryLabel}
                <ExternalLink aria-hidden="true" strokeWidth={2} className="size-3.5 opacity-85" />
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={another}
            className="w-fit gap-2.5"
          >
            <Plus aria-hidden="true" strokeWidth={1.9} />
            {CLASSIFY_ANOTHER_LABEL}
          </Button>
        </div>
      </Surface>

      <p className="mx-auto mt-block max-w-[48ch] text-center font-sans text-meta leading-relaxed text-ink-muted">
        Prevyl classifies tangible goods under India&apos;s{" "}
        <span className="font-mono text-accent-ink">ITC(HS) 2022</span> Schedule 2. Services, rights
        and digital-only deliverables fall outside the tariff schedule.
      </p>
    </div>
  );
}

export { RefusedView };
