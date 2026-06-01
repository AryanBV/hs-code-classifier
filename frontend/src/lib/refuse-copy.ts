import type { RefuseReason } from "./types";

/**
 * D4 — the ~5-bucket refuse taxonomy. We NEVER render the model's free text.
 * Every refusal maps to one of these pre-written, calm, non-judgmental buckets
 * with exactly one recovery action.
 *
 * REVIEW-AND-TWEAK: this copy was drafted for you to adjust. Plain voice, no em-dashes.
 */

export type RecoveryKind = "reinput" | "scope";

export interface RefuseCopy {
  key: string;
  /** Calm headline. */
  title: string;
  /** One short paragraph. */
  body: string;
  /** The single recovery action label. */
  recoveryLabel: string;
  recovery: RecoveryKind;
}

const SERVICE: RefuseCopy = {
  key: "service",
  title: "This looks like a service, not a physical product.",
  body: "ITC-HS codes classify tangible goods you can ship and clear through customs, so there is no code to assign to a service. If part of your shipment is a physical item, describe that item instead.",
  recoveryLabel: "Describe a physical product",
  recovery: "reinput",
};

const NOT_REAL: RefuseCopy = {
  key: "not_real",
  title: "This does not look like a real, tradable product.",
  body: "We could not match this to a physical commodity that gets exported. If you meant a real product, describe it in a few plain words and we will try again.",
  recoveryLabel: "Describe a real product",
  recovery: "reinput",
};

const RESTRICTED: RefuseCopy = {
  key: "restricted",
  title: "This is not something we can classify here.",
  body: "This appears to be a restricted or controlled item. Classifying and exporting it needs a licensed customs broker and the right permits, so we will not assign a code automatically.",
  recoveryLabel: "See what Prevyl can classify",
  recovery: "scope",
};

const UNCLEAR: RefuseCopy = {
  key: "unclear",
  title: "We could not make out a product to classify.",
  body: "We need a little more to work with. Tell us what the item is made of and what it is used for, in a few plain words, and we will take another look.",
  recoveryLabel: "Add a few details",
  recovery: "reinput",
};

const INDISTINCT: RefuseCopy = {
  key: "indistinct",
  title: "We could not confidently place this one.",
  body: "This product sits between categories and we would rather say so than guess. Add one more detail, like the material, the form, or what it is used for, and try again.",
  recoveryLabel: "Add a detail and retry",
  recovery: "reinput",
};

const FALLBACK = INDISTINCT;

/** Map the backend reason enum (or null) to a user-facing bucket. */
export function getRefuseCopy(reason: RefuseReason | null): RefuseCopy {
  switch (reason) {
    case "services_not_goods":
      return SERVICE;
    case "fictional":
    case "extraterrestrial":
      return NOT_REAL;
    case "contraband":
    case "weapons_restricted_class":
      return RESTRICTED;
    case "incoherent_query":
    case "function_only_no_substance":
      return UNCLEAR;
    case "genuinely_indistinguishable":
    case "backtrack_no_fit":
      return INDISTINCT;
    default:
      return FALLBACK;
  }
}

export const ALL_REFUSE_BUCKETS = [SERVICE, NOT_REAL, RESTRICTED, UNCLEAR, INDISTINCT];
