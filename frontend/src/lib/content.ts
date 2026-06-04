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
// "The Record Being Prepared" — the honest wait.
//
// The six REAL pipeline stages (L0..L5), shown as a STATIC ordered method list
// titled below. This is the way Prevyl reads the schedule, in order — NOT a
// timer-driven progress bar. There is ONE indeterminate "working" state over
// the whole method; no per-stage Done/active/pending, no percentage, no ETA.
// ----------------------------------------------------------------------------

export const METHOD_TITLE = "How Prevyl reads the schedule";

/** The six real stages, named in the order the pipeline runs them. Honest. */
export const METHOD_STAGES = [
  "Read your words",
  "Find the chapter",
  "Retrieve candidate headings",
  "Apply the Section and Chapter rules",
  "Choose the tariff line",
  "Check against the legal notes",
] as const;

/** Eyebrow over the whole wait. The single honest "in flight" word. */
export const READING_EYEBROW = "Reading the schedule";

/**
 * Method GLOSSES — one TRUE thing about HS classification, rotated INDEPENDENTLY
 * of any "active stage" (so no sentence ever claims a stage is happening now).
 * Each teaches HOW classification works; none is keyed to the method-list rows.
 * Distinct from WAIT_LESSONS (the marginal micro-lesson deck) so the two streams
 * never repeat one another within a round.
 */
export const METHOD_GLOSSES = [
  "Classification starts from what a thing IS, not what it is called. A trade name is a clue, not the rule.",
  "A chapter note can pull a product in or push it out, even when the words seem to fit a heading.",
  "Headings are read against each other. The one with the most specific description usually wins.",
  "Section and Chapter notes are law, not commentary. They override a heading's plain reading where they apply.",
  "When two lines could fit, the General Interpretive Rules decide which one governs, in a fixed order.",
  "The last two digits are India's own breakdown of a world subheading. They split a line by finer detail.",
  "An unflagged product usually lands on the residual line, not the special variant nobody mentioned.",
] as const;

/** The honest expectation line shown for the whole wait. No deadline. */
export const WAIT_EXPECTATION =
  "This usually takes up to a minute. Prevyl is reading the schedule, not guessing.";

// ----------------------------------------------------------------------------
// Redacted-slot captions (the honesty contract: placeholders must LOOK like
// placeholders, never plausible-but-fake content).
// ----------------------------------------------------------------------------

/** Under the empty 4-2-2 code slot during the wait. */
export const SLOT_CODE_CAPTION = "Your tariff line will appear here, with its description.";
/** In the margin, over the redacted band strip. No band colour until the real result. */
export const SLOT_BAND_CAPTION = "The band appears once the reading settles.";
/** Over the redacted citation region. */
export const SLOT_CITATION_CAPTION = "The cited basis in the schedule will be quoted here.";

// ----------------------------------------------------------------------------
// Multi-round — "WHAT YOU TOLD US". The user's OWN submitted answers ride
// across rounds. NEVER engine-confirmed facts, never "Chapter fixed".
// ----------------------------------------------------------------------------

export const WHAT_YOU_TOLD_US_LABEL = "What you told us";
/** Lead line on the answer path. Honest: re-reading WITH the user's own detail. */
export const REREADING_LEAD = "Re-reading with the detail you added";

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

// ----------------------------------------------------------------------------
// Result-level explicit disclaimer. The graduated BAND_ADVISORY says "verify
// before filing" at the decision point; this short tag names WHAT the record is
// (indicative, AI-generated, not official advice) so the boundary is explicit on
// every result, not only implied by the hedging copy. Calm, not alarming.
// ----------------------------------------------------------------------------
export const RESULT_DISCLAIMER =
  "Indicative · AI-generated · not official customs or legal advice. Verify with a licensed customs broker before filing.";

// ----------------------------------------------------------------------------
// Trade intelligence (additive section). All copy here is DATED/INDICATIVE and
// honest by construction: nothing asserts a yes/no for a line, stale is never
// shown, a null status is never "Free", a missing condition is named not blank,
// and a flag's absence is explicitly not a clearance. No em-dashes.
// ----------------------------------------------------------------------------
export const TRADE_INTEL_HEADING = "Export and policy";
export const TRADE_INTEL_META = "India · ITC(HS)";
/** The grouped money rows (duty, incentive, UQC). */
export const TRADE_INTEL_MONEY_LABEL = "Duty, incentives and unit";
export const TRADE_INTEL_FLAGS_LABEL = "Advisory flags";
export const TRADE_INTEL_OFFICIAL_TEXT_LABEL = "Official text (verbatim)";
/** Shown when a Restricted/Prohibited line carries no condition text. Never blank. */
export const TRADE_INTEL_CONDITION_MISSING =
  "We do not hold the specific condition for this line. Check the DGFT ITC(HS) schedule and notifications.";
/** Used instead of a (possibly wrong) value when a datum is stale-past-budget. */
export const TRADE_INTEL_STALE_VERIFY =
  "This status may have changed. Verify the current status on the DGFT ITC(HS) schedule.";
/**
 * The SHORT stale advisory shown inline beside a stale export-policy status. The
 * status WORD and its date are still shown in full (never dropped behind a bare
 * "Verify" chip); this is appended as the advisory so the line reads e.g.
 * "Free · as on 21 May 2022 · Verify current on DGFT".
 */
export const TRADE_INTEL_STALE_VERIFY_SHORT = "Verify current on DGFT";
/** Verify-state placeholders — never a bare rate when we do not reliably hold it. */
export const TRADE_INTEL_DUTY_VERIFY = "Verify on CBIC";
export const TRADE_INTEL_INCENTIVE_VERIFY = "Verify on DGFT";
/** The standing caveat on every advisory flag. */
export const TRADE_INTEL_ABSENCE_NOT_CLEARANCE = "Absence of this flag is not a clearance.";
/** The verify-it-yourself link label on a promoted alert. */
export const TRADE_INTEL_VERIFY_LINK_LABEL = "Verify on the DGFT ITC(HS) schedule";

// ----------------------------------------------------------------------------
// Feedback on a result (was this code right?). Lightweight, unobtrusive.
// ----------------------------------------------------------------------------
export const FEEDBACK_PROMPT = "Was this code right?";
export const FEEDBACK_UP_LABEL = "Yes, this looks right";
export const FEEDBACK_DOWN_LABEL = "No, this looks wrong";
export const FEEDBACK_REPORT_LABEL = "Report a wrong code";
export const FEEDBACK_NOTE_PLACEHOLDER =
  "Optional: what looked off, or the code you expected.";
export const FEEDBACK_SUBMIT_LABEL = "Send feedback";
export const FEEDBACK_THANKS = "Thanks. This helps Prevyl get better.";
export const FEEDBACK_ERROR = "Could not save just now. Please try again.";
