/**
 * Deterministic mock of the Prevyl classifier, shaped EXACTLY like the frozen
 * backend DTO. Lets the entire UI run end-to-end with zero paid API calls.
 * Switch to the real backend by setting BACKEND_API_URL (see route handlers).
 */
import type {
  AnswerRequest,
  RefuseReason,
  WireClassification,
  WireQuestion,
  WireRefused,
  WireResponse,
} from "./types";

export type MockOutcome =
  | { kind: "ok"; body: WireResponse }
  | { kind: "error"; status: number; body: { error: string; retryable: boolean } };

function classification(
  partial: Omit<WireClassification, "responseType" | "processingTimeMs"> &
    Partial<Pick<WireClassification, "processingTimeMs">>,
): WireClassification {
  return {
    responseType: "classification",
    processingTimeMs: 37000 + Math.floor(Math.random() * 9000),
    ...partial,
  };
}

const norm = (s: string) => s.toLowerCase();
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

const MATERIAL_WORDS = [
  "leather",
  "plastic",
  "pvc",
  "textile",
  "cotton",
  "jute",
  "canvas",
  "paper",
  "nylon",
  "polyester",
];

/** Curated realistic results so the demo feels true to the corpus. */
function lookup(q: string): WireResponse | null {
  // Refusals -------------------------------------------------------------
  if (has(q, "consult", "service", "consulting", "freelance", "subscription", "saas")) {
    return refuse(
      "This looks like a service, not a physical product.",
      "services_not_goods",
    );
  }
  if (has(q, "dragon", "unicorn", "magic", "phoenix", "wizard")) {
    return refuse("This describes a fictional item, so there is no real commodity to classify.", "fictional");
  }
  if (q.replace(/[^a-z]/g, "").length < 3) {
    return refuse(
      "We could not read a product in this description. Try a few plain words about what you are exporting.",
      "incoherent_query",
    );
  }

  // Clarifying question (material unknown) -------------------------------
  if (has(q, "bag", "handbag", "purse", "pouch") && !has(q, ...MATERIAL_WORDS)) {
    return question();
  }

  // 6-digit narrowing ----------------------------------------------------
  if (has(q, "saree fabric", "printed cotton", "cotton cloth", "printed fabric", "shirting fabric")) {
    return classification({
      hsCode: "5208.52",
      description: "Printed woven fabrics of cotton, plain weave, weighing not more than 100 g/m2",
      confidence: 60,
      confidenceBand: "medium",
      reasoning:
        "This is a printed woven cotton fabric, which sits in heading 5208 (woven cotton, not more than 200 g/m2).\nIt is printed and plain weave, pointing to subheading 5208.52.\nThe exact 8-digit line depends on the specific fabric type, which the description does not state, so we return the 6-digit subheading with the candidate lines below.",
      alternatives: [
        { code: "5208.52.10", description: "Dhoti and saree" },
        { code: "5208.52.20", description: "Shirting fabrics" },
        { code: "5208.52.90", description: "Other" },
      ],
      isSixDigit: true,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "MEDIUM",
      citation: {
        primary: {
          type: "leaf_description",
          source_ref: "subheadings.5208.52",
          verbatim_text: "Printed: Plain weave, weighing not more than 100 g/m2",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-6",
      },
      components: null,
    });
  }

  // Confident 8-digit examples ------------------------------------------
  if (has(q, "coffee") && has(q, "roast")) {
    return classification({
      hsCode: "0901.21.00",
      description: "Coffee, roasted, not decaffeinated",
      confidence: 90,
      confidenceBand: "high",
      reasoning:
        "Roasted coffee is classified in Chapter 09 (coffee, tea, spices), heading 0901.\nSubheading 0901.21 covers roasted coffee that is not decaffeinated.\nNo decaffeination is indicated, so the residual not-decaffeinated leaf 0901.21.00 applies under GIR-1 and GIR-6.",
      alternatives: [
        { code: "0901.22.00", description: "Coffee, roasted, decaffeinated" },
        { code: "0901.11.00", description: "Coffee, not roasted, not decaffeinated" },
      ],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "HIGH",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.0901",
          verbatim_text:
            "Coffee, whether or not roasted or decaffeinated; coffee husks and skins; coffee substitutes containing coffee in any proportion.",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    });
  }

  if (has(q, "power bank", "powerbank", "lithium", "li-ion") && has(q, "power bank", "powerbank", "bank", "battery", "lithium")) {
    return classification({
      hsCode: "8507.60.00",
      description: "Lithium-ion accumulators",
      confidence: 90,
      confidenceBand: "high",
      reasoning:
        "A power bank is a portable lithium-ion accumulator, classified in heading 8507 (electric accumulators).\nSubheading 8507.60 covers lithium-ion accumulators specifically.\nThe single 8-digit line 8507.60.00 applies under GIR-1.",
      alternatives: [
        { code: "8507.50.00", description: "Nickel-metal hydride accumulators" },
        { code: "8504.40.90", description: "Static converters, other" },
      ],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: "Subject to applicable BIS / lithium-battery transport requirements.",
      indiaSpecific: false,
      selfConfidence: "HIGH",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.8507",
          verbatim_text: "Electric accumulators, including separators therefor, whether or not rectangular (including square).",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    });
  }

  if (has(q, "leather", "handbag") && has(q, "leather")) {
    return classification({
      hsCode: "4202.21.00",
      description: "Handbags with outer surface of leather or composition leather",
      confidence: 90,
      confidenceBand: "high",
      reasoning:
        "A handbag with an outer surface of leather is classified in heading 4202 (trunks, handbags and similar containers).\nSubheading 4202.21 covers handbags with an outer surface of leather or composition leather.\nThe leaf 4202.21.00 applies under GIR-1.",
      alternatives: [
        { code: "4202.22.00", description: "Handbags with outer surface of plastic sheeting or textile" },
        { code: "4202.29.00", description: "Handbags, other" },
      ],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "HIGH",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.4202",
          verbatim_text:
            "Trunks, suit-cases, vanity-cases ... handbags ... with outer surface of leather, of composition leather ...",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: [
        { name: "body", material: "leather", role: "primary" },
        { name: "clasp", material: "base metal", role: "auxiliary" },
      ],
    });
  }

  return null;
}

function refuse(message: string, reason: RefuseReason): WireRefused {
  return { responseType: "refused", message, reason, processingTimeMs: 2200 };
}

function question(): WireQuestion {
  return {
    responseType: "question",
    question: "What is the primary material of the bag?",
    options: [
      { id: "leather", label: "Leather (natural or composition)" },
      { id: "plastic_sheeting", label: "Plastic sheeting / PVC" },
      { id: "textile", label: "Textile (cotton, jute, woven fabric)" },
      { id: "paper", label: "Paper or paperboard" },
    ],
    questionId: "q_material_4231",
    discriminatingAttribute: "material",
    processingTimeMs: 9100,
  };
}

/** Default confident result (the hero case). */
function defaultBolt(): WireClassification {
  return classification({
    hsCode: "7318.15.00",
    description: "Other screws and bolts, whether or not with their nuts or washers",
    confidence: 90,
    confidenceBand: "high",
    reasoning:
      "The product is a threaded fastener of steel, so it sits in Chapter 73 (articles of iron or steel).\nHeading 7318 covers screws, bolts, nuts and similar articles; hex bolts are bolts.\nNo special variant (self-tapping, studs) is flagged, so the residual 'Other' leaf 7318.15.00 applies under GIR-1 and GIR-6.",
    alternatives: [
      { code: "7318.16.00", description: "Nuts" },
      { code: "7318.15.90", description: "Other" },
      { code: "7318.19.00", description: "Other threaded articles" },
    ],
    isSixDigit: false,
    exportPolicy: "Free",
    policyCondition: null,
    indiaSpecific: false,
    selfConfidence: "HIGH",
    citation: {
      primary: {
        type: "note",
        source_ref: "headings.7318",
        verbatim_text:
          "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter-pins, washers (including spring washers) and similar articles, of iron or steel.",
        note_or_exclusion_id: null,
      },
      gir_applied: "GIR-1",
    },
    components: null,
  });
}

export function mockClassify(rawQuery: string): MockOutcome {
  const q = norm(rawQuery).trim();

  if (has(q, "__daily_limit__")) {
    return { kind: "error", status: 503, body: { error: "Daily limit reached", retryable: false } };
  }
  if (has(q, "__error__", "__timeout__")) {
    return { kind: "error", status: 503, body: { error: "Classification temporarily unavailable", retryable: true } };
  }

  const hit = lookup(q) ?? defaultBolt();
  return { kind: "ok", body: hit };
}

/** Mock multi-turn continuation: resolve a material answer to a leaf. */
export function mockAnswer(req: AnswerRequest): MockOutcome {
  const byMaterial: Record<string, WireClassification> = {
    leather: classification({
      hsCode: "4202.21.00",
      description: "Handbags with outer surface of leather or composition leather",
      confidence: 90,
      confidenceBand: "high",
      reasoning:
        "You confirmed the outer surface is leather.\nHeading 4202 covers handbags; subheading 4202.21 is handbags with an outer surface of leather or composition leather.\nThe leaf 4202.21.00 applies under GIR-1.",
      alternatives: [
        { code: "4202.29.00", description: "Handbags, other" },
        { code: "4202.31.00", description: "Articles of a kind carried in the pocket or handbag, of leather" },
      ],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "HIGH",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.4202",
          verbatim_text:
            "Trunks, suit-cases ... handbags ... with outer surface of leather, of composition leather ...",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    }),
    plastic_sheeting: classification({
      hsCode: "4202.22.00",
      description: "Handbags with outer surface of sheeting of plastics or of textile materials",
      confidence: 80,
      confidenceBand: "high",
      reasoning:
        "You confirmed the outer surface is plastic sheeting.\nSubheading 4202.22 covers handbags with an outer surface of plastic sheeting or textile materials.\nThe leaf 4202.22.00 applies under GIR-1.",
      alternatives: [{ code: "4202.29.00", description: "Handbags, other" }],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "HIGH",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.4202",
          verbatim_text: "... handbags ... with outer surface of sheeting of plastics or of textile materials ...",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    }),
    textile: classification({
      hsCode: "4202.22.00",
      description: "Handbags with outer surface of sheeting of plastics or of textile materials",
      confidence: 70,
      confidenceBand: "medium",
      reasoning:
        "You confirmed the outer surface is textile.\nSubheading 4202.22 covers handbags with an outer surface of textile materials.\nThe leaf 4202.22.00 applies; verify the exact textile makeup before filing.",
      alternatives: [{ code: "4202.92.00", description: "Other, with outer surface of textile materials" }],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "MEDIUM",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.4202",
          verbatim_text: "... handbags ... with outer surface of sheeting of plastics or of textile materials ...",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    }),
    paper: classification({
      hsCode: "4819.40.00",
      description: "Other sacks and bags, including cones, of paper",
      confidence: 70,
      confidenceBand: "medium",
      reasoning:
        "You confirmed the bag is paper.\nPaper bags are classified in heading 4819 (cartons, boxes, bags of paper).\nSubheading 4819.40 covers other sacks and bags of paper.",
      alternatives: [{ code: "4819.30.00", description: "Sacks and bags, having a base of a width of 40 cm or more" }],
      isSixDigit: false,
      exportPolicy: "Free",
      policyCondition: null,
      indiaSpecific: false,
      selfConfidence: "MEDIUM",
      citation: {
        primary: {
          type: "note",
          source_ref: "headings.4819",
          verbatim_text: "Cartons, boxes, cases, bags and other packing containers, of paper, paperboard ...",
          note_or_exclusion_id: null,
        },
        gir_applied: "GIR-1",
      },
      components: null,
    }),
  };

  const result = byMaterial[req.answerId] ?? defaultBolt();
  return { kind: "ok", body: result };
}
