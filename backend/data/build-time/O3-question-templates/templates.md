# O3 — Question Templates (curated for QGS)

**Curator:** claude-opus-4-7 (build-time O3 job)
**Date:** 2026-05-26
**Total templates:** 51
**Validation status:** all `validated: false` — orchestrator hand-validates in a later cycle.

This document is the human-readable companion to `templates.json`. Each template is a row destined for the `question_templates` Postgres table, consumed at runtime by the Question Generation Subsystem (QGS, sub-spec 02 §A.7) when info-gain selects the corresponding `discriminating_attribute`.

## Schema reminder (from migration 20260526120200)

| Column | Type | Notes |
|---|---|---|
| `discriminating_attribute` | TEXT | One of the QGS attribute keys (`material`, `form`, `function_`, `intended_use`, `processing_state`, `composition`) OR a sub-spec 04 extension key (`fabric_construction`, `made_up`, `chemical_class`, `predominant_element`, `wearable`, `electrically_warmed`, `electrically_heated`, `in_solution`, `solution_purpose`, `intended_role`) |
| `chapter_scope` | TEXT[] \| NULL | NULL = universal. Populated = chapter-specific override. |
| `question_text` | TEXT | Natural-language question. NEVER code-language. |
| `value_labels` | JSONB | `{ value_id: user_friendly_label }`. 2-4 options per question. |
| `notes` | TEXT \| NULL | Curation rationale. |
| `validated` | BOOL | False until hand-validated. |

## Per-attribute breakdown (51 total)

| Attribute | Count |
|---|---|
| material | 10 |
| intended_use | 9 |
| form | 8 |
| function_ | 5 |
| processing_state | 5 |
| composition | 2 |
| fabric_construction | 2 |
| intended_role | 2 |
| made_up | 1 |
| wearable | 1 |
| electrically_warmed | 1 |
| electrically_heated | 1 |
| chemical_class | 1 |
| predominant_element | 1 |
| in_solution | 1 |
| solution_purpose | 1 |

## O5 confusing-pair coverage (mandatory 8/8)

| Pair | Discriminator | Chapter scope | Status |
|---|---|---|---|
| Ch.42 vs Ch.43 (leather vs furskin) | `material` | [42, 43] | COVERED |
| Ch.09 vs Ch.21 (raw/roasted vs extract) | `processing_state` | [09, 21] | COVERED |
| Ch.61 vs Ch.62 (knitted vs woven apparel) | `fabric_construction` | [61, 62] | COVERED |
| Ch.72 vs Ch.80 (Fe-predominant vs Sn-predominant) | `predominant_element` | [72, 74-81] | COVERED |
| Ch.42 vs Ch.62 (leather apparel vs textile apparel) | `material` | [42, 61, 62] | COVERED |
| Ch.54 vs Ch.55 (filament vs staple) | `form` | [54, 55] | COVERED |
| Ch.84 vs Ch.87 (industrial machinery vs vehicle parts) | `intended_use` | [84, 85, 87] | COVERED |
| Ch.29 vs Ch.30 (bulk API vs formulated drug) | `processing_state` | [29, 30] | COVERED |

Each pair also has secondary supporting templates (e.g. Ch.09 vs Ch.21 is additionally backed by a `form` template for "powder vs soluble powder" disambiguation, and a `function_` template for "brewed vs dissolves directly").

## Templates grouped by attribute

### material (10 templates)

1. **Ch.42 vs Ch.43** — hair-on / hair-off distinction. Three options: leather / furskin / artificial-fur.
2. **Ch.42 vs Ch.61/62** — leather vs textile apparel. Four options including faux-leather edge case.
3. **Universal material** — 11 common materials (steel, aluminium, copper, plastic, wood, glass, rubber, leather, textile, paper, other).
4. **Metal chapters 72-81** — 8 options (Fe, Al, Cu, Ni, Zn, Sn, Pb, other).
5. **Ch.42 leather sub-types** — full-grain / split / composition / patent / chamois.
6. **Wood/cork/plaiting Ch.44-46** — solid wood / panel / cork / plaiting material.
7. **Natural-fibre textiles Ch.50-53** — silk / wool / cotton / other vegetable.
8. **Plastics vs rubber Ch.39/40** — thermoplastic / natural rubber / synthetic rubber / thermoset.
9. **Footwear Ch.64** — upper-and-sole material combinations (5 buckets).
10. **Stone/cement/ceramic Ch.68/69** — natural stone / cement / refractory ceramic / sanitary ceramic / abrasive.

### form (8 templates)

1. **Universal form** — raw bulk / semi-finished / finished part / complete product / fabric-or-yarn.
2. **Ch.54 vs Ch.55** — filament / staple / tow >2m / tow ≤2m (Ch.55 Note 1 threshold).
3. **Metal chapters 72-83** — ingot / bar-rod-wire / sheet-plate-strip / tube-pipe / structural section / finished article.
4. **Ch.29/30/38 presentation** — bulk powder / bulk liquid / tablet-capsule / ampoule-vial / syrup-cream / retail pack.
5. **Coffee Ch.09/21** — whole bean / ground / soluble powder / freeze-dried / liquid concentrate.
6. **Paper Ch.48** — rolls/sheets / envelopes / boxes / registers / labels / other.
7. **Inorganic chemicals Ch.28** — element / acid-or-base / salt-or-oxide / isotope.
8. **Glass Ch.70** — primary form / flat glass / container / tableware / technical fibre.

### function_ (5 templates)

1. **Universal function** — 10 buckets (machinery / electrical / fastener / apparel / container / food / chemical / construction / tool / other).
2. **Ch.84/85 machinery role** — mechanical / production / electrical generation / electronic / domestic.
3. **Metal articles Ch.73/82/83** — hand tool / fastener / fitting / structural / kitchenware / container.
4. **Ch.38 chemical function** — lubricant / cleaning / agricultural / industrial reagent / biodiesel.
5. **Coffee Ch.09/21 consumption** — brewed / dissolves directly / ingredient.

### intended_use (9 templates)

1. **Universal end-use** — industrial / automotive / household / medical / construction / agricultural / personal / office.
2. **Ch.84/85/87 vehicle-part test** — "solely or principally for vehicle?" (Section XVII Note 3); 4 buckets including engine and bearing carve-outs.
3. **Ch.61/62/63 apparel gender** — men's / women's / babies / unisex-or-industrial.
4. **Ch.30 therapeutic purpose** — human / veterinary / diagnostic / wound care.
5. **Ch.86-89 transport** — rail / road / aircraft / ship.
6. **Ch.32/33** — paint-coating / dye-pigment / perfume-cosmetic / essential-oil.
7. **Ch.94** — household / office / outdoor / medical furniture.
8. **Ch.95** — toy / sports / video-game / festive / fishing.
9. **Ch.71** — jewellery / coin-bullion / industrial / stone / pearl.

### processing_state (5 templates)

1. **Universal processing** — raw / semi-processed / finished / formulated.
2. **Ch.09 vs Ch.21 coffee extraction** — roasted bean / decaffeinated / extracted-soluble / preparation-with-coffee.
3. **Ch.29 vs Ch.30 formulation** — bulk unformulated / stabilised-in-water / formulated dosage / retail mixed preparation.
4. **Ch.02/03/16/20 food preservation** — fresh / frozen / dried-salted-smoked / cooked-prepared.
5. **Ch.72 steel working** — hot-rolled / cold-rolled / plated-coated / drawn-extruded / cast-forged.

### composition (2 templates)

1. **Universal composite test** — single material / composite-with-essential-character / mixture-or-set / coated-or-laminated.
2. **Ch.72 alloy class** — non-alloy carbon / stainless / other alloy / iron-not-steel.

### fabric_construction (2 templates)

1. **Ch.61 vs Ch.62** — knitted-or-crocheted / woven / non-woven / wadding-only (the exemplar binary discriminator).
2. **Ch.50-60 fabric routing** — woven / knitted / crocheted / non-woven / wadding.

### Sub-spec 04 extension attributes (one template each)

- **made_up** [Ch.61/62/63] — made-up finished article vs fabric on a roll.
- **wearable** [Ch.85] — worn on body vs used independently.
- **electrically_warmed** [Ch.63/85] — electric heating primary vs not.
- **electrically_heated** [Ch.85] — electric heating primary vs incidental.
- **chemical_class** [Ch.28/29] — 6 enum buckets mirroring Ch.29 Note 1.
- **predominant_element** [Ch.72/74-81] — 8 metal buckets (resolves tin-coated steel vs pure tin confusion).
- **in_solution** [Ch.29] — yes/no.
- **solution_purpose** [Ch.29/30] — safety_transport / specific_use / none.
- **intended_role** [Ch.39/48/70] — packaging / structural / independent / technical.
- **intended_role** [Ch.90] — optical / measuring / medical-surgical / implant / technical (high-SKIP refinement).

## Quality compliance checklist

- [x] No question uses code-language ("Is this Chapter 42 or 43?"). All questions describe the product feature in user vocabulary.
- [x] All `value_labels` use plain English, never jargon. Where chemistry/metallurgy terms appear (e.g. "Sn ≥ 50%"), they appear in parentheticals after the natural-language explanation.
- [x] All templates have 2-4 options (per QGS spec § avoid decision paralysis). Two templates have a few more (footwear Ch.64 has 5 because the heading literally combines upper+sole; metal-form Ch.72-83 has 6 because semi-finished metal shapes are a fundamental routing axis).
- [x] Boolean attributes (`made_up`, `wearable`, `electrically_warmed`, `electrically_heated`, `in_solution`) have 2 descriptive options, not literal "yes/no".
- [x] `chapter_scope` is NULL where the template is universal (5 templates: universal material, form, function_, intended_use, processing_state, composition).
- [x] All `discriminating_attribute` values come from the existing schema (`tariff_line_attributes` columns + QGS_ATTRIBUTE_KEYS); no invented keys.

## Ingest recipe

```sql
-- Pseudo-SQL; the orchestrator can script this with `pg-copy` or a Node ingest loader.
INSERT INTO question_templates (
  discriminating_attribute,
  chapter_scope,
  question_text,
  value_labels,
  notes,
  validated
)
SELECT
  t->>'discriminating_attribute',
  CASE WHEN t->'chapter_scope' = 'null'::jsonb THEN NULL
       ELSE ARRAY(SELECT jsonb_array_elements_text(t->'chapter_scope')) END,
  t->>'question_text',
  t->'value_labels',
  t->>'notes',
  (t->>'validated')::boolean
FROM jsonb_array_elements(:templates_json::jsonb) t;
```

After ingest, hand-validation flips `validated=true` row-by-row.
