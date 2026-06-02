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
  high: "A clear, well-supported reading. The notes and rules agree here.",
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

/** Framing for the confident 8-digit case. Literal and direct. The
 *  verify-before-filing reminder is said ONCE, by the band advisory, so it is
 *  not repeated here. */
export const EIGHT_DIGIT_FRAMING =
  "This is the best 8-digit match for what you described.";

export const ALTERNATIVES_LABEL = "Close alternatives to check";
export const SIX_DIGIT_CANDIDATES_LABEL = "8-digit candidates to check";

// ----------------------------------------------------------------------------
// Rationale framing. Separate VERIFIABLE from GENERATED.
// ----------------------------------------------------------------------------

/** Heading for the model's own reasoning steps. */
export const RATIONALE_HEADING = "Why this code";
/** Honesty label that sits above the generated reasoning. Layout-neutral (the
 *  verifiable citation sits in the margin on desktop, below on mobile), so it
 *  names the source rather than pointing a direction. */
export const GENERATED_EXPLANATION_LABEL =
  "Prevyl's own reasoning. The verifiable source is the cited basis in the schedule.";
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

/** One-line value proposition. Outcome-first, <=8 words (5-second test). */
export const VALUE_PROP = "The right export code, with its legal basis.";
/** One supporting sentence. Anchors the high-stakes purpose under the input. */
export const VALUE_SUB =
  "Describe your product and get its 8-digit Indian ITC-HS export code, with the chapter and heading cited so you can verify it before filing.";

/**
 * How it works, in three plain steps. Below the fold on the landing: substance
 * for returning users and search engines, without crowding the hero. Honest
 * voice (it reads the schedule, it does not guess), no fabricated stats.
 */
export const HOW_IT_WORKS = [
  {
    title: "Describe your product",
    body: "A few plain words is enough. Material, form and use sharpen the match.",
  },
  {
    title: "We read the schedule",
    body: "Prevyl works through the ITC-HS chapters, headings and legal notes in order. It reads the schedule, it does not guess.",
  },
  {
    title: "You get a cited code",
    body: "An 8-digit line with its legal basis and an honest confidence band. Verify it before filing.",
  },
] as const;

// ----------------------------------------------------------------------------
// The wait (loading). Honest domain micro-lessons shown as marginalia during
// the genuine ~40s classification. Occupied time feels shorter and the wait
// doubles as just-in-time onboarding. Every line is true and checkable; none
// claims progress or a fraction. No fabricated stats, no em-dashes.
// ----------------------------------------------------------------------------

export const WAIT_LESSONS = [
  "A confidence band is a category we admit to, not a percentage. High means the notes and rules point one way.",
  "Indian ITC-HS codes have 8 digits. The first 6 follow the world HS system; the last 2 are India's own breakdown.",
  "A product's chapter is decided first by what it is and what it is made of, before what it is used for.",
  "Legal notes at the top of each chapter can pull a product in or push it out. Prevyl reads those, not just the words.",
  "When a description does not flag a special variant, the plain residual line is usually the right one.",
  "The General Interpretive Rules settle ties. GIR-1 says the headings and the legal notes govern first.",
  "Two products that look alike can sit in different chapters. Material and processing often decide which.",
  "A cited heading you can look up is worth more than a confident guess you cannot check.",
] as const;

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
