/**
 * Shared user-facing copy. Plain, human voice. No em-dashes.
 *
 * Honesty rules baked in here:
 * - Confidence is a BAND with a plain-English meaning line, never a number.
 * - "Verify before filing" is said ONCE at the decision point, graduated by band,
 *   plus the one persistent global disclaimer. We do not repeat it everywhere.
 * - Labels are literal and confident, not costume ("Best match", not "Inscribing").
 * - No fabricated stats.
 */

import type { ConfidenceBand } from "./types";

export const BRAND = "Prevyl";

/** The brand line. Honesty promoted from fine print to point of view. */
export const TAGLINE = "Classification you can check, not just trust.";

/**
 * The one persistent global disclaimer (footer + records).
 * This is the always-present line. The decision-point advisory below is separate
 * and graduated by band; do not stack both in the same spot. Middot, not em-dash.
 */
export const ADVISORY = "Indicative classification · verify before filing.";

// ----------------------------------------------------------------------------
// Confidence band. A category we admit to, never a measured gauge.
// Always pair the band word with its meaning line; never color or word alone.
// ----------------------------------------------------------------------------

/** The band word as shown in the margin (the first, largest thing there). */
export const BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/** Plain-English consequence of each band. What it means for the reader. */
export const BAND_MEANING: Record<ConfidenceBand, string> = {
  high: "A clear, well-supported reading. The notes and rules point one way.",
  medium: "A reasonable reading, but a close alternative could fit. Worth a careful look.",
  low: "An uncertain reading. The product sits near a boundary, so treat this as a lead, not an answer.",
};

/**
 * The single decision-point advisory, graduated by band. Render this ONCE,
 * next to the code and actions. Higher bands stay quiet; lower bands name why
 * and ask for more scrutiny. Do not also repeat the global ADVISORY here.
 */
export const BAND_ADVISORY: Record<ConfidenceBand, string> = {
  high: "Confirm this against your actual product before you file.",
  medium: "Check this against your product details, and weigh the close alternative, before you file.",
  low: "Do not file on this alone. Confirm the details with your customs broker first.",
};

// ----------------------------------------------------------------------------
// 6-vs-8-digit framing (D5)
// ----------------------------------------------------------------------------

/** D5. Shown when a result resolves only to the 6-digit subheading. */
export const SIX_DIGIT_NARROWING =
  "We have narrowed this to the 6-digit subheading. The last two digits depend on product details your customs broker confirms before filing.";

/** D5. The plain-language 6-vs-8 explainer line. */
export const SIX_VS_EIGHT_EXPLAINER =
  "The 8-digit lines below split this subheading by finer details such as material or grade. Treat them as candidates to check, not lines to file as they are.";

/** Framing for the confident 8-digit case. Literal and direct. */
export const EIGHT_DIGIT_FRAMING =
  "This is the best 8-digit match for what you described. Confirm it against your product before filing.";

export const ALTERNATIVES_LABEL = "Close alternatives to check";
export const SIX_DIGIT_CANDIDATES_LABEL = "8-digit candidates to check";

// ----------------------------------------------------------------------------
// Rationale framing. Separate VERIFIABLE from GENERATED.
// ----------------------------------------------------------------------------

/** Heading for the model's own reasoning steps. */
export const RATIONALE_HEADING = "Why this code";
/** Honesty label that sits above the generated reasoning. */
export const GENERATED_EXPLANATION_LABEL =
  "Generated explanation. The citation below is the verifiable source.";
/** Heading for the quoted legal text the reasoning leans on. */
export const CITATION_HEADING = "Basis in the schedule";
/** Shown when no reasoning was recorded. Treat emptiness as a signal, not a gap. */
export const RATIONALE_EMPTY =
  "No supporting notes were recorded for this match, which is itself a reason to check it closely.";

// ----------------------------------------------------------------------------
// Landing
// ----------------------------------------------------------------------------

/** Honest trust strip on the landing. No fabricated stats. */
export const TRUST_POINTS = [
  "Free to use",
  "A cited rationale on every result",
  "Honest about what it is not sure of",
];

/** One-line value proposition. */
export const VALUE_PROP = "The right 8-digit export code, with a rationale you can verify.";
export const VALUE_SUB =
  "Describe your product. Prevyl finds the Indian ITC-HS code, shows the legal basis for it, and tells you how sure it is.";

// ----------------------------------------------------------------------------
// Operating-loop labels (literal, not costume)
// ----------------------------------------------------------------------------

export const INPUT_LABEL = "Describe your product";
export const INPUT_PLACEHOLDER = "e.g. stainless steel hex bolts, M10, partly threaded";
export const SUBMIT_LABEL = "Find the code";
export const CLASSIFY_ANOTHER_LABEL = "Classify another product";
export const EDIT_AND_RERUN_LABEL = "Edit and run again";
/** What the user gave us. Plain, not "Description filed". */
export const QUERY_ECHO_LABEL = "You asked";
