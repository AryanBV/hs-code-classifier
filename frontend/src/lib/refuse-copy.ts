import type { RefuseReason } from "./types";

/**
 * D4. The ~5-bucket refuse taxonomy. We NEVER render the model's free text.
 * Every refusal maps to one of these pre-written, calm, literal buckets with
 * exactly one recovery action that moves the person forward.
 *
 * Voice: warm and plain, never an error, never a scold, no costume. No em-dashes.
 * Honesty: nothing was filed on a refusal, so these never say "verify before filing".
 *
 * UNCLEAR is an input problem (we could not read a product from the words).
 * INDISTINCT is a model-side problem (we read it, but it sits between categories
 * and we would rather say so than guess). Keep that distinction in the copy.
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
  title: "That sounds like a service, not a physical product.",
  body: "ITC-HS codes classify tangible goods you ship and clear through customs, so there is no code to assign to a service. If a physical item is part of what you send, describe that item and we will classify it.",
  recoveryLabel: "Describe a physical product",
  recovery: "reinput",
};

const NOT_REAL: RefuseCopy = {
  key: "not_real",
  title: "We could not tie this to a real, tradable product.",
  body: "Nothing here matched a physical commodity that gets exported. If you had a real product in mind, name it in a few plain words and we will take another look.",
  recoveryLabel: "Describe a real product",
  recovery: "reinput",
};

const RESTRICTED: RefuseCopy = {
  key: "restricted",
  title: "This is a controlled item, so we will not put a code on it here.",
  body: "Items like this need a licensed customs broker and the right permits before they can be classified or exported. We would rather point you to the proper channel than hand you a code that should not be self-assigned.",
  recoveryLabel: "See what Prevyl can classify",
  recovery: "scope",
};

const UNCLEAR: RefuseCopy = {
  key: "unclear",
  title: "We could not make out a product in that description.",
  body: "There was not quite enough to work from. Tell us what the item is and what it is made of, in a few plain words, and we will try again.",
  recoveryLabel: "Add a few details",
  recovery: "reinput",
};

const INDISTINCT: RefuseCopy = {
  key: "indistinct",
  title: "This one sits between categories, and we would rather say so than guess.",
  body: "We read your product, but it falls close to a line between codes, and guessing would not be honest. Add one more detail, such as the material, the form, or what it is used for, and we will look again.",
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
