"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileText } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { getRefuseCopy } from "@/lib/refuse-copy";
import type { UiRefused } from "@/lib/types";

export interface RefusedViewProps {
  reason: UiRefused["reason"];
  /** Routes back to the start so the user can re-describe their product. */
  onReset: () => void;
}

/**
 * RefusedView — a respectful dead-end with one way forward (state-refuse.html,
 * D4). Calm warm card, NOT a red error. The copy comes from the pre-written
 * bucket map (never the model's free text). Exactly one recovery action: a
 * primary re-input button for "reinput", or a quiet scope link for "scope".
 */
function RefusedView({ reason, onReset }: RefusedViewProps) {
  const copy = getRefuseCopy(reason);
  const isReinput = copy.recovery === "reinput";

  return (
    <div className="mx-auto w-full max-w-[660px] pb-8">
      <style>{settleKeyframes}</style>

      <Surface
        as="section"
        variant="raised"
        role="region"
        aria-live="polite"
        aria-label="Classification outcome"
        className="relative overflow-hidden p-[clamp(26px,4vw,48px)] motion-safe:animate-[prevyl-settle_0.44s_ease_both]"
      >
        {/* faint archival seal watermark (decorative) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-7 -top-7 size-[188px] text-accent-ink opacity-[0.06]"
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
        <p className="relative z-[1] mb-[22px] flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          <span aria-hidden="true" className="h-px w-[18px] bg-accent" />
          Reviewed · no tariff line to assign
        </p>

        {/* subject: calm ledger glyph + headline */}
        <div className="relative z-[1] mb-4.5 flex items-start gap-4 sm:gap-[18px]">
          <span
            aria-hidden="true"
            className="grid size-[46px] shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_24%,var(--rule))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-accent sm:size-[54px]"
          >
            <FileText className="size-6 sm:size-7" strokeWidth={1.7} />
          </span>
          <h1 className="m-0 max-w-[22ch] font-display text-[clamp(1.5rem,3.4vw,2.05rem)] font-medium leading-[1.2] text-ink">
            {copy.title}
          </h1>
        </div>

        {/* pre-written bucket body */}
        <p className="relative z-[1] mt-4.5 max-w-[54ch] font-sans text-[1rem] leading-relaxed text-ink">
          {copy.body}
        </p>

        {/* hairline divider before the action */}
        <hr className="relative z-[1] my-[clamp(22px,3vw,30px)] h-px border-0 border-t border-rule" />

        {/* EXACTLY ONE primary recovery action */}
        <div className="relative z-[1] flex flex-col gap-3">
          <p className="font-sans text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Where to go next
          </p>

          {isReinput ? (
            <Button
              variant="primary"
              onClick={onReset}
              className="h-13 min-h-13 w-full justify-start gap-3 px-[18px]"
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
        </div>
      </Surface>

      <p className="mx-auto mt-[clamp(20px,3vw,28px)] max-w-[48ch] text-center font-sans text-[0.78rem] leading-relaxed text-ink-muted">
        Prevyl classifies tangible goods under India&apos;s{" "}
        <span className="font-mono text-accent-ink">ITC(HS) 2022</span> Schedule 2. Services, rights
        and digital-only deliverables fall outside the tariff schedule.
      </p>
    </div>
  );
}

const settleKeyframes = `
@keyframes prevyl-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;

export { RefusedView };
