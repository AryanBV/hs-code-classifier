// backend/src/eval/gold/real-world-staging.ts
//
// ============================================================================
// STAGED — NOT in the frozen 385/343 master suite. Gold codes PENDING FOUNDER
// APPROVAL before any merge (gold/eval-data changes are user-gated).
//
// DO NOT import this file into the frozen master suite
// (`backend/src/eval/test-suites/master-suite.ts`) or into any gate denominator.
// It is a SEPARATE, staged corpus of REAL-WORLD MESSY-INPUT cases authored to
// exercise the classifier's robustness to the way Indian SME exporters actually
// type: misspellings, terse/vague queries, regional/Hinglish trade terms, brand
// and trade names, run-on verbose paragraphs with destination/origin noise, and
// industry abbreviations. Nothing in the runtime path reads it. When the founder
// approves these gold codes they will be MERGED into the master suite in a
// deliberate, reviewed change (with their own GOLD-REMEDIATION-LOG entry).
// ============================================================================
//
// MAPPING (from the authored source set):
//   messy_query  -> query
//   gold_code    -> expected_code  (every code is `gold_verified: true`)
//   expected_chapter = gold_code[0:2]
//   expected_heading = gold_code[0:4]   (dots stripped)
//   expected_routing = the author's HS call ('classify' | 'ask')
//   category     -> a `category` tag (food_agri/textile/metal/chemical/
//                   electronics/automotive/other) PLUS a `source` slug that
//                   preserves the messy-input family (typos / vague /
//                   regional_hinglish / brand_trade / runon_verbose / abbrev).
//   note         -> notes
//   clean_equivalent / intended_product -> folded into notes for the reviewer.
//
// ASSEMBLY RULES APPLIED:
//   (1) Dropped any case with gold_verified=false or a malformed 8-digit code —
//       NONE were dropped (all 60 authored cases passed both checks; every code
//       matches ^\d{4}\.\d{2}\.\d{2}$).
//   (2) Deduped on (query, expected_code) — NO exact duplicates existed. Several
//       products recur ACROSS messy-input families (e.g. turmeric powder appears
//       as a typo "termaric" and as Hinglish "haldi"; ss bolt appears as a typo
//       and as the terse "ss bolt") with DISTINCT queries — these are kept on
//       purpose: testing the SAME leaf through different messy-input styles is
//       the whole point of this staged corpus.
//   (3) Chapter diversity: 29 distinct HS chapters span animal/veg/mineral/
//       chemical/plastic/textile/stone/base-metal/machinery/electronics/vehicle
//       sections (see the coverage summary in the GOLD-REMEDIATION note below).
//
// Each `expected_axis` / `option_answerability` is set ONLY on `ask` cases (the
// silent forced-choice axis the author judged genuinely needs ONE question with
// no safe residual default). `classify` cases carry neither (nothing to ask).

import type { EvalTestCase } from '../types';

/**
 * Family 1 — TYPOS. Real misspellings exporters type (single-letter drops,
 * transposed vowels, phonetic regional spellings). The product is otherwise
 * fully specified, so almost all should classify directly despite the typo; the
 * one `ask` (aluminium sheet) is a genuine alloy-vs-not split with no residual.
 */
export const realWorldStagingTypos: EvalTestCase[] = [
  {
    id: 'RW-TYPO-01',
    query: 'stainles steel hex bolt M10',
    source: 'real-world-staging:typos',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7318',
    expected_code: '7318.15.00',
    difficulty: 'easy',
    notes:
      "clean='stainless steel hex bolt M10'; product=stainless steel hexagon-head bolt M10. 'stainles' single-letter drop. Bolt + size + material fully specified; 7318.15.00 is the catch-all for other screws and bolts. Answer directly.",
  },
  {
    id: 'RW-TYPO-02',
    query: 'basmathi rice 1121 export quality',
    source: 'real-world-staging:typos',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '10',
    expected_heading: '1006',
    expected_code: '1006.30.20',
    difficulty: 'easy',
    notes:
      "clean='basmati rice 1121 export quality'; product=semi/wholly-milled Basmati rice (1121) for export. 'basmathi' = standard South-Indian phonetic misspelling. 1006.30.20 is the dedicated Basmati line, so even with the typo the leaf is unambiguous.",
  },
  {
    id: 'RW-TYPO-03',
    query: 'cotton tshrit mens round neck',
    source: 'real-world-staging:typos',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '61',
    expected_heading: '6109',
    expected_code: '6109.10.00',
    difficulty: 'easy',
    notes:
      "clean='cotton t-shirt mens round neck'; product=men's knitted cotton T-shirt, round neck. 'tshrit'=transposed t-shirt typo. T-shirts are heading 6109 (knitted); 'of cotton' fully resolves to 6109.10.00. Round-neck knit tee is the default reading.",
  },
  {
    id: 'RW-TYPO-04',
    query: 'aluminuim sheet 1mm thicknes',
    source: 'real-world-staging:typos',
    category: 'metal',
    expected_routing: 'ask',
    expected_chapter: '76',
    expected_heading: '7606',
    expected_code: '7606.92.90',
    expected_axis: 'composition', // alloyed vs not-alloyed
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'aluminium sheet alloy status: not-alloyed (7606.91) vs alloyed (7606.92) with NO residual default; query states neither',
    notes:
      "clean='aluminium sheet 1mm thickness'; product=aluminium rectangular sheet 1mm thick (alloy status unstated). 'aluminuim' is the most common spelling error. 7606 splits 6-digit on NOT-alloyed (7606.91) vs alloyed (7606.92) with no residual; a plain 'aluminium sheet' states neither. ONE question (alloy or not) is genuinely needed; gold reflects the common commercial alloy-grade case.",
  },
  {
    id: 'RW-TYPO-05',
    query: 'termaric powder polished single',
    source: 'real-world-staging:typos',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.30.30',
    difficulty: 'easy',
    notes:
      "clean='turmeric powder polished single'; product=turmeric in powder form (ground haldi). 'termaric' is a frequent turmeric misspelling. 0910.30 splits fresh/dried/powder/other; the query says 'powder', so it resolves to 0910.30.30 with no residual ambiguity.",
  },
  {
    id: 'RW-TYPO-06',
    query: 'geniune leather ladies hand bag',
    source: 'real-world-staging:typos',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '42',
    expected_heading: '4202',
    expected_code: '4202.21.10',
    difficulty: 'easy',
    notes:
      "clean='genuine leather ladies hand bag'; product=ladies handbag with outer surface of genuine leather. 'geniune'=transposed-vowel typo. Leather + ladies handbag resolves cleanly: 4202.21 is leather-surface handbags, .10 is 'Hand-bags for ladies'.",
  },
  {
    id: 'RW-TYPO-07',
    query: 'polished marbel floor tile white',
    source: 'real-world-staging:typos',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '68',
    expected_heading: '6802',
    expected_code: '6802.21.10',
    difficulty: 'medium',
    notes:
      "clean='polished marble floor tile white'; product=marble tile, simply cut/sawn flat surface, for flooring. 'marbel' is a very common marble misspelling. Marble tile (worked, flat/even surface) maps to 6802.21.10 'Marble blocks or tiles'. Material + product form are specified.",
  },
  {
    id: 'RW-TYPO-08',
    query: 'hdpe plastic carry bag poly',
    source: 'real-world-staging:typos',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3923',
    expected_code: '3923.21.00',
    difficulty: 'easy',
    notes:
      "clean='HDPE plastic carry bag (polyethylene)'; product=polyethylene (HDPE) carry bag/sack. Real exporters type 'poly'/'hdpe' loosely. Sacks and bags of polymers of ethylene = 3923.21.00. HDPE is polyethylene, so the polymer is specified; resolves directly.",
  },
  {
    id: 'RW-TYPO-09',
    query: 'mango pulp aspetic kesar',
    source: 'real-world-staging:typos',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '20',
    expected_heading: '2007',
    expected_code: '2007.99.10',
    difficulty: 'medium',
    notes:
      "clean='mango pulp aseptic kesar'; product=Kesar mango pulp/puree (cooked, aseptically packed). 'aspetic'=transposed letters for aseptic. Mango pulp (homogenised/cooked puree) sits in heading 2007; 2007.99.10 is the dedicated 'Mango' line. Variety (kesar) and pack don't change the 8-digit code.",
  },
  {
    id: 'RW-TYPO-10',
    query: 'brass gate valve 1 inch threded',
    source: 'real-world-staging:typos',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '84',
    expected_heading: '8481',
    expected_code: '8481.80.20',
    difficulty: 'medium',
    notes:
      "clean='brass gate valve 1 inch threaded'; product=brass (non-ferrous) hand-operated gate valve, 1 inch. 'threded' drops an 'a'. Brass = non-ferrous metal, so 8481.80.20 'Taps, cocks and similar appliances of non-ferrous metal' is the precise leaf. Material qualifier resolves the split.",
  },
];

/**
 * Family 2 — VAGUE / TERSE. Under-specified queries. The honest split: terse-
 * complete or unmarked-default-wins cases classify; genuinely contentless ones
 * (with no safe residual across the common exporter meanings) ask ONE question.
 */
export const realWorldStagingVague: EvalTestCase[] = [
  {
    id: 'RW-VAGUE-01',
    query: 'steel pipe',
    source: 'real-world-staging:vague',
    category: 'metal',
    expected_routing: 'ask',
    expected_chapter: '73',
    expected_heading: '7306',
    expected_code: '7306.30.90',
    expected_axis: 'processing_state', // seamless vs welded (+ cross-section)
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'seamless (7304) vs welded (7306), then cross-section/material (stainless 7306.40 vs other 7306.30); no safe residual',
    notes:
      "clean='steel pipe'; product=welded carbon/iron steel tube of circular cross-section (the usual default). Chapter 73 is clear but the heading splits hard on seamless (7304) vs welded (7306) then cross-section/material. No single residual is safe; ask ONE question (seamless vs welded, circular vs square). If forced, welded circular iron/steel 'Other' = 7306.30.90, but that is not safe enough to classify outright.",
  },
  {
    id: 'RW-VAGUE-02',
    query: 'plastic item',
    source: 'real-world-staging:vague',
    category: 'chemical',
    expected_routing: 'ask',
    expected_chapter: '39',
    expected_heading: '3926',
    expected_code: '3926.90.99',
    expected_axis: 'function', // what the article actually is
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      "could be a bag (3923), tableware (3924), builders' ware (3925) or a residual 'other article of plastic' (3926.90.99); must establish what the item IS",
    notes:
      "clean='plastic article'; product=an unspecified finished article of plastic. Almost contentless. The residual 3926.90.99 exists but routing to it blindly would be wrong for the majority of real plastic exports (most are bags/packaging/tableware). Ask what the item IS before classifying. 3926.90.99 is the honest residual landing only if it is a true n.e.s. article.",
  },
  {
    id: 'RW-VAGUE-03',
    query: 'cotton fabric',
    source: 'real-world-staging:vague',
    category: 'textile',
    expected_routing: 'ask',
    expected_chapter: '52',
    expected_heading: '5208',
    expected_code: '5208.21.90',
    expected_axis: 'processing_state', // cotton%, weave, bleach state, weight, end-use
    option_answerability: 'hard',
    difficulty: 'hard',
    expected_ambiguity:
      'needs cotton% (5208/5209/5210/5211), weave, bleach state, weight band and Indian end-use leaf; NO safe residual default',
    notes:
      "clean='woven cotton fabric'; product=woven fabric of cotton (weave/bleach/weight/end-use unspecified). Chapter 52 is obvious but the 6/8-digit split needs cotton%, weave, bleach state, weight band, and Indian end-use leaves. 5208.21.90 ('Other', bleached plain <200g/m2) is only one of dozens of equally-likely leaves. Ask at least one clarifying question.",
  },
  {
    id: 'RW-VAGUE-04',
    query: 'machine part',
    source: 'real-world-staging:vague',
    category: 'other',
    expected_routing: 'ask',
    expected_chapter: '84',
    expected_heading: '8487',
    expected_code: '8487.90.00',
    expected_axis: 'function', // part of WHAT machine (Section XVI Note 2)
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'parts are classified by the machine they belong to (Sec XVI Note 2); without the machine (pump/engine/textile/vehicle) no heading can be picked',
    notes:
      "clean='machine part'; product=a part of a machine, no machine or function specified. 8487.90.00 is the genuine residual ('machinery parts not containing electrical connectors... n.e.s.') but it only applies to a narrow class; defaulting to it for any 'machine part' is wrong. Ask: part of WHAT machine.",
  },
  {
    id: 'RW-VAGUE-05',
    query: 'ss bolt',
    source: 'real-world-staging:vague',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7318',
    expected_code: '7318.15.00',
    difficulty: 'easy',
    notes:
      "clean='stainless steel bolt'; product=stainless steel threaded bolt/screw. Vague on dimensions/head type, but a bare 'ss bolt' maps cleanly: Ch.73, heading 7318, subheading 7318.15 ('Other screws and bolts') -> single residual leaf 7318.15.00. Stainless vs carbon does not change this leaf. Classify.",
  },
  {
    id: 'RW-VAGUE-06',
    query: 'plastic bag',
    source: 'real-world-staging:vague',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3923',
    expected_code: '3923.21.00',
    difficulty: 'medium',
    notes:
      "clean='plastic carry bag'; product=sack/bag of polymers of ethylene (LDPE/HDPE poly bag). Slightly vague on polymer, but the overwhelming real-world default for a bare 'plastic bag' from an Indian exporter is a polyethylene poly bag -> 3923.21.00. Unmarked-default-wins: absent a flag for polypropylene/other, the ethylene leaf is the common correct one. Classify with the PE default; only ask if a different polymer is signalled.",
  },
  {
    id: 'RW-VAGUE-07',
    query: 'old clothes for export',
    source: 'real-world-staging:vague',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '63',
    expected_heading: '6309',
    expected_code: '6309.00.00',
    difficulty: 'medium',
    notes:
      "clean='worn clothing for export'; product=worn/used clothing and worn textile articles exported in bulk. Reads vague but is a precise corpus concept: worn clothing in bulk is heading 6309, single-leaf 6309.00.00. 'worn/old/used' + 'export in bulk' discriminates from new garments (Ch.61/62). Classify. (Export of worn clothing is policy-restricted in India — surface that, but the code is unambiguous.)",
  },
  {
    id: 'RW-VAGUE-08',
    query: 'steel furniture',
    source: 'real-world-staging:vague',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '94',
    expected_heading: '9403',
    expected_code: '9403.20.10',
    difficulty: 'medium',
    notes:
      "clean='steel office/household furniture'; product=metal (steel) furniture e.g. office cupboards/racks/chairs. Vague on exact furniture type, but material + 'furniture' is enough: Ch.94, heading 9403, subheading 9403.20 (other metal furniture), Indian leaf 9403.20.10 ('Of Steel'). The 'Of Steel' leaf collects steel furniture regardless of type. Not a parts query (that would be 9403.99). Classify.",
  },
  {
    id: 'RW-VAGUE-09',
    query: 'marble',
    source: 'real-world-staging:vague',
    category: 'other',
    expected_routing: 'ask',
    expected_chapter: '68',
    expected_heading: '6802',
    expected_code: '6802.21.10',
    expected_axis: 'processing_state', // raw (Ch.25) vs worked (Ch.68)
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'raw crude/roughly-trimmed marble (Ch.25 heading 2515) vs worked monumental/building marble blocks/tiles/slabs (Ch.68 heading 6802); no safe default',
    notes:
      "clean='marble blocks or tiles'; product=worked monumental/building marble. Bare 'marble' is a classic raw-vs-worked Ch.25/68 fork with no safe default; ask processing state. If worked, 6802.21.10 ('Marble blocks or tiles') is the landing leaf, but must not be chosen without confirming the stone is worked.",
  },
  {
    id: 'RW-VAGUE-10',
    query: 'electric cable',
    source: 'real-world-staging:vague',
    category: 'electronics',
    expected_routing: 'ask',
    expected_chapter: '85',
    expected_heading: '8544',
    expected_code: '8544.49.99',
    expected_axis: 'material', // voltage + fitted-with-connectors + insulation
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      '6-digit split turns on voltage + connectors: <=1000V w/connectors (8544.42) vs <=1000V w/o (8544.49) vs >1000V (8544.60), then insulation; no safe residual',
    notes:
      "clean='insulated electric cable'; product=insulated electric conductor/cable (voltage/connector/insulation unspecified). Heading 8544 is clear but the split turns entirely on voltage and connectors. 8544.49.99 ('other, Other', <=1000V, no connectors) is just one of many equally-likely leaves. Ask voltage/fitted-with-connectors before classifying.",
  },
];

/**
 * Family 3 — REGIONAL / HINGLISH TRADE TERMS. Indian-language product names and
 * trade jargon (haldi, elaichi, saunf, chawal, chana, jhinga, methi, supari,
 * kaju). Most pin an India-specific leaf; two are genuine asks with no residual.
 */
export const realWorldStagingRegionalHinglish: EvalTestCase[] = [
  {
    id: 'RW-HING-01',
    query: 'haldi powder export quality 25kg bags',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.30.30',
    difficulty: 'easy',
    notes:
      "clean='turmeric powder, export quality, 25 kg bags'; product=turmeric in powder form. haldi=turmeric. Query explicitly says 'powder' so the leaf is unambiguous: 0910.30.30 (Powder). 0910.30: Fresh .10 / Dried .20 / Powder .30. No clarifying question needed.",
  },
  {
    id: 'RW-HING-02',
    query: 'elaichi green chhoti for export, alleppey',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0908',
    expected_code: '0908.31.20',
    difficulty: 'medium',
    notes:
      "clean='small green cardamom (Alleppey), for export'; product=small green cardamom (Elettaria), Alleppey green, whole. elaichi=cardamom; 'chhoti/green'+'alleppey' pins the India-specific leaf 0908.31.20 (Small (ellettaria), alleppey green). 'Neither crushed nor ground' subheading 0908.31 since no powder mentioned. Directly classifiable.",
  },
  {
    id: 'RW-HING-03',
    query: 'saunf seeds 1 ton, food grade not for sowing',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0909',
    expected_code: '0909.61.39',
    difficulty: 'medium',
    notes:
      "clean='fennel seeds, 1 tonne, food grade, not seed-quality'; product=fennel seeds (saunf), whole, non-seed (food) quality. saunf=fennel. Whole, neither crushed nor ground -> 0909.61. 'not for sowing/food grade' rules out seed-quality (.31), giving 0909.61.39 (Other). The food-grade flag removes the only ambiguity, so classify.",
  },
  {
    id: 'RW-HING-04',
    query: 'basmati chawal 1121 sella for middle east',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '10',
    expected_heading: '1006',
    expected_code: '1006.30.12',
    difficulty: 'medium',
    notes:
      "clean='basmati rice, 1121 sella (parboiled), for Middle East'; product=basmati rice, parboiled (sella). basmati chawal=basmati rice; 'sella'=trade term for parboiled. Semi-milled/milled parboiled basmati -> 1006.30.12 (Parboiled: Basmati rice), NOT the plain 1006.30.20. 'sella' is the load-bearing token. Classify.",
  },
  {
    id: 'RW-HING-05',
    query: 'kabuli chana 12mm whole dried chickpeas',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '07',
    expected_heading: '0713',
    expected_code: '0713.20.10',
    difficulty: 'easy',
    notes:
      "clean='Kabuli chana (chickpeas) 12mm, whole, dried'; product=dried chickpeas, Kabuli type, whole. kabuli chana names the exact leaf 0713.20.10 (Kabuli chana) under chickpeas 0713.20, distinct from 0713.20.20 (Bengal gram/desi chana). 'whole dried' confirms not split. Classify.",
  },
  {
    id: 'RW-HING-06',
    query: 'jhinga vannamei frozen HOSO 26/30 seafood export',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '03',
    expected_heading: '0306',
    expected_code: '0306.17.20',
    difficulty: 'medium',
    notes:
      "clean='vannamei shrimp, frozen, head-on shell-on, 26/30 count'; product=frozen Vannamei shrimp (Litopenaeus vannamei). jhinga=shrimp/prawn; 'vannamei'+'frozen' pins the species leaf 0306.17.20 (Vannamei shrimp) under frozen shrimp 0306.17. Species is named, so classify (not the live/chilled 0306.36 sibling, since 'frozen').",
  },
  {
    id: 'RW-HING-07',
    query: 'kasoori methi dried fenugreek leaves... wait, methi seeds whole for spice',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.99.12',
    difficulty: 'hard',
    notes:
      "clean='fenugreek seeds (methi), whole, as a spice'; product=fenugreek seeds (methi dana), whole, spice use. Messy self-correction mid-query (real exporter typing). Corrected intent is methi SEEDS (spice) -> 0910.99.12 (Other spices > Seed > Fenugreek), NOT kasoori methi leaves (Ch.07/12). 'seeds whole for spice' resolves it. Classify on the corrected intent.",
  },
  {
    id: 'RW-HING-08',
    query: 'supari 50 boxes for dubai mouth freshener',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '21',
    expected_heading: '2106',
    expected_code: '2106.90.30',
    expected_axis: 'processing_state', // processed/flavoured product vs raw areca nut
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      "'supari' means BOTH the processed/flavoured betel-nut product (2106.90.30, Ch.21) AND plain raw areca nut (0802.80.10, Ch.08); different chapters, no common parent, no residual default",
    notes:
      "clean='supari, 50 boxes, for Dubai, mouth-freshener type'; product=ambiguous processed flavoured betel-nut 'supari' vs raw whole areca nut. 'mouth freshener' leans 2106 but exporters use it loosely for plain roasted areca too; these sit in DIFFERENT chapters with no common parent, so ONE question (processed/flavoured vs raw areca nut?) is required. Gold = the 2106 reading.",
  },
  {
    id: 'RW-HING-09',
    query: 'kaju W320 kernels export 10kg tin',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '08',
    expected_heading: '0801',
    expected_code: '0801.32.20',
    difficulty: 'medium',
    notes:
      "clean='cashew kernels grade W320, export, 10 kg tin'; product=cashew kernels, whole, grade W320. kaju=cashew. 'W320' is a WHOLE-kernel grade (W=whole), pinning 0801.32.20 (Cashew kernel, whole) over .10 (broken). 'kernels' rules out in-shell 0801.31. The grade code is load-bearing. Classify.",
  },
  {
    id: 'RW-HING-10',
    query: 'kaju export grade, kernels, what code?',
    source: 'real-world-staging:regional_hinglish',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '08',
    expected_heading: '0801',
    expected_code: '0801.32.20',
    expected_axis: 'form', // whole vs broken/pieces
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'cashew kernels whole (0801.32.20) vs broken/pieces (0801.32.10) — both standard high-volume export grades, neither a residual catch-all; grade not given',
    notes:
      "clean='cashew kernels, export grade (grade unspecified)'; product=cashew kernels, whole vs broken not specified. Unlike the W320 case, no grade given: 0801.32.20 (whole) and 0801.32.10 (broken/pieces) are BOTH standard, high-volume export grades priced very differently; neither is a residual 'Other'. Ask whole-vs-broken (one question, options, no default). Gold = the whole reading.",
  },
];

/**
 * Family 4 — BRAND / TRADE NAMES. Indian household brands standing in for a
 * product class (Maggi, Fevicol, Surf, Cello, Colgate, Eclairs, Thums Up, Dabur
 * Chyawanprash, Horlicks, Eveready). Most resolve via unmarked-default-wins; two
 * (Eclairs cocoa-fork, Eveready chemistry-fork) are genuine asks.
 */
export const realWorldStagingBrandTrade: EvalTestCase[] = [
  {
    id: 'RW-BRAND-01',
    query: 'Maggi noodles 70g pack for export',
    source: 'real-world-staging:brand_trade',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '19',
    expected_heading: '1902',
    expected_code: '1902.30.90',
    difficulty: 'medium',
    notes:
      "clean='instant noodles (uncooked dried pasta), retail pack'; product=Maggi-style instant noodles. Brand 'Maggi'=instant noodles. Heading 1902 (pasta); instant noodles fall under 1902.30 'other pasta'. The masala sachet is incidental/packed-together; the noodle cake governs. The common retail instant-noodle pack with flavour sachet resolves to residual '.90 Other' (1902.30.10 is 'Dried' specifically). Unmarked-default-wins; classify to chapter 19.",
  },
  {
    id: 'RW-BRAND-02',
    query: 'fevicol adhesive 1kg bottle',
    source: 'real-world-staging:brand_trade',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '35',
    expected_heading: '3506',
    expected_code: '3506.10.00',
    difficulty: 'medium',
    notes:
      "clean='white PVA wood adhesive (synthetic resin glue), retail pack <=1kg'; product=Fevicol=PVA white wood glue, retail-packed. Brand 'Fevicol'=adhesive. The query says 1kg retail bottle 'put up for retail sale as glue, not exceeding 1kg' = subheading 3506.10. The deeper 3506.91 split applies to glues NOT put up for retail <=1kg, so the retail pack lands at single leaf 3506.10.00. Classify.",
  },
  {
    id: 'RW-BRAND-03',
    query: 'surf detergent powder 1 kg',
    source: 'real-world-staging:brand_trade',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '34',
    expected_heading: '3402',
    expected_code: '3402.90.11',
    difficulty: 'medium',
    notes:
      "clean='synthetic detergent washing powder, retail'; product=Surf Excel=synthetic-detergent laundry washing powder, retail. Brand 'Surf'=laundry detergent. HS-2022/ITC has no 3402.20 (deleted); retail synthetic-detergent washing preparations sit under 3402.90 'Synthetic detergents -> Washing preparations...' = 3402.90.11. 'detergent powder' lands the synthetic-detergent washing-preparation leaf. Classify.",
  },
  {
    id: 'RW-BRAND-04',
    query: 'Cello pen ball point blue 100 pcs',
    source: 'real-world-staging:brand_trade',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '96',
    expected_heading: '9608',
    expected_code: '9608.10.19',
    difficulty: 'medium',
    notes:
      "clean='ball point pens, ordinary (not precious metal)'; product=Cello-brand ordinary plastic ball-point pens. Brand 'Cello'=ball point pen. 9608.10 splits on (a) liquid ink for rolling ball vs other and (b) high-value (>=US$100 cif)/precious-metal vs other. An ordinary bulk plastic Cello pen is plainly NOT high-value/precious-metal -> residual 'Other' = 9608.10.19. Unmarked-default-wins; classify without asking about value.",
  },
  {
    id: 'RW-BRAND-05',
    query: 'colgate toothpaste 100g tube export',
    source: 'real-world-staging:brand_trade',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '33',
    expected_heading: '3306',
    expected_code: '3306.10.20',
    difficulty: 'easy',
    notes:
      "clean='dentifrice / toothpaste in paste form, retail tube'; product=Colgate=toothpaste (dentifrice) in paste form. Brand 'Colgate'=toothpaste. 3306.10 dentifrices split only on physical form: powder (.10) vs paste (.20) vs other (.90). The query says 'toothpaste ... tube' = paste form -> 3306.10.20 unambiguous. Classify (form given).",
  },
  {
    id: 'RW-BRAND-06',
    query: 'Eclairs toffee candy 50 pcs jar',
    source: 'real-world-staging:brand_trade',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '17',
    expected_heading: '1704',
    expected_code: '1704.90.30',
    expected_axis: 'composition', // contains cocoa/chocolate filling or not
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'sugar caramel/toffee WITHOUT cocoa = 1704.90.30 vs chocolate/cocoa-centred = 1806.90.20; the deciding fact is cocoa content, no safe default',
    notes:
      "clean='sugar-boiled/toffee confectionery without cocoa OR chocolate-filled toffee'; product=Cadbury Eclairs=a chocolate-filled toffee/caramel. Genuinely ambiguous at heading level: toffee WITHOUT cocoa is 1704.90.30 (toffees/caramels), but a cocoa centre pushes it to 1806.90.20. One question (cocoa content yes/no) is honestly needed. Gold = the no-cocoa toffee reading.",
  },
  {
    id: 'RW-BRAND-07',
    query: 'thums up cold drink 200ml bottle',
    source: 'real-world-staging:brand_trade',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '22',
    expected_heading: '2202',
    expected_code: '2202.10.10',
    difficulty: 'medium',
    notes:
      "clean='aerated/carbonated soft drink (cola), sweetened'; product=Thums Up=aerated carbonated cola. Brand 'Thums Up'=carbonated cola. Heading 2202 waters with added sugar/flavour: 2202.10 covers aerated waters/lemonade/other; a fizzy cola is an 'aerated water' = 2202.10.10. 'Cold drink'+'bottle' in Indian usage = carbonated. Not a fruit-juice (2202.99) case. Classify.",
  },
  {
    id: 'RW-BRAND-08',
    query: 'Dabur Chyawanprash 1kg jar herbal tonic',
    source: 'real-world-staging:brand_trade',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '30',
    expected_heading: '3004',
    expected_code: '3004.90.11',
    difficulty: 'medium',
    notes:
      "clean='ayurvedic medicament put up for retail sale'; product=Dabur Chyawanprash=ayurvedic medicament/health tonic, retail. Brand 'Dabur Chyawanprash'=ayurvedic tonic. 'herbal tonic'+recognised ayurvedic preparation in retail pack -> 3004.90.11 'Ayurvedic system medicaments, put up for retail sale'. Chyawanprash is registered/sold as an Ayurvedic medicament in India, so 3004.90.11 is the established ITC-HS treatment (over 2106.90.99 food supplement). Classify.",
  },
  {
    id: 'RW-BRAND-09',
    query: 'Horlicks health drink powder 500g',
    source: 'real-world-staging:brand_trade',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '19',
    expected_heading: '1901',
    expected_code: '1901.10.10',
    difficulty: 'medium',
    notes:
      "clean='malted-milk food (malt-extract milk-based powder beverage prep)'; product=Horlicks=malted-milk powder. Brand 'Horlicks'=malted milk powder. Heading 1901 malt-extract/flour food preps: 1901.10.10 is 'Malted milk (including powder)'. Horlicks is the textbook malted-milk food preparation; brand + 'health drink powder' lands the malted-milk leaf. Classify.",
  },
  {
    id: 'RW-BRAND-10',
    query: 'Eveready battery AA 1.5v pack of 10',
    source: 'real-world-staging:brand_trade',
    category: 'electronics',
    expected_routing: 'ask',
    expected_chapter: '85',
    expected_heading: '8506',
    expected_code: '8506.80.90',
    expected_axis: 'composition', // cell chemistry: zinc-carbon vs alkaline Mn-dioxide
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'primary cells split by CHEMISTRY: alkaline Mn-dioxide (8506.10.00) vs zinc-carbon Other (8506.80.90); size/voltage given but not chemistry, no safe default',
    notes:
      "clean='primary cell/battery (dry cell), AA size'; product=Eveready AA dry-cell primary battery. Brand 'Eveready'=dry-cell battery. Heading 8506 primary cells split by chemistry; AA Eveready cells exist in BOTH zinc-carbon (8506.80.90) and alkaline Mn-dioxide (8506.10.00) variants with no safe default. The deciding fact (chemistry) needs one clarifying question. Gold = the classic zinc-carbon 'red Eveready' reading.",
  },
];

/**
 * Family 5 — RUN-ON / VERBOSE. Full exporter-style paragraphs with greeting,
 * origin city, destination country and IEC/shipment noise wrapped around the
 * product. The classifier must extract the product and not be derailed by noise.
 */
export const realWorldStagingRunonVerbose: EvalTestCase[] = [
  {
    id: 'RW-VERB-01',
    query:
      'hello sir we want to export whole frozen chicken to dubai from punjab please tell hs code',
    source: 'real-world-staging:runon_verbose',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '02',
    expected_heading: '0207',
    expected_code: '0207.12.00',
    difficulty: 'medium',
    notes:
      "clean='whole frozen chicken (Gallus domesticus), not cut in pieces'; product=frozen whole chicken. Destination (Dubai) and origin (Punjab) are noise. 'whole'+'frozen chicken' fully specifies the not-cut-in-pieces frozen fowl leaf 0207.12.00 (vs cuts/offal 0207.14.00). Extra words must not derail.",
  },
  {
    id: 'RW-VERB-02',
    query:
      'we are exporters of frozen vannamei shrimp headless shell on from andhra need the itc hs code for shipment to usa',
    source: 'real-world-staging:runon_verbose',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '03',
    expected_heading: '0306',
    expected_code: '0306.17.20',
    difficulty: 'medium',
    notes:
      "clean='frozen vannamei shrimp (Litopenaeus vannamei)'; product=frozen vannamei shrimp. Species explicitly named (vannamei). 'headless shell on' and destination USA are noise. India has a dedicated vannamei leaf 0306.17.20 under frozen shrimps and prawns. Classify.",
  },
  {
    id: 'RW-VERB-03',
    query:
      'i want to export basmati rice to dubai we mill it ourselves in haryana raw white not parboiled bags of 25kg',
    source: 'real-world-staging:runon_verbose',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '10',
    expected_heading: '1006',
    expected_code: '1006.30.20',
    difficulty: 'medium',
    notes:
      "clean='raw (non-parboiled) basmati rice'; product=raw white basmati rice. Query explicitly says 'raw...not parboiled', resolving the parboiled (1006.30.12) vs other fork. 'Basmati rice' leaf under Other semi/wholly milled = 1006.30.20. Packing and destination are noise. Classify.",
  },
  {
    id: 'RW-VERB-04',
    query:
      'namaste we manufacture and export dried turmeric fingers from erode tamil nadu whole polished not powder kindly share hs code for europe',
    source: 'real-world-staging:runon_verbose',
    category: 'food_agri',
    expected_routing: 'classify',
    expected_chapter: '09',
    expected_heading: '0910',
    expected_code: '0910.30.20',
    difficulty: 'medium',
    notes:
      "clean='dried turmeric (whole fingers, not powdered)'; product=dried turmeric rhizomes/fingers. 'dried'+'not powder' disambiguates dried (0910.30.20) from fresh (.10) and powder (.30). City/destination are noise. Strong unmarked signal toward dried-whole leaf. Classify.",
  },
  {
    id: 'RW-VERB-05',
    query:
      'respected sir we manufacture stainless steel pressure cookers in our factory at mumbai for export purpose what is the export hs code',
    source: 'real-world-staging:runon_verbose',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7323',
    expected_code: '7323.93.10',
    difficulty: 'medium',
    notes:
      "clean='stainless steel pressure cookers'; product=stainless steel pressure cookers (table/kitchen articles). Iron/steel table-kitchen ware heading 7323; 'pressure cookers' is its own dedicated leaf 7323.93.10 under stainless steel. Factory/city framing is noise. Classify.",
  },
  {
    id: 'RW-VERB-06',
    query:
      'we are a leather goods exporter from kanpur dealing in genuine leather wallets and purses for men want to ship to germany pls provide hsn',
    source: 'real-world-staging:runon_verbose',
    category: 'other',
    expected_routing: 'classify',
    expected_chapter: '42',
    expected_heading: '4202',
    expected_code: '4202.31.20',
    difficulty: 'medium',
    notes:
      "clean='wallets and purses of leather'; product=men's wallets/purses of genuine leather. Articles of a kind carried in pocket/handbag, outer surface of leather = subheading 4202.31; 'wallets and purses, of leather' is the named leaf 4202.31.20. Kanpur/Germany are noise. Classify.",
  },
  {
    id: 'RW-VERB-07',
    query:
      'exporting jute hessian bags burlap sacks from kolkata to middle east 100 percent jute need correct itc hs code for our IEC',
    source: 'real-world-staging:runon_verbose',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '63',
    expected_heading: '6305',
    expected_code: '6305.10.30',
    difficulty: 'medium',
    notes:
      "clean='jute hessian bags'; product=jute hessian (burlap) bags/sacks of jute. Sacks and bags of jute = subheading 6305.10; India splits by jute-bag type and 'Jute hessian bags' is the explicit named leaf 6305.10.30. 'burlap'=hessian synonym; Kolkata/Middle East are noise. Classify.",
  },
  {
    id: 'RW-VERB-08',
    query:
      'we make plastic dinner plates tumblers and serving bowls for household use plastic moulded export quality from delhi hs code chahiye',
    source: 'real-world-staging:runon_verbose',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3924',
    expected_code: '3924.10.90',
    difficulty: 'medium',
    notes:
      "clean='plastic tableware (plates, bowls, tumblers) for household use'; product=household plastic tableware, non-insulated. Tableware and kitchenware of plastics = subheading 3924.10; non-insulated household ware -> 'Other' 3924.10.90 (insulated ware is .10). 'household use'+named items resolve it; city/Hindi ('chahiye') noise. Classify.",
  },
  {
    id: 'RW-VERB-09',
    query:
      'sir i export ceramic brake pads and brake assemblies for passenger cars and suvs from pune is the hs code different for the brakes only',
    source: 'real-world-staging:runon_verbose',
    category: 'automotive',
    expected_routing: 'classify',
    expected_chapter: '87',
    expected_heading: '8708',
    expected_code: '8708.30.00',
    difficulty: 'medium',
    notes:
      "clean='brakes and brake parts for motor vehicles'; product=brakes/brake pads for motor vehicles of headings 8701-8705 (cars/SUVs). Parts and accessories of motor vehicles, heading 8708; 'Brakes and servo-brakes; parts thereof' is the single dedicated leaf 8708.30.00. 'for passenger cars and suvs' keeps it in 87 (not 84/68); Pune is noise. Classify.",
  },
  {
    id: 'RW-VERB-10',
    query:
      'we export cumin seeds jeera from unjha gujarat bulk to gulf countries please tell me the exact 8 digit hs code for jeera',
    source: 'real-world-staging:runon_verbose',
    category: 'food_agri',
    expected_routing: 'ask',
    expected_chapter: '09',
    expected_heading: '0909',
    expected_code: '0909.31.29',
    expected_axis: 'composition', // cumin-black (kala jeera) vs other-than-black
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      'cumin/jeera whole 0909.31 splits cumin-black (0909.31.1x) vs cumin-other-than-black (0909.31.2x), each seed-quality vs other; no clean residual across black-vs-other',
    notes:
      "clean='cumin seeds (jeera), whole, not crushed/ground'; product=whole cumin seeds, black-vs-other-than-black + seed-quality vs other unresolved. 'jeera/cumin' whole -> 0909.31, but black-vs-other-than-black has NO clean residual default, so one question (is it black/kala jeera?) is genuinely needed. Common trade jeera is other-than-black non-seed (0909.31.29). Destination/city are noise. Gold = the common other-than-black reading.",
  },
];

/**
 * Family 6 — INDUSTRY ABBREVIATIONS. Steel/plastic/metal trade shorthand (SS,
 * M.S., PP, HDPE, CR, GI, PVC, Alu, HR). Most pin a leaf once the abbreviation is
 * expanded + a stated dimension/grade resolves the split; two (CR coil, GI
 * wire gauge) are genuine asks where the 8-digit band is not determined in-query.
 */
export const realWorldStagingAbbrev: EvalTestCase[] = [
  {
    id: 'RW-ABBR-01',
    query: 'SS 304 pipe welded 2 inch erw',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7306',
    expected_code: '7306.40.00',
    difficulty: 'medium',
    notes:
      "clean='Stainless steel grade 304 welded ERW pipe, circular, 2 inch'; product=welded stainless steel tube of circular cross-section (304). SS=stainless steel, 304=austenitic grade. 'Welded ERW, circular' pins heading 7306 and the stainless welded-circular leaf 7306.40.00 cleanly. No residual fork. Classify.",
  },
  {
    id: 'RW-ABBR-02',
    query: 'M.S. angle 50x50x5',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '72',
    expected_heading: '7216',
    expected_code: '7216.21.00',
    difficulty: 'medium',
    notes:
      "clean='Mild steel angle (L-section), non-alloy hot-rolled, 50x50x5 mm'; product=non-alloy steel L-section angle, hot-rolled, height <80 mm. M.S.=mild steel (non-alloy). The dimension 50x50 (<80 mm) is stated, pinning the <80 mm L-section leaf 7216.21.00. If size were omitted it would be 'ask' (80 mm fork to 7216.40.00), but 50x50 resolves it. Classify.",
  },
  {
    id: 'RW-ABBR-03',
    query: 'PP woven sacks 50 kg for cement packing',
    source: 'real-world-staging:abbrev',
    category: 'textile',
    expected_routing: 'classify',
    expected_chapter: '63',
    expected_heading: '6305',
    expected_code: '6305.33.00',
    difficulty: 'medium',
    notes:
      "clean='Polypropylene woven sacks/bags of PP strip, for packing (50 kg)'; product=sacks/bags of woven man-made (PP strip) textile material. PP=polypropylene. 'Woven sacks' of PP strip are textile sacks (Ch.63), not plastic articles (Ch.39) — classic 39-vs-63 fork resolved by 'woven...strip'. Leaf 6305.33.00 covers PP-strip sacks. Classify.",
  },
  {
    id: 'RW-ABBR-04',
    query: 'HDPE granules virgin film grade',
    source: 'real-world-staging:abbrev',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3901',
    expected_code: '3901.20.00',
    difficulty: 'easy',
    notes:
      "clean='High-density polyethylene granules, virgin, film grade (primary form)'; product=polyethylene in primary form (granules), SG >=0.94. HDPE=high-density polyethylene=SG>=0.94, exactly the single leaf 3901.20.00 (no further split). 'Granules' confirms primary form (heading 3901). Classify.",
  },
  {
    id: 'RW-ABBR-05',
    query: 'CR coil cold rolled steel',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'ask',
    expected_chapter: '72',
    expected_heading: '7209',
    expected_code: '7209.16.10',
    expected_axis: 'form', // plate/sheet/strip + thickness band
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      "CR (heading 7209); thickness band sets the 6-digit but the Indian 8-digit splits Plates/Sheets/Strip/Other and 'coil' maps to none cleanly; no residual default",
    notes:
      "clean='Cold-rolled non-alloy steel coil (flat-rolled, in coils)'; product=cold-rolled flat non-alloy steel; form leaf undetermined by 'coil'. CR=cold-rolled (heading 7209). Genuinely needs ONE question (thickness + sheet-vs-strip) with no residual default; 7209.16.10 'Plates' is the placeholder gold.",
  },
  {
    id: 'RW-ABBR-06',
    query: 'GI wire 12 gauge for fencing',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'ask',
    expected_chapter: '72',
    expected_heading: '7217',
    expected_code: '7217.20.20',
    expected_axis: 'form', // SWG thickness band
    option_answerability: 'answerable',
    difficulty: 'hard',
    expected_ambiguity:
      "GI=galvanised wire (7217.20); the 8-digit leaf depends purely on SWG band (18&below / 18-26 / above-26) and '12 gauge' is ambiguous across gauge systems; no residual default",
    notes:
      "clean='Galvanised (zinc-coated) iron/steel wire, 12 SWG, for fencing'; product=zinc-coated non-alloy steel wire; SWG band determines the leaf. GI=galvanised iron (zinc-coated wire, subheading 7217.20). '12 gauge' is ambiguous (SWG vs other systems) so confirm; gold 7217.20.20 is the 18-26 SWG band placeholder.",
  },
  {
    id: 'RW-ABBR-07',
    query: 'PVC resin suspension grade k67',
    source: 'real-world-staging:abbrev',
    category: 'chemical',
    expected_routing: 'classify',
    expected_chapter: '39',
    expected_heading: '3904',
    expected_code: '3904.10.20',
    difficulty: 'easy',
    notes:
      "clean='Poly(vinyl chloride) suspension-grade resin, K-value 67, not mixed'; product=PVC homopolymer in primary form, suspension grade, not mixed. PVC=poly(vinyl chloride). 'Suspension grade'+'resin, not mixed' maps to the Indian leaf 3904.10.20 'Suspension grade PVC resin'. Unambiguous. Classify.",
  },
  {
    id: 'RW-ABBR-08',
    query: 'Alu foil 11 micron plain jumbo roll',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '76',
    expected_heading: '7607',
    expected_code: '7607.19.91',
    difficulty: 'medium',
    notes:
      "clean='Aluminium foil, not backed, plain, 11 micron, jumbo rolls'; product=aluminium foil (<=0.2 mm), not backed, rolled not further worked, plain. Alu=aluminium. 11 micron (<0.2 mm) = foil heading 7607; 'not backed' (jumbo roll) -> 7607.19; 'plain' -> leaf 7607.19.91. Embossed/printed/coated siblings excluded by 'plain'. Classify.",
  },
  {
    id: 'RW-ABBR-09',
    query: 'HR plate 12mm IS2062',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '72',
    expected_heading: '7208',
    expected_code: '7208.51.10',
    difficulty: 'medium',
    notes:
      "clean='Hot-rolled non-alloy steel plate, 12 mm thick, IS 2062 grade, not in coils'; product=hot-rolled flat non-alloy steel plate, >10 mm band, not in coils. HR=hot-rolled; 'plate'+'12 mm' (exceeding 10 mm, not in coils) pins subheading 7208.51, and 'plate' selects leaf 7208.51.10 'Plates'. IS 2062 confirms non-alloy structural steel. Form (plate) explicit so no fork. Classify.",
  },
  {
    id: 'RW-ABBR-10',
    query: 'GI pipe 2 inch B class for plumbing',
    source: 'real-world-staging:abbrev',
    category: 'metal',
    expected_routing: 'classify',
    expected_chapter: '73',
    expected_heading: '7306',
    expected_code: '7306.30.10',
    difficulty: 'medium',
    notes:
      "clean='Galvanised iron pipe (welded, circular), 2 inch, B-class, for plumbing'; product=welded galvanised iron tube, circular, other than line/casing pipe. GI pipe=galvanised iron welded round pipe -> heading 7306, subheading 7306.30 (welded, circular, iron/non-alloy steel); leaf 7306.30.10 'Of iron'. 'B class' (wall thickness) does not change the 8-digit. Distinct from GI WIRE (7217). Classify.",
  },
];

/**
 * The assembled staged corpus — all six messy-input families flattened in family
 * order. 60 cases / 29 distinct chapters. STAGED, NOT frozen, gold PENDING
 * FOUNDER APPROVAL. See the coverage summary in the GOLD-REMEDIATION note above.
 */
export const realWorldStaging: EvalTestCase[] = [
  ...realWorldStagingTypos,
  ...realWorldStagingVague,
  ...realWorldStagingRegionalHinglish,
  ...realWorldStagingBrandTrade,
  ...realWorldStagingRunonVerbose,
  ...realWorldStagingAbbrev,
];
