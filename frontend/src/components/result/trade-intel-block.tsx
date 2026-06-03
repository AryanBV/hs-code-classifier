"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

import { PolicyStatus } from "@/components/ui/policy-status";
import { DatedValueRow } from "@/components/ui/dated-value-row";
import { SourceQuote } from "@/components/ui/source-quote";
import { AdvisoryFlag } from "@/components/ui/advisory-flag";
import { Expander } from "@/components/ui/expander";
import { RuleLine } from "@/components/ui/rule-line";
import {
  TRADE_INTEL_ABSENCE_NOT_CLEARANCE,
  TRADE_INTEL_CONDITION_MISSING,
  TRADE_INTEL_DUTY_VERIFY,
  TRADE_INTEL_FLAGS_LABEL,
  TRADE_INTEL_HEADING,
  TRADE_INTEL_INCENTIVE_VERIFY,
  TRADE_INTEL_META,
  TRADE_INTEL_MONEY_LABEL,
  TRADE_INTEL_OFFICIAL_TEXT_LABEL,
  TRADE_INTEL_STALE_VERIFY,
  TRADE_INTEL_VERIFY_LINK_LABEL,
} from "@/lib/content";
import type {
  PolicySeverity,
  TradeExportDuty,
  TradeIncentive,
  TradeIntelligence,
  TradeVerifyState,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The severities that get PROMOTED to the top of the document pane as an
 * unmissable alert (a control warning must not hide below the rationale). Free
 * (notice) and null (grey) stay calm and compact, lower in the pane.
 */
export function isPromotedSeverity(severity: PolicySeverity): boolean {
  return severity === "danger" || severity === "warning";
}

/** Whether this result carries trade intel worth promoting to the top. */
export function shouldPromoteTradeIntel(intel: TradeIntelligence | null | undefined): boolean {
  if (!intel) return false;
  return isPromotedSeverity(intel.exportPolicy.severity);
}

function isVerifyState(
  v: TradeExportDuty | TradeIncentive | TradeVerifyState | null | undefined,
): v is TradeVerifyState {
  return !!v && (v as TradeVerifyState).verifyOnly === true;
}

const INCENTIVE_LABEL: Record<TradeIncentive["kind"], string> = {
  rodtep: "RoDTEP",
  rosctl: "RoSCTL",
};

function pct(n: number): string {
  // Tabular, India-style — keep simple and dot-decimal.
  return `${n}%`;
}

// ----------------------------------------------------------------------------
// Money rows (export duty + incentive + UQC). Each datum is dated + sourced.
// A verify-state never shows a bare rate; it shows "verify on CBIC/DGFT".
// ----------------------------------------------------------------------------

function MoneyRows({ intel }: { intel: TradeIntelligence }) {
  const { exportDuty, incentive, uqc } = intel;
  const hasAny = exportDuty != null || incentive != null || uqc != null;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col">
      {/* Export duty */}
      {exportDuty != null ? (
        isVerifyState(exportDuty) ? (
          <DatedValueRow
            label="Export duty"
            value={TRADE_INTEL_DUTY_VERIFY}
            asOn={exportDuty.asOn}
            sourceLabel="CBIC"
            sourceUrl={exportDuty.sourceUrl}
          />
        ) : (
          <DatedValueRow
            label="Export duty"
            value={
              exportDuty.verify || !exportDuty.mappable
                ? TRADE_INTEL_DUTY_VERIFY
                : exportDuty.isNil
                  ? "NIL"
                  : (exportDuty.rateText ?? "").trim() || TRADE_INTEL_DUTY_VERIFY
            }
            detail={exportDuty.conditionVerbatim}
            asOn={exportDuty.asOn}
            sourceLabel="Customs Tariff"
            sourceUrl={exportDuty.sourceUrl}
          />
        )
      ) : null}

      {/* Incentive (RoDTEP / RoSCTL) — always render the rate WITH the cap. */}
      {incentive != null ? (
        isVerifyState(incentive) ? (
          <DatedValueRow
            label="Incentive"
            value={TRADE_INTEL_INCENTIVE_VERIFY}
            asOn={incentive.asOn}
            sourceLabel="DGFT"
            sourceUrl={incentive.sourceUrl}
          />
        ) : (
          <DatedValueRow
            label={INCENTIVE_LABEL[incentive.kind]}
            value={pct(incentive.ratePct)}
            detail={
              (incentive.cap ?? "").trim()
                ? `cap ${(incentive.cap ?? "").trim()}${
                    (incentive.capUnit ?? "").trim() ? ` ${(incentive.capUnit ?? "").trim()}` : ""
                  }`
                : null
            }
            asOn={incentive.asOn}
            sourceLabel="DGFT"
            sourceUrl={incentive.sourceUrl}
          />
        )
      ) : null}

      {/* UQC — the per-unit basis (enables the per-unit caps above). */}
      {uqc != null ? (
        <DatedValueRow
          label="Unit (UQC)"
          value={(uqc.code ?? "").trim() || "Not specified"}
          detail={uqc.label}
        />
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// The verbatim condition (for promoted alert cases). Honesty-critical: a missing
// condition on a Restricted/Prohibited line is NEVER blank or inferred.
// ----------------------------------------------------------------------------

function ConditionBody({ intel }: { intel: TradeIntelligence }) {
  const { exportPolicy } = intel;
  const verbatim = (exportPolicy.conditionVerbatim ?? "").trim();

  if (verbatim) {
    return <SourceQuote label={TRADE_INTEL_OFFICIAL_TEXT_LABEL} text={verbatim} />;
  }

  if (exportPolicy.conditionMissing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
          {TRADE_INTEL_OFFICIAL_TEXT_LABEL}
        </span>
        <p className="rounded-sm border border-dashed border-rule-strong bg-surface-sunk px-3.5 py-3 font-sans text-meta leading-relaxed text-ink-muted">
          {TRADE_INTEL_CONDITION_MISSING}
        </p>
      </div>
    );
  }

  return null;
}

function VerifyLink({ url, label }: { url: string; label?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 font-sans text-meta text-accent-ink underline-offset-4 hover:underline",
        "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      {label ?? TRADE_INTEL_VERIFY_LINK_LABEL}
      <ArrowRight aria-hidden="true" strokeWidth={1.9} className="size-3.5" />
    </a>
  );
}

// ----------------------------------------------------------------------------
// The status, by stale-state. A stale-past-budget status is NEVER shown stale:
// it shows the advisory + verify link, never the (possibly wrong) value.
// ----------------------------------------------------------------------------

function PolicyStatusBlock({
  intel,
  prominence,
}: {
  intel: TradeIntelligence;
  prominence: "alert" | "inline";
}) {
  const { exportPolicy } = intel;

  // Stale: never display the stale status value; replace with "verify on DGFT".
  if (exportPolicy.stale) {
    return (
      <PolicyStatus
        severity="grey"
        statusWord="Verify"
        plain={(exportPolicy.staleAdvisory ?? "").trim() || TRADE_INTEL_STALE_VERIFY}
        prominence={prominence}
        sourceLabel="DGFT"
        sourceUrl={exportPolicy.sourceUrl}
      />
    );
  }

  const word = exportPolicy.status ?? "Not specified";

  return (
    <PolicyStatus
      severity={exportPolicy.severity}
      statusWord={word}
      plain={exportPolicy.statusPlain}
      prominence={prominence}
      asOn={exportPolicy.asOn}
      sourceLabel="DGFT ITC(HS) Schedule"
      sourceUrl={exportPolicy.sourceUrl}
    >
      {prominence === "alert" ? (
        <>
          <ConditionBody intel={intel} />
          <VerifyLink url={exportPolicy.sourceUrl} />
        </>
      ) : null}
    </PolicyStatus>
  );
}

// ----------------------------------------------------------------------------
// TradeIntelBlock — assembles the whole trade-intel section from
// result.tradeIntelligence. Risk-adaptive: a promoted alert for
// Prohibited/Restricted/STE; a calm compact chip + an expander for the money
// rows for Free/null. The §6 three-line disclaimer attaches to the block.
// ----------------------------------------------------------------------------

export interface TradeIntelBlockProps {
  intel: TradeIntelligence;
  /**
   * "promoted" = the unmissable top-of-pane alert (Prohibited/Restricted/STE).
   * "document" = the calm in-document compact block (Free/null), after the
   * rationale/alternatives.
   */
  placement: "promoted" | "document";
  className?: string;
}

function TradeIntelBlock({ intel, placement, className }: TradeIntelBlockProps) {
  const flags = Array.isArray(intel.flags) ? intel.flags : [];
  const promoted = placement === "promoted";

  // PROMOTED: the severity alert is the whole point. Money rows + flags ride
  // below it, with the disclaimer attached. No expander — this is high-urgency.
  if (promoted) {
    return (
      <section
        aria-label={TRADE_INTEL_HEADING}
        className={cn("flex flex-col gap-4", className)}
      >
        <PolicyStatusBlock intel={intel} prominence="alert" />

        {(intel.exportDuty || intel.incentive || intel.uqc) ? (
          <div>
            <p className="mb-1 font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
              {TRADE_INTEL_MONEY_LABEL}
            </p>
            <MoneyRows intel={intel} />
          </div>
        ) : null}

        {flags.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
              {TRADE_INTEL_FLAGS_LABEL}
            </p>
            {flags.map((f, i) => (
              <AdvisoryFlag
                key={`${f.type}-${i}`}
                message={f.message}
                absenceNote={TRADE_INTEL_ABSENCE_NOT_CLEARANCE}
                versionDate={f.versionDate}
                sourceUrl={f.sourceUrl}
                sourceLabel="Source"
              />
            ))}
          </div>
        ) : null}

        <p className="border-t border-rule pt-3 font-sans text-meta leading-relaxed text-ink-muted">
          {intel.disclaimer}
        </p>
      </section>
    );
  }

  // DOCUMENT (Free/null): calm and compact. The status chip is always visible;
  // the duty/incentive rows live behind a quiet expander (Fork-4 decision).
  const hasMoney = intel.exportDuty != null || intel.incentive != null || intel.uqc != null;
  const hasFlags = flags.length > 0;

  return (
    <section aria-label={TRADE_INTEL_HEADING} className={cn("mt-9", className)}>
      <RuleLine label={TRADE_INTEL_HEADING} />
      <div className="mt-3 flex flex-col gap-3">
        <PolicyStatusBlock intel={intel} prominence="inline" />

        {(hasMoney || hasFlags) ? (
          <Expander title={TRADE_INTEL_MONEY_LABEL} meta={TRADE_INTEL_META}>
            <div className="flex flex-col gap-4">
              {hasMoney ? <MoneyRows intel={intel} /> : null}
              {hasFlags ? (
                <div className="flex flex-col gap-2">
                  <p className="font-sans text-eyebrow font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-ink-muted">
                    {TRADE_INTEL_FLAGS_LABEL}
                  </p>
                  {flags.map((f, i) => (
                    <AdvisoryFlag
                      key={`${f.type}-${i}`}
                      message={f.message}
                      absenceNote={TRADE_INTEL_ABSENCE_NOT_CLEARANCE}
                      versionDate={f.versionDate}
                      sourceUrl={f.sourceUrl}
                      sourceLabel="Source"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </Expander>
        ) : null}

        <p className="font-sans text-meta leading-relaxed text-ink-muted">{intel.disclaimer}</p>
      </div>
    </section>
  );
}

export { TradeIntelBlock };
