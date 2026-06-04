"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";

import { Surface } from "@/components/ui/surface";
import { consumeSkipEntrance } from "@/lib/reveal-handoff";
import { WhatYouToldUs, type ToldUsItem } from "@/components/result/what-you-told-us";
import { MonoCode } from "@/components/ui/mono-code";
import { ConfidenceBand } from "@/components/ui/confidence-band";
import { RuleLine } from "@/components/ui/rule-line";
import { SealEmblem } from "@/components/ui/seal";
import { Expander } from "@/components/ui/expander";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { DocumentMargin } from "@/components/layout/document-margin";
import { MobileActionBar, ResultActions } from "@/components/result/result-actions";
import { ResultFeedback } from "@/components/result/result-feedback";
import {
  TradeIntelBlock,
  buildFallbackTradeIntel,
  shouldPromoteTradeIntel,
} from "@/components/result/trade-intel-block";
import {
  ALTERNATIVES_LABEL,
  BAND_ADVISORY,
  BAND_MEANING,
  CITATION_HEADING,
  CLASSIFY_ANOTHER_LABEL,
  EDIT_AND_RERUN_LABEL,
  EIGHT_DIGIT_FRAMING,
  GENERATED_EXPLANATION_LABEL,
  QUERY_ECHO_LABEL,
  RATIONALE_EMPTY,
  RATIONALE_HEADING,
  RESULT_DISCLAIMER,
  SIX_DIGIT_CANDIDATES_LABEL,
  SIX_DIGIT_NARROWING,
  SIX_VS_EIGHT_EXPLAINER,
} from "@/lib/content";
import type { Citation, UiClassification } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ResultViewRecord {
  id?: string;
  query: string;
  result: UiClassification;
}

export interface ResultViewProps {
  record: ResultViewRecord;
  /**
   * Multi-round: the user's OWN submitted answers (oldest first). When present
   * they ride into the result as the "WHAT YOU TOLD US" strip, so the record
   * reads as the continuous outcome of the session (the question interlude and
   * the wait carried the same strip). Honest input, never engine-confirmed facts.
   */
  toldUs?: ToldUsItem[];
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function descriptionFallback(r: UiClassification): string {
  const desc = (r.description ?? "").trim();
  if (desc.length > 0) return desc;
  return r.isSixDigit
    ? "Subheading description not recorded for this line."
    : "Tariff-line description not recorded for this line.";
}

function reasoningLines(reasoning: string | null | undefined): string[] {
  return (reasoning ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** The verbatim note/exclusion text — the VERIFIABLE source. */
function verbatim(citation: Citation | null | undefined): string {
  return (citation?.primary?.verbatim_text ?? "").trim();
}

/** Humanize a DB locator into a readable source line. Falls back to the raw ref. */
function humanizeSourceRef(citation: Citation | null | undefined): string {
  const ref = (citation?.primary?.source_ref ?? "").trim();
  if (!ref) return "Source not recorded";
  const type = citation?.primary?.type;
  // headings.7318 -> "Heading 7318" ; chapters.73 -> "Chapter 73"
  const heading = ref.match(/headings?\.(\d{4})/i);
  if (heading) return `Heading ${heading[1]}`;
  const chapter = ref.match(/chapters?\.(\d{2})/i);
  if (chapter) return `Chapter ${chapter[1]} note`;
  if (type === "exclusion") return "Chapter exclusion rule";
  if (type === "leaf_description") return "Tariff-line description";
  return ref;
}

/**
 * Chrome and substance move together. When there is no verbatim source text,
 * the record is thin: we suppress the archival stamp and lower the citation's
 * visual weight rather than presenting full confidence theatre over nothing.
 */
function evidenceIsThin(result: UiClassification): boolean {
  return verbatim(result.citation).length === 0;
}

// ----------------------------------------------------------------------------
// Motion — the ONE signature reveal. Entrance only, never loops. Sheet rises,
// the code clip-reveals upward (inscribed onto the baseline), the band inks in,
// the seal presses once. prefers-reduced-motion settles everything instantly.
// ----------------------------------------------------------------------------

const REVEAL_EASE = [0.2, 0.6, 0.2, 1] as const;

/**
 * The signature reveal variants. `settled` collapses every variant to its
 * instant ("shown") form WITHOUT animation — used both for prefers-reduced-motion
 * AND for the classify -> record handoff (so the second mount on /r/{id} does not
 * re-play a reveal the user just watched in-page). One flag drives both, so the
 * reduced-motion authority and the skip-entrance authority are a SINGLE source.
 */
function useReveal(skipEntrance = false) {
  const reducedPref = useReducedMotion();
  const reduced = reducedPref || skipEntrance;

  const sheet: Variants = {
    hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 10 },
    shown: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : 0.55, ease: REVEAL_EASE },
    },
  };

  // The code is inscribed onto the baseline: it clip-reveals upward.
  const code: Variants = {
    hidden: {
      opacity: reduced ? 1 : 0,
      clipPath: reduced ? "inset(0 0 0 0)" : "inset(100% 0 0 0)",
      y: reduced ? 0 : 6,
    },
    shown: {
      opacity: 1,
      clipPath: "inset(0% 0 0 0)",
      y: 0,
      transition: { duration: reduced ? 0 : 0.55, ease: REVEAL_EASE, delay: reduced ? 0 : 0.18 },
    },
  };

  const ink: Variants = {
    hidden: { opacity: reduced ? 1 : 0 },
    shown: {
      opacity: 1,
      transition: { duration: reduced ? 0 : 0.5, ease: "easeOut", delay: reduced ? 0 : 0.42 },
    },
  };

  // The seal presses ONCE (a process mark, never a certainty claim).
  const seal: Variants = {
    hidden: { opacity: reduced ? 1 : 0, scale: reduced ? 1 : 1.06 },
    shown: {
      opacity: 1,
      scale: 1,
      transition: { duration: reduced ? 0 : 0.42, ease: REVEAL_EASE, delay: reduced ? 0 : 0.62 },
    },
  };

  return { sheet, code, ink, seal };
}

// ----------------------------------------------------------------------------
// The hero code block — different SHAPE for 6-digit vs 8-digit.
// ----------------------------------------------------------------------------

function HeroCode({
  result,
  codeVariants,
}: {
  result: UiClassification;
  codeVariants: Variants;
}) {
  if (!result.isSixDigit) {
    return (
      <motion.div variants={codeVariants}>
        {/* The code is select-all; the single copy home is the margin actions
            block (mirrored by the mobile bar), so we do not duplicate a copy
            control here. That removes the confusing two-place / two-format
            copy and keeps the hero code clean. */}
        <MonoCode code={result.hsCode} size="display" baseline />
      </motion.div>
    );
  }

  // 6-digit: render the resolved subheading at full strength, then a GHOSTED
  // ".__.__" tail so the artifact visibly looks unfinished, because it is. The
  // last two digit-pairs are what a broker confirms; we never invent them.
  return (
    <motion.div variants={codeVariants}>
      <span className="inline-flex items-end gap-[0.16em] border-b border-rule-strong pb-1.5 letterpress-top">
        <MonoCode code={result.hsCode} size="display" />
        <span
          aria-hidden="true"
          className="select-none font-mono text-code leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-ink-muted/70"
        >
          <span className="mx-[0.16em] text-[0.62em]">.</span>__
          <span className="mx-[0.16em] text-[0.62em]">.</span>__
        </span>
        <span className="sr-only">. Last two digit pairs not yet determined.</span>
      </span>
    </motion.div>
  );
}

// ----------------------------------------------------------------------------
// Alternatives / candidates. For 6-digit this is the PRIMARY "choose one to
// verify" decision element (numbered, full-ink, generous rows). For 8-digit it
// is a quieter "close alternatives to check" list.
// ----------------------------------------------------------------------------

function AlternativesSection({ result }: { result: UiClassification }) {
  const isSix = result.isSixDigit;
  const alternatives = Array.isArray(result.alternatives) ? result.alternatives : [];

  if (alternatives.length === 0) {
    if (isSix) {
      return (
        <section className="mt-9">
          <RuleLine label={SIX_DIGIT_CANDIDATES_LABEL} lineNumber="02" />
          <p className="mt-3 max-w-read font-sans text-body leading-relaxed text-ink-muted">
            The 8-digit lines under this subheading are not separately recorded here. A licensed
            customs broker confirms the final two digits from your product details before filing.
          </p>
        </section>
      );
    }
    return null;
  }

  if (isSix) {
    // PRIMARY decision component: numbered, full ink, 44px+ rows.
    return (
      <section className="mt-9">
        <RuleLine label={SIX_DIGIT_CANDIDATES_LABEL} lineNumber="02" />
        <p className="mb-3 mt-3 max-w-read font-sans text-meta leading-relaxed text-ink-muted">
          Choose the one that matches your product, then confirm it before filing. A customs broker
          decides which line applies from the actual goods.
        </p>
        <ol className="flex flex-col gap-2">
          {alternatives.map((alt, i) => (
            <li key={`${alt.code}-${i}`}>
              <div className="flex min-h-[3.25rem] items-center gap-4 rounded-md border border-rule-strong bg-surface px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-sm bg-surface-sunk font-mono text-meta text-ink-muted"
                >
                  {i + 1}
                </span>
                <MonoCode code={alt.code} size="sm" className="min-w-[10.5ch] shrink-0 font-medium" />
                <span className="min-w-0 flex-1 font-sans text-[0.95rem] leading-snug text-ink">
                  {(alt.description ?? "").trim() || "Description not recorded"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  // 8-digit: quieter "adjacent leaves worth a check".
  return (
    <section className="mt-9">
      <RuleLine label={ALTERNATIVES_LABEL} lineNumber="02" />
      <p className="mb-2.5 mt-3 max-w-read font-sans text-meta leading-relaxed text-ink-muted">
        Worth a check if your product carries a detail we did not see. These are leads, not lines to
        file as they are.
      </p>
      <ul className="flex flex-col border-t border-rule">
        {alternatives.map((alt, i) => (
          <li
            key={`${alt.code}-${i}`}
            className="flex min-h-11 items-center gap-4 border-b border-rule px-1 py-2.5"
          >
            <MonoCode code={alt.code} size="sm" className="min-w-[10.5ch] shrink-0" />
            <span className="min-w-0 flex-1 font-sans text-[0.92rem] leading-snug text-ink-muted">
              {(alt.description ?? "").trim() || "Description not recorded"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ----------------------------------------------------------------------------
// The document pane (the one lifted sheet).
// ----------------------------------------------------------------------------

function DocumentPane({
  result,
  reveal,
}: {
  result: UiClassification;
  reveal: ReturnType<typeof useReveal>;
}) {
  const isSix = result.isSixDigit;
  const lines = reasoningLines(result.reasoning);

  // Export policy must ALWAYS render. Prefer the rich assembler output when the
  // backend ships it; otherwise synthesise a minimal export-policy block from the
  // flat `exportPolicy`/`policyCondition` fields so the section is never missing
  // (e.g. a deploy window before the assembler lands, or its fail-safe null).
  const intel = result.tradeIntelligence ?? buildFallbackTradeIntel(result);

  return (
    <Surface
      as="article"
      variant="raised"
      sheet
      role="region"
      aria-label="Classification record"
      className="p-card"
    >
      <div className="doc-margin-rule">
        {/* eyebrow + the hero heading. The <h1> is the outcome itself. */}
        <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {isSix ? "Narrowed to a 6-digit subheading" : "Proposed 8-digit tariff line"}
        </p>

        <h1 className="sr-only">
          {isSix
            ? `Narrowed to ITC-HS subheading ${result.hsCode}. ${descriptionFallback(result)}`
            : `Proposed ITC-HS tariff line ${result.hsCode}. ${descriptionFallback(result)}`}
        </h1>

        {/* the hero code (clip-revealed onto the baseline). MonoCode owns its
            own a11y: code segments are aria-hidden, the group carries an
            aria-label, and the copy controls stay reachable. */}
        <HeroCode result={result} codeVariants={reveal.code} />

        {/* description demoted to a caption beneath the code */}
        <p className="mt-4 max-w-[42ch] font-sans text-[clamp(1.02rem,1.6vw,1.2rem)] leading-snug text-ink-muted">
          {descriptionFallback(result)}
        </p>

        {/* framing line, by shape */}
        {isSix ? (
          <div className="mt-5 flex items-start gap-3 rounded-sm border border-rule-strong border-l-[3px] border-l-band-medium bg-surface-sunk px-4 py-3.5">
            <p className="font-sans text-[0.95rem] leading-relaxed text-ink">
              {SIX_DIGIT_NARROWING}
            </p>
          </div>
        ) : (
          <p className="mt-5 font-sans text-[0.95rem] leading-relaxed text-ink-muted">
            {EIGHT_DIGIT_FRAMING}
          </p>
        )}

        {/* C1 (mobile): the band is the one honest signal and must show high,
            right under the code, not buried at the foot of a long column. On
            `< lg` we hoist a compact band strip here (the full meter still
            lives in the margin, which stacks below on mobile). The desktop
            two-pane keeps the band only in the margin, so this is `lg:hidden`. */}
        <div
          className="mt-6 flex flex-col gap-2 border-t border-rule pt-4 lg:hidden"
          aria-hidden="true"
        >
          <ConfidenceBand band={result.confidenceBand} variant="inline" />
          <p className="max-w-read font-sans text-meta leading-snug text-ink-muted">
            {BAND_MEANING[result.confidenceBand]}
          </p>
        </div>
      </div>

      {/* TRADE INTELLIGENCE — promoted alert (Prohibited/Restricted/STE). A
          control warning must be unmissable, so it sits at the TOP of the
          document pane, right under the code/description (EXPERIENCE-DESIGN
          §4.2). Renders nothing when there is no trade intel or the status is
          calm (Free/null), which falls to the compact block below. */}
      {intel && shouldPromoteTradeIntel(intel) ? (
        <div className="mt-7">
          <TradeIntelBlock intel={intel} placement="promoted" />
        </div>
      ) : null}

      {/* 6-digit: candidate list is the PRIMARY decision; show it FIRST. */}
      {isSix ? (
        <>
          <AlternativesSection result={result} />
          <p className="mt-5 max-w-read font-sans text-meta leading-relaxed text-ink-muted">
            {SIX_VS_EIGHT_EXPLAINER}
          </p>
        </>
      ) : null}

      {/* GENERATED reasoning — clearly labelled as generated, kept separate from
          the verifiable citation that lives in the margin. */}
      <section className="mt-9">
        <RuleLine label={RATIONALE_HEADING} lineNumber={isSix ? "03" : "01"} />
        {/* H10 (honesty): a clear GENERATED tag makes the boundary between the
            model's own reasoning and the verifiable citation unmissable. NO
            italic here; italic is reserved strictly for the verbatim source. */}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-meta leading-relaxed text-ink-muted">
          <span className="inline-flex items-center rounded-sm border border-rule-strong bg-surface-sunk px-1.5 py-0.5 text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink">
            Generated
          </span>
          <span>{GENERATED_EXPLANATION_LABEL}</span>
        </p>
        <div className="mt-3 max-w-read space-y-2.5">
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <p key={i} className="font-sans text-[0.98rem] leading-relaxed text-ink">
                {line}
              </p>
            ))
          ) : (
            <p className="font-sans text-[0.98rem] leading-relaxed text-ink-muted">
              {RATIONALE_EMPTY}
            </p>
          )}
        </div>
      </section>

      {/* 8-digit: alternatives come after the reasoning (secondary). */}
      {!isSix ? <AlternativesSection result={result} /> : null}

      {/* The full record, free to read. Down-weighted disclosure rows. */}
      <div className="mt-9 flex flex-col gap-2.5" aria-label="The full record, free to read">
        <Expander title="Components and materials" meta={componentsMeta(result)}>
          <ComponentsBody result={result} />
        </Expander>

        {/* Export policy (status + verbatim condition) now lives in the single
            "Export and policy" trade-intel block below; the old expander that
            duplicated it was removed. Only the India-specific ORIGIN datum (not
            an export-policy field) is retained here so no detail is lost. */}
        <Expander title="Tariff line origin" meta="India · ITC(HS)">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-meta text-ink-muted">India-specific</dt>
            <dd className="m-0 text-[0.9rem] text-ink">
              {result.indiaSpecific
                ? "Yes. This line is an Indian national breakout."
                : "No. This line matches the WCO HS 2022 structure."}
            </dd>
          </dl>
        </Expander>
      </div>

      {/* TRADE INTELLIGENCE — calm compact block (Free/null). Sits after the
          rationale/alternatives and the disclosure rows (EXPERIENCE-DESIGN
          §4.2): a compact status chip with the duty/incentive rows behind a
          quiet expander. Promoted alerts (Prohibited/Restricted/STE) render at
          the TOP instead, so this is skipped for them. Renders nothing when
          there is no trade intel at all (sparse-friendly, pre-ingest state). */}
      {intel && !shouldPromoteTradeIntel(intel) ? (
        <TradeIntelBlock intel={intel} placement="document" />
      ) : null}
    </Surface>
  );
}

function componentsMeta(result: UiClassification): string {
  const components = Array.isArray(result.components) ? result.components : [];
  if (components.length === 0) return "None recorded";
  return `${components.length} part${components.length === 1 ? "" : "s"}`;
}

function ComponentsBody({ result }: { result: UiClassification }) {
  const components = Array.isArray(result.components) ? result.components : [];
  if (components.length === 0) {
    return <p>No separate components were recorded for this product.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {components.map((c, i) => (
        <React.Fragment key={`${c.name}-${i}`}>
          <dt className="text-meta capitalize text-ink-muted">{(c.role ?? "part").trim() || "part"}</dt>
          <dd className="m-0 text-[0.9rem] text-ink">
            {`${(c.name ?? "—").trim() || "—"} · ${(c.material ?? "—").trim() || "—"}`}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// ----------------------------------------------------------------------------
// The living margin (attached marginalia, subordinate to the sheet).
// ----------------------------------------------------------------------------

function MarginPane({
  record,
  reveal,
}: {
  record: ResultViewRecord;
  reveal: ReturnType<typeof useReveal>;
}) {
  const result = record.result;
  const citation = result.citation;
  const thin = evidenceIsThin(result);
  const sourceLine = humanizeSourceRef(citation);
  const quoted = verbatim(citation);

  return (
    <div className="flex flex-col gap-5 px-1 py-1">
      {/* ASSESSMENT: the band, the one stamp, the graduated advisory. */}
      <section aria-label="Assessment" className="relative">
        {/* ONE archival stamp — suppressed when the record is thin (chrome and
            substance move together). It overlaps the gutter, pressed once.
            H9: the edge-overlap disc is a DESKTOP two-pane device; on a
            full-width mobile margin it would float over the Assessment text and
            clip the gutter, so it is `hidden lg:block`. */}
        {!thin ? (
          <motion.div
            variants={reveal.seal}
            className="pointer-events-none absolute -top-1 right-0 hidden lg:block"
            aria-hidden="true"
          >
            <SealEmblem size={66} label="RECORDED · NOT A RULING" />
          </motion.div>
        ) : null}

        <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          Assessment
        </p>

        <motion.div variants={reveal.ink}>
          <ConfidenceBand band={result.confidenceBand} variant="meter" />
        </motion.div>

        {/* The single decision-point advisory, graduated by band. Said ONCE. */}
        <p className="mt-4 border-t border-rule pt-3.5 font-sans text-meta leading-relaxed text-ink">
          {BAND_ADVISORY[result.confidenceBand]}
        </p>

        {/* Explicit, calm record disclaimer: names WHAT this is (indicative,
            AI-generated, not official advice). The graduated advisory above says
            "verify"; this names the boundary so it is unmissable on every result,
            not only implied by the hedging. */}
        <p className="mt-2.5 font-sans text-meta leading-relaxed text-ink-muted">
          {RESULT_DISCLAIMER}
        </p>
      </section>

      {/* THE VERIFIABLE SOURCE — kept visually distinct from the generated
          reasoning in the document. This is the quote you can look up. */}
      <section aria-label={CITATION_HEADING}>
        <div className="mb-2.5 flex items-center justify-between gap-2.5">
          <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
            {CITATION_HEADING}
          </span>
          {citation?.gir_applied ? (
            <Badge variant="accent" className="font-mono">
              {citation.gir_applied}
            </Badge>
          ) : null}
        </div>

        <p className="mb-2 font-sans text-meta text-ink-muted">{sourceLine}</p>

        {quoted ? (
          <blockquote
            className={cn(
              "m-0 rounded-sm border-l-[3px] border-accent-quiet bg-surface-sunk px-3.5 py-3",
              "font-display text-[0.95rem] font-normal italic leading-snug text-ink",
            )}
          >
            {quoted}
          </blockquote>
        ) : (
          <p className="rounded-sm border border-dashed border-rule-strong bg-surface-sunk px-3.5 py-3 font-sans text-meta leading-relaxed text-ink-muted">
            No verbatim note was recorded for this match. With no source text to check, treat the
            reading as a lead and verify it against the schedule yourself.
          </p>
        )}
      </section>

      {/* Origin annotation. The export-policy status is rendered ONCE, by the
          dated/sourced TradeIntelBlock in the document pane (single source of
          truth); the old undated "Export policy · {status}" chip here was a
          duplicate render and has been removed. Only the India-specific origin
          flag — which the trade-intel block does not carry — remains here. */}
      {result.indiaSpecific ? (
        <section aria-label="Origin" className="flex flex-wrap gap-2">
          <Chip variant="india" className="normal-case tracking-normal">
            India-specific line
          </Chip>
        </section>
      ) : null}

      {/* RECORD ACTIONS — kept flat, never a co-equal card. */}
      <section aria-label="Keep this record" className="border-t border-rule pt-5">
        <ResultActions record={record} />
      </section>

      {/* FEEDBACK — lightweight "was this code right?" with a report path. Fail-
          safe: a failed submit never breaks this view. */}
      <ResultFeedback record={record} />

      {/* Verify it yourself — inviting verification is trust-building. */}
      <a
        href="https://www.indiantradeportal.in/vs.jsp?lang=0&id=0,1,9046"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 font-sans text-meta text-accent-ink underline-offset-4 hover:underline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-sm",
        )}
      >
        Look this up in the official ITC(HS) schedule
        <ArrowRight aria-hidden="true" strokeWidth={1.9} className="size-3.5" />
      </a>
    </div>
  );
}

// ----------------------------------------------------------------------------
// ResultView — the signature screen.
// ----------------------------------------------------------------------------

/**
 * ResultView — the hero readout. One lifted document sheet carries the HS code
 * as the hero object (description demoted to a caption); the living margin holds
 * the assessment band, one archival stamp, and the single VERIFIABLE citation,
 * kept distinct from the GENERATED reasoning on the sheet. Branches on
 * `isSixDigit` into a visibly different shape: a ghosted ".__.__" tail and a
 * primary "choose one to verify" candidate list. Confidence is band-only.
 *
 * The one signature reveal (sheet rises, code clip-reveals, band inks, seal
 * presses once) runs entrance-only via `motion`; prefers-reduced-motion settles
 * everything instantly.
 */
function ResultView({ record, toldUs = [] }: ResultViewProps) {
  const result = record.result;
  const router = useRouter();

  // Engineering A (double-reveal fix): if THIS record was just inscribed in-page
  // by the classify flow (which then router.replace'd here), skip the entrance so
  // the user does not watch the same reveal twice. Read-once-then-clear, keyed to
  // the record id; defaults to a full reveal for any direct/cold/refreshed visit.
  // Computed once on mount (client-only) so SSR is unaffected and the read is not
  // repeated across renders.
  const [skipEntrance] = React.useState<boolean>(() =>
    record.id ? consumeSkipEntrance(record.id) : false,
  );
  const reveal = useReveal(skipEntrance);

  // H8: "Edit and run again" carries the original query back to the input so an
  // almost-right run becomes a one-detail edit, not a full retype. It routes to
  // `/?q=` (the landing input reads `?q=` — Group C); "Classify another product"
  // stays the distinct blank-start action.
  const editAndRerun = React.useCallback(() => {
    router.push(`/?q=${encodeURIComponent(record.query)}`);
  }, [router, record.query]);

  return (
    <motion.div
      // Reserve scroll room on mobile so the sticky bottom action bar (H11)
      // never covers the terminal actions; desktop has no sticky bar.
      className="pb-28 lg:pb-12"
      initial="hidden"
      animate="shown"
      variants={reveal.sheet}
    >
      {/* query echo — this is the user's input, shown as plain data, not a
          pull-quote (dressing a rough description as authoritative would lie). */}
      <div className="mb-[clamp(16px,2.4vw,26px)] flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {QUERY_ECHO_LABEL}
        </span>
        <span className="font-mono text-[0.95rem] text-ink">{record.query}</span>
      </div>

      {/* WHAT YOU TOLD US — the session's own submitted detail, carried in from
          the question interlude / wait so the record reads continuous. Honest
          input only; renders nothing when there were no clarifying rounds. */}
      {toldUs.length > 0 ? (
        <div className="mb-[clamp(16px,2.4vw,26px)]">
          <WhatYouToldUs items={toldUs} />
        </div>
      ) : null}

      <DocumentMargin
        document={<DocumentPane result={result} reveal={reveal} />}
        margin={<MarginPane record={record} reveal={reveal} />}
      />

      {/* Terminal actions — close the loop. "Edit and run again" carries the
          query back to the input (H8); "Classify another product" starts blank. */}
      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={editAndRerun}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-md border border-rule-strong bg-surface px-4 font-sans text-body font-semibold text-ink",
            "transition-colors duration-150 ease-[var(--ease-ledger)]",
            "hover:border-accent hover:text-accent-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          <Pencil aria-hidden="true" strokeWidth={1.9} className="size-[1.05rem]" />
          {EDIT_AND_RERUN_LABEL}
        </button>
        <Link
          href="/"
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-md px-4 font-sans text-body font-semibold text-ink-muted",
            "transition-colors duration-150 ease-[var(--ease-ledger)]",
            "hover:text-accent-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-md",
          )}
        >
          <Plus aria-hidden="true" strokeWidth={2} className="size-[1.05rem]" />
          {CLASSIFY_ANOTHER_LABEL}
        </Link>
      </div>

      {/* H11/C1: sticky bottom action bar (mobile only). Pins the CHA's two
          load-bearing tasks (Copy code, Download PDF); `lg:hidden` internally
          so the desktop two-pane is untouched. */}
      <MobileActionBar record={record} />
    </motion.div>
  );
}

export { ResultView };
