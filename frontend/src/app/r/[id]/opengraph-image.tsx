import { ImageResponse } from "next/og";

/**
 * Per-record social card for /r/{id} — the B2B referral channel's first
 * impression. Rendered in the Customs-Ledger idiom: warm aged paper, a hairline
 * certificate frame, the Fraunces wordmark + honesty tagline, and the
 * checkmark-free archival seal (a register cross + nib, NEVER a "verified"
 * tick).
 *
 * Per-record data (the actual code + band + Record ID) is NOT server-available
 * in this no-DB build, so the card is a tasteful BRANDED-GENERIC card. It makes
 * no per-record claim: it shows no specific Record ID and no `/r/{id}` shareable
 * URL, because that record does not resolve for a recipient yet (the matching
 * /r/{id} page is localStorage-only and dead-ends off-device). Showing only the
 * homepage brand mark keeps the preview honest. The hooks for the real
 * per-record path are wired and commented below: once Supabase `shared_records`
 * is provisioned, fetch the public, PII-scrubbed record by `id` and render the
 * real code, band word, and Record ID in place of the generic headline.
 *
 * Satori constraints (next/og): flexbox only (no grid), literal hex (no CSS
 * tokens), fonts as ArrayBuffer in ttf/otf/woff. We mirror the Foundation's
 * LIGHT-theme OKLCH ramp as exact sRGB hex so the card matches the product.
 *
 * Font note: Satori's parser throws `ltagTable is not defined` on fonts that
 * carry an Apple AAT `ltag` table (Commit Mono does). So the card uses ONLY the
 * clean Fraunces (display) + Hanken (body) TTF instances. The codes do not
 * appear on the generic card anyway; the per-record path (below) can render them
 * in Hanken when shared_records is live.
 */

export const alt = "Prevyl · an Indian ITC-HS classification record you can verify before filing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Foundation light-theme palette, converted from the globals.css OKLCH ramp to
// sRGB hex (Satori cannot read CSS custom properties). Keep in sync with
// globals.css :root if the ramp is ever re-tuned.
const PAPER = "#fefcf8"; // --paper (the lifted sheet)
const SURFACE = "#f9f6f1"; // --surface
const DESK = "#e3dfd7"; // --bg (the desk)
const SUNK = "#d9d4cb"; // --surface-sunk
const INK = "#27221d"; // --ink
const INK_MUTED = "#5f5952"; // --ink-muted
const RULE = "#c7c2ba"; // --rule
const RULE_STRONG = "#7f7971"; // --rule-strong (synced to the round-2 token nudge)
const ACCENT_QUIET = "#864b39"; // --accent-quiet (seal, citation rule, links)

/** Fetch a font as ArrayBuffer; return null on any failure so the card still renders. */
async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// Pinned fontsource TTF instances (small static cuts, not the full variable
// fonts) — both verified free of the AAT `ltag` table that breaks Satori.
// Pinned to a version for reproducible builds.
const FRAUNCES_TTF =
  "https://cdn.jsdelivr.net/fontsource/fonts/fraunces@5.2.5/latin-600-normal.ttf";
const HANKEN_TTF =
  "https://cdn.jsdelivr.net/fontsource/fonts/hanken-grotesk@5.2.5/latin-500-normal.ttf";

/**
 * The archival seal as inline SVG — concentric rings + a register cross + a nib
 * lozenge. NEVER a checkmark, never a "verified" claim. Mirrors ui/seal.tsx.
 */
function Seal({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      style={{ transform: "rotate(-4deg)" }}
    >
      <circle cx="50" cy="50" r="46" stroke={ACCENT_QUIET} strokeWidth="1.2" opacity="0.5" />
      <circle cx="50" cy="50" r="39" stroke={ACCENT_QUIET} strokeWidth="2.4" opacity="0.85" />
      <circle cx="50" cy="50" r="33" stroke={ACCENT_QUIET} strokeWidth="0.7" opacity="0.45" />
      {/* register cross */}
      <line x1="50" y1="38" x2="50" y2="62" stroke={ACCENT_QUIET} strokeWidth="1.8" opacity="0.92" />
      <line x1="38" y1="50" x2="62" y2="50" stroke={ACCENT_QUIET} strokeWidth="1.8" opacity="0.92" />
      <circle cx="50" cy="50" r="9" stroke={ACCENT_QUIET} strokeWidth="1.2" opacity="0.6" />
      {/* nib lozenge */}
      <path d="M50 45 l3.5 5 l-3.5 5 l-3.5 -5 z" fill={ACCENT_QUIET} opacity="0.85" />
    </svg>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited. We do NOT render the id as
  // a per-record reference, because the matching /r/{id} page is localStorage-
  // only and does not resolve for a recipient yet. Showing a specific Record ID
  // here would imply a shareable, resolvable record that does not exist.
  await params;

  // PER-RECORD PATH (DB): when `shared_records` is live, replace the generic
  // headline block with the real values, e.g.:
  //   const { id } = await params;
  //   const rec = await getSharedRecord(id);   // public, PII-scrubbed
  //   headline = rec ? segmentCode(rec.hsCode) : GENERIC;
  //   bandWord = rec?.confidenceBand;           // render as WORD only, never a number
  //   leafDesc = rec?.description;

  const [fraunces, hanken] = await Promise.all([
    fetchFont(FRAUNCES_TTF),
    fetchFont(HANKEN_TTF),
  ]);

  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" }[] = [];
  if (fraunces) fonts.push({ name: "Fraunces", data: fraunces, weight: 600, style: "normal" });
  if (hanken) fonts.push({ name: "Hanken Grotesk", data: hanken, weight: 500, style: "normal" });

  const display = fraunces ? "Fraunces" : "serif";
  const body = hanken ? "Hanken Grotesk" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: DESK,
          padding: 52,
          fontFamily: body,
        }}
      >
        {/* the one lifted sheet */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            backgroundColor: PAPER,
            border: `1px solid ${RULE_STRONG}`,
            borderRadius: 2,
            padding: 64,
            boxShadow: "0 24px 60px -36px rgba(39,34,29,0.55)",
            position: "relative",
          }}
        >
          {/* masthead: wordmark + record reference */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontFamily: display,
                  fontSize: 52,
                  fontWeight: 600,
                  color: INK,
                  letterSpacing: -0.5,
                }}
              >
                Prevyl
              </span>
              <span
                style={{
                  fontSize: 18,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: INK_MUTED,
                  marginTop: 8,
                }}
              >
                ITC-HS classification record
              </span>
            </div>
            <Seal px={120} />
          </div>

          {/* center: the honesty headline (generic until DB) */}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 880 }}>
            <span
              style={{
                fontSize: 15,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: ACCENT_QUIET,
                marginBottom: 20,
              }}
            >
              The careful customs clerk, not the oracle
            </span>
            <span
              style={{
                fontFamily: display,
                fontSize: 58,
                fontWeight: 600,
                lineHeight: 1.12,
                color: INK,
              }}
            >
              The right export code, with a rationale you can check.
            </span>
            <span style={{ fontSize: 25, color: INK_MUTED, marginTop: 22, lineHeight: 1.35 }}>
              Describe your product. See the legal basis, and how sure it is, before you file.
            </span>
          </div>

          {/* footer: ledger rule, record id, advisory */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${RULE}`,
              paddingTop: 26,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: display, fontSize: 26, fontWeight: 600, color: INK, letterSpacing: 0 }}>
                Classification record
              </span>
              <span style={{ fontSize: 18, color: INK_MUTED, marginTop: 6 }}>
                hscode.prevyl.com
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 18,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: ACCENT_QUIET,
                backgroundColor: SURFACE,
                border: `1px solid ${RULE_STRONG}`,
                borderRadius: 2,
                padding: "12px 20px",
              }}
            >
              Indicative · verify before filing
            </div>
          </div>

          {/* a faint ledger gutter line, anchored left, for the document feel */}
          <div
            style={{
              position: "absolute",
              top: 64,
              bottom: 64,
              left: 40,
              width: 1,
              backgroundColor: SUNK,
            }}
          />
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
