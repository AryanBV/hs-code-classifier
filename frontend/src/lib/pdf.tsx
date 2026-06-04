"use client";

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Path,
  Circle,
  Line,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";

import type {
  ConfidenceBand,
  TradeExportDuty,
  TradeIncentive,
  TradeIntelligence,
  TradeVerifyState,
  UiClassification,
} from "./types";
import { makeRecordId, formatGeneratedAt } from "./record-id";
import {
  BAND_MEANING,
  TRADE_INTEL_ABSENCE_NOT_CLEARANCE,
  TRADE_INTEL_CONDITION_MISSING,
  TRADE_INTEL_DUTY_VERIFY,
  TRADE_INTEL_HEADING,
  TRADE_INTEL_INCENTIVE_VERIFY,
  TRADE_INTEL_STALE_VERIFY,
  TRADE_INTEL_STALE_VERIFY_SHORT,
} from "./content";

/**
 * generateAndDownloadPdf — builds a premium, filing-grade "Classification
 * Record" certificate with @react-pdf/renderer and triggers a browser download.
 *
 * Design (per the UX brief): the three brand fonts are registered so the record
 * reads as Prevyl, not the default Times/Helvetica/Courier PDF trio. The 8-digit
 * code is the hero, segmented 4-2-2 with the broker-confirmed .00 demoted. The
 * VERIFIABLE citation is visually separated from the GENERATED rationale. The
 * confidence band is a WORD plus a plain-English meaning line, NEVER a number.
 * A checkmark-free archival seal plus a Record ID + timestamp close the
 * certificate. Resilient to null/empty fields throughout.
 *
 * Honesty note: the certificate carries NO QR code and NO printed `/r/{id}`
 * shareable link, because there is no server-side `shared_records` yet — such a
 * link would dead-end ("not on this device") for any recipient. The Record ID
 * (PRV-...) + the generated timestamp stay on paper as an honest reference that
 * identifies the record without promising a working link. A non-clickable
 * `hscode.prevyl.com` brand mark is the only URL shown. Restore the QR + record
 * URL only once the link truly resolves for recipients.
 */

// ---------------------------------------------------------------------------
// Fonts. Registered from the fontsource CDN (static TTF instances). react-pdf
// fetches these client-side when the PDF is built. Registration is wrapped so a
// CDN failure degrades to the built-in fonts rather than throwing — the code
// (Commit Mono) is the highest-value cut, then Fraunces (masthead) and Hanken.
// ---------------------------------------------------------------------------
const FONT_BASE = "https://cdn.jsdelivr.net/fontsource/fonts";
let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  try {
    Font.register({
      family: "Fraunces",
      fonts: [
        { src: `${FONT_BASE}/fraunces@5.2.5/latin-500-normal.ttf`, fontWeight: 500 },
        { src: `${FONT_BASE}/fraunces@5.2.5/latin-600-normal.ttf`, fontWeight: 600 },
        {
          src: `${FONT_BASE}/fraunces@5.2.5/latin-400-italic.ttf`,
          fontWeight: 400,
          fontStyle: "italic",
        },
      ],
    });
    Font.register({
      family: "Hanken Grotesk",
      fonts: [
        { src: `${FONT_BASE}/hanken-grotesk@5.2.5/latin-400-normal.ttf`, fontWeight: 400 },
        { src: `${FONT_BASE}/hanken-grotesk@5.2.5/latin-500-normal.ttf`, fontWeight: 500 },
        { src: `${FONT_BASE}/hanken-grotesk@5.2.5/latin-600-normal.ttf`, fontWeight: 600 },
      ],
    });
    Font.register({
      family: "Commit Mono",
      fonts: [
        { src: `${FONT_BASE}/commit-mono@5.2.5/latin-400-normal.ttf`, fontWeight: 400 },
        { src: `${FONT_BASE}/commit-mono@5.2.5/latin-600-normal.ttf`, fontWeight: 600 },
      ],
    });
    // Avoid hyphenated word-splitting in the certificate body.
    Font.registerHyphenationCallback((word) => [word]);
  } catch {
    /* fall back to built-in fonts; the record still renders. */
  }
}

// Family helpers so a registration failure cleanly degrades to built-ins.
const DISPLAY = "Fraunces";
const BODY = "Hanken Grotesk";
const MONO = "Commit Mono";

// ---------------------------------------------------------------------------
// Palette — the Foundation LIGHT-theme OKLCH ramp converted to sRGB hex (PDFs
// need literal color). Keep in sync with globals.css :root.
// ---------------------------------------------------------------------------
const C = {
  desk: "#e3dfd7", // --bg
  surface: "#f9f6f1", // --surface
  paper: "#fefcf8", // --paper
  sunk: "#d9d4cb", // --surface-sunk
  ink: "#27221d", // --ink
  inkMuted: "#5f5952", // --ink-muted
  rule: "#c7c2ba", // --rule
  ruleStrong: "#7f7971", // --rule-strong (light) — darkened for WCAG 1.4.11 >=3:1
  accent: "#893624", // --accent (oxblood)
  accentQuiet: "#864b39", // --accent-quiet (seal, citation rule)
  accentInk: "#732719", // --accent-ink
  bandHigh: "#1b6255", // --band-high (teal)
  bandMedium: "#916717", // --band-medium (amber)
  bandLow: "#964426", // --band-low (rust)
} as const;

// Severity -> color for the trade-intel status (reuses the band family so a
// Prohibited rust matches a Low-confidence rust). grey = muted ink.
const SEVERITY_COLOR: Record<string, string> = {
  danger: C.bandLow,
  warning: C.bandMedium,
  notice: C.bandHigh,
  grey: C.inkMuted,
};

const BAND_COLOR: Record<ConfidenceBand, string> = {
  high: C.bandHigh,
  medium: C.bandMedium,
  low: C.bandLow,
};
const BAND_WORD: Record<ConfidenceBand, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
// Plain-English meaning lines: SINGLE SOURCE OF TRUTH is lib/content.ts
// BAND_MEANING, imported above so the travelling PDF states the identical thing
// as the on-screen band. Do NOT redefine these strings here.
// Graduated decision-point advisory (mirrors lib/content.ts BAND_ADVISORY).
const BAND_ADVISORY: Record<ConfidenceBand, string> = {
  high: "Confirm this against your actual product before you file.",
  medium:
    "Check this against your product details, and weigh the close alternative, before you file.",
  low: "Do not file on this alone. Confirm the details with your customs broker first.",
};
// Filled segments per band (more ink = more confidence).
const BAND_INKED: Record<ConfidenceBand, 1 | 2 | 3> = { high: 3, medium: 2, low: 1 };

const styles = StyleSheet.create({
  // Page padding clears the lifted-sheet inset (the desk margin around the
  // paper). Top/bottom padding also reserves the band for the fixed header and
  // fixed footer so flowing content never collides with them across pages.
  page: {
    backgroundColor: C.desk,
    color: C.ink,
    paddingTop: 116,
    paddingBottom: 96,
    paddingHorizontal: 74,
    fontFamily: BODY,
    fontSize: 10,
    lineHeight: 1.5,
  },
  // the lifted sheet — a fixed full-bleed paper background behind the content.
  sheet: {
    position: "absolute",
    top: 34,
    bottom: 34,
    left: 34,
    right: 34,
    backgroundColor: C.paper,
    border: `1px solid ${C.ruleStrong}`,
    borderRadius: 2,
  },
  // the fixed masthead, pinned over the sheet's top edge.
  headerFixed: {
    position: "absolute",
    top: 50,
    left: 74,
    right: 74,
  },
  // Pinned near the bottom of the A4 page using `top`, because react-pdf honors
  // `top` (not `bottom`) for fixed absolutely-positioned elements. `top`/`left`
  // are measured from the PAGE EDGE (not the content box), matching the fixed
  // header at top:50. A4 = 841.89pt; footer block ~62pt, so top:768 ends ~830.
  footerFixed: {
    position: "absolute",
    top: 742,
    left: 74,
    right: 74,
  },
  // header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: C.ruleStrong,
    paddingBottom: 14,
    marginBottom: 20,
  },
  wordmark: { fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink },
  wordmarkSub: {
    fontSize: 8,
    color: C.inkMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  headerRight: { textAlign: "right", maxWidth: 230 },
  headerTitle: {
    fontFamily: DISPLAY,
    fontSize: 13,
    fontWeight: 600,
    color: C.ink,
  },
  headerBandline: {
    fontSize: 7,
    color: C.accentInk,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 5,
  },
  headerMeta: { fontSize: 8, color: C.inkMuted, marginTop: 3 },
  recordId: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 600,
    color: C.ink,
    marginTop: 5,
  },
  // eyebrow + section
  eyebrow: {
    fontSize: 7.5,
    color: C.inkMuted,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: DISPLAY,
    fontSize: 12,
    fontWeight: 500,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingBottom: 4,
    marginBottom: 10,
    marginTop: 20,
  },
  query: { fontFamily: MONO, fontSize: 11, color: C.ink, marginBottom: 4 },
  // headline code (hero)
  codeRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
  codeMain: {
    fontFamily: MONO,
    fontSize: 40,
    fontWeight: 600,
    color: C.ink,
    letterSpacing: 1,
  },
  codeSep: { fontFamily: MONO, fontSize: 28, color: C.inkMuted, marginHorizontal: 5 },
  codeTail: { fontFamily: MONO, fontSize: 40, fontWeight: 600, color: C.inkMuted, letterSpacing: 1 },
  codeBaseline: { height: 1, backgroundColor: C.ruleStrong, marginTop: 2, marginBottom: 12 },
  leafDesc: {
    fontFamily: DISPLAY,
    fontSize: 12.5,
    color: C.ink,
    lineHeight: 1.4,
    marginBottom: 4,
    maxWidth: 360,
  },
  // assessment / band block
  assessRow: { flexDirection: "row", gap: 14, marginTop: 14, alignItems: "stretch" },
  bandCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    backgroundColor: C.surface,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 188,
  },
  segCol: { flexDirection: "column-reverse", gap: 2.5 },
  seg: { width: 13, height: 7, borderRadius: 1 },
  bandWord: { fontFamily: DISPLAY, fontSize: 17, fontWeight: 600 },
  bandHint: { fontSize: 7, color: C.inkMuted, letterSpacing: 1, textTransform: "uppercase" },
  metaCol: { flexDirection: "column", gap: 6, flexGrow: 1 },
  metaCell: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  metaKey: {
    fontSize: 6.5,
    color: C.inkMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 1.5,
  },
  metaVal: { fontSize: 9.5, color: C.ink },
  bandMeaning: { fontSize: 9, color: C.ink, marginTop: 9, maxWidth: 460, lineHeight: 1.45 },
  // decision-point advisory
  advisoryBox: {
    flexDirection: "row",
    gap: 9,
    backgroundColor: C.surface,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 2,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  advisoryStrong: { fontFamily: BODY, fontSize: 9.5, fontWeight: 600, color: C.accentInk },
  advisoryText: { fontSize: 9, color: C.ink, lineHeight: 1.45 },
  // body
  generatedLabel: {
    fontSize: 7.5,
    color: C.inkMuted,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  claimRow: { flexDirection: "row", gap: 8, marginBottom: 5 },
  claimBullet: { fontFamily: MONO, fontSize: 9, color: C.accentQuiet, marginTop: 0.5 },
  claimText: { fontSize: 9.5, color: C.ink, flex: 1, lineHeight: 1.45 },
  muted: { fontSize: 9, color: C.inkMuted, lineHeight: 1.45 },
  // citation
  citeBox: {
    backgroundColor: C.surface,
    borderLeftWidth: 3,
    borderLeftColor: C.accentQuiet,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  citeHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  citeGir: { fontFamily: MONO, fontSize: 9, fontWeight: 600, color: C.accentInk },
  citeSrc: { fontSize: 8, color: C.inkMuted },
  citeText: { fontFamily: DISPLAY, fontSize: 10.5, fontStyle: "italic", color: C.ink, lineHeight: 1.5 },
  // trade intelligence
  tiStatusBox: {
    borderLeftWidth: 3,
    borderRadius: 2,
    backgroundColor: C.surface,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tiStatusWord: { fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, marginBottom: 3 },
  tiStatusPlain: { fontSize: 9.5, color: C.ink, lineHeight: 1.45 },
  tiAsOn: { fontSize: 7.5, color: C.inkMuted, marginTop: 4 },
  tiRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
  tiRowLabel: { fontSize: 8, color: C.inkMuted, width: 92 },
  tiRowValue: { fontFamily: MONO, fontSize: 9.5, color: C.ink, flex: 1 },
  tiRowMeta: { fontSize: 7, color: C.inkMuted, marginTop: 1.5 },
  tiFlag: {
    flexDirection: "column",
    borderLeftWidth: 3,
    borderLeftColor: C.bandMedium,
    backgroundColor: C.surface,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 5,
  },
  tiFlagText: { fontSize: 8.5, color: C.ink, lineHeight: 1.4 },
  tiFlagAbsence: { fontSize: 7.5, color: C.inkMuted, marginTop: 2 },
  // alternatives / components
  altRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingVertical: 5,
    alignItems: "center",
  },
  altCode: { fontFamily: MONO, fontSize: 10, color: C.ink, width: 92 },
  altDesc: { fontSize: 9, color: C.inkMuted, flex: 1, lineHeight: 1.4 },
  // footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerLeft: { flexDirection: "column", gap: 2 },
  footerStrong: { fontFamily: MONO, fontSize: 8.5, color: C.ink },
  footerText: { fontSize: 7.5, color: C.inkMuted },
  pageNo: { fontSize: 7.5, color: C.inkMuted },
});

function safe(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function reasoningLines(reasoning: string | null | undefined): string[] {
  return (reasoning ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Split an HS code into its 4-2-2 segments; tail (.00) is rendered demoted. */
function codeSegments(code: string): { main: string; mid: string; tail: string } {
  const parts = (code ?? "").split(".");
  if (parts.length >= 3) {
    return { main: parts[0], mid: parts[1], tail: parts[2] };
  }
  const digits = (code ?? "").replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    return { main: digits.slice(0, 4), mid: digits.slice(4, 6), tail: digits.slice(6, 8) };
  }
  if (digits.length >= 6) {
    return { main: digits.slice(0, 4), mid: digits.slice(4, 6), tail: "" };
  }
  return { main: safe(code, "—"), mid: "", tail: "" };
}

/** The checkmark-free archival seal as vector. Mirrors ui/seal.tsx. */
function SealVector({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="46" stroke={C.accentQuiet} strokeWidth={1.2} fillOpacity={0} />
      <Circle cx="50" cy="50" r="39" stroke={C.accentQuiet} strokeWidth={2.4} fillOpacity={0} />
      <Circle cx="50" cy="50" r="33" stroke={C.accentQuiet} strokeWidth={0.7} fillOpacity={0} />
      <Line x1="50" y1="38" x2="50" y2="62" stroke={C.accentQuiet} strokeWidth={1.8} />
      <Line x1="38" y1="50" x2="62" y2="50" stroke={C.accentQuiet} strokeWidth={1.8} />
      <Circle cx="50" cy="50" r="9" stroke={C.accentQuiet} strokeWidth={1.2} fillOpacity={0} />
      <Path d="M50 45 l3.5 5 l-3.5 5 l-3.5 -5 z" fill={C.accentQuiet} />
    </Svg>
  );
}

/** Type guard for a stale/withheld datum (matches the screen logic). */
function isVerifyState(
  v: TradeExportDuty | TradeIncentive | TradeVerifyState | null | undefined,
): v is TradeVerifyState {
  return !!v && (v as TradeVerifyState).verifyOnly === true;
}

const TI_INCENTIVE_LABEL: Record<TradeIncentive["kind"], string> = {
  rodtep: "RoDTEP",
  rosctl: "RoSCTL",
};

/**
 * TradeIntelSection — the trade-intel status + dated rows + flags + disclaimer
 * for the PDF, so the certificate matches the screen (single source of truth).
 * Honesty mirrors the screen exactly: stale never shows a value; null is never
 * Free; a missing condition is named, not blank; a verify-state never shows a
 * bare rate; every datum carries its as-on date. Renders nothing when absent.
 */
function TradeIntelSection({ intel }: { intel: TradeIntelligence | null | undefined }) {
  if (!intel) return null;
  const ep = intel.exportPolicy;

  // Stale: keep the STATUS WORD + its date + color visible (never drop them
  // behind a bare "Verify"); the plain line flags it may have changed and a
  // "Verify current on DGFT" advisory is appended to the as-on line below.
  // Mirrors the screen (PolicyStatusBlock) exactly.
  const stale = ep.stale;
  const statusWord = safe(ep.status, "Not specified");
  const statusColor = stale && !ep.status
    ? C.inkMuted
    : (SEVERITY_COLOR[ep.severity] ?? C.inkMuted);
  const statusPlain = stale
    ? safe(ep.staleAdvisory, TRADE_INTEL_STALE_VERIFY)
    : ep.statusPlain;

  const conditionVerbatim = (ep.conditionVerbatim ?? "").trim();
  const showCondition = !stale && (conditionVerbatim.length > 0 || ep.conditionMissing);

  const duty = intel.exportDuty;
  const incentive = intel.incentive;
  const uqc = intel.uqc;
  const flags = Array.isArray(intel.flags) ? intel.flags : [];

  function dutyValue(): string {
    if (duty == null) return "";
    if (isVerifyState(duty)) return TRADE_INTEL_DUTY_VERIFY;
    if (duty.verify || !duty.mappable) return TRADE_INTEL_DUTY_VERIFY;
    if (duty.isNil) return "NIL";
    return safe(duty.rateText, TRADE_INTEL_DUTY_VERIFY);
  }

  function incentiveRow(): { label: string; value: string; meta: string } | null {
    if (incentive == null) return null;
    if (isVerifyState(incentive)) {
      return { label: "Incentive", value: TRADE_INTEL_INCENTIVE_VERIFY, meta: incentiveMeta(incentive.asOn) };
    }
    const cap = (incentive.cap ?? "").trim();
    const capUnit = (incentive.capUnit ?? "").trim();
    const capText = cap ? `cap ${cap}${capUnit ? ` ${capUnit}` : ""}` : "";
    return {
      label: TI_INCENTIVE_LABEL[incentive.kind],
      value: `${incentive.ratePct}%`,
      meta: [capText, incentiveMeta(incentive.asOn)].filter(Boolean).join(" · "),
    };
  }

  function incentiveMeta(asOn: string | null): string {
    const a = (asOn ?? "").trim();
    return a ? `as on ${a}` : "";
  }

  const dutyAsOn = duty != null ? (duty.asOn ?? "").trim() : "";
  // Stale advisories ride only on a shown value object (never on a verify-state).
  const dutyAdvisory =
    duty != null && !isVerifyState(duty) ? (duty.staleAdvisory ?? "").trim() : "";
  const incAdvisory =
    incentive != null && !isVerifyState(incentive) ? (incentive.staleAdvisory ?? "").trim() : "";
  const inc = incentiveRow();

  return (
    <>
      <Text style={styles.sectionLabel}>{TRADE_INTEL_HEADING}</Text>

      {/* status */}
      <View style={[styles.tiStatusBox, { borderLeftColor: statusColor }]}>
        <Text style={[styles.tiStatusWord, { color: statusColor }]}>{statusWord}</Text>
        <Text style={styles.tiStatusPlain}>{statusPlain}</Text>
        {/* as-on date + source, with a "Verify current on DGFT" advisory appended
            when stale (the status word + date above stay shown in full). */}
        {((ep.asOn ?? "").trim() || stale) ? (
          <Text style={styles.tiAsOn}>
            {[
              (ep.asOn ?? "").trim() ? `as on ${(ep.asOn ?? "").trim()}` : "",
              "DGFT ITC(HS) Schedule",
              stale ? TRADE_INTEL_STALE_VERIFY_SHORT : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>

      {/* verbatim condition (or the honest "we don't hold it" line) */}
      {showCondition ? (
        <View style={styles.citeBox}>
          <Text style={styles.citeSrc}>Official text (verbatim)</Text>
          <Text style={styles.citeText}>
            {conditionVerbatim
              ? `“${conditionVerbatim}”`
              : TRADE_INTEL_CONDITION_MISSING}
          </Text>
        </View>
      ) : null}

      {/* dated money rows */}
      {duty != null ? (
        <View style={styles.tiRow}>
          <Text style={styles.tiRowLabel}>Export duty</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tiRowValue}>{dutyValue()}</Text>
            {dutyAsOn ? <Text style={styles.tiRowMeta}>{`as on ${dutyAsOn} · Customs Tariff`}</Text> : null}
            {dutyAdvisory ? <Text style={styles.tiRowMeta}>{dutyAdvisory}</Text> : null}
          </View>
        </View>
      ) : null}
      {inc ? (
        <View style={styles.tiRow}>
          <Text style={styles.tiRowLabel}>{inc.label}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tiRowValue}>{inc.value}</Text>
            {inc.meta ? <Text style={styles.tiRowMeta}>{`${inc.meta} · DGFT`}</Text> : null}
            {incAdvisory ? <Text style={styles.tiRowMeta}>{incAdvisory}</Text> : null}
          </View>
        </View>
      ) : null}
      {uqc != null ? (
        <View style={styles.tiRow}>
          <Text style={styles.tiRowLabel}>Unit (UQC)</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tiRowValue}>{safe(uqc.code, "Not specified")}</Text>
            {(uqc.label ?? "").trim() ? <Text style={styles.tiRowMeta}>{(uqc.label ?? "").trim()}</Text> : null}
          </View>
        </View>
      ) : null}

      {/* advisory flags — never assert, absence is not a clearance */}
      {flags.length > 0 ? (
        <>
          <Text style={[styles.eyebrow, { marginTop: 10 }]}>Advisory flags</Text>
          {flags.map((f, i) => (
            <View key={`${f.type}-${i}`} style={styles.tiFlag}>
              <Text style={styles.tiFlagText}>{f.message}</Text>
              <Text style={styles.tiFlagAbsence}>
                {`${TRADE_INTEL_ABSENCE_NOT_CLEARANCE}${
                  (f.versionDate ?? "").trim() ? ` ${(f.versionDate ?? "").trim()}` : ""
                }`}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {/* the §6 disclaimer travels with the record */}
      <Text style={[styles.muted, { marginTop: 10 }]}>{intel.disclaimer}</Text>
    </>
  );
}

interface RecordInput {
  query: string;
  result: UiClassification;
  /** Optional: override the minted Record ID (e.g. a stored permalink id). */
  recordId?: string;
  /** Optional: when the record was generated (defaults to now). */
  generatedAt?: number;
  /**
   * Optional: the public permalink base. Reserved (signature preserved) for when
   * server-side `shared_records` exists; NOT currently printed as a link, since a
   * `/r/{id}` URL would dead-end for recipients in the no-DB build.
   */
  shareBaseUrl?: string;
}

function CertificateDoc({
  query,
  result,
  recordId,
  generatedAt,
}: RecordInput) {
  const r = result;
  const desc = safe(r.description, "Description not recorded");
  const band = (r.confidenceBand ?? "medium") as ConfidenceBand;
  const bandWord = BAND_WORD[band] ?? "Medium";
  const bandColor = BAND_COLOR[band] ?? C.bandMedium;
  const inked = BAND_INKED[band] ?? 2;
  const lines = reasoningLines(r.reasoning);
  const alternatives = Array.isArray(r.alternatives) ? r.alternatives : [];
  const components = Array.isArray(r.components) ? r.components : [];
  const citation = r.citation;
  const seg = codeSegments(r.hsCode);

  const id = safe(recordId, makeRecordId(query, r.hsCode));
  // `generatedAt` is resolved by the caller (generateAndDownloadPdf) so render
  // stays pure; the `?? 0` is only a type guard, never the live default.
  const stamp = formatGeneratedAt(generatedAt ?? 0);

  const altLabel = r.isSixDigit ? "8-digit candidates to check" : "Close alternatives to check";
  const headlineEyebrow = r.isSixDigit
    ? "6-digit subheading · narrowed, not yet filed"
    : "Best 8-digit match";

  return (
    <Document
      title={`Prevyl Classification Record ${id}`}
      author="Prevyl"
      subject="Indicative ITC-HS classification record"
      creator="Prevyl"
      producer="Prevyl"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* the lifted paper sheet — fixed full-bleed background on every page */}
        <View style={styles.sheet} fixed />

        {/* fixed masthead */}
        <View style={[styles.headerFixed, styles.header]} fixed>
          <View>
            <Text style={styles.wordmark}>Prevyl</Text>
            <Text style={styles.wordmarkSub}>The careful customs clerk</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Indicative Classification Record</Text>
            <Text style={styles.headerBandline}>Indicative · not a customs ruling</Text>
            <Text style={styles.recordId}>{id}</Text>
            <Text style={styles.headerMeta}>{`Generated ${stamp}`}</Text>
            <Text style={styles.headerMeta}>Schedule 2 · ITC(HS) 2022</Text>
          </View>
        </View>

        {/* flowing content */}
        <View>
          {/* query */}
          <Text style={styles.eyebrow}>You asked</Text>
          <Text style={styles.query}>{safe(query, "(no description)")}</Text>

          {/* headline code + seal */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 16 }} wrap={false}>
            <View style={{ maxWidth: 380 }}>
              <Text style={styles.eyebrow}>{headlineEyebrow}</Text>
              <View style={styles.codeRow}>
                <Text style={styles.codeMain}>{seg.main}</Text>
                {seg.mid ? <Text style={styles.codeSep}>·</Text> : null}
                {seg.mid ? <Text style={styles.codeMain}>{seg.mid}</Text> : null}
                {seg.tail ? <Text style={styles.codeSep}>·</Text> : null}
                {seg.tail ? <Text style={styles.codeTail}>{seg.tail}</Text> : null}
              </View>
              <View style={[styles.codeBaseline, { width: 230 }]} />
              <Text style={styles.leafDesc}>{desc}</Text>
            </View>
            <SealVector size={76} />
          </View>

          {/* assessment: band + policy meta */}
          <View style={styles.assessRow}>
            <View style={styles.bandCard}>
              <View style={styles.segCol}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.seg,
                      i < inked
                        ? { backgroundColor: bandColor }
                        : { backgroundColor: "transparent", borderWidth: 1, borderColor: C.ruleStrong },
                    ]}
                  />
                ))}
              </View>
              <View>
                <Text style={styles.bandHint}>Confidence band</Text>
                <Text style={[styles.bandWord, { color: bandColor }]}>{bandWord}</Text>
              </View>
            </View>
            <View style={styles.metaCol}>
              <View style={styles.metaCell}>
                <Text style={styles.metaKey}>Export policy</Text>
                <Text style={styles.metaVal}>{safe(r.exportPolicy, "Not recorded")}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaKey}>India-specific line</Text>
                <Text style={styles.metaVal}>{r.indiaSpecific ? "Yes" : "No"}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.bandMeaning}>{BAND_MEANING[band]}</Text>
          {r.policyCondition ? (
            <Text style={[styles.muted, { marginTop: 6 }]}>
              {`Policy condition: ${r.policyCondition}`}
            </Text>
          ) : null}

          {/* decision-point advisory, graduated by band */}
          <View style={styles.advisoryBox}>
            <Text style={styles.advisoryStrong}>Before you file</Text>
            <Text style={styles.advisoryText}>{BAND_ADVISORY[band]}</Text>
          </View>

          {/* why this code — GENERATED, clearly labelled */}
          <Text style={styles.sectionLabel}>Why this code</Text>
          <Text style={styles.generatedLabel}>
            Generated explanation. The basis quoted below is the verifiable source.
          </Text>
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <View key={i} style={styles.claimRow}>
                <Text style={styles.claimBullet}>§{String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.claimText}>{line}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>
              No supporting notes were recorded for this match, which is itself a reason to check it
              closely.
            </Text>
          )}

          {/* basis in the schedule — VERIFIABLE */}
          {citation ? (
            <>
              <Text style={styles.sectionLabel}>Basis in the schedule</Text>
              <View style={styles.citeBox}>
                <View style={styles.citeHead}>
                  <Text style={styles.citeGir}>{safe(citation.gir_applied, "GIR applied")}</Text>
                  <Text style={styles.citeSrc}>
                    {`Source · ${safe(citation.primary?.source_ref, "n/a")}`}
                  </Text>
                </View>
                <Text style={styles.citeText}>
                  {`“${safe(citation.primary?.verbatim_text, "No verbatim text was recorded for this match.")}”`}
                </Text>
              </View>
            </>
          ) : null}

          {/* alternatives */}
          <Text style={styles.sectionLabel}>{altLabel}</Text>
          {alternatives.length > 0 ? (
            alternatives.map((alt, i) => (
              <View key={`${alt.code}-${i}`} style={styles.altRow}>
                <Text style={styles.altCode}>{safe(alt.code, "—")}</Text>
                <Text style={styles.altDesc}>{safe(alt.description, "—")}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>
              {r.isSixDigit
                ? "No 8-digit candidates were listed for this subheading."
                : "No close alternatives were flagged for this result."}
            </Text>
          )}

          {/* components (GIR 3(b)) */}
          {components.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Components considered</Text>
              {components.map((c, i) => (
                <View key={`${c.name}-${i}`} style={styles.altRow}>
                  <Text style={styles.altCode}>{safe(c.role, "—")}</Text>
                  <Text style={styles.altDesc}>
                    {`${safe(c.name, "—")} · ${safe(c.material, "—")}`}
                  </Text>
                </View>
              ))}
            </>
          ) : null}

          {/* trade intelligence — status + dated rows + flags + disclaimer.
              Renders nothing when the result carries no trade-intel data. */}
          <TradeIntelSection intel={r.tradeIntelligence} />

          {/* the persistent global disclaimer */}
          <Text style={[styles.muted, { marginTop: 18 }]}>
            This record reflects Prevyl&apos;s best reading of the Indian ITC-HS schedule. It is
            indicative and is not a customs ruling.
          </Text>
        </View>

        {/* fixed footer text, repeated on every page. The Record ID + the
            non-clickable brand mark are an honest on-paper reference; no QR and
            no `/r/{id}` link are printed, because that link does not yet resolve
            for recipients (no server-side shared_records). */}
        <View style={[styles.footerFixed, styles.footer]} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerStrong}>{id}</Text>
            <Text style={styles.footerText}>hscode.prevyl.com</Text>
            <Text
              style={styles.pageNo}
              render={({ pageNumber, totalPages }) =>
                `Prevyl · ITC-HS classification · page ${pageNumber} of ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

function slugForFile(code: string): string {
  const cleaned = (code ?? "").replace(/[^0-9]/g, "");
  return cleaned.length > 0 ? cleaned : "record";
}

export async function generateAndDownloadPdf(record: RecordInput): Promise<void> {
  registerFonts();

  // Resolve the timestamp here (not in render) so CertificateDoc stays pure.
  const generatedAt = record.generatedAt ?? Date.now();

  const blob = await pdf(
    <CertificateDoc
      query={record.query}
      result={record.result}
      recordId={record.recordId}
      generatedAt={generatedAt}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `prevyl-${slugForFile(record.result.hsCode)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke on the next tick so the click has resolved the navigation.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
