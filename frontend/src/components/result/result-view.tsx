import * as React from "react";
import { Filter, Info } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { MonoCode } from "@/components/ui/mono-code";
import { ConfidenceBand } from "@/components/ui/confidence-band";
import { Chip } from "@/components/ui/chip";
import { RuleLine } from "@/components/ui/rule-line";
import { SealEmblem } from "@/components/ui/seal";
import { Expander } from "@/components/ui/expander";
import { Badge } from "@/components/ui/badge";
import { DocumentMargin } from "@/components/layout/document-margin";
import { ResultActions } from "@/components/result/result-actions";
import {
  ADVISORY,
  ALTERNATIVES_LABEL,
  EIGHT_DIGIT_FRAMING,
  SIX_DIGIT_CANDIDATES_LABEL,
  SIX_DIGIT_NARROWING,
  SIX_VS_EIGHT_EXPLAINER,
} from "@/lib/content";
import type { UiClassification } from "@/lib/types";

export interface ResultViewRecord {
  id?: string;
  query: string;
  result: UiClassification;
}

export interface ResultViewProps {
  record: ResultViewRecord;
}

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

/** Left-pane "to verify" alternatives / candidates list. */
function AlternativesSection({
  result,
}: {
  result: UiClassification;
}) {
  const isSix = result.isSixDigit;
  const label = isSix ? SIX_DIGIT_CANDIDATES_LABEL : ALTERNATIVES_LABEL;
  const alternatives = Array.isArray(result.alternatives) ? result.alternatives : [];

  if (alternatives.length === 0) {
    // Honest one-liner for the six-digit case rather than an empty section.
    if (isSix) {
      return (
        <section className="mt-8 sm:mt-9">
          <RuleLine label={label} />
          <p className="mt-3 font-sans text-[0.92rem] leading-relaxed text-ink-muted">
            The 8-digit lines under this subheading are not separately recorded here. A licensed
            customs broker confirms the final two digits from your product details before filing.
          </p>
        </section>
      );
    }
    return null;
  }

  return (
    <section className="mt-8 sm:mt-9">
      <RuleLine label={label} />
      <p className="mb-2.5 mt-2 font-sans text-[0.78rem] text-ink-muted">
        {isSix
          ? "These split this subheading by finer detail. One is the filing line. A customs broker confirms which from the actual product."
          : "Adjacent leaves worth a check if your product carries a detail we did not see."}
      </p>
      <ul className="flex flex-col border-t border-rule">
        {alternatives.map((alt, i) => (
          <li
            key={`${alt.code}-${i}`}
            className="flex items-center gap-4 border-b border-rule px-1 py-3"
          >
            <MonoCode code={alt.code} size="sm" className="min-w-[11ch] shrink-0 font-medium" />
            <span className="min-w-0 flex-1 text-[0.92rem] text-ink-muted">
              {(alt.description ?? "").trim() || "Description not recorded"}
            </span>
            <span className="shrink-0 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent opacity-75">
              Verify
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The document pane (left). */
function DocumentPane({ result }: { result: UiClassification }) {
  const isSix = result.isSixDigit;
  const lines = reasoningLines(result.reasoning);
  const citation = result.citation;
  const components = Array.isArray(result.components) ? result.components : [];

  return (
    <Surface
      as="article"
      variant="raised"
      role="region"
      aria-label="Classification readout"
      className="p-[clamp(22px,3vw,40px)] motion-safe:animate-[prevyl-settle_0.42s_ease_both]"
    >
      {/* eyebrow */}
      <p className="mb-[18px] flex items-center gap-2.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        <span aria-hidden="true" className="h-px w-[18px] bg-accent" />
        {isSix ? "Narrowed · 6-digit subheading" : "Classified · 8-digit tariff line"}
      </p>

      {/* headline code */}
      <MonoCode code={result.hsCode} size="display" className="block" />
      <p className="mt-3.5 max-w-[36ch] font-display text-[clamp(1.18rem,2.2vw,1.55rem)] font-normal leading-[1.32] text-ink">
        {descriptionFallback(result)}
      </p>

      {/* six-digit: narrowing framing + 6-vs-8 explainer */}
      {isSix ? (
        <>
          <div className="mt-[18px] flex items-start gap-3 rounded-r-[10px] border border-[color-mix(in_srgb,var(--band-medium)_42%,var(--rule))] border-l-[3px] border-l-band-medium bg-[color-mix(in_srgb,var(--band-medium)_13%,var(--surface))] px-4 py-3.5">
            <Filter
              aria-hidden="true"
              strokeWidth={1.7}
              className="mt-0.5 size-[18px] shrink-0 text-band-medium"
            />
            <p className="font-sans text-[0.92rem] leading-relaxed text-ink">
              {SIX_DIGIT_NARROWING}
            </p>
          </div>
          <p className="mt-3.5 border-t border-rule pt-3.5 font-sans text-[0.86rem] leading-relaxed text-ink-muted">
            {SIX_VS_EIGHT_EXPLAINER}
          </p>
        </>
      ) : (
        <p className="mt-3.5 border-t border-rule pt-3.5 font-sans text-[0.86rem] leading-relaxed text-ink-muted">
          {EIGHT_DIGIT_FRAMING}
        </p>
      )}

      {/* advisory */}
      <p className="mt-[18px] flex items-center gap-2.5 border-t border-rule pt-4 font-sans text-[0.85rem] text-ink-muted">
        <Info aria-hidden="true" strokeWidth={1.7} className="size-4 shrink-0 text-accent" />
        {ADVISORY}
      </p>

      {/* why this code */}
      <section className="mt-8 sm:mt-9">
        <RuleLine label="Why this code" />
        <div className="mt-3.5 max-w-[60ch] space-y-2.5">
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <p key={i} className="font-sans text-[0.98rem] leading-relaxed text-ink">
                {line}
              </p>
            ))
          ) : (
            <p className="font-sans text-[0.98rem] leading-relaxed text-ink-muted">
              No rationale was recorded for this result.
            </p>
          )}
        </div>
      </section>

      {/* alternatives / candidates */}
      <AlternativesSection result={result} />

      {/* expanders — full record, free to read */}
      <div className="mt-7 flex flex-col gap-2.5" aria-label="Full record, free to read">
        <Expander title="Full reasoning" meta="Read the trace">
          <div className="space-y-2.5">
            {lines.length > 0 ? (
              lines.map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p>No rationale was recorded for this result.</p>
            )}
          </div>
        </Expander>

        {citation ? (
          <Expander title="Chapter & section notes (verbatim)" meta="Sources">
            <div className="space-y-3">
              <p className="border-l-2 border-accent py-0.5 pl-3.5 font-display text-[0.95rem] font-normal italic text-ink">
                {(citation.primary?.verbatim_text ?? "").trim() || "No verbatim text recorded."}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-[0.84rem] text-ink-muted">Source</dt>
                <dd className="m-0 font-mono text-[0.84rem] text-accent-ink">
                  {(citation.primary?.source_ref ?? "").trim() || "n/a"}
                </dd>
                <dt className="text-[0.84rem] text-ink-muted">Rule applied</dt>
                <dd className="m-0 text-[0.9rem] text-ink">
                  {(citation.gir_applied ?? "").trim() || "n/a"}
                </dd>
              </dl>
            </div>
          </Expander>
        ) : null}

        {components.length > 0 ? (
          <Expander title="Components" meta={`${components.length} part${components.length === 1 ? "" : "s"}`}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {components.map((c, i) => (
                <React.Fragment key={`${c.name}-${i}`}>
                  <dt className="text-[0.84rem] capitalize text-ink-muted">
                    {(c.role ?? "part").trim() || "part"}
                  </dt>
                  <dd className="m-0 text-[0.9rem] text-ink">
                    {`${(c.name ?? "—").trim() || "—"} · ${(c.material ?? "—").trim() || "—"}`}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </Expander>
        ) : null}

        <Expander title="Export policy detail" meta="India · ITC(HS)">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-[0.84rem] text-ink-muted">Export policy</dt>
            <dd className="m-0 text-[0.9rem] text-ink">
              {(result.exportPolicy ?? "").trim() || "Not recorded against this line."}
            </dd>
            <dt className="text-[0.84rem] text-ink-muted">Policy condition</dt>
            <dd className="m-0 text-[0.9rem] text-ink">
              {(result.policyCondition ?? "").trim() || "None recorded against this line."}
            </dd>
            <dt className="text-[0.84rem] text-ink-muted">India-specific</dt>
            <dd className="m-0 text-[0.9rem] text-ink">
              {result.indiaSpecific
                ? "Yes — this line is an Indian national breakout."
                : "No — this line matches the WCO HS 2022 structure."}
            </dd>
          </dl>
        </Expander>
      </div>
    </Surface>
  );
}

/** The living margin / assessment pane (right). */
function MarginPane({ record }: { record: ResultViewRecord }) {
  const result = record.result;
  const citation = result.citation;
  const hasPolicyChip = Boolean((result.exportPolicy ?? "").trim());

  return (
    <div className="flex flex-col gap-[clamp(18px,2.2vw,22px)]">
      {/* assessment card */}
      <Surface
        as="section"
        variant="raised"
        aria-label="Assessment"
        className="relative p-[clamp(20px,2.4vw,26px)] motion-safe:animate-[prevyl-settle_0.42s_ease_both] motion-safe:[animation-delay:0.06s]"
      >
        {/* stamp emblem top-right */}
        <div className="absolute right-[18px] top-[18px]">
          <SealEmblem size={74} label="RULE-CHECKED" />
        </div>

        <p className="mb-4 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Assessment
        </p>

        <ConfidenceBand band={result.confidenceBand} variant="meter" />

        <RuleLine className="my-4.5" />

        {/* primary citation */}
        {citation ? (
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-2.5">
              <span className="font-sans text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Primary citation
              </span>
              <Badge variant="accent" className="font-mono">
                {(citation.gir_applied ?? "GIR").trim() || "GIR"}
              </Badge>
            </div>
            <p className="mb-2 font-sans text-[0.78rem] text-ink-muted">
              {`source · ${(citation.primary?.source_ref ?? "n/a").trim() || "n/a"}`}
            </p>
            <blockquote className="m-0 rounded-r-lg border-l-[3px] border-accent bg-surface-sunk px-3.5 py-3 font-display text-[0.95rem] font-normal italic leading-snug text-ink">
              {(citation.primary?.verbatim_text ?? "").trim() ||
                "No verbatim text recorded for this citation."}
            </blockquote>
          </div>
        ) : null}

        <RuleLine className="my-4.5" />

        {/* policy + india chips */}
        <div className="flex flex-wrap gap-2.5">
          {hasPolicyChip ? (
            <Chip variant="policy" className="normal-case tracking-normal">
              {`Export policy · ${(result.exportPolicy ?? "").trim()}`}
            </Chip>
          ) : (
            <Chip variant="neutral" className="normal-case tracking-normal">
              Export policy · not recorded
            </Chip>
          )}
          {result.indiaSpecific ? (
            <Chip variant="india" className="normal-case tracking-normal">
              India-specific line
            </Chip>
          ) : null}
        </div>

        {result.policyCondition && (result.policyCondition ?? "").trim() ? (
          <p className="mt-3 font-sans text-[0.8rem] leading-relaxed text-ink-muted">
            {result.policyCondition}
          </p>
        ) : null}

        <p className="mt-4 flex items-center gap-2 border-t border-rule pt-3.5 font-sans text-[0.8rem] text-ink-muted">
          <Info aria-hidden="true" strokeWidth={1.7} className="size-3.5 shrink-0 text-accent" />
          {ADVISORY}
        </p>
      </Surface>

      {/* gated actions card */}
      <Surface
        as="section"
        variant="raised"
        aria-label="Record actions"
        className="p-[clamp(20px,2.4vw,26px)] motion-safe:animate-[prevyl-settle_0.42s_ease_both] motion-safe:[animation-delay:0.1s]"
      >
        <ResultActions record={record} />
      </Surface>
    </div>
  );
}

/**
 * ResultView — the hero readout (hero-B + state-sixdigit). A two-pane document /
 * margin layout: the classification document on the left, the assessment and
 * record actions in the living margin on the right. Branches on `isSixDigit` for
 * framing and labels. Confidence is band-only, via the ConfidenceBand primitive.
 */
function ResultView({ record }: ResultViewProps) {
  const result = record.result;

  return (
    <div className="pb-24 sm:pb-12">
      {/* Co-located entrance keyframe; the global reduced-motion guard zeroes it. */}
      <style>{settleKeyframes}</style>

      {/* query line */}
      <div className="mb-[clamp(18px,2.4vw,28px)] flex flex-wrap items-center gap-3.5">
        <span className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Description filed
        </span>
        <span className="font-display text-[clamp(1.05rem,2vw,1.34rem)] font-normal italic text-ink">
          <span aria-hidden="true" className="text-accent">
            &ldquo;
          </span>
          {record.query}
          <span aria-hidden="true" className="text-accent">
            &rdquo;
          </span>
        </span>
      </div>

      <DocumentMargin
        document={<DocumentPane result={result} />}
        margin={<MarginPane record={record} />}
      />
    </div>
  );
}

const settleKeyframes = `
@keyframes prevyl-settle {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
`;

export { ResultView };
