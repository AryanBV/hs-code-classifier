"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { DocumentMargin } from "@/components/layout/document-margin";
import { WhatYouToldUs, type ToldUsItem } from "@/components/result/what-you-told-us";
import {
  METHOD_GLOSSES,
  METHOD_STAGES,
  METHOD_TITLE,
  QUERY_ECHO_LABEL,
  READING_EYEBROW,
  REREADING_LEAD,
  SLOT_BAND_CAPTION,
  SLOT_CITATION_CAPTION,
  SLOT_CODE_CAPTION,
  WAIT_EXPECTATION,
  WAIT_LESSONS,
} from "@/lib/content";

/** Elapsed-time escalation. Honest reassurance, not a deadline. */
const ESCALATE_SLOW_MS = 25000;
const ESCALATE_LONG_MS = 55000;
const SLOW_NOTE = "Taking a little longer. We are being thorough.";
const LONG_NOTE = "Complex products can take the full minute. Still working.";

/**
 * The rotation cycle for the gloss / micro-lesson cross-fade decks. Authored to
 * pair with the `gloss-cycle` keyframe (tuned for a ~6-item deck): with a 21s
 * cycle each line gets a ~3.5s visible window. PURELY a CSS concern — no JS
 * timer drives it. Kept here only so the per-item negative animation-delay
 * (which staggers the deck) is computed against the same number.
 */
const GLOSS_CYCLE_MS = 21000;
const LESSON_CYCLE_MS = 24000;

export interface LoadingViewProps {
  query: string;
  /**
   * Cancel the in-flight run. Optional and additive: when wired, the wait is
   * never a trap. Omit it and the Cancel control is simply not shown.
   */
  onCancel?: () => void;
  /**
   * Multi-round: the user's OWN submitted answers, oldest first. Rides the wait
   * as the "WHAT YOU TOLD US" chip strip. Empty on round one.
   */
  toldUs?: ToldUsItem[];
  /**
   * True when this wait follows a submitted answer (not the first classify). The
   * lead line then honestly reads "Re-reading with the detail you added: ...".
   */
  isAnswerPath?: boolean;
  /**
   * Advance the gloss + lesson decks across rounds instead of restarting them,
   * so a later round's wait reads materially different. Typically the number of
   * answers submitted so far. ALSO keys the monotonic accrual so it RESTARTS
   * from zero each round (a new round is a new wall-clock measurement).
   */
  deckOffset?: number;
}

/**
 * LoadingView — "The Ledger Keeps Time" (the honest wait).
 *
 * The result FRAME is on the desk from the instant of click: the query echoed in
 * mono, the lifted .doc-sheet, and visibly-EMPTY reserved slots (a 4-2-2 code
 * skeleton, a redacted margin band strip, a dashed citation region). It mirrors
 * the result's exact two-pane geometry so the swap reads as continuous
 * inscription, not a new screen.
 *
 * The single LIVENESS signal that proves work is happening is real elapsed
 * wall-clock time. A thin "ink trail" accrues monotonically beneath the redacted
 * code slot (it only ever grows, never rewinds, never reaches a defined end), so
 * it can never read as a fraction / ETA / completion and a stuck render FREEZES
 * it. The honest 25s/55s escalation copy is PROMOTED to a primary register
 * co-located with the accrual — it advances only because real time passed.
 *
 * Honesty by construction: there is NO timer-driven per-stage Done/active/pending
 * progress. The six REAL stages are shown as a STATIC ordered method list with
 * ONE indeterminate breathing nib over the whole method — no %/countdown/ETA. An
 * independently-rotating method GLOSS teaches one true thing about HS
 * classification, NOT keyed to any active stage. Placeholders LOOK like
 * placeholders; no band colour appears until the real result (the band is the
 * one chromatic event, reserved for the result).
 *
 * TIMER DISCIPLINE (the hang prerequisite): this view holds ZERO repeating-timer
 * state. The gloss/lesson rotation is PURE CSS (a staggered-delay opacity
 * cross-fade), the accrual is a single long CSS keyframe, and the only JS timers
 * are AT MOST TWO one-shot setTimeouts (25s, 55s) for the escalation copy, each
 * cleaned up on unmount. Nothing setStates on a recurring tick while the mutation
 * is pending — which was the prime suspect for the SPA-nav concurrent-render
 * starvation hang (see classify-client.tsx for the full root-cause note).
 *
 * Reduced-motion: a SINGLE source (motion/react useReducedMotion) drives the nib
 * and the skeleton breath, matching the result reveal's reduced-motion path so
 * the loading -> code handoff is one continuous beat with one reduced-motion
 * authority. The accrual is `motion-reduce:hidden` so a reduce user never sees a
 * frozen fully-grown trail implying "done"; the gloss deck collapses to one
 * static line under reduce. Meaning never depends on motion.
 *
 * Accessibility: the parent owns the single role="status" live summary; this
 * view's rotating gloss/lesson + the accrual are aria-hidden (they would
 * otherwise leak the whole deck or announce a cosmetic value). The query echo
 * and method list are static.
 */
function LoadingView({
  query,
  onCancel,
  toldUs = [],
  isAnswerPath = false,
  deckOffset = 0,
}: LoadingViewProps) {
  const reduced = useReducedMotion();

  // The honest lead line. On the answer path it names the user's own added
  // detail (their submitted answers), which IS query-specific without any SSE.
  const answerDetail = toldUs.map((t) => t.label).join(", ");
  const leadLine =
    isAnswerPath && answerDetail
      ? `${REREADING_LEAD}: ${answerDetail}.`
      : null;

  return (
    <div className="pb-12">
      <h1 className="sr-only">
        Classifying your description against the Indian ITC-HS schedule
      </h1>

      {/* query echo — same shape and place as the result, so it is already here
          when the answer resolves into the reserved slots (data, not a quote). */}
      <div className="mb-[clamp(16px,2.4vw,26px)] flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {QUERY_ECHO_LABEL}
        </span>
        <span className="font-mono text-[0.95rem] text-ink">{query}</span>
      </div>

      <DocumentMargin
        document={
          <LoadingDocument
            reduced={reduced ?? false}
            deckOffset={deckOffset}
            leadLine={leadLine}
            toldUs={toldUs}
          />
        }
        margin={
          <LoadingMargin
            deckOffset={deckOffset}
            onCancel={onCancel}
          />
        }
      />
    </div>
  );
}

/**
 * The document sheet, with the reserved code slot (redacted) carrying the
 * monotonic ink-trail on its baseline, the honest static method list under ONE
 * breathing nib, the promoted elapsed-escalation register, and the
 * independently-rotating gloss. Same lifted sheet + slot positions as
 * result-view so the swap reads as inscription into slots that were always there.
 */
function LoadingDocument({
  reduced,
  deckOffset,
  leadLine,
  toldUs,
}: {
  reduced: boolean;
  deckOffset: number;
  leadLine: string | null;
  toldUs: ToldUsItem[];
}) {
  return (
    <Surface
      as="section"
      variant="raised"
      sheet
      role="region"
      aria-label="The classification record being prepared"
      aria-busy="true"
      className="p-card"
    >
      <div className="doc-margin-rule">
        {/* eyebrow + the ONE indeterminate working nib — the single honest
            "in flight" signal over the whole method. */}
        <p className="mb-4 flex items-center gap-2.5 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          <WorkingNib reduced={reduced} />
          {READING_EYEBROW}
        </p>

        {/* the code slot: a skeleton in the 4-2-2 shape, with the monotonic
            ink-trail accruing on its baseline. Anticipation, never a fake code.
            This is exactly where the real code reveals in. */}
        <CodeSlotSkeleton reduced={reduced} accrualKey={deckOffset} />

        <p className="mt-4 max-w-[42ch] font-sans text-meta leading-snug text-ink-muted">
          {SLOT_CODE_CAPTION}
        </p>

        {/* PROMOTED elapsed register — the honest "real time passed" cue, co-
            located with the accrual. It advances ONLY because real wall-clock
            time elapsed on a real run (the one cue that can never read as
            canned). Keyed on deckOffset so a new round REMOUNTS it with a fresh
            clock (no synchronous setState-in-effect reset). role=status is owned
            by the parent; this is a quiet, non-live register that never
            announces on a cosmetic change. */}
        <ElapsedRegister key={deckOffset} />

        {/* the answer-path lead line — honest, query-specific via the user's own
            submitted detail (no SSE). Only present after an answer. */}
        {leadLine ? (
          <p className="mt-5 max-w-read font-sans text-[0.95rem] leading-relaxed text-ink">
            {leadLine}
          </p>
        ) : null}

        {/* WHAT YOU TOLD US — rides the wait, growing across rounds. */}
        {toldUs.length > 0 ? (
          <div className="mt-6 border-t border-rule pt-5">
            <WhatYouToldUs items={toldUs} />
          </div>
        ) : null}

        {/* THE HONEST METHOD — a STATIC ordered list of the real stages. NOT a
            progress walk: no per-stage Done/active/pending, no %, no ETA. The
            single breathing nib above is the only "working" signal. The accrual
            deliberately lives ABOVE this list (on the code-slot baseline) and
            never traverses or aligns with these rows (honesty hard-guard). */}
        <div className="mt-7 border-t border-rule pt-6">
          <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
            {METHOD_TITLE}
          </p>
          <MethodList reduced={reduced} />
        </div>

        {/* method GLOSS — teaches one TRUE thing about HS classification, rotated
            INDEPENDENTLY of the stages (never "this stage is happening now") as a
            PURE-CSS cross-fade. Never claims a stage; reduced-motion: one static
            line (the deck collapses, never blank — see CrossfadeDeck). */}
        <div className="mt-6 border-t border-rule pt-5">
          <p className="mb-2 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
            How classification works
          </p>
          <CrossfadeDeck
            lines={METHOD_GLOSSES}
            offset={deckOffset}
            cycleMs={GLOSS_CYCLE_MS}
            className="max-w-read font-display opsz-citation text-[0.95rem] leading-relaxed text-ink"
          />
        </div>
      </div>
    </Surface>
  );
}

/**
 * THE HONEST METHOD LIST + the looping reading-scan.
 *
 * The six REAL stages render as a STATIC ordered list (no per-stage
 * Done/active/pending, no checkmark, no %, no ETA — the row text and state are
 * identical for every row, always). Over them, a soft highlight bar TRAVELS from
 * row 01 to row 06 and LOOPS back to the top, so the instrument is visibly
 * "reading the schedule in order".
 *
 * Why the loop is honest (not a progress claim): the bar never stops on a row
 * and never marks one complete — it continuously sweeps top-to-bottom and
 * restarts, which is an ambient "reading in order" pass (an eye running down the
 * page), NOT a position pointer that advances with real pipeline progress. There
 * is no state on any row, so nothing can read as "this stage is done / this
 * stage is current". The travel geometry is derived ONLY from the fixed row
 * count, never from engine state.
 *
 * The rows are given a fixed per-row min-height so the scan band height
 * (--scan-band) and travel distance (--scan-travel = (rows-1) * stride) align to
 * the rows without brittle measurement. The bar is PURE CSS (a single
 * transform/opacity keyframe); no JS timer, no setState on a tick.
 *
 * Reduced motion: the scan bar is suppressed (motion-reduce:hidden + the global
 * kill-switch); the honest static ordered list remains and meaning never depends
 * on the motion.
 */
function MethodList({ reduced }: { reduced: boolean }) {
  const ROW_STRIDE_REM = 2.5; // matches min-h-10 below
  const travel = ROW_STRIDE_REM * (METHOD_STAGES.length - 1);
  return (
    <div
      className="relative"
      style={
        {
          ["--scan-band" as string]: `${ROW_STRIDE_REM}rem`,
          ["--scan-travel" as string]: `${travel}rem`,
          ["--scan-duration" as string]: "4.2s",
        } as React.CSSProperties
      }
    >
      {/* the traveling reading-scan — ambient, loops, claims no completion */}
      {!reduced ? (
        <span aria-hidden="true" className="method-scan motion-reduce:hidden" />
      ) : null}

      <ol className="relative m-0 flex list-none flex-col p-0">
        {METHOD_STAGES.map((stage, i) => (
          <li
            key={stage}
            className="flex min-h-10 items-center gap-3"
          >
            <span
              aria-hidden="true"
              className="font-mono text-meta tabular-nums text-ink-muted/70"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-sans text-[0.95rem] leading-snug text-ink">
              {stage}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The promoted elapsed register. Holds the loading view's ONLY timer state:
 * which honest elapsed-escalation note to show. It is advanced by AT MOST TWO
 * one-shot setTimeouts (25s, 55s) — never a repeating interval — each cleared on
 * unmount. So this view never setStates on a recurring tick while the run is
 * pending (the SPA-nav hang prerequisite). The component is REMOUNTED per round
 * (keyed on deckOffset at the call site), so each round arms a fresh clock from
 * its `null` initial state with no synchronous reset.
 */
function ElapsedRegister() {
  const [escalation, setEscalation] = React.useState<string | null>(null);

  React.useEffect(() => {
    const slow = window.setTimeout(() => setEscalation(SLOW_NOTE), ESCALATE_SLOW_MS);
    const long = window.setTimeout(() => setEscalation(LONG_NOTE), ESCALATE_LONG_MS);
    return () => {
      window.clearTimeout(slow);
      window.clearTimeout(long);
    };
  }, []);

  return (
    <p className="mt-3 max-w-read font-sans text-[0.95rem] leading-relaxed text-ink-muted">
      {escalation ?? WAIT_EXPECTATION}
    </p>
  );
}

/**
 * The ONE indeterminate working nib — a calm breath signifying "working through
 * this, in order". Reduced-motion: a static accent disc (still the clear working
 * state via the eyebrow word + aria). Single reduced-motion source (the prop).
 */
function WorkingNib({ reduced }: { reduced: boolean }) {
  // Enlarged to a clearly-pulsing mark (was 7px, read as too small to register
  // as motion). A larger disc inside a faint accent halo: the disc breathes
  // (compositor opacity+scale) and the halo gives the pulse visible reach
  // without claiming any fraction. Reduced motion: a static accent disc (the
  // working state is still carried by the eyebrow word + aria-busy).
  if (reduced) {
    return (
      <span
        aria-hidden="true"
        className="size-[11px] rounded-full bg-accent"
      />
    );
  }
  // `breathe` is a custom utility already gated by the no-preference media query
  // (so it is inherently motion-safe; the Tailwind motion-safe: variant does not
  // compose onto raw utilities). Apply it plain — under reduced motion the rule
  // does not exist and the static disc above is rendered instead.
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex size-[11px] items-center justify-center"
    >
      <span className="absolute inset-0 rounded-full bg-accent/25 breathe" />
      <span className="relative size-[9px] rounded-full bg-accent breathe" />
    </span>
  );
}

/**
 * The 4-2-2 code placeholder, sized to the display code so the reveal lands in
 * the exact same geometry. Redacted (skeleton-calm), never a fake code. The
 * monotonic ink-trail accrues on a baseline BENEATH the redacted blocks — a thin
 * lengthening underscore (a clerk's pen leaving a steady mark on the page it
 * will later inscribe), encoding ONLY elapsed time.
 *
 * Honesty hard-guards, codified here:
 *  - the trail sits on the baseline UNDER the slot; it does NOT fill the slot
 *    and does NOT scan across it as if a value were being written in;
 *  - it is UNBOUNDED in feel (no track, no visible 100% / end-stop) — a thin
 *    open-ended trail, not a filled bar;
 *  - it encodes elapsed time ONLY (no stage / count / fraction / ETA);
 *  - it never extends into / aligns with the method list below.
 *
 * Reduced-motion: the global kill-switch would otherwise freeze the asymmetric
 * scaleX at its 100% frame (a fully-grown trail implying "done"), so the trail
 * carries `motion-reduce:hidden` — reduce users get the honest static frame.
 * The `accrualKey` restarts the trail from zero on each new round.
 */
function CodeSlotSkeleton({
  reduced,
  accrualKey,
}: {
  reduced: boolean;
  accrualKey: number;
}) {
  // each redacted block carries the canonical loading SHEEN — a bright band
  // sweeping left-to-right across the placeholder, looping continuously. It is
  // the universally-read "loading" motion and claims nothing (light over an
  // empty form). Under reduced motion the sweep is suppressed (the global
  // kill-switch + motion-reduce here) and only the calm static skeleton shows.
  // `skeleton-calm` and `shimmer-sweep` are custom utilities already wrapped in
  // `@media (prefers-reduced-motion: no-preference)` in globals.css, so they are
  // inherently motion-safe (under reduced motion the rule does not exist and
  // nothing animates). The Tailwind `motion-safe:` variant does NOT compose onto
  // these raw classes (it emits nothing), so we apply them PLAIN — the media
  // query is the single reduced-motion authority.
  const block = [
    "relative rounded-sm bg-surface-sunk h-[clamp(2.1rem,5.5vw,3.1rem)]",
    reduced ? "opacity-60" : "skeleton-calm shimmer-sweep",
  ].join(" ");
  return (
    <div aria-hidden="true" className="relative inline-block">
      <div className="flex items-center gap-[0.2em] leading-none">
        <span className={`${block} w-[4.2ch]`} />
        <Dot />
        <span className={`${block} w-[2.2ch]`} />
        <Dot />
        <span className={`${block} w-[2.2ch]`} />
      </div>
      {/* the ink-trail: an accent-quiet underscore on the slot baseline that
          GROWS with elapsed time. It is wider than the slot (140%) and its
          leading edge fades to nothing (mask gradient), so there is NO crisp
          end-stop / visible 100% — an open-ended trail, not a filled bar.
          Thickened (h-[3px]) and brightened (accent-quiet, no alpha demotion)
          so it actually registers as a moving mark, per the founder note that
          the old h-px trail was invisible. Keyed so it restarts per round.
          Hidden under reduced motion (would otherwise freeze fully-grown =
          "done"). */}
      <span
        key={accrualKey}
        aria-hidden="true"
        style={{
          maskImage:
            "linear-gradient(to right, black 0%, black 62%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, black 0%, black 62%, transparent 100%)",
        }}
        className="ledger-accrue pointer-events-none absolute -bottom-2 left-0 h-[3px] w-[140%] origin-left rounded-full bg-accent-quiet motion-reduce:hidden"
      />
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
 * A pure-CSS cross-fade rotation deck. All lines are absolutely stacked and
 * `aria-hidden` (the parent's single role=status is the only announced summary,
 * so the deck never leaks one-line-or-all to assistive tech). Each line fades in
 * for its window then out, on a shared cycle, offset by a per-line negative
 * animation-delay so exactly one is visible at a time. NO JS timer.
 *
 * `offset` advances the deck per round (so a later round reads different) by
 * rotating which line falls in which slot. Reduced-motion: the rotation is
 * `motion-safe` only; under reduce a SINGLE static line (the offset one) is
 * shown and the rest are hidden — never blank, never the frozen-100% nothing the
 * global kill-switch would otherwise produce.
 */
function CrossfadeDeck({
  lines,
  offset,
  cycleMs,
  className,
}: {
  lines: readonly string[];
  offset: number;
  cycleMs: number;
  className?: string;
}) {
  const n = lines.length;
  const startIndex = ((offset % n) + n) % n;
  // Reserve height: the deck is absolutely stacked, so a sizing copy holds the
  // box open to the tallest line (kept invisible + out of the a11y tree).
  return (
    <div aria-hidden="true" className={`relative ${className ?? ""}`}>
      {/* invisible sizer — keeps layout stable as lines cross-fade */}
      <span className="invisible block">
        {lines.reduce((a, b) => (b.length > a.length ? b : a), "")}
      </span>
      {lines.map((line, i) => {
        // The slot this line occupies in the rotation, advanced by `offset`.
        const slot = (i + (n - startIndex)) % n;
        const delayMs = -((slot * cycleMs) / n);
        const isFirstUnderReduce = slot === 0;
        return (
          <span
            key={line}
            style={{
              animationDelay: `${delayMs}ms`,
              ["--gloss-cycle-duration" as string]: `${cycleMs}ms`,
            }}
            className={[
              "absolute inset-x-0 top-0 opacity-0",
              // `gloss-rotate` is a custom utility already gated by the
              // no-preference media query, so it is inherently motion-safe (the
              // Tailwind motion-safe: variant does NOT compose onto raw utilities
              // — it emitted nothing, which left this deck blank). Apply it plain.
              "gloss-rotate",
              // …and under reduced motion show exactly the one starting line.
              isFirstUnderReduce
                ? "motion-reduce:opacity-100"
                : "motion-reduce:hidden",
            ].join(" ")}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The attached marginalia, mid-preparation: the redacted band strip (no colour,
 * never a fake band), the redacted citation region, then the genuine wait turned
 * into a rotating domain micro-lesson, a Cancel, and the source line. The honest
 * elapsed-escalation copy has been PROMOTED into the document column (next to the
 * accrual), so it no longer lives here as a margin afterthought.
 */
function LoadingMargin({
  deckOffset,
  onCancel,
}: {
  deckOffset: number;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-1 py-1">
      {/* assessment slot — a redacted band strip, never a fake band, no colour */}
      <section aria-label="Assessment">
        <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          Assessment
        </p>
        {/* the redacted band strip carries the same loading SHEEN as the code
            slot. It stays colourless (no band hue until the real result — the
            band is the one chromatic event reserved for the result); the sheen
            is a neutral light sweep over an empty placeholder, claiming nothing. */}
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          <div className="skeleton-calm shimmer-sweep h-3 w-28 rounded-sm bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-60" />
          <div className="flex gap-1.5">
            <div className="skeleton-calm shimmer-sweep h-2 flex-1 rounded-full bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-60" />
            <div className="skeleton-calm shimmer-sweep h-2 flex-1 rounded-full bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-60" />
            <div className="skeleton-calm shimmer-sweep h-2 flex-1 rounded-full bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-60" />
          </div>
        </div>
        <p className="mt-4 border-t border-rule pt-3.5 font-sans text-meta leading-relaxed text-ink-muted">
          {SLOT_BAND_CAPTION}
        </p>
      </section>

      {/* citation slot — a dashed/redacted region, never a fake quote */}
      <section aria-label="Basis in the schedule" className="border-t border-rule pt-4">
        <p className="mb-2.5 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          Basis in the schedule
        </p>
        {/* the redacted citation region — the dashed frame stays a placeholder
            (never a fake quote); the two redacted text lines carry the loading
            sheen so the citation area is visibly "being assembled". */}
        <div
          aria-hidden="true"
          className="rounded-sm border border-dashed border-rule-strong bg-surface-sunk px-3.5 py-3"
        >
          <div className="skeleton-calm shimmer-sweep h-2.5 w-full rounded-full bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-50" />
          <div className="skeleton-calm shimmer-sweep mt-2 h-2.5 w-3/5 rounded-full bg-surface-sunk motion-reduce:animate-none motion-reduce:opacity-50" />
        </div>
        <p className="mt-2.5 font-sans text-meta leading-relaxed text-ink-muted">
          {SLOT_CITATION_CAPTION}
        </p>
      </section>

      {/* While you wait — the honest, checkable domain note (marginalia voice),
          rotated as a PURE-CSS cross-fade (reduced-motion: one static line). */}
      <section aria-label="While you wait" className="border-t border-rule pt-4">
        <p className="mb-2 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          While you wait
        </p>
        <CrossfadeDeck
          lines={WAIT_LESSONS}
          offset={deckOffset}
          cycleMs={LESSON_CYCLE_MS}
          className="font-display opsz-citation text-meta leading-relaxed text-ink"
        />
      </section>

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
