# O5 — Confusing Chapter Pairs: Discriminating Attributes

Build-time documentation of the 8 historically confusable chapter pairs.
Feeds Tiebreak prompt disambiguation logic (Layer 6) and QGS template curation (O3).

**Source date:** 2026-05-26
**Curator:** Claude Opus 4.7 via Claude Max subscription (build-time only)
**Schema reference:** `tariff_line_attributes` (see sub-spec 01 + sub-spec 04). All `attribute_key` values below are keys from that schema — no invented keys.

---

## Top-level summary — Pair → Strongest discriminator

| Pair | Strongest discriminator (HIGH confidence) | Secondary signals |
|---|---|---|
| Ch.42 vs Ch.43 (leather vs fur) | `material` (leather vs furskin/fur) | `composite_components` (fur lining/trim), `processing_state` (with hair on / without) |
| Ch.09 vs Ch.21 (raw vs instant coffee) | `processing_state` (roasted/ground vs extracted/concentrated) | `form` (bean/powder vs soluble), `function_` (brewed vs dissolved) |
| Ch.61 vs Ch.62 (knitted vs woven apparel) | `fabric_construction` (knitted/crocheted vs woven) | `made_up` pre-filter (must be true for both) |
| Ch.72 vs Ch.80 (steel vs tin) | `predominant_element` (Fe vs Sn) | `composition` (numeric % Sn), `function_` (structural vs solder) |
| Ch.42 vs Ch.62 (leather vs textile apparel) | `material` (leather vs textile fibre); `composite_components` for mixed items | `fabric_construction` NULL for leather |
| Ch.54 vs Ch.55 (filament vs staple fibre) | `form` (continuous filament vs cut staple) | `processing_state` (extruded vs carded/cut); material is IDENTICAL across the pair (does not discriminate) |
| Ch.84 vs Ch.87 (machinery vs vehicles) | `intended_use` (industrial general purpose vs vehicle-specific) | `function_` (general machine vs vehicle structural part) |
| Ch.29 vs Ch.30 (API vs pharma formulation) | `processing_state` (unformulated bulk vs formulated dosage) | `form` (powder/crystal vs tablet/capsule), `chemical_class`, `intended_use` |

All 8 pairs have at least one HIGH-confidence discriminator. **No structural gaps in the attribute schema.**

---

## Pair 1 — Ch.42 vs Ch.43: Leather articles vs Fur articles

**Pair label:** Leather articles (Ch.42) vs Fur articles (Ch.43)

Ch.42 covers articles made from tanned hides/skins with hair removed (leather). Ch.43 covers articles made from hides/skins tanned-or-dressed with the hair or wool ON (furskins), plus artificial fur. The single deciding fact is whether hair/wool is retained on the substrate.

### Discriminating attributes

**1. `material` — HIGH (`cleanly_splits`)**
- Ch.42 values: `leather`, `tanned hide`, `chamois leather`, `patent leather`, `metallised leather`, `composition leather`
- Ch.43 values: `furskin`, `fur`, `mink`, `fox fur`, `rabbit fur`, `sheepskin with wool on`, `artificial fur`
- *Why:* Ch.43 Note 1 defines furskin as "hides or skins of all animals which have been tanned or dressed with the hair or wool on". Ch.42 Note 1 defines leather; Ch.42 Note 2(b) explicitly excludes fur-lined apparel to Ch.43. Disambiguates >95% of cases on its own.

**2. `processing_state` — MEDIUM (`partial_signal`)**
- Ch.42 values: `tanned and dehaired`, `tanned without hair`, `split leather`
- Ch.43 values: `tanned with hair on`, `dressed with wool on`
- *Why:* Reinforces material signal. NB: raw hides WITH hair on go to Ch.41 not 43.

**3. `composite_components` — HIGH (`requires_combination`)**
- Ch.42 values: leather primary, no fur lining/trim beyond mere trim
- Ch.43 values: furskin/artificial fur lining or outer attachment (not mere trimming)
- *Why:* Ch.42 Note 2(b) → apparel/accessories (except gloves) lined with furskin/artificial fur, or with fur attached on outside (not mere trim), reclassify to Ch.43. Encoded in `chapter_exclusions` id 1849 / 2995.

**Legal basis:** Ch.42 Notes 1 + 2(b) + 4. Ch.43 Notes 1 + 2(c) + 5. `chapter_exclusions` ids 1849, 1867, 2995.

### Worked examples
1. *Tanned cowhide leather jacket* → **42** (material=leather; no fur).
2. *Mink fur coat with silk lining* → **43** (material=furskin per Ch.43 Note 1).
3. *Leather glove with rabbit fur lining* → **42** (Ch.43 Note 2(c) carve-out: gloves of leather+fur → 4203).
4. *Sheepskin coat with wool retained* → **43** (sheepskin with wool on = furskin).
5. *Wool-pile imitation fur garment (knit pile on knit backing)* → 61/62 (knit imitation fur excluded from Ch.43 by Note 5).

### Edge cases
- Knit/woven imitation furskin: excluded from Ch.43 (Note 5) → routes to 5801/6001 fabric or Ch.61/62 garments.
- Leather garment with mere fur trim (cuff edging): stays Ch.42 (Note 2(b) "except as mere trimming").
- Raw hides with hair on (untanned, undressed): Ch.41, not Ch.43.

---

## Pair 2 — Ch.09 vs Ch.21: Raw/roasted coffee vs Coffee extracts

**Pair label:** Raw/roasted coffee (Ch.09) vs Coffee extracts & preparations (Ch.21)

Ch.09 covers coffee in raw, roasted, decaffeinated, ground or roasted+ground forms. Ch.21 (heading 2101) covers extracts, essences, concentrates of coffee, and preparations with a basis of those extracts (instant coffee, soluble coffee, coffee mixes). Discriminator is presence of an extraction step.

### Discriminating attributes

**1. `processing_state` — HIGH (`cleanly_splits`)**
- Ch.09 values: `raw`, `green`, `roasted`, `decaffeinated`, `ground`, `roasted and ground`
- Ch.21 values: `extracted`, `soluble`, `freeze-dried extract`, `spray-dried extract`, `concentrated`, `instant`
- *Why:* Water/solvent extraction → soluble solids → dried is the legal bright line. Ch.21 Note 1(b) and Note 2 govern the boundary. `chapter_exclusions` 3024, 1632.

**2. `form` — MEDIUM (`partial_signal`)**
- Ch.09 values: whole bean, ground, powder of roasted beans
- Ch.21 values: soluble powder, granules (agglomerated from extract), freeze-dried crystals, liquid concentrate, paste
- *Why:* Form alone is ambiguous ('powder' covers both ground roast and instant). Combine with processing_state.

**3. `function_` — MEDIUM (`partial_signal`)**
- Ch.09 values: brewing material, to be brewed/percolated
- Ch.21 values: dissolves in water directly, ready to consume after rehydration, flavouring base
- *Why:* Solubility-in-water as confirmation, downstream of processing_state.

**Legal basis:** Ch.09 Note 1, Ch.21 Notes 1(b) + 2. `chapter_exclusions` 1632, 1639, 3024.

### Worked examples
1. *Roasted arabica beans, 1kg* → **09** (processing_state=roasted; not extracted).
2. *Freeze-dried instant coffee 200g, dissolves in hot water* → **21** (processing_state=extracted+freeze-dried).
3. *Ground roasted coffee 250g for filter brewing* → **09** (form=powder but processing_state=ground roasted).
4. *Coffee concentrate liquid 1L for cold brew dispensers* → **21** (processing_state=concentrated extract).
5. *Decaffeinated roasted beans* → **09** (decaffeination is a Ch.09-resident process — the caffeine is extracted, not the coffee solids).

### Edge cases
- Decaffeinated coffee: Ch.09 despite extraction — solvent removes caffeine, not coffee.
- 3-in-1 instant mixes (coffee + milk powder + sugar): Ch.21 (2101.12) — basis is coffee extract.
- Coffee-flavoured confectionery: Ch.17 or Ch.18 (out of pair scope).
- Roasted coffee substitutes containing some coffee: Ch.09; their extracts: Ch.21.

---

## Pair 3 — Ch.61 vs Ch.62: Knitted vs Woven apparel

**Pair label:** Knitted/crocheted apparel (Ch.61) vs Woven (non-knitted) apparel (Ch.62)

Both chapters cover MADE-UP articles of apparel and clothing accessories. Sole boundary is fabric construction. Heading 6212 (brassieres, girdles, corsets, etc.) is in Ch.62 regardless of construction.

### Discriminating attributes

**1. `fabric_construction` — HIGH (`cleanly_splits`)**
- Ch.61 values: `knitted`, `crocheted`
- Ch.62 values: `woven`, `wadding` (Note 1 carve-out)
- *Why:* Ch.61 Note 1 (knit-only), Ch.62 Note 1 (non-knit). The exemplar binary discriminator; single boolean fully resolves except 6212 carve-out. `chapter_exclusions` 2059, 2095, 2096.

**2. `made_up` — HIGH (`partial_signal`)**
- Both chapters require `made_up = true` (pre-filter).
- *Why:* If false → product is a fabric (Ch.50-60), rules out Ch.61/62. Does NOT discriminate between them.

**3. `function_` — LOW (`cleanly_splits` between apparel and non-apparel only)**
- Both chapters: apparel/clothing accessory/garment
- *Why:* Does NOT discriminate Ch.61 from Ch.62. Confirms candidate set only.

**Legal basis:** Ch.61 Notes 1 + 2(a), Ch.62 Note 1 (in-parens 6212 exception). `chapter_exclusions` 2059, 2095, 2096.

### Worked examples
1. *Men's cotton knit t-shirt, single jersey* → **61** (knitted).
2. *Men's woven cotton dress shirt with collar and buttons* → **62** (woven).
3. *Ladies' knitted brassiere* → **62** (6212 carve-out — bras always Ch.62 even if knitted).
4. *100% polyester crocheted shawl* → **61** (crocheted treated identically to knitted).
5. *Men's woven polyester suit (jacket + trousers)* → **62** (woven; meets Ch.62 Note 3 suit definition).
6. *Wadded ski jacket with woven outer shell* → **62** (wadding-content with woven outer goes to 6211; only WHOLLY-wadding excluded).

### Edge cases
- Bonded knit-and-woven composites: essential character governs (GIR-3(b)).
- Heading 6212 always in Ch.62 even if knitted.
- Knit fabric impregnated with PVC: Ch.39 (`chapter_exclusions` 2077).
- Non-woven (spunbond) PPE coveralls: Ch.62 (not knit, not crochet, not wadding bucket).

---

## Pair 4 — Ch.72 vs Ch.80: Steel (incl. tinplate) vs Tin metal

**Pair label:** Iron and steel (Ch.72, including tin-coated steel) vs Tin metal (Ch.80)

Ch.72 covers iron and steel — including tin-coated steel sheet ('tinplate', heading 7210.12). Ch.80 covers tin as base metal (pure tin or tin alloys where tin predominates). The trigger word 'tin' is the prime SME confusion: 'tin plate' in trade usage almost always means tin-COATED STEEL (Ch.72), not pure tin (Ch.80).

### Discriminating attributes

**1. `predominant_element` — HIGH (`cleanly_splits`)**
- Ch.72 values: `iron`, `Fe`
- Ch.80 values: `tin`, `Sn`
- *Why:* Ch.72 Note 2 (ferrous metals clad with another ferrous metal classified by predominating ferrous metal); Section XV General Note (alloys classified by predominant metal by weight). Requires O2 to populate `predominant_element` field.

**2. `composition` — HIGH (`requires_combination`)**
- Ch.72 values: steel substrate + tin coating; Fe ≥ 50% by weight; Sn ≤ 50%
- Ch.80 values: Sn ≥ 50% by weight; pure tin; tin solder (Sn/Pb where Sn predominates)
- *Why:* Tinplate is typically 99.5%+ steel with <1% Sn coating; pure tin goods 95%+ Sn. Quantitative confirmation.

**3. `function_` — MEDIUM (`partial_signal`)**
- Ch.72 values: food can body stock, structural sheet, construction
- Ch.80 values: soldering, babbit bearing, pewter craftwork, tinning alloy stock
- *Why:* End-use hints help disambiguate trade-name confusion.

**Legal basis:** Ch.72 Note 1(d) (steel definition), Ch.72 Note 2 (predominating ferrous metal), Section XV General Note (alloys by predominant metal). Ch.80 has no chapter notes — discrimination relies on Section XV rules. Trade-name trap: 'tinplate' = tin-coated steel = Ch.72 (7210.12), NOT Ch.80.

### Worked examples
1. *Electrolytic tinplate sheet 0.21mm for food cans* → **72** (predominant_element=iron; steel + Sn coating → 7210.12).
2. *Pure tin bars 99.85% Sn for solder manufacturing* → **80** (predominant_element=tin → 8001.10).
3. *Tin-lead solder wire 60% Sn / 40% Pb* → **80** (Sn predominant → 8003).
4. *Galvanized steel sheet (zinc-coated)* → **72** (iron substrate; zinc is coating).
5. *Tin foil 99.9% Sn 6 micron for capacitor manufacture* → **80** (form=foil, predominant=tin → 8007).

### Edge cases
- Aluminium foil colloquially called 'tin foil' (kitchen): Ch.76, not Ch.80 / Ch.72. Layer 0 alias map should normalise.
- Tin-lead solder where Pb > Sn: Ch.78 (lead) — strict predominant-metal rule.
- Pewter (Sn/Sb/Cu): if Sn ≥ 85% → Ch.80; otherwise Ch.81.
- Tinplate SCRAP: Ch.72 (7204), not Ch.80.

---

## Pair 5 — Ch.42 vs Ch.62: Leather apparel vs Textile woven apparel

**Pair label:** Leather apparel (Ch.42, heading 4203) vs Textile woven apparel (Ch.62)

Leather garments (jackets, coats, vests, gloves, belts of leather) → Ch.42 heading 4203. Same garment types of textile fabric → Ch.61 (knit) or Ch.62 (woven). Pure material discriminator unless composite, in which case GIR-3(b) essential character decides.

### Discriminating attributes

**1. `material` — HIGH (`cleanly_splits`)**
- Ch.42 values: `leather`, `composition leather`, `chamois`, `patent leather`, `metallised leather`
- Ch.62 values: `cotton`, `polyester`, `wool`, `silk`, `viscose`, `woven textile`, `any textile fabric`
- *Why:* Ch.42 heading 4203 + Note 4 covers apparel of leather/composition leather. Textile apparel → Ch.61/62.

**2. `fabric_construction` — MEDIUM (`partial_signal`)**
- Ch.42 values: NULL/absent (leather is not a fabric)
- Ch.62 values: `woven`, `knitted`, `crocheted` (latter two routes to Ch.61)
- *Why:* fabric_construction is meaningful only for textile branch. NULL fabric_construction + material=leather is the most reliable Ch.42 signal.

**3. `composite_components` — HIGH (`requires_combination`)**
- Ch.42 values: leather primary (>50% surface or essential character)
- Ch.62 values: textile primary; leather merely as trim/patches
- *Why:* GIR-3(b) essential character test for mixed leather+textile garments.

**Legal basis:** Ch.42 heading 4203 + Note 4, Ch.62 Note 1, GIR-3(b). NO direct exclusion rule between 42 and 62 in `chapter_exclusions` — boundary is constructive via material attribute.

### Worked examples
1. *Men's full-grain leather biker jacket* → **42** (material=leather → 4203.10).
2. *Men's woven polyester windbreaker jacket* → **62** (material=polyester woven → 6201/6203).
3. *Men's woven cotton jacket with small leather elbow patches* → **62** (composite: primary=cotton woven; leather patches are trim).
4. *Leather vest with cotton lining* → **42** (outer shell leather is primary).
5. *Leather driving gloves (full leather)* → **42** (Ch.42 Note 4 enumerates gloves → 4203.21/4203.29).
6. *Denim jacket woven cotton* → **62**.

### Edge cases
- Leather + furskin garment → Ch.43 (see Pair 1).
- Faux-leather (PU-coated woven fabric): Ch.62 normally; Ch.39 only if plastic coating dominates.
- Leather glove with textile cuff: Ch.42 (gloves explicitly 4203 regardless of textile cuff).
- Belt of leather with textile back: Ch.42 4203.30 (leather is wearing surface).

---

## Pair 6 — Ch.54 vs Ch.55: Filament vs Staple man-made fibres

**Pair label:** Man-made FILAMENTS (Ch.54) vs Man-made STAPLE fibres (Ch.55)

Same chemistry (polyester, nylon, viscose, acrylic) — discriminator is form: continuous strands = filament (Ch.54); short cut/discontinuous = staple (Ch.55). Heaviest SME confusion since both are 'synthetic fibre'.

### Discriminating attributes

**1. `form` — HIGH (`cleanly_splits`)**
- Ch.54 values: `filament`, `continuous filament`, `monofilament`, `multifilament`, `filament yarn`, `filament tow >2m`
- Ch.55 values: `staple fibre`, `cut staple`, `discontinuous fibre`, `tow ≤2m`, `carded staple`, `combed staple`, `staple yarn`
- *Why:* Ch.55 Note 1 (5501/5502 apply only to filament tow of length >2m; ≤2m → 5503/5504). Ch.54 Note 2 (filament TOW excluded to Ch.55). `chapter_exclusions` 1976.

**2. `processing_state` — MEDIUM (`partial_signal`)**
- Ch.54 values: spun as continuous filament, extruded continuous
- Ch.55 values: cut from tow, carded, combed, crimped staple
- *Why:* Reinforces form.

**3. `material` — LOW (`partial_signal`)**
- Both chapters: polyester, nylon, polypropylene, viscose, acrylic, acetate (IDENTICAL set)
- *Why:* Material does NOT discriminate within the pair. Useful only to confirm Ch.54/55 vs Ch.50-53 (natural fibres).

**Legal basis:** Ch.54 Note 1 (defines man-made fibres shared), Ch.54 Note 2 (filament tow → Ch.55), Ch.55 Note 1 (2m threshold). `chapter_exclusions` 1976.

### Worked examples
1. *100% polyester staple fibre 1.4 denier x 38mm for spinning* → **55** (form=staple → 5503.20).
2. *Polyester continuous filament yarn (POY) 150 denier for weaving* → **54** (form=filament → 5402.47).
3. *Nylon monofilament 0.5mm for fishing line* → **54** (monofilament → 5404.11).
4. *Acrylic staple fibre raw for blending with cotton* → **55** (form=staple → 5503.30).
5. *Viscose rayon filament tow length 3.5m* → **55** (tow >2m, BUT filament tow explicitly redirects Ch.54 → 5502 in Ch.55).
6. *Polyester filament tow length 1.5m cut* → **55** (tow ≤2m → 5503/5504).

### Edge cases
- Tow boundary at exactly 2m: 'exceeding 2m' means ≤2m goes to Ch.55.
- 'Staple yarn' (yarn from staple) stays Ch.55 (5509/5510/5511) — don't confuse with 'filament yarn' (Ch.54).
- Microfibre filament fabrics: Ch.54 at fibre/yarn level; fabric goes to Ch.55 fabric headings only if from staple.
- Strip / split-film yarn of plastic (5404/5405): in Ch.54 but Note 1 last sentence says strip is NOT 'man-made fibre' for naming purposes.

---

## Pair 7 — Ch.84 vs Ch.87: Industrial machinery vs Vehicles/parts

**Pair label:** Industrial machinery (Ch.84) vs Vehicles and vehicle parts (Ch.87)

Ch.84 covers nuclear reactors, boilers, machinery and mechanical appliances generally (everything not electrical/Ch.85, not vehicles/Ch.87, not optical/Ch.90). Ch.87 covers vehicles (other than rail/tram) and PARTS AND ACCESSORIES of such vehicles. Boundary test: "solely or principally for use with a Ch.87 vehicle?" (Section XVII Note 3). If yes → Ch.87. General-purpose machine → Ch.84.

### Discriminating attributes

**1. `intended_use` — HIGH (`cleanly_splits`)**
- Ch.84 values: `industrial general purpose`, `factory machinery`, `stand-alone machine`, `non-vehicle use`, `agricultural machinery (non-tractor)`, `manufacturing`
- Ch.87 values: `motor vehicle part`, `automotive`, `for vehicles of 8701-8705`, `for two-wheelers`, `vehicle accessory`
- *Why:* Section XVII Note 3 — solely-or-principally-with-vehicle test. The discriminating attribute is intended_use.

**2. `function_` — MEDIUM (`partial_signal`)**
- Ch.84 values: pump, compressor, engine (general), machine tool, boiler, valve, bearing
- Ch.87 values: vehicle body, chassis frame, suspension, brake assembly, transmission gearbox for vehicle, tractor mainframe
- *Why:* Function not decisive on its own. Vehicle engines stay Ch.84 (Section XVII Note 2(e)). Combine with intended_use.

**3. `intended_role` — LOW (`requires_combination`)**
- Ch.84 values: technical_use, general industrial
- Ch.87 values: support (vehicle structural), other (vehicle-specific)
- *Why:* Loosely correlated. Combine with intended_use.

**Legal basis:** Section XVII Note 2 + Note 3; Ch.84 Note 1 exclusions. `chapter_exclusions` 2424-2428 (vehicle-destined items that revert to Ch.84: machines of 8401-8479, valves 8481, bearings 8482, transmission shafts 8483; electric motors 2428 → Ch.85).

### Worked examples
1. *Industrial centrifugal pump 50 HP for chemical plant* → **84** (intended_use=industrial → 8413).
2. *Fuel injection pump for diesel engines of motor vehicles* → **84** (Section XVII Note 2(e); fuel injection pumps explicitly Ch.84 → 8413.30).
3. *Automotive shock absorber assembly for passenger cars* → **87** (intended_use=motor vehicle part → 8708.80).
4. *Tractor (agricultural, 75 HP, 4WD)* → **87** (vehicle proper → 8701).
5. *Tractor power take-off shaft (used solely on agricultural tractors of 8701)* → **87** *(boundary case — if it's an article of heading 8483 (transmission shaft) integral to engine/motor, reverts to Ch.84 per `chapter_exclusions` 2427)*.
6. *Ball bearing 6205 ZZ general industrial* → **84** (8482 always Ch.84 even when vehicle-destined).

### Edge cases
- Vehicle engines: ALWAYS Ch.84 (8407/8408). Section XVII Note 2(e).
- Vehicle radiators: Section XVII Note 2(e) exception — they DO revert to Ch.87 (8708.91), not 8419.
- Bearings (8482), valves (8481), transmission shafts (8483): always Ch.84.
- Filters for industrial use: Ch.84 (8421). Filters solely for motor vehicles: Ch.87 (8708.99).
- Electrical motors/generators (alternators, starter motors): Ch.85 (NOT Ch.87, NOT Ch.84). `chapter_exclusions` 2428.

---

## Pair 8 — Ch.29 vs Ch.30: Bulk API vs Pharma formulation

**Pair label:** Organic chemicals / bulk APIs (Ch.29) vs Pharmaceutical preparations (Ch.30)

Ch.29 covers separate chemically-defined organic compounds (including bulk APIs in powder/granule form). Ch.30 covers pharmaceutical PREPARATIONS — formulated dosage forms (tablets, capsules, ampoules, injections, syrups) and mixed pharmaceutical products. Discriminator is processing_state/form: unformulated bulk → Ch.29; measured doses or retail dosage forms → Ch.30.

### Discriminating attributes

**1. `processing_state` — HIGH (`cleanly_splits`)**
- Ch.29 values: `unformulated`, `bulk powder`, `bulk granular`, `crystalline API`, `industrial intermediate`, `with stabiliser only (Note 1(f))`, `in water (Note 1(d))`
- Ch.30 values: `formulated`, `tableted`, `capsuled`, `in ampoules`, `in vials`, `in measured doses`, `retail-packed`, `mixed preparation`
- *Why:* Ch.29 Note 1(a)-(h) admits only single compounds with controlled minor additions. Once 'put up in measured doses or in forms or packings for retail sale' as a medicament → Ch.30. `chapter_exclusions` 2678, 1727.

**2. `form` — HIGH (`partial_signal`)**
- Ch.29 values: powder, crystalline, granules, bulk solid, bulk liquid
- Ch.30 values: tablet, capsule, ampoule, vial, syrup, ointment, cream, transdermal patch, suppository, injection
- *Why:* Strong proxy for processing_state. Dosage forms = explicit Ch.30.

**3. `intended_use` — MEDIUM (`partial_signal`)**
- Ch.29 values: intermediate for synthesis, API for tablet manufacture, reagent grade, industrial
- Ch.30 values: therapeutic/prophylactic for human use, veterinary medicine, patient administration, OTC retail
- *Why:* Confirms processing_state. 'Paracetamol API powder for tablet manufacture' is Ch.29 (still unformulated) even though end-use is pharma.

**4. `chemical_class` — MEDIUM (`partial_signal`)**
- Ch.29 values: `separate_organic_compound`, `isomer_mixture`, `sugar_derivative`, `diazonium_salt`
- Ch.30 values: `other`
- *Why:* Mirrors Ch.29 Note 1(a)-(h) eligibility. NULL or 'other' → NOT Ch.29.

**Legal basis:** Ch.29 Note 1 (eligible forms), Ch.30 Note 1 (exclusions), Ch.30 Note 3 (unmixed-products definition). `chapter_exclusions` 2678, 1722, 1723, 1727.

### Worked examples
1. *Paracetamol bulk powder 25kg drum 99% pure USP grade* → **29** (unformulated bulk → 2922.29).
2. *Paracetamol 500mg tablets blister pack of 10* → **30** (formulated, measured doses → 3004.90).
3. *Amoxicillin trihydrate API powder bulk 25kg pharma grade* → **29** (bulk separate compound → 2941.10).
4. *Amoxicillin 500mg capsules retail blister pack* → **30** (dosage form → 3004.10).
5. *Ibuprofen sodium salt bulk crystalline 50kg* → **29** (salt is still separate compound → 2916).
6. *Insulin injection 100 IU/ml in 10ml vials retail pack* → **30** (Ch.30 Note 2 + measured doses → 3004.31).

### Edge cases
- Saline solution for IV use: Ch.30 if measured doses; Ch.29 only if bulk NaCl dissolved in water for transport (Note 1(d)). `solution_purpose` attribute (per O2) discriminates.
- Vitamins bulk: Ch.29 separate compound (e.g. ascorbic acid → 2936). Vitamin tablets → Ch.30 (3004).
- Immunological products (monoclonal antibodies, interferons, GFs): Ch.30 always (3002). `chapter_exclusions` 1703.
- Herbal extracts standardised but unmixed: Ch.30 Note 3(a)(3) treats as 'unmixed' for 3003/3004. Boundary depends on 'medicament' vs 'industrial extract' (Ch.13).
- Combination tablets (paracetamol + caffeine): Ch.30 3004 (mixed preparation in measured doses). NEVER Ch.29 (Note 1 admits only single compounds).

---

## Cross-pair observations

- `material` is the strongest discriminator for 3 pairs (42/43, 42/62, 72/80).
- `processing_state` is the strongest for 3 pairs (09/21, 29/30, plus reinforces 54/55).
- `form` is the strongest for 1 pair (54/55) and a strong secondary for 29/30 + 09/21.
- `fabric_construction` is the bright line for 1 pair (61/62) and supporting in 42/62.
- `intended_use` is the strongest for 1 pair (84/87) — the only pair where the boundary is use-based rather than substance-based.
- `predominant_element` (numeric composition output of O2) is needed for 1 pair (72/80) and may be relevant in other metal pairs not in this set.

**No pair lacks a HIGH-confidence discriminator.** No structural gaps in the attribute schema were identified.
