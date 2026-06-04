/**
 * Stage S3 — plain-trade language layer for the askable surface (BUILD-TIME).
 *
 * Maps each O7 concept-axis (and its value-ids) to PLAIN TRADE LANGUAGE an Indian
 * SME exporter can answer WITHOUT any HS/tariff knowledge:
 *   - `question`: one exporter-facing question per axis (no HS jargon, no codes).
 *   - `valueLabels`: value-id -> exporter-language option label (MECE).
 *   - `answerability`: 'easy' (any exporter knows) | 'moderate' (knows with a spec
 *     sheet) | 'hard' (needs a measurement/grading judgement many sellers lack).
 *
 * Where a curated label is missing, the generator falls back to a title-cased
 * label and a generic question, and marks answerability 'moderate' — so coverage
 * is honest. This file is consumed ONLY by `generate-askable-surface.ts`; it is not
 * a runtime module.
 */

export type Answerability = 'easy' | 'moderate' | 'hard';

export interface AxisLanguage {
  /** Exporter-facing question (plain trade language, no HS jargon, no codes). */
  question: string;
  /** value-id -> exporter-language option label. */
  valueLabels: Record<string, string>;
  /** Whether a non-expert exporter can reliably answer this axis. */
  answerability: Answerability;
}

/**
 * Per-axis plain-trade language. Pattern-band axes (power/capacity/diameter/...)
 * have no fixed value-ids; the generator title-cases their value-ids (e.g.
 * "power-1000kw-to-5000kw" -> "1000kW to 5000kW") and uses the axis question here.
 */
export const AXIS_LANGUAGE: Record<string, AxisLanguage> = {
  thermal: {
    question: 'How is it shipped: fresh/chilled, frozen, or live?',
    valueLabels: {
      fresh_or_chilled: 'Fresh or chilled (not frozen)',
      frozen: 'Frozen',
      live: 'Live',
    },
    answerability: 'easy',
  },
  presentation: {
    question: 'Is it the whole carcass/animal, cuts/pieces, or offal (edible organs)?',
    valueLabels: {
      whole: 'Whole carcass / whole animal',
      cut: 'Cuts or pieces',
      offal: 'Offal (edible organs)',
    },
    answerability: 'easy',
  },
  roasted: {
    question: 'Has it been roasted, or is it still green/raw?',
    valueLabels: {
      roasted: 'Roasted',
      not_roasted: 'Not roasted (green / raw)',
    },
    answerability: 'easy',
  },
  decaffeinated: {
    question: 'Has the caffeine been removed (decaffeinated)?',
    valueLabels: {
      decaffeinated: 'Decaffeinated (caffeine removed)',
      not_decaffeinated: 'Regular (not decaffeinated)',
    },
    answerability: 'easy',
  },
  coffee_form: {
    question: 'What kind of coffee bean is it?',
    valueLabels: {
      plantation: 'Arabica Plantation (washed Arabica)',
      cherry: 'Cherry (dry/natural-processed; Arabica or Robusta)',
      parchment: 'Robusta Parchment (washed Robusta)',
    },
    answerability: 'easy',
  },
  process_method: {
    question: 'How was the coffee processed?',
    valueLabels: {
      dry_processed: 'Dry / natural processed (cherry)',
      wet_processed: 'Wet / washed processed (parchment)',
    },
    answerability: 'easy',
  },
  grade: {
    question: 'What is the sale grade of the coffee?',
    valueLabels: {
      grade_a: 'A Grade',
      grade_b: 'B Grade',
      grade_c: 'C Grade',
      grade_ab: 'AB Grade',
      grade_pb: 'PB (Peaberry) Grade',
      grade_bbb: 'B/B/B Grade',
      bulk: 'Bulk (ungraded)',
    },
    answerability: 'easy',
  },
  textile_finish: {
    question: 'What is the fabric finish?',
    valueLabels: {
      unbleached: 'Unbleached (grey / loom-state)',
      bleached: 'Bleached',
      dyed: 'Dyed (one solid colour)',
      printed: 'Printed',
      yarn_dyed: 'Yarn-dyed (woven from coloured yarns / checks & stripes)',
    },
    answerability: 'easy',
  },
  weave: {
    question: 'What is the weave of the fabric?',
    valueLabels: {
      plain_weave: 'Plain weave',
      twill: 'Twill weave',
      dobby: 'Dobby weave',
      damask: 'Damask / jacquard weave',
      other_weave: 'Other weave',
    },
    answerability: 'moderate',
  },
  fiber_type: {
    question: 'What is the main fibre / material?',
    valueLabels: {
      cotton: 'Cotton',
      silk: 'Silk',
      wool: 'Wool',
      synthetic_fibre: 'Synthetic fibre (e.g. polyester, nylon, acrylic)',
      artificial_fibre: 'Artificial fibre (e.g. viscose / rayon)',
      man_made_fibre: 'Man-made fibre (synthetic or artificial)',
      jute: 'Jute',
      flax: 'Flax / linen',
    },
    answerability: 'easy',
  },
  polymer: {
    question: 'What plastic / polymer is it made of?',
    valueLabels: {
      polyethylene: 'Polyethylene (PE)',
      polypropylene: 'Polypropylene (PP)',
      pvc: 'PVC (polyvinyl chloride)',
      polystyrene: 'Polystyrene (PS)',
      vinyl_acetate: 'Vinyl acetate polymer',
      acrylic: 'Acrylic polymer',
    },
    answerability: 'moderate',
  },
  physical_form: {
    question: 'What physical form is it in?',
    valueLabels: {
      powder: 'Powder',
      liquid: 'Liquid',
      solid: 'Solid',
      paste: 'Paste',
      gas: 'Gas',
      sheet: 'Sheet / film',
      bar: 'Bar / rod',
      tube: 'Tube / pipe',
    },
    answerability: 'easy',
  },
  metal_working: {
    question: 'How was the metal worked / formed?',
    valueLabels: {
      hot_rolled: 'Hot-rolled',
      cold_rolled: 'Cold-rolled',
      cast: 'Cast',
      forged: 'Forged',
      wrought: 'Wrought',
      unwrought: 'Unwrought (raw / primary form)',
    },
    answerability: 'moderate',
  },
  metal_coating: {
    question: 'Is the surface coated?',
    valueLabels: {
      galvanized: 'Galvanized (zinc-coated)',
      coated: 'Coated (painted / plated / other coating)',
      uncoated: 'Uncoated (bare)',
    },
    answerability: 'easy',
  },
  pipe_construction: {
    question: 'Is the pipe/tube seamless or welded?',
    valueLabels: {
      seamless: 'Seamless',
      welded: 'Welded',
    },
    answerability: 'easy',
  },
  machine_part: {
    question: 'Is it the complete machine, a part, or an accessory?',
    valueLabels: {
      complete: 'Complete machine / equipment',
      part: 'Part / component',
      accessory: 'Accessory',
    },
    answerability: 'easy',
  },
  electric_machine: {
    question: 'Is it a motor or a generator?',
    valueLabels: {
      motor: 'Motor',
      generator: 'Generator',
    },
    answerability: 'easy',
  },
  vehicle_type: {
    question: 'What type of vehicle is it?',
    valueLabels: {
      bus: 'Bus',
      van: 'Van',
      car: 'Car',
      special_purpose: 'Special-purpose vehicle',
    },
    answerability: 'easy',
  },
  worked_state: {
    question: 'Is it worked / processed, or unworked / raw?',
    valueLabels: {
      worked: 'Worked / processed',
      unworked: 'Unworked / raw',
      sorted: 'Sorted / graded',
      unsorted: 'Unsorted',
    },
    answerability: 'moderate',
  },
  origin_nature: {
    question: 'Is it natural, synthetic, or reconstructed?',
    valueLabels: {
      natural: 'Natural',
      synthetic: 'Synthetic / artificial',
      reconstructed: 'Reconstructed',
    },
    answerability: 'easy',
  },
  // --- INCIDENTAL axes (questions provided for completeness; flagged on answerability) ---
  coil_state: {
    question: 'Is it supplied in coils or not in coils?',
    valueLabels: {
      in_coils: 'In coils',
      not_in_coils: 'Not in coils (flat / cut lengths)',
    },
    answerability: 'moderate',
  },
  cellularity: {
    question: 'Is it cellular (foam) or non-cellular, rigid or flexible?',
    valueLabels: {
      cellular: 'Cellular (foam / sponge)',
      non_cellular: 'Non-cellular (solid)',
      rigid: 'Rigid',
      flexible: 'Flexible',
    },
    answerability: 'moderate',
  },
  chem_structure: {
    question: 'What is the chemical structure?',
    valueLabels: {
      aromatic: 'Aromatic',
      unsaturated: 'Unsaturated',
      saturated: 'Saturated',
      halogenated: 'Halogenated',
    },
    answerability: 'hard',
  },
  fabric_weight: {
    question: 'What is the fabric weight (grams per square metre)?',
    valueLabels: {
      not_more_than_100gsm: 'Up to 100 g/m2',
      weight_100_to_200gsm: '100 to 200 g/m2',
      not_more_than_200gsm: 'Up to 200 g/m2',
      over_200gsm: 'Over 200 g/m2',
    },
    answerability: 'hard',
  },
  weaving_method: {
    question: 'Was it made on a handloom or a power-loom / mill?',
    valueLabels: {
      handloom: 'Handloom',
      mill: 'Power-loom / mill',
    },
    answerability: 'easy',
  },
  embellishment: {
    question: 'Is it embroidered or otherwise embellished?',
    valueLabels: {
      embroidered: 'Embroidered',
      zari_border: 'Zari border',
      chikan: 'Chikan work',
    },
    answerability: 'easy',
  },
  retail_packing: {
    question: 'Is it packed for retail sale or in bulk?',
    valueLabels: {
      for_retail_sale: 'Packed for retail sale',
      not_for_retail_sale: 'Not for retail sale',
      bulk_packing: 'Bulk packing',
    },
    answerability: 'easy',
  },
  gem_quality: {
    question: 'Is it industrial quality or jewellery / gem quality?',
    valueLabels: {
      industrial: 'Industrial quality',
      non_industrial: 'Jewellery / gem quality (non-industrial)',
    },
    answerability: 'hard',
  },
  air_conditioning: {
    question: 'Is it fitted with air-conditioning?',
    valueLabels: {
      air_conditioned: 'Air-conditioned',
      non_air_conditioned: 'Not air-conditioned',
    },
    answerability: 'easy',
  },
  body_construction: {
    question: 'What is the body construction?',
    valueLabels: {
      monocoque: 'Monocoque (integral / unibody)',
      body_on_chassis: 'Body on chassis',
    },
    answerability: 'hard',
  },
  seat_capacity: {
    question: 'How many persons does it seat (including the driver)?',
    valueLabels: {},
    answerability: 'moderate',
  },
  power_rating: {
    question: 'What is the power / output rating (kW)?',
    valueLabels: {},
    answerability: 'hard',
  },
  capacity_rating: {
    question: 'What is the capacity rating (kVA)?',
    valueLabels: {},
    answerability: 'hard',
  },
  diameter_band: {
    question: 'What is the outer diameter?',
    valueLabels: {},
    answerability: 'hard',
  },
  container_size: {
    question: 'What is the container size?',
    valueLabels: {},
    answerability: 'moderate',
  },
  end_use: {
    question: 'What is the intended end use?',
    valueLabels: {
      apparel: 'Apparel / clothing',
      household: 'Household / home use',
      industrial: 'Industrial use',
      packaging: 'Packaging',
      pharmaceutical: 'Pharmaceutical use',
      agricultural: 'Agricultural use',
      automotive: 'Automotive use',
    },
    answerability: 'moderate',
  },
};
