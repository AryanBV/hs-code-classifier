"use client";

import * as React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

import type { ConfidenceBand, UiClassification } from "./types";

/**
 * generateAndDownloadPdf — builds a formal "Classification Record" certificate
 * with @react-pdf/renderer and triggers a browser download. Uses the library's
 * built-in fonts (Times-Roman / Helvetica / Courier) so it never depends on a
 * network font fetch. Resilient to null/empty fields.
 */

// Warm / neutral certificate palette (PDF needs literal hex; the theme tokens
// are CSS-only). Kept close to the on-screen Customs-Ledger tones.
const C = {
  bg: "#FBF8F1",
  ink: "#23211C",
  inkMuted: "#6B6457",
  rule: "#D8CFBC",
  accent: "#7A4B2B",
  accentInk: "#5C3720",
  sunk: "#EDE6D8",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    color: C.ink,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
  },
  // header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingBottom: 12,
    marginBottom: 20,
  },
  wordmark: { fontFamily: "Times-Roman", fontSize: 17, color: C.ink },
  headerRight: { textAlign: "right" },
  headerTitle: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: C.accentInk,
    letterSpacing: 1,
  },
  headerMeta: { fontSize: 8, color: C.inkMuted, marginTop: 2 },
  // eyebrow + section
  eyebrow: {
    fontSize: 8,
    color: C.inkMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 18,
  },
  query: {
    fontFamily: "Times-Roman",
    fontSize: 12,
    color: C.ink,
    marginBottom: 18,
  },
  // headline code
  codeBlock: {
    backgroundColor: C.sunk,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 6,
    padding: 16,
    marginBottom: 6,
  },
  code: {
    fontFamily: "Courier-Bold",
    fontSize: 30,
    color: C.ink,
    letterSpacing: 1,
  },
  leafDesc: {
    fontFamily: "Times-Roman",
    fontSize: 13,
    color: C.ink,
    marginTop: 10,
    marginBottom: 4,
  },
  // assessment row
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metaCell: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 120,
  },
  metaKey: {
    fontSize: 7,
    color: C.inkMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaVal: { fontSize: 10, color: C.ink },
  // body text
  para: { fontSize: 10, color: C.ink, marginBottom: 6 },
  muted: { fontSize: 9, color: C.inkMuted },
  // citation
  citeBox: {
    backgroundColor: C.sunk,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  citeGir: {
    fontFamily: "Courier-Bold",
    fontSize: 9,
    color: C.accentInk,
    marginBottom: 4,
  },
  citeSrc: { fontSize: 8, color: C.inkMuted, marginBottom: 4 },
  citeText: { fontFamily: "Times-Italic", fontSize: 10, color: C.ink },
  // alternatives / components
  altRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    paddingVertical: 5,
  },
  altCode: {
    fontFamily: "Courier",
    fontSize: 10,
    color: C.ink,
    width: 90,
  },
  altDesc: { fontSize: 9, color: C.inkMuted, flex: 1 },
  // advisory + footer
  advisory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 10,
    marginTop: 18,
  },
  advisoryText: { fontSize: 9, color: C.inkMuted },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.inkMuted },
});

const BAND_WORD: Record<ConfidenceBand, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

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

interface RecordInput {
  query: string;
  result: UiClassification;
}

function CertificateDoc({ query, result }: RecordInput) {
  const r = result;
  const desc = safe(r.description, "Description not recorded");
  const bandWord = BAND_WORD[r.confidenceBand] ?? "Medium";
  const lines = reasoningLines(r.reasoning);
  const alternatives = Array.isArray(r.alternatives) ? r.alternatives : [];
  const components = Array.isArray(r.components) ? r.components : [];
  const citation = r.citation;
  const generatedOn = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const altLabel = r.isSixDigit ? "8-digit candidates to verify" : "Alternatives to verify";

  return (
    <Document
      title={`Prevyl Classification Record ${r.hsCode}`}
      author="Prevyl"
      subject="ITC-HS classification record"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* header */}
        <View style={styles.header} fixed>
          <Text style={styles.wordmark}>Prevyl</Text>
          <View style={styles.headerRight}>
            <Text style={styles.headerTitle}>Classification Record</Text>
            <Text style={styles.headerMeta}>Generated {generatedOn}</Text>
            <Text style={styles.headerMeta}>Schedule 2 · ITC(HS) 2022</Text>
          </View>
        </View>

        {/* query */}
        <Text style={styles.eyebrow}>Description filed</Text>
        <Text style={styles.query}>{`“${safe(query, "(no description)")}”`}</Text>

        {/* headline */}
        <Text style={styles.eyebrow}>
          {r.isSixDigit ? "6-digit subheading · careful narrowing" : "8-digit tariff line"}
        </Text>
        <View style={styles.codeBlock}>
          <Text style={styles.code}>{safe(r.hsCode, "—")}</Text>
        </View>
        <Text style={styles.leafDesc}>{desc}</Text>

        {/* assessment cells */}
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Confidence band</Text>
            <Text style={styles.metaVal}>{bandWord}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Export policy</Text>
            <Text style={styles.metaVal}>{safe(r.exportPolicy, "Not recorded")}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>India-specific</Text>
            <Text style={styles.metaVal}>{r.indiaSpecific ? "Yes" : "No"}</Text>
          </View>
        </View>
        {r.policyCondition ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            {`Policy condition: ${r.policyCondition}`}
          </Text>
        ) : null}

        {/* why this code */}
        <Text style={styles.sectionLabel}>Why this code</Text>
        {lines.length > 0 ? (
          lines.map((line, i) => (
            <Text key={i} style={styles.para}>
              {line}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>No rationale was recorded for this result.</Text>
        )}

        {/* citation */}
        {citation ? (
          <>
            <Text style={styles.sectionLabel}>Primary citation</Text>
            <View style={styles.citeBox}>
              <Text style={styles.citeGir}>{safe(citation.gir_applied, "GIR")}</Text>
              <Text style={styles.citeSrc}>
                {`Source · ${safe(citation.primary?.source_ref, "n/a")}`}
              </Text>
              <Text style={styles.citeText}>
                {`“${safe(citation.primary?.verbatim_text, "No verbatim text recorded.")}”`}
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
              : "No adjacent leaves were flagged for this result."}
          </Text>
        )}

        {/* components */}
        {components.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Components</Text>
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

        {/* advisory */}
        <View style={styles.advisory}>
          <Text style={styles.advisoryText}>
            Indicative classification · verify before filing. This record reflects Prevyl&apos;s
            best reading of the Indian ITC-HS schedule and is not a customs ruling.
          </Text>
        </View>

        {/* footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Prevyl · ITC-HS classification</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
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
  const blob = await pdf(
    <CertificateDoc query={record.query} result={record.result} />,
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
