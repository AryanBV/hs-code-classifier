import { ImageResponse } from "next/og";

/**
 * Per-record social card for /r/{id}.
 *
 * In this no-DB build the per-record data (the actual code + confidence band)
 * is NOT server-available, so we render a tasteful GENERIC branded certificate
 * card in the Customs-Ledger palette. `params` is awaited to satisfy the Next 16
 * Promise contract even though the id is not used here.
 *
 * TODO (DB): once Supabase `shared_records` is provisioned, fetch the public,
 * PII-scrubbed record by id and render the real HS code + band on the card.
 *
 * Note: this is an ImageResponse (Satori). Only flexbox and a subset of CSS are
 * supported (no `display: grid`), and colors must be literal hex, not theme
 * tokens. We use the default font so there is no external font fetch to fail.
 */

export const alt = "Prevyl · ITC-HS classification record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Customs-Ledger palette, literal for Satori.
const PAPER = "#f4efe6";
const PAPER_SUNK = "#ece5d8";
const INK = "#23211c";
const INK_MUTED = "#6b6358";
const ACCENT = "#7a4b2b";
const RULE = "#d8cfbe";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Awaited for the Next 16 contract; per-record rendering arrives with the DB.
  await params;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: PAPER,
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        {/* hairline certificate frame */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: `2px solid ${RULE}`,
            borderRadius: 20,
            backgroundColor: PAPER,
            padding: 64,
            boxShadow: "0 30px 80px -50px rgba(35,33,28,0.5)",
          }}
        >
          {/* masthead: wordmark + record eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 46,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: INK,
                }}
              >
                Prevyl
              </span>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 12,
                  backgroundColor: ACCENT,
                  marginLeft: 12,
                  marginBottom: 18,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: INK_MUTED,
              }}
            >
              Classification record
            </span>
          </div>

          {/* center: title + supporting line */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: ACCENT,
                marginBottom: 18,
              }}
            >
              ITC-HS export classification
            </span>
            <span
              style={{
                fontSize: 60,
                fontWeight: 600,
                lineHeight: 1.15,
                color: INK,
                maxWidth: 880,
              }}
            >
              The right export code, with a cited rationale.
            </span>
            <span
              style={{
                fontSize: 26,
                color: INK_MUTED,
                marginTop: 22,
                maxWidth: 820,
              }}
            >
              Indian ITC-HS classification you can verify before filing.
            </span>
          </div>

          {/* footer: ledger rule + stamp-ish chip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `2px solid ${RULE}`,
              paddingTop: 28,
            }}
          >
            <span style={{ fontSize: 22, color: INK_MUTED }}>
              hscode.prevyl.com
            </span>
            <span
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: ACCENT,
                backgroundColor: PAPER_SUNK,
                border: `1px solid ${RULE}`,
                borderRadius: 999,
                padding: "12px 22px",
              }}
            >
              Rule-checked · Indicative
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
