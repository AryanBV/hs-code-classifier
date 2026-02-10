# Ground Truth Fix Review
Date: 2026-02-10
Total test cases analyzed: 553

## Summary
- Valid codes (no change needed): 233
- Invalid codes (to fix): 63 (HIGH: 0, MEDIUM: 63, LOW: 0)
- Missing GT (auto-filled): 55 (HIGH: 12, MEDIUM: 34, LOW: 9)
- LLM-generated cases flagged: 78

## Section 1: Invalid Code Fixes (63 cases)

### Auto-Fix Confidence: MEDIUM (2-3 candidates, one recommended)

| # | Case ID | Product | Old Code | Recommended Code | Rec. Description | Other Candidates |
|---|---------|---------|----------|------------------|------------------|------------------|
| 1 | EC001 | mink fur coat full length | `4303.10.00` | `4303.90.90` | Of mink, whole, with or wit... | `4302.11.00`, `4301.30.00` |
| 2 | EC002 | fox fur stole ladies accessory | `4303.10.00` | `4303.10.90` | Articles of apparel and clo... | `4303.90.90`, `4301.30.00` |
| 3 | EC003 | rabbit pelt jacket with fur | `4303.10.00` | `4303.90.10` | Of lamb, the following : As... | `4303.90.10`, `4303.10.10` |
| 4 | EC004 | genuine leather jacket brown | `4203.10.00` | `4203.10.10` | Jackets and jerseys | `4202.91.00`, `4202.11.90` |
| 5 | EC005 | cowhide leather handbag | `4202.21.00` | `4202.21.10` | Hand-bags for ladies | `4202.29.10`, `4202.22.20` |
| 6 | EC007 | tinplate steel sheets for c... | `7210.12.00` | `7210.11.10` | Plates | `7208.25.10`, `7208.27.10` |
| 7 | EC008 | galvanized steel sheet coils | `7210.49.00` | `7210.49.10` | Galvannealed | `7225.92.10`, `7210.49.10` |
| 8 | EC009 | pure tin ingots 99.9% | `8001.10.00` | `8001.10.90` | Ingots, pigs, slabs and oth... | `8001.10.10`, `8002.00.10` |
| 9 | EC010 | tin foil pure metal wrapping | `8007.00.00` | `8007.00.10` | Ingots, pigs, slabs and oth... | `8002.00.10`, `8001.20.00` |
| 10 | EC011 | tin solder bar lead-free | `8003.00.00` | `8003.00.20` | Bars,other than hollow bars... | `8003.00.10`, `8002.00.10` |
| 11 | EC012 | stainless steel plates flat | `7219.31.00` | `7219.22.12` | Universal plates of stainle... | `7219.22.19`, `7219.22.11` |
| 12 | EC015 | viscose rayon filament thread | `5403.10.00` | `5403.10.20` | Viscose rayon tyre yarn - 1... | `5403.32.00`, `5403.10.10` |
| 13 | EC017 | acrylic staple fiber for sp... | `5503.30.00` | `5503.11.10` | Acrylic or modacrylic | `5501.30.00`, `5509.31.00` |
| 14 | EC018 | viscose staple fiber rayon | `5504.10.00` | `5504.10.11` | Obtained from wood other th... | `5504.10.21`, `5510.20.10` |
| 15 | EC019 | leather coat men's long | `4203.10.00` | `4203.40.20` | Semi-chrome grain garments | `4203.10.10`, `4203.10.90` |
| 16 | EC020 | leather vest motorcycle | `4203.10.00` | `4203.10.10` | Jackets and jerseys | `4203.30.00`, `4203.40.20` |
| 17 | EC021 | leather gloves winter lined | `4203.21.00` | `4203.21.20` | Mittens and mitts | `4203.29.30`, `4203.21.10` |
| 18 | EC022 | wool coat women woven fabric | `6202.11.00` | `6202.20.90` | Other | `6202.20.10`, `6206.20.00` |
| 19 | EC024 | nylon jacket windbreaker woven | `6201.93.00` | `6201.40.10` | Jackets and blazers : -- Of... | `6204.31.90`, `6203.32.00` |
| 20 | EC025 | knitted polo shirt men cotton | `6105.10.00` | `6105.10.10` | Shirts, hand crocheted | `6105.10.90`, `6105.90.90` |
| 21 | EC028 | woven dress shirt formal men | `6205.20.00` | `6205.20.10` | Handloom | `6205.20.90`, `6205.90.90` |
| 22 | EC029 | woven trousers men cotton c... | `6203.42.00` | `6203.42.10` | Trousers, bib and brace ove... | `6203.19.10`, `6203.42.90` |
| 23 | EC030 | woven skirt women linen | `6204.59.00` | `6204.51.00` | Skirts and divided skirts :... | `6204.59.11`, `6204.59.19` |
| 24 | EC031 | roasted coffee ground filter | `0901.21.00` | `0901.11.32` | Rob Parchment: ---- PB Grade | `0901.11.44`, `0901.11.33` |
| 25 | EC032 | coffee beans decaffeinated ... | `0901.22.00` | `0901.11.44` | Rob cherry: ---- B/B/B Grade | `0901.12.00`, `0901.11.42` |
| 26 | EC034 | coffee concentrate cold bre... | `2101.11.00` | `2101.20.20` | Quick brewing black tea | `2101.30.90`, `2101.11.10` |
| 27 | EC035 | espresso capsules nespresso... | `0901.21.00` | `0901.90.10` | Coffee husks and skins | `0901.11.22`, `0901.11.23` |
| 28 | EC036 | diesel engine for truck | `8408.20.00` | `8408.20.20` | Engines of cylinder capacit... | `8408.20.10`, `8408.90.10` |
| 29 | EC037 | hydraulic pump industrial | `8413.60.00` | `8413.81.30` | Axial flow and mixed flow v... | `8413.30.20`, `8413.81.20` |
| 30 | EC038 | air compressor piston type | `8414.40.00` | `8414.40.10` | Other | `8407.33.90`, `8407.31.90` |
| 31 | EC039 | electric motor AC induction... | `8501.52.00` | `8501.52.10` | Squirrel cage induction mot... | `8501.51.10`, `8501.53.10` |
| 32 | EC040 | power transformer 1000KVA | `8504.23.00` | `8504.23.10` | Having a power handling cap... | `8504.23.20`, `8504.34.00` |
| 33 | EC041 | PVC pipe for water supply | `3917.23.00` | `3917.31.00` | Suspension grade PVC resin | `3926.90.10`, `3904.90.10` |
| 34 | EC042 | plastic container food grad... | `3923.30.00` | `3923.30.10` | Polyethylene having a speci... | `3901.10.20`, `3901.10.10` |
| 35 | EC045 | rubber gasket seal O-ring | `4016.93.00` | `4016.93.20` | Rubber ring (O-ring) | `4016.93.30`, `4016.93.40` |
| 36 | TC005 | plastic bumper for Toyota I... | `8708.10.00` | `8708.10.90` | Other | `8708.10.10`, `8704.10.10` |
| 37 | TC010 | windscreen wiper motor 12V ... | `8501.10.00` | `8501.10.13` | DC motor: ----Wiper motor | `8501.31.13`, `8512.40.00` |
| 38 | TC013 | truck tyre 315/80R22.5 radial | `4011.20.00` | `4011.10.10` | Radials | `4011.20.10`, `4012.19.10` |
| 39 | TC014 | inner tube for motorcycle tyre | `4013.90.00` | `4013.90.20` | For motor cycle | `4013.90.50`, `4013.90.41` |
| 40 | TC015 | motorcycle helmet ISI approved | `6506.10.00` | `6506.10.10` | Speed glass welding helmets... | `6506.10.20`, `6506.10.90` |
| 41 | TC101 | arabica coffee beans grade ... | `0901.11.10` | `0901.11.12` | Arabica plantation: ---- B ... | `0901.11.13`, `0901.11.11` |
| 42 | TC103 | roasted coffee beans whole ... | `0901.21.00` | `0901.11.44` | Rob cherry: ---- B/B/B Grade | `0901.11.42`, `0901.11.45` |
| 43 | TC104 | instant coffee powder spray... | `2101.11.00` | `2101.11.10` | Custard powder | `2104.10.10`, `2102.30.00` |
| 44 | TC105 | freeze dried soluble coffee... | `2101.11.00` | `2101.11.20` | Dried | `2106.90.92`, `2104.10.90` |
| 45 | TC106 | coffee extract liquid conce... | `2101.11.00` | `2101.11.10` | Instant coffee, flavoured | `2101.12.00`, `2101.11.20` |
| 46 | TC107 | black pepper whole Malabar ... | `0904.11.00` | `0904.11.40` | Black pepper ungarbled | `0904.11.30`, `0904.11.20` |
| 47 | TC111 | cardamom green whole pods | `0908.31.00` | `0908.31.30` | Small, coorg green | `0908.31.20`, `0908.32.20` |
| 48 | TC112 | cumin seeds whole jeera | `0909.31.00` | `0909.31.21` | Cumin, other than black: --... | `0909.31.11`, `0909.31.29` |
| 49 | TC113 | cinnamon bark quills Ceylon | `0906.11.00` | `0906.11.10` | Cinnamon bark | `0906.11.20`, `0906.11.90` |
| 50 | TC114 | cloves whole dried flower buds | `0907.10.00` | `0907.10.30` | Stem | `0907.10.90`, `0907.10.10` |
| 51 | TC115 | ginger fresh whole root | `0910.11.00` | `0910.11.10` | Fresh | `0910.30.10`, `0910.11.20` |
| 52 | TC116 | ginger dried sliced | `0910.12.00` | `0910.11.20` | Dried, unbleached | `0910.11.30`, `0910.11.10` |
| 53 | TC117 | saffron threads pure Kashmir | `0910.20.00` | `0910.20.20` | Saffron stamen | `0910.20.10`, `0910.20.90` |
| 54 | TC119 | green tea leaves loose | `0902.10.00` | `0902.20.40` | Green Tea waste | `0902.20.10`, `0902.20.20` |
| 55 | TC120 | black tea CTC Assam | `0902.30.00` | `0902.40.20` | Black Tea, leaf in bulk | `0902.40.60`, `0902.40.30` |
| 56 | TC202 | amoxicillin capsules 250mg | `3004.10.00` | `3004.10.30` | Amoxycillin | `3004.10.60`, `3004.10.20` |
| 57 | TC205 | paracetamol powder bulk API | `2924.29.00` | `2924.29.80` | Pipradrol (INN), piritramid... | `2933.33.35`, `2924.29.80` |
| 58 | TC206 | ibuprofen raw material powder | `2918.99.00` | `2918.11.10` | Ibuprofane | `2934.99.30`, `2926.30.00` |
| 59 | TC207 | insulin injection 100IU/ml ... | `3004.31.00` | `3004.31.10` | Insulin injection | `3003.31.00`, `3002.41.14` |
| 60 | TC303 | men's formal cotton shirt w... | `6205.20.00` | `6205.20.10` | Handloom | `6205.20.90`, `6205.90.90` |
| 61 | TC304 | denim jeans men's cotton woven | `6203.42.00` | `6203.19.10` | Of cotton | `6205.20.10`, `6203.32.00` |
| 62 | TC305 | wool sweater knitted pullover | `6110.11.00` | `6110.11.20` | Sweaters and cardigans | `6110.19.00`, `6110.12.00` |
| 63 | TC306 | silk saree woven traditional | `6206.10.00` | `6206.10.10` | of silk:---- Embroidered wi... | `6204.19.12`, `6204.29.13` |

<details>
<summary>Detailed candidates for MEDIUM confidence (63 cases)</summary>

**EC001:** "mink fur coat full length"
- Current: ch=43 heading=4303 code=4303.10.00
- Proposed: ch=43 heading=4303 code=4303.90.90
- Reasoning: 6 candidates in heading 4303. Recommending 4303.90.90 (sim=0.355). Original 4303.10.00 not in DB.
- All candidates:
  - `4301.10.00` Of mink, whole, with or without head, tail or paws (sim: 0.413)
  - `4302.11.00` Whole skins, with or without head, tail or paws, not assembled : -- Of mink (sim: 0.406)
  - `4301.30.00` Of lamb, the following : Astrakhan, Broadtail, Caracul, Persian and similar lamb, Indian, Chinese, Mongolian or Tibetan lamb, whole, with or without head, tail or paws (sim: 0.371)
  - `4304.00.19` Other (sim: 0.358)
  - `4301.60.00` Of fox, whole, with or without head, tail or paws (sim: 0.356)

**EC002:** "fox fur stole ladies accessory"
- Current: ch=43 heading=4303 code=4303.10.00
- Proposed: ch=43 heading=4303 code=4303.10.90
- Reasoning: 6 candidates in heading 4303. Recommending 4303.10.90 (sim=0.338). Original 4303.10.00 not in DB.
- All candidates:
  - `4303.10.90` Articles of apparel and clothing accessories: ---- Other (sim: 0.338)
  - `4303.90.90` Other (sim: 0.331)
  - `4301.30.00` Of lamb, the following : Astrakhan, Broadtail, Caracul, Persian and similar lamb, Indian, Chinese, Mongolian or Tibetan lamb, whole, with or without head, tail or paws (sim: 0.329)
  - `4304.00.11` Artificial fur as trimmings and embellishments for garments, made ups, knitwear, plastic and leather goods (sim: 0.326)
  - `4301.60.00` Of fox, whole, with or without head, tail or paws (sim: 0.325)

**EC003:** "rabbit pelt jacket with fur"
- Current: ch=43 heading=4303 code=4303.10.00
- Proposed: ch=43 heading=4303 code=4303.90.10
- Reasoning: 6 candidates in heading 4303. Recommending 4303.90.10 (sim=0.389). Original 4303.10.00 not in DB.
- All candidates:
  - `4301.30.00` Of lamb, the following : Astrakhan, Broadtail, Caracul, Persian and similar lamb, Indian, Chinese, Mongolian or Tibetan lamb, whole, with or without head, tail or paws (sim: 0.419)
  - `4303.90.10` Of wild animals covered under the Wild Life (Protection) Act,1972 (sim: 0.389)
  - `4303.10.10` Articles of apparel and clothing accessories: ---- Of wild animals covered under the Wild Life (Protection) Act,1972 (sim: 0.388)
  - `4301.60.00` Of fox, whole, with or without head, tail or paws (sim: 0.374)
  - `4301.10.00` Of mink, whole, with or without head, tail or paws (sim: 0.374)

**EC004:** "genuine leather jacket brown"
- Current: ch=42 heading=4203 code=4203.10.00
- Proposed: ch=42 heading=4203 code=4203.10.10
- Reasoning: 11 candidates in heading 4203. Recommending 4203.10.10 (sim=0.363). Original 4203.10.00 not in DB.
- All candidates:
  - `4203.10.10` Jackets and jerseys (sim: 0.363)
  - `4202.91.00` Other : -- With outer surface of leather or of composition leather (sim: 0.353)
  - `4202.11.90` Other (sim: 0.353)
  - `4202.31.90` Other (sim: 0.352)
  - `4202.21.90` Other (sim: 0.351)

**EC005:** "cowhide leather handbag"
- Current: ch=42 heading=4202 code=4202.21.00
- Proposed: ch=42 heading=4202 code=4202.21.10
- Reasoning: 44 candidates in heading 4202. Recommending 4202.21.10 (sim=0.453). Original 4202.21.00 not in DB.
- All candidates:
  - `4202.21.10` Hand-bags for ladies (sim: 0.453)
  - `4202.29.10` Hand bags of other materials excluding wicker-work or basket work (sim: 0.444)
  - `4202.22.20` Hand-bags and shopping bags, of cotton (sim: 0.437)
  - `4202.22.10` Hand-bags and shopping bags, of artificial plastic material (sim: 0.433)
  - `4202.22.30` Hand-bags and shopping bags, of Jute (sim: 0.427)

**EC007:** "tinplate steel sheets for canning"
- Current: ch=72 heading=7210 code=7210.12.00
- Proposed: ch=72 heading=7210 code=7210.11.10
- Reasoning: 17 candidates in heading 7210. Recommending 7210.11.10 (sim=N/A). Original 7210.12.00 not in DB.
- All candidates:
  - `7208.26.10` Plates (sim: 0.444)
  - `7208.25.10` Plates (sim: 0.442)
  - `7208.27.10` Plates (sim: 0.441)
  - `7220.12.22` Strips for pipes and tubes (other than skelp): ---- Nickel chromium austenitic type (sim: 0.440)
  - `7220.11.22` Strips for pipes and tubes (other than skelp): ---- Nickel chromium austenitic type (sim: 0.439)

**EC008:** "galvanized steel sheet coils"
- Current: ch=72 heading=7210 code=7210.49.00
- Proposed: ch=72 heading=7210 code=7210.49.10
- Reasoning: 17 candidates in heading 7210. Recommending 7210.49.10 (sim=0.482). Original 7210.49.00 not in DB.
- All candidates:
  - `7225.91.10` Galvannealed (sim: 0.507)
  - `7225.92.10` Galvannealed (sim: 0.502)
  - `7210.49.10` Galvannealed (sim: 0.482)
  - `7210.30.91` Other:----Galvannealed (sim: 0.477)
  - `7212.20.91` Other:----Galvannealed (sim: 0.475)

**EC009:** "pure tin ingots 99.9%"
- Current: ch=80 heading=8001 code=8001.10.00
- Proposed: ch=80 heading=8001 code=8001.10.90
- Reasoning: 3 candidates in heading 8001. Recommending 8001.10.90 (sim=0.514). Original 8001.10.00 not in DB.
- All candidates:
  - `8001.10.90` Ingots, pigs, slabs and other primary forms of tin (sim: 0.514)
  - `8001.10.10` Blocks (sim: 0.449)
  - `8002.00.10` Tin scrap, namely the following: Block tin covered by ISRI code word Ranch; High tin base babbit covered by ISRI code word Raves; Pewter covered by ISRI code word Ranks. (sim: 0.447)
  - `8001.20.00` Tin alloys (sim: 0.447)
  - `8003.00.20` Bars,other than hollow bars and rods (sim: 0.427)

**EC010:** "tin foil pure metal wrapping"
- Current: ch=80 heading=8007 code=8007.00.00
- Proposed: ch=80 heading=8007 code=8007.00.10
- Reasoning: 2 candidates in heading 8007. Recommending 8007.00.10 (sim=0.292). Original 8007.00.00 not in DB.
- All candidates:
  - `8001.10.90` Ingots, pigs, slabs and other primary forms of tin (sim: 0.317)
  - `8002.00.10` Tin scrap, namely the following: Block tin covered by ISRI code word Ranch; High tin base babbit covered by ISRI code word Raves; Pewter covered by ISRI code word Ranks. (sim: 0.314)
  - `8001.20.00` Tin alloys (sim: 0.309)
  - `8003.00.30` Profiles (sim: 0.304)
  - `8001.10.10` Blocks (sim: 0.304)

**EC011:** "tin solder bar lead-free"
- Current: ch=80 heading=8003 code=8003.00.00
- Proposed: ch=80 heading=8003 code=8003.00.20
- Reasoning: 4 candidates in heading 8003. Recommending 8003.00.20 (sim=0.330). Original 8003.00.00 not in DB.
- All candidates:
  - `8003.00.20` Bars,other than hollow bars and rods (sim: 0.330)
  - `8003.00.10` Hollow bars (sim: 0.322)
  - `8002.00.10` Tin scrap, namely the following: Block tin covered by ISRI code word Ranch; High tin base babbit covered by ISRI code word Raves; Pewter covered by ISRI code word Ranks. (sim: 0.319)
  - `8003.00.30` Profiles (sim: 0.319)
  - `8003.00.40` Wires (sim: 0.314)

**EC012:** "stainless steel plates flat"
- Current: ch=72 heading=7219 code=7219.31.00
- Proposed: ch=72 heading=7219 code=7219.22.12
- Reasoning: 54 candidates in heading 7219. Recommending 7219.22.12 (sim=0.518). Original 7219.31.00 not in DB.
- All candidates:
  - `7219.22.12` Universal plates of stainless steel or heat resisting steel: ---- Nickel chromium austenitic type (sim: 0.518)
  - `7219.22.19` Universal plates of stainless steel or heat resisting steel: ---- Other (sim: 0.513)
  - `7219.22.11` Universal plates of stainless steel or heat resisting steel: ---- Chromium type (sim: 0.506)
  - `7219.21.12` Exceeding 14 mm Universal plates of stainless steel/heat resisting steel, nickel chromium austenitic type: (sim: 0.503)
  - `7219.90.12` Sheets and plates: ---- Thickness 3 mm to 4.75 mm (sim: 0.484)

**EC015:** "viscose rayon filament thread"
- Current: ch=54 heading=5403 code=5403.10.00
- Proposed: ch=54 heading=5403 code=5403.10.20
- Reasoning: 30 candidates in heading 5403. Recommending 5403.10.20 (sim=0.569). Original 5403.10.00 not in DB.
- All candidates:
  - `5403.10.20` Viscose rayon tyre yarn - 1,833 decitex (sim: 0.569)
  - `5403.32.00` Other yarn, single : -- Of viscose rayon, with a twist exceeding 120 turns per metre (sim: 0.567)
  - `5403.10.10` Viscose rayon tyre yarn - 1,233 decitex (sim: 0.566)
  - `5403.31.00` Other yarn, single : -- Of viscose rayon, untwisted or with a twist not exceeding 120 (sim: 0.554)
  - `5403.10.90` Other (sim: 0.533)

**EC017:** "acrylic staple fiber for spinning"
- Current: ch=55 heading=5503 code=5503.30.00
- Proposed: ch=55 heading=5503 code=5503.11.10
- Reasoning: 15 candidates in heading 5503. Recommending 5503.11.10 (sim=N/A). Original 5503.30.00 not in DB.
- All candidates:
  - `5506.30.00` Acrylic or modacrylic (sim: 0.603)
  - `5501.30.00` Acrylic or modacrylic (sim: 0.576)
  - `5509.31.00` Containing 85 percent or more by weight of acrylic or modacrylic staple fibre -- Single yarn (sim: 0.568)
  - `5509.32.00` Containing 85 percent or more by weight of acrylic or modacrylic staple fibre -- Multiple (folded) or cabled yarn (sim: 0.561)
  - `5509.62.00` Other yarn, of acrylic or modacrylic staple fibres : -- Mixed mainly or solely with cotton (sim: 0.556)

**EC018:** "viscose staple fiber rayon"
- Current: ch=55 heading=5504 code=5504.10.00
- Proposed: ch=55 heading=5504 code=5504.10.11
- Reasoning: 9 candidates in heading 5504. Recommending 5504.10.11 (sim=0.608). Original 5504.10.00 not in DB.
- All candidates:
  - `5504.10.11` Obtained from wood other than bamboo: ---- Flame retaradant Viscose Rayon fibre (sim: 0.608)
  - `5504.10.21` Obtained from bamboo: ---- Flame retaradant Viscose Rayon fibre (sim: 0.597)
  - `5510.20.10` Viscose rayon spun yarn (sim: 0.576)
  - `5510.30.10` Viscose rayon spun yarn (sim: 0.573)
  - `5510.12.10` Viscose rayon spun yarn (sim: 0.566)

**EC019:** "leather coat men's long"
- Current: ch=42 heading=4203 code=4203.10.00
- Proposed: ch=42 heading=4203 code=4203.40.20
- Reasoning: 11 candidates in heading 4203. Recommending 4203.40.20 (sim=0.348). Original 4203.10.00 not in DB.
- All candidates:
  - `4203.40.20` Semi-chrome grain garments (sim: 0.348)
  - `4203.10.10` Jackets and jerseys (sim: 0.344)
  - `4203.10.90` Other (sim: 0.330)
  - `4203.40.90` Other (sim: 0.330)
  - `4202.92.00` Other : -- With outer (sim: 0.329)

**EC020:** "leather vest motorcycle"
- Current: ch=42 heading=4203 code=4203.10.00
- Proposed: ch=42 heading=4203 code=4203.10.10
- Reasoning: 11 candidates in heading 4203. Recommending 4203.10.10 (sim=0.347). Original 4203.10.00 not in DB.
- All candidates:
  - `4203.10.10` Jackets and jerseys (sim: 0.347)
  - `4203.30.00` Belts and bandoliers (sim: 0.344)
  - `4203.40.20` Semi-chrome grain garments (sim: 0.339)
  - `4202.11.60` Vanity-cases (sim: 0.326)
  - `4201.00.00` Saddlery and harness for any animal (including traces, leads, knee pads, muzzles, saddle cloths, saddle bags, dog coats and the like), of any material. (sim: 0.325)

**EC021:** "leather gloves winter lined"
- Current: ch=42 heading=4203 code=4203.21.00
- Proposed: ch=42 heading=4203 code=4203.21.20
- Reasoning: 11 candidates in heading 4203. Recommending 4203.21.20 (sim=0.430). Original 4203.21.00 not in DB.
- All candidates:
  - `4203.21.20` Mittens and mitts (sim: 0.430)
  - `4203.29.30` Mittens and mitts (sim: 0.418)
  - `4203.21.10` Gloves (sim: 0.410)
  - `4203.29.20` Other gloves (sim: 0.405)
  - `4203.29.10` Gloves for use in industry (sim: 0.401)

**EC022:** "wool coat women woven fabric"
- Current: ch=62 heading=6202 code=6202.11.00
- Proposed: ch=62 heading=6202 code=6202.20.90
- Reasoning: 8 candidates in heading 6202. Recommending 6202.20.90 (sim=0.502). Original 6202.11.00 not in DB.
- All candidates:
  - `6202.20.90` Other (sim: 0.502)
  - `6202.20.10` Overcoats, raincoats, car-coats, capes, cloaks and similar articles (sim: 0.482)
  - `6206.20.00` Of wool or fine animal hair (sim: 0.481)
  - `6202.40.90` Other (sim: 0.481)
  - `6204.11.00` Suits : -- Of wool or fine animal hair (sim: 0.476)

**EC024:** "nylon jacket windbreaker woven"
- Current: ch=62 heading=6201 code=6201.93.00
- Proposed: ch=62 heading=6201 code=6201.40.10
- Reasoning: 8 candidates in heading 6201. Recommending 6201.40.10 (sim=0.363). Original 6201.93.00 not in DB.
- All candidates:
  - `6203.33.00` Jackets and blazers : -- Of synthetic fibres (sim: 0.374)
  - `6204.31.90` Jackets and blazers: ---- Other (sim: 0.372)
  - `6203.32.00` Jackets and blazers : -- Of cotton (sim: 0.365)
  - `6210.40.10` Bullet proof jacket, bomb disposal jacket and the like (sim: 0.364)
  - `6201.40.10` Overcoats, raincoats, car-coats, capes, cloaks and similar articles (sim: 0.363)

**EC025:** "knitted polo shirt men cotton"
- Current: ch=61 heading=6105 code=6105.10.00
- Proposed: ch=61 heading=6105 code=6105.10.10
- Reasoning: 6 candidates in heading 6105. Recommending 6105.10.10 (sim=0.385). Original 6105.10.00 not in DB.
- All candidates:
  - `6105.10.10` Shirts, hand crocheted (sim: 0.385)
  - `6105.10.90` Other (sim: 0.383)
  - `6105.90.90` Other (sim: 0.361)
  - `6105.90.10` Of silk (sim: 0.358)
  - `6105.20.20` Of artificial fibres (sim: 0.357)

**EC028:** "woven dress shirt formal men"
- Current: ch=62 heading=6205 code=6205.20.00
- Proposed: ch=62 heading=6205 code=6205.20.10
- Reasoning: 9 candidates in heading 6205. Recommending 6205.20.10 (sim=0.479). Original 6205.20.00 not in DB.
- All candidates:
  - `6205.20.10` Handloom (sim: 0.479)
  - `6205.20.90` Other (sim: 0.465)
  - `6205.90.90` Other (sim: 0.457)
  - `6205.90.19` Other (sim: 0.457)
  - `6205.30.90` Other (sim: 0.451)

**EC029:** "woven trousers men cotton chino"
- Current: ch=62 heading=6203 code=6203.42.00
- Proposed: ch=62 heading=6203 code=6203.42.10
- Reasoning: 22 candidates in heading 6203. Recommending 6203.42.10 (sim=0.430). Original 6203.42.00 not in DB.
- All candidates:
  - `6203.42.10` Trousers, bib and brace overalls, breeches and shorts: ---- Handloom (sim: 0.430)
  - `6203.19.10` Of cotton (sim: 0.427)
  - `6203.42.90` Trousers, bib and brace overalls, breeches and shorts: ---- Other (sim: 0.416)
  - `6203.32.00` Jackets and blazers : -- Of cotton (sim: 0.415)
  - `6205.20.10` Handloom (sim: 0.413)

**EC030:** "woven skirt women linen"
- Current: ch=62 heading=6204 code=6204.59.00
- Proposed: ch=62 heading=6204 code=6204.51.00
- Reasoning: 66 candidates in heading 6204. Recommending 6204.51.00 (sim=0.470). Original 6204.59.00 not in DB.
- All candidates:
  - `6204.51.00` Skirts and divided skirts : -- Of wool or fine animal hair (sim: 0.470)
  - `6204.59.11` of silk:---- Embroidered with Lucknow Chikan Craft (sim: 0.463)
  - `6204.59.19` of silk:---- Other (sim: 0.454)
  - `6204.42.20` Handloom (sim: 0.449)
  - `6204.62.10` Handloom (sim: 0.446)

**EC031:** "roasted coffee ground filter"
- Current: ch=09 heading=0901 code=0901.21.00
- Proposed: ch=09 heading=0901 code=0901.11.32
- Reasoning: 28 candidates in heading 0901. Recommending 0901.11.32 (sim=0.413). Original 0901.21.00 not in DB.
- All candidates:
  - `0901.11.32` Rob Parchment: ---- PB Grade (sim: 0.413)
  - `0901.11.44` Rob cherry: ---- B/B/B Grade (sim: 0.410)
  - `0901.11.33` Rob Parchment: ---- C Grade (sim: 0.410)
  - `0901.11.31` Rob Parchment: ---- AB Grade (sim: 0.408)
  - `0901.11.42` Rob cherry: ---- PB Grade (sim: 0.407)

**EC032:** "coffee beans decaffeinated roasted"
- Current: ch=09 heading=0901 code=0901.22.00
- Proposed: ch=09 heading=0901 code=0901.11.44
- Reasoning: 28 candidates in heading 0901. Recommending 0901.11.44 (sim=0.456). Original 0901.22.00 not in DB.
- All candidates:
  - `0901.11.44` Rob cherry: ---- B/B/B Grade (sim: 0.456)
  - `0901.12.00` Coffee, not roasted : --Decaffeinated (sim: 0.456)
  - `0901.11.42` Rob cherry: ---- PB Grade (sim: 0.455)
  - `0901.11.43` Rob cherry: ---- C Grade (sim: 0.451)
  - `0901.11.41` Rob cherry: ---- AB Grade (sim: 0.450)

**EC034:** "coffee concentrate cold brew liquid"
- Current: ch=21 heading=2101 code=2101.11.00
- Proposed: ch=21 heading=2101 code=2101.20.20
- Reasoning: 12 candidates in heading 2101. Recommending 2101.20.20 (sim=0.411). Original 2101.11.00 not in DB.
- All candidates:
  - `2101.20.20` Quick brewing black tea (sim: 0.411)
  - `2101.30.90` Other (sim: 0.387)
  - `2101.11.10` Instant coffee, flavoured (sim: 0.386)
  - `2101.11.20` Instant coffee, not flavoured (sim: 0.385)
  - `2101.12.00` Extracts, essences and concentrates, of coffee, and preparations with a basis of these extracts, essences or concentrates or with a basis of coffee : -- Preparations with a basis of extracts, essences or concentrates or with a basis of coffee (sim: 0.384)

**EC035:** "espresso capsules nespresso compatible"
- Current: ch=09 heading=0901 code=0901.21.00
- Proposed: ch=09 heading=0901 code=0901.90.10
- Reasoning: 28 candidates in heading 0901. Recommending 0901.90.10 (sim=0.304). Original 0901.21.00 not in DB.
- All candidates:
  - `0901.90.10` Coffee husks and skins (sim: 0.304)
  - `0901.11.22` Arabica Cherry: ---- PB Grade (sim: 0.303)
  - `0901.11.23` Arabica Cherry: ---- C Grade (sim: 0.302)
  - `0901.90.90` Other (sim: 0.302)
  - `0901.90.20` Coffee substitutes containing coffee (sim: 0.301)

**EC036:** "diesel engine for truck"
- Current: ch=84 heading=8408 code=8408.20.00
- Proposed: ch=84 heading=8408 code=8408.20.20
- Reasoning: 8 candidates in heading 8408. Recommending 8408.20.20 (sim=0.396). Original 8408.20.00 not in DB.
- All candidates:
  - `8408.20.20` Engines of cylinder capacity exceeding 250 cc (sim: 0.396)
  - `8408.20.10` Of cylinder capacity not exceeding 250 cc (sim: 0.396)
  - `8408.90.10` Stationary engines of cylinder capacity exceeding 50 cc (sim: 0.387)
  - `8408.10.92` Other: ----Of a cylinder capacity exceeding 100 cc but not exceeding 250 cc (sim: 0.386)
  - `8408.10.93` Other: ----Of a cylinder capacity exceeding 250 cc (sim: 0.385)

**EC037:** "hydraulic pump industrial"
- Current: ch=84 heading=8413 code=8413.60.00
- Proposed: ch=84 heading=8413 code=8413.81.30
- Reasoning: 38 candidates in heading 8413. Recommending 8413.81.30 (sim=0.438). Original 8413.60.00 not in DB.
- All candidates:
  - `8413.81.30` Axial flow and mixed flow vertical pump designed primarily for handling water (sim: 0.438)
  - `8413.30.20` Oil pump (sim: 0.434)
  - `8413.81.20` Hydraulic ram (sim: 0.433)
  - `8413.50.21` Primarily designed for handling water: ----Deep tube well turbine pump (sim: 0.433)
  - `8413.70.93` other ----Horizontal self priming pumps (sim: 0.433)

**EC038:** "air compressor piston type"
- Current: ch=84 heading=8414 code=8414.40.00
- Proposed: ch=84 heading=8414 code=8414.40.10
- Reasoning: 34 candidates in heading 8414. Recommending 8414.40.10 (sim=0.358). Original 8414.40.00 not in DB.
- All candidates:
  - `8407.32.90` Other (sim: 0.362)
  - `8407.33.90` Other (sim: 0.360)
  - `8407.31.90` Other (sim: 0.359)
  - `8414.40.10` Reciprocating air compressors (sim: 0.358)
  - `8407.34.90` Other (sim: 0.354)

**EC039:** "electric motor AC induction 5HP"
- Current: ch=85 heading=8501 code=8501.52.00
- Proposed: ch=85 heading=8501 code=8501.52.10
- Reasoning: 46 candidates in heading 8501. Recommending 8501.52.10 (sim=0.518). Original 8501.52.00 not in DB.
- All candidates:
  - `8501.52.10` Squirrel cage induction motor, 3 phase type (sim: 0.518)
  - `8501.51.10` Squirrel cage induction motor 3 phase type (sim: 0.517)
  - `8501.53.10` Squirrel cage induction motor, 3 phase type (sim: 0.516)
  - `8501.40.10` Fractional Horse power motor (sim: 0.473)
  - `8501.53.20` Slipring motor (sim: 0.463)

**EC040:** "power transformer 1000KVA"
- Current: ch=85 heading=8504 code=8504.23.00
- Proposed: ch=85 heading=8504 code=8504.23.10
- Reasoning: 23 candidates in heading 8504. Recommending 8504.23.10 (sim=0.534). Original 8504.23.00 not in DB.
- All candidates:
  - `8504.23.10` Having a power handling capacity exceeding 10000 kVA but not exceeding 50000 kVA (sim: 0.534)
  - `8504.23.20` Having a power handling capacity exceeding 50000 kVA but not exceeding 100000 kVA (sim: 0.530)
  - `8504.34.00` Other transformers : -- Having a power handling capacity exceeding 500 kVA (sim: 0.512)
  - `8504.33.00` Other transformers : -- Having a power handling capacity exceeding 16 kVA but not exceeding 500 kVA (sim: 0.512)
  - `8504.22.00` Liquid dielectric transformers : -- Having a power handling capacity exceeding 650 kVA but not exceeding 10,000 kVA (sim: 0.498)

**EC041:** "PVC pipe for water supply"
- Current: ch=39 heading=3917 code=3917.23.00
- Proposed: ch=39 heading=3917 code=3917.31.00
- Reasoning: 22 candidates in heading 3917. Recommending 3917.31.00 (sim=0.321). Original 3917.23.00 not in DB.
- All candidates:
  - `3904.10.20` Suspension grade PVC resin (sim: 0.363)
  - `3926.90.10` PVC belt conveyor (sim: 0.331)
  - `3904.90.10` Chlorinated poly vinyl chloride (CPVC) resin (sim: 0.326)
  - `3905.12.10` Poly(vinyl acetate) (PVA), moulding material (sim: 0.321)
  - `3917.31.00` Other tubes, pipes and hoses : -- Flexible tubes, pipes and hoses, having a minimum burst pressure of 27.6 Mpa (sim: 0.321)

**EC042:** "plastic container food grade HDPE"
- Current: ch=39 heading=3923 code=3923.30.00
- Proposed: ch=39 heading=3923 code=3923.30.10
- Reasoning: 16 candidates in heading 3923. Recommending 3923.30.10 (sim=0.388). Original 3923.30.00 not in DB.
- All candidates:
  - `3901.20.00` Polyethylene having a specific gravity of 0.94 or more (sim: 0.411)
  - `3901.10.20` Low density polyethylene (LDPE) (sim: 0.410)
  - `3901.10.10` Linear low density polyethylene (LLDPE), in which ethylene monomer unit contributes 95 percent or more by weight of the total polymer content (sim: 0.406)
  - `3925.10.00` Reservoirs, tanks, vats and similar containers, of a capacity exceeding 300 l (sim: 0.404)
  - `3901.40.10` Linear low density polyethylene (LLDPE), in which ethylene monomer unit contributes less than 95 percent by weight of the total polymer content (sim: 0.399)

**EC045:** "rubber gasket seal O-ring"
- Current: ch=40 heading=4016 code=4016.93.00
- Proposed: ch=40 heading=4016 code=4016.93.20
- Reasoning: 22 candidates in heading 4016. Recommending 4016.93.20 (sim=0.531). Original 4016.93.00 not in DB.
- All candidates:
  - `4016.93.20` Rubber ring (O-ring) (sim: 0.531)
  - `4016.93.30` Rubber seals ( Oil seals and the like ) (sim: 0.499)
  - `4016.93.40` Gaskets (sim: 0.476)
  - `4016.93.10` Patches for puncture repair of self-vulcanizing rubber or a rubber backing (sim: 0.475)
  - `4016.93.50` Washers (sim: 0.468)

**TC005:** "plastic bumper for Toyota Innova"
- Current: ch=87 heading=8708 code=8708.10.00
- Proposed: ch=87 heading=8708 code=8708.10.90
- Reasoning: 16 candidates in heading 8708. Recommending 8708.10.90 (sim=0.300). Original 8708.10.00 not in DB.
- All candidates:
  - `8708.10.90` Other (sim: 0.300)
  - `8708.10.10` For tractors (sim: 0.285)
  - `8704.10.10` With net weight (excluding pay-load) exceeding 8 tonnes and maximum pay-load capacity not less than 10 tonnes (sim: 0.235)
  - `8704.10.90` Other (sim: 0.233)
  - `8708.95.00` Other parts and accessories : -- Safety airbags with inflater system; parts thereof (sim: 0.232)

**TC010:** "windscreen wiper motor 12V automotive"
- Current: ch=85 heading=8501 code=8501.10.00
- Proposed: ch=85 heading=8501 code=8501.10.13
- Reasoning: 46 candidates in heading 8501. Recommending 8501.10.13 (sim=0.432). Original 8501.10.00 not in DB.
- All candidates:
  - `8501.10.13` DC motor: ----Wiper motor (sim: 0.432)
  - `8501.31.13` DC motors: ----Wiper motor (sim: 0.410)
  - `8512.40.00` Windscreen wipers, defrosters and demisters (sim: 0.386)
  - `8501.10.11` DC motor: ----Micro motor (sim: 0.367)
  - `8501.52.20` Slipring motor (sim: 0.358)

**TC013:** "truck tyre 315/80R22.5 radial"
- Current: ch=40 heading=4011 code=4011.20.00
- Proposed: ch=40 heading=4011 code=4011.10.10
- Reasoning: 13 candidates in heading 4011. Recommending 4011.10.10 (sim=0.401). Original 4011.20.00 not in DB.
- All candidates:
  - `4011.10.10` Radials (sim: 0.401)
  - `4011.20.10` Radials (sim: 0.396)
  - `4012.19.10` For two wheelers (sim: 0.388)
  - `4012.20.20` For passenger automobile vehicles, including two wheelers, three wheelers and personal type vehicles (sim: 0.379)
  - `4013.90.41` For tractors: ---- Rear tyres (sim: 0.370)

**TC014:** "inner tube for motorcycle tyre"
- Current: ch=40 heading=4013 code=4013.90.00
- Proposed: ch=40 heading=4013 code=4013.90.20
- Reasoning: 10 candidates in heading 4013. Recommending 4013.90.20 (sim=0.455). Original 4013.90.00 not in DB.
- All candidates:
  - `4013.90.20` For motor cycle (sim: 0.455)
  - `4013.90.50` For tractors: ---- Of a kind used in tyres of cycle rickshaws and three-wheeled powered cycle-rickshaws (sim: 0.430)
  - `4013.90.41` For tractors: ---- Rear tyres (sim: 0.429)
  - `4013.10.10` For motor car (sim: 0.425)
  - `4011.50.10` Multi-cellular polyurethane (MCP) tubeless tyre (sim: 0.423)

**TC015:** "motorcycle helmet ISI approved"
- Current: ch=65 heading=6506 code=6506.10.00
- Proposed: ch=65 heading=6506 code=6506.10.10
- Reasoning: 5 candidates in heading 6506. Recommending 6506.10.10 (sim=0.367). Original 6506.10.00 not in DB.
- All candidates:
  - `6506.10.10` Speed glass welding helmets or other helmets meant for industrial use (sim: 0.367)
  - `6506.10.20` Headgear for ballistic protection (sim: 0.361)
  - `6506.10.90` Other (sim: 0.332)
  - `6506.91.00` Other : -- Of rubber or of plastics (sim: 0.292)
  - `6506.99.00` Other : -- Of other materials (sim: 0.291)

**TC101:** "arabica coffee beans grade A plantation"
- Current: ch=09 heading=0901 code=0901.11.10
- Proposed: ch=09 heading=0901 code=0901.11.12
- Reasoning: 28 candidates in heading 0901. Recommending 0901.11.12 (sim=0.443). Original 0901.11.10 not in DB.
- All candidates:
  - `0901.11.12` Arabica plantation: ---- B Grade (sim: 0.443)
  - `0901.11.13` Arabica plantation: ---- C Grade (sim: 0.438)
  - `0901.11.11` Arabica plantation: ---- A Grade (sim: 0.435)
  - `0901.11.24` Arabica Cherry: ---- B/B/B Grade (sim: 0.428)
  - `0901.11.23` Arabica Cherry: ---- C Grade (sim: 0.419)

**TC103:** "roasted coffee beans whole not ground"
- Current: ch=09 heading=0901 code=0901.21.00
- Proposed: ch=09 heading=0901 code=0901.11.44
- Reasoning: 28 candidates in heading 0901. Recommending 0901.11.44 (sim=0.466). Original 0901.21.00 not in DB.
- All candidates:
  - `0901.11.44` Rob cherry: ---- B/B/B Grade (sim: 0.466)
  - `0901.11.42` Rob cherry: ---- PB Grade (sim: 0.463)
  - `0901.11.45` Rob cherry: ---- Bulk (sim: 0.462)
  - `0901.11.32` Rob Parchment: ---- PB Grade (sim: 0.461)
  - `0901.11.43` Rob cherry: ---- C Grade (sim: 0.460)

**TC104:** "instant coffee powder spray dried"
- Current: ch=21 heading=2101 code=2101.11.00
- Proposed: ch=21 heading=2101 code=2101.11.10
- Reasoning: 12 candidates in heading 2101. Recommending 2101.11.10 (sim=0.427). Original 2101.11.00 not in DB.
- All candidates:
  - `2106.90.80` Custard powder (sim: 0.455)
  - `2104.10.10` Dried (sim: 0.437)
  - `2102.30.00` Prepared baking powders (sim: 0.430)
  - `2101.11.10` Instant coffee, flavoured (sim: 0.427)
  - `2101.11.20` Instant coffee, not flavoured (sim: 0.426)

**TC105:** "freeze dried soluble coffee granules"
- Current: ch=21 heading=2101 code=2101.11.00
- Proposed: ch=21 heading=2101 code=2101.11.20
- Reasoning: 12 candidates in heading 2101. Recommending 2101.11.20 (sim=0.384). Original 2101.11.00 not in DB.
- All candidates:
  - `2104.10.10` Dried (sim: 0.438)
  - `2106.90.92` Other: ---- Sterilized or pasteurized millstone (sim: 0.418)
  - `2104.10.90` Other (sim: 0.394)
  - `2104.20.00` Homogenised composite food preparations (sim: 0.392)
  - `2106.10.00` Protein concentrates and textured protein substances (sim: 0.389)

**TC106:** "coffee extract liquid concentrate"
- Current: ch=21 heading=2101 code=2101.11.00
- Proposed: ch=21 heading=2101 code=2101.11.10
- Reasoning: 12 candidates in heading 2101. Recommending 2101.11.10 (sim=0.478). Original 2101.11.00 not in DB.
- All candidates:
  - `2101.11.10` Instant coffee, flavoured (sim: 0.478)
  - `2101.12.00` Extracts, essences and concentrates, of coffee, and preparations with a basis of these extracts, essences or concentrates or with a basis of coffee : -- Preparations with a basis of extracts, essences or concentrates or with a basis of coffee (sim: 0.476)
  - `2101.11.20` Instant coffee, not flavoured (sim: 0.474)
  - `2101.11.90` Other (sim: 0.471)
  - `2101.20.20` Quick brewing black tea (sim: 0.468)

**TC107:** "black pepper whole Malabar grade"
- Current: ch=09 heading=0904 code=0904.11.00
- Proposed: ch=09 heading=0904 code=0904.11.40
- Reasoning: 16 candidates in heading 0904. Recommending 0904.11.40 (sim=0.457). Original 0904.11.00 not in DB.
- All candidates:
  - `0904.11.40` Black pepper ungarbled (sim: 0.457)
  - `0904.11.30` Black pepper, garbled (sim: 0.443)
  - `0904.11.20` Light black pepper (sim: 0.434)
  - `0904.11.60` Pepper pinheads (sim: 0.433)
  - `0904.11.10` Pepper, long (sim: 0.426)

**TC111:** "cardamom green whole pods"
- Current: ch=09 heading=0908 code=0908.31.00
- Proposed: ch=09 heading=0908 code=0908.31.30
- Reasoning: 15 candidates in heading 0908. Recommending 0908.31.30 (sim=0.464). Original 0908.31.00 not in DB.
- All candidates:
  - `0908.31.30` Small, coorg green (sim: 0.464)
  - `0908.31.20` Small (ellettaria),alleppey green (sim: 0.463)
  - `0908.32.20` Small cardamom seeds (sim: 0.449)
  - `0908.32.30` Cardamom husk (sim: 0.442)
  - `0904.11.50` Green pepper, dehydrated (sim: 0.435)

**TC112:** "cumin seeds whole jeera"
- Current: ch=09 heading=0909 code=0909.31.00
- Proposed: ch=09 heading=0909 code=0909.31.21
- Reasoning: 20 candidates in heading 0909. Recommending 0909.31.21 (sim=0.455). Original 0909.31.00 not in DB.
- All candidates:
  - `0909.31.21` Cumin, other than black: ---- Of seed quality (sim: 0.455)
  - `0909.31.11` Cumin, black :---- Of seed quality (sim: 0.449)
  - `0909.31.29` Cumin, other than black: ---- Other (sim: 0.448)
  - `0909.32.00` Seeds of cumin : --Crushed or ground (sim: 0.443)
  - `0909.31.19` Cumin, black :----Other (sim: 0.442)

**TC113:** "cinnamon bark quills Ceylon"
- Current: ch=09 heading=0906 code=0906.11.00
- Proposed: ch=09 heading=0906 code=0906.11.10
- Reasoning: 6 candidates in heading 0906. Recommending 0906.11.10 (sim=0.448). Original 0906.11.00 not in DB.
- All candidates:
  - `0906.11.10` Cinnamon bark (sim: 0.448)
  - `0906.11.20` Cinnamon tree flowers (sim: 0.416)
  - `0906.11.90` Other (sim: 0.413)
  - `0906.19.10` cassia (sim: 0.401)
  - `0906.19.90` other (sim: 0.385)

**TC114:** "cloves whole dried flower buds"
- Current: ch=09 heading=0907 code=0907.10.00
- Proposed: ch=09 heading=0907 code=0907.10.30
- Reasoning: 5 candidates in heading 0907. Recommending 0907.10.30 (sim=0.493). Original 0907.10.00 not in DB.
- All candidates:
  - `0907.10.30` Stem (sim: 0.493)
  - `0907.10.90` Other (sim: 0.490)
  - `0907.10.10` Extracted (sim: 0.476)
  - `0907.10.20` Not Extracted (other than stem) (sim: 0.466)
  - `0907.20.00` Crushed or ground (sim: 0.447)

**TC115:** "ginger fresh whole root"
- Current: ch=09 heading=0910 code=0910.11.00
- Proposed: ch=09 heading=0910 code=0910.11.10
- Reasoning: 29 candidates in heading 0910. Recommending 0910.11.10 (sim=0.376). Original 0910.11.00 not in DB.
- All candidates:
  - `0910.11.10` Fresh (sim: 0.376)
  - `0910.30.10` Fresh (sim: 0.343)
  - `0910.11.20` Dried, unbleached (sim: 0.342)
  - `0910.11.30` Dried, bleached (sim: 0.330)
  - `0910.11.90` Other (sim: 0.329)

**TC116:** "ginger dried sliced"
- Current: ch=09 heading=0910 code=0910.12.00
- Proposed: ch=09 heading=0910 code=0910.11.20
- Reasoning: 29 candidates in heading 0910. Recommending 0910.11.20 (sim=0.375). Original 0910.12.00 not in DB.
- All candidates:
  - `0910.11.20` Dried, unbleached (sim: 0.375)
  - `0910.11.30` Dried, bleached (sim: 0.365)
  - `0910.11.10` Fresh (sim: 0.348)
  - `0910.30.20` Dried (sim: 0.348)
  - `0910.11.90` Other (sim: 0.336)

**TC117:** "saffron threads pure Kashmir"
- Current: ch=09 heading=0910 code=0910.20.00
- Proposed: ch=09 heading=0910 code=0910.20.20
- Reasoning: 29 candidates in heading 0910. Recommending 0910.20.20 (sim=0.330). Original 0910.20.00 not in DB.
- All candidates:
  - `0910.20.20` Saffron stamen (sim: 0.330)
  - `0910.20.10` Saffron stigma (sim: 0.330)
  - `0910.20.90` Other (sim: 0.290)
  - `0910.11.20` Dried, unbleached (sim: 0.281)
  - `0908.31.30` Small, coorg green (sim: 0.281)

**TC119:** "green tea leaves loose"
- Current: ch=09 heading=0902 code=0902.10.00
- Proposed: ch=09 heading=0902 code=0902.20.40
- Reasoning: 20 candidates in heading 0902. Recommending 0902.20.40 (sim=0.448). Original 0902.10.00 not in DB.
- All candidates:
  - `0902.20.40` Green Tea waste (sim: 0.448)
  - `0902.20.10` Green Tea in packets exceeding content 3 kg. but not exceeding 20 kg. (sim: 0.428)
  - `0902.20.20` Green Tea in bulk (sim: 0.421)
  - `0902.20.30` Green Tea agglomerated in forms such as ball, brick and tablets (sim: 0.413)
  - `0902.40.60` Black Tea waste (sim: 0.399)

**TC120:** "black tea CTC Assam"
- Current: ch=09 heading=0902 code=0902.30.00
- Proposed: ch=09 heading=0902 code=0902.40.20
- Reasoning: 20 candidates in heading 0902. Recommending 0902.40.20 (sim=0.421). Original 0902.30.00 not in DB.
- All candidates:
  - `0902.40.20` Black Tea, leaf in bulk (sim: 0.421)
  - `0902.40.60` Black Tea waste (sim: 0.421)
  - `0902.40.30` Black Tea, dust in bulk (sim: 0.417)
  - `0902.40.50` Black Tea, agglomerated in forms such as ball, brick and tablets (sim: 0.414)
  - `0902.30.90` Other (sim: 0.414)

**TC202:** "amoxicillin capsules 250mg"
- Current: ch=30 heading=3004 code=3004.10.00
- Proposed: ch=30 heading=3004 code=3004.10.30
- Reasoning: 141 candidates in heading 3004. Recommending 3004.10.30 (sim=0.405). Original 3004.10.00 not in DB.
- All candidates:
  - `3004.10.30` Amoxycillin (sim: 0.405)
  - `3004.10.60` Ampicillin and Cloxacillin combinations (sim: 0.387)
  - `3004.10.20` Ampicillin (sim: 0.384)
  - `3004.10.50` Cloxacillin (sim: 0.362)
  - `3004.10.40` Becampicillin (sim: 0.357)

**TC205:** "paracetamol powder bulk API"
- Current: ch=29 heading=2924 code=2924.29.00
- Proposed: ch=29 heading=2924 code=2924.29.80
- Reasoning: 21 candidates in heading 2924. Recommending 2924.29.80 (sim=0.446). Original 2924.29.00 not in DB.
- All candidates:
  - `2933.33.32` Pipradrol (INN), piritramide (INN), propiram (INN), remifentanil (INN) and trimeperidine (INN); salts thereof: - - - - Piritramide (INN) and its salt (sim: 0.447)
  - `2933.33.35` Pipradrol (INN), piritramide (INN), propiram (INN), remifentanil (INN) and trimeperidine (INN); salts thereof: - - - - Trimeperidine (INN) and its salt (sim: 0.447)
  - `2924.29.80` Paracetamol (sim: 0.446)
  - `2933.33.33` Pipradrol (INN), piritramide (INN), propiram (INN), remifentanil (INN) and trimeperidine (INN); salts thereof: - - - - Propiram (INN) and its salt (sim: 0.445)
  - `2933.33.31` Pipradrol (INN), piritramide (INN), propiram (INN), remifentanil (INN) and trimeperidine (INN); salts thereof: - - - - Pipradrol (INN) and its salt (sim: 0.444)

**TC206:** "ibuprofen raw material powder"
- Current: ch=29 heading=2918 code=2918.99.00
- Proposed: ch=29 heading=2918 code=2918.11.10
- Reasoning: 48 candidates in heading 2918. Recommending 2918.11.10 (sim=N/A). Original 2918.99.00 not in DB.
- All candidates:
  - `2942.00.12` Ibuprofane (sim: 0.442)
  - `2934.99.30` Buprofezin (ISO) (sim: 0.372)
  - `2926.30.00` Fenproporex (INN) and its salts; methadone (INN) intermediate (4-cyano-2-dimethylamino-4,4- diphenylbutane) (sim: 0.355)
  - `2901.24.00` Unsaturated : -- Buta-1,3-diene and isoprene (sim: 0.333)
  - `2941.90.12` Rifampicin and its salts: ---- 3 Formyl Rifa S V(Rifa int) (sim: 0.333)

**TC207:** "insulin injection 100IU/ml vial"
- Current: ch=30 heading=3004 code=3004.31.00
- Proposed: ch=30 heading=3004 code=3004.31.10
- Reasoning: 141 candidates in heading 3004. Recommending 3004.31.10 (sim=0.432). Original 3004.31.00 not in DB.
- All candidates:
  - `3004.31.10` Insulin injection (sim: 0.432)
  - `3003.31.00` Other, containing hormones or other products of heading 29.37 : -- Containing insulin (sim: 0.327)
  - `3002.41.14` Single vaccines for: - - - - Polio (sim: 0.293)
  - `3002.41.12` Single vaccines for: - - - - Hepatitis (sim: 0.288)
  - `3002.41.17` Single vaccines for: - - - - Japanese encephalitis (sim: 0.284)

**TC303:** "men's formal cotton shirt woven"
- Current: ch=62 heading=6205 code=6205.20.00
- Proposed: ch=62 heading=6205 code=6205.20.10
- Reasoning: 9 candidates in heading 6205. Recommending 6205.20.10 (sim=0.527). Original 6205.20.00 not in DB.
- All candidates:
  - `6205.20.10` Handloom (sim: 0.527)
  - `6205.20.90` Other (sim: 0.517)
  - `6205.90.90` Other (sim: 0.493)
  - `6205.90.19` Other (sim: 0.492)
  - `6205.90.11` Khadi (sim: 0.475)

**TC304:** "denim jeans men's cotton woven"
- Current: ch=62 heading=6203 code=6203.42.00
- Proposed: ch=62 heading=6203 code=6203.19.10
- Reasoning: 22 candidates in heading 6203. Recommending 6203.19.10 (sim=0.387). Original 6203.42.00 not in DB.
- All candidates:
  - `6203.19.10` Of cotton (sim: 0.387)
  - `6205.20.10` Handloom (sim: 0.379)
  - `6203.32.00` Jackets and blazers : -- Of cotton (sim: 0.379)
  - `6205.20.90` Other (sim: 0.374)
  - `6203.22.00` Ensembles : -- Of cotton (sim: 0.371)

**TC305:** "wool sweater knitted pullover"
- Current: ch=61 heading=6110 code=6110.11.00
- Proposed: ch=61 heading=6110 code=6110.11.20
- Reasoning: 9 candidates in heading 6110. Recommending 6110.11.20 (sim=0.395). Original 6110.11.00 not in DB.
- All candidates:
  - `6110.11.20` Sweaters and cardigans (sim: 0.395)
  - `6110.19.00` Of wool or fine animal hair : -- Other (sim: 0.381)
  - `6110.12.00` Of wool or fine animal hair : -- Of Kashmir (cashmere) goats (sim: 0.380)
  - `6106.90.20` Of wool or fine animal hair (sim: 0.367)
  - `6110.11.90` Other (sim: 0.365)

**TC306:** "silk saree woven traditional"
- Current: ch=62 heading=6206 code=6206.10.00
- Proposed: ch=62 heading=6206 code=6206.10.10
- Reasoning: 7 candidates in heading 6206. Recommending 6206.10.10 (sim=0.391). Original 6206.10.00 not in DB.
- All candidates:
  - `6204.59.11` of silk:---- Embroidered with Lucknow Chikan Craft (sim: 0.442)
  - `6204.19.12` Of silk: ---- Embroidered with Lucknow Chikan Craft (sim: 0.434)
  - `6204.29.13` Of silk ---- embroidered with Lucknow Chikan Craft (sim: 0.428)
  - `6211.49.22` of silk: ---- Embroidered with Lucknow Chikan Craft (sim: 0.424)
  - `6204.39.13` Of silk: ---- embroidered with Lucknow Chikan Craft (sim: 0.420)

</details>

## Section 2: Missing GT -- Auto-Filled (55 cases)

### Confidence: HIGH

| # | Case ID | Product | Old Code | New Code | New Description | Reason |
|---|---------|---------|----------|----------|-----------------|--------|
| 1 | S5-AMB-001 | spark plug for car engine i... | `NONE` | `8511.10.00` | Electrical ignition or star... | Proposed heading 8511 (sim=0.419). Proposed cod... |
| 2 | S5-AMB-002 | car windshield laminated sa... | `NONE` | `7007.21.90` | Safety glass, consisting of... | Proposed heading 7007 (sim=0.386). Proposed cod... |
| 3 | S5-AMB-004 | motorcycle helmet protectiv... | `NONE` | `6506.10.20` | Other headgear, whether or ... | Proposed heading 6506 (sim=0.419). Proposed cod... |
| 4 | S5-AUTO-025 | timing belt rubber reinforc... | `NONE` | `4010.11.10` | Conveyor or transmission be... | Proposed heading 4010 (sim=0.357). Proposed cod... |
| 5 | S5-SIMP-002 | fresh red apples Shimla var... | `NONE` | `0808.10.00` | Apples, pears and quinces, ... | Proposed heading 0808 (sim=0.379). Proposed cod... |
| 6 | S5-SIMP-004 | refined white cane sugar cr... | `NONE` | `1701.91.00` | Cane or beet sugar and chem... | Proposed heading 1701 (sim=0.483). Proposed cod... |
| 7 | S5-SIMP-005 | wheat flour all purpose maida | `NONE` | `1101.00.00` | Wheat or meslin flour. | Proposed heading 1101 (sim=0.398). Proposed cod... |
| 8 | S5-SIMP-009 | fresh raw prawns shrimp frozen | `NONE` | `0306.17.50` | Fish fillets and other fish... | Proposed heading 0304 (sim=0.368). Proposed cod... |
| 9 | S5-SIMP-029 | gold necklace 22 karat hall... | `NONE` | `7108.12.10` | Gold (including gold plated... | Proposed heading 7108 (sim=0.423). Proposed cod... |
| 10 | S5-SIMP-033 | rubber gloves industrial he... | `NONE` | `4015.90.30` | Articles of apparel and clo... | Proposed heading 4015 (sim=0.419). Proposed cod... |
| 11 | S5-SIMP-038 | umbrella folding automatic ... | `NONE` | `6601.10.00` | Umbrellas and sun umbrellas... | Proposed heading 6601 (sim=0.350). Proposed cod... |
| 12 | S5-SIMP-039 | wristwatch quartz analog st... | `NONE` | `9101.21.00` | Wrist-watches, pocket-watch... | Proposed heading 9101 (sim=0.414). Proposed cod... |

### Confidence: MEDIUM

| # | Case ID | Product | Old Code | Recommended Code | Rec. Description | Other Candidates |
|---|---------|---------|----------|------------------|------------------|------------------|
| 1 | S5-AMB-003 | rubber floor mat for car in... | `NONE` | `4013` Inner tubes, of rubb | `4012` Retreaded or used pn | `4011` New pneumatic tyres, |
| 2 | S5-AMB-005 | car seat cover leather cust... | `NONE` | `4201` Saddlery and harness | `4202` Trunks, suit-cases,  | `4205` Other articles of le |
| 3 | S5-AMB-006 | vehicle headlight bulb halo... | `NONE` | `8539` ELECTRIC FILAMENT OR | `8512` Electrical lighting  | `8513` Portable electric la |
| 4 | S5-AMB-007 | silicone sealant tube for c... | `NONE` | `3214` Glaziers putty, graf | `3213` Artists, students or | `3210` Other paints and var |
| 5 | S5-AMB-008 | foam mattress memory foam p... | `NONE` | `9404` Mattress supports; a | `9406` Prefabricated buildi | `9403` Other furniture and  |
| 6 | S5-AMB-010 | sports bra lycra elastic wo... | `NONE` | `6104` Womens or girls suit | `6108` Womens or girls slip | `6106` Womens or girls blou |
| 7 | S5-AMB-011 | canvas tote bag cotton shop... | `NONE` | `4202` Trunks, suit-cases,  | `4201` Saddlery and harness | `4206` Articles of gut (oth |
| 8 | S5-AMB-013 | power bank lithium portable... | `NONE` | `8513` Portable electric la | `8506` Primary cells and pr | `8529` PARTS SUITABLE FOR U |
| 9 | S5-AMB-014 | yoga mat PVC exercise fitness | `NONE` | `9506` Articles and equipme | `9503` Tricycles, scooters, | `9504` VIDEO GAME CONSOLES  |
| 10 | S5-AMB-015 | drone with camera quadcopte... | `NONE` | `8806` UNMANNED AIRCRAFT | `8801` Balloons and dirigib | `8802` OTHER AIRCRAFT, EXCE |
| 11 | S5-AUTO-002 | brake drum cast iron for Ta... | `NONE` | `8709` Works trucks, self-p | `8706` Chassis fitted with  | `8707` Bodies (including ca |
| 12 | S5-AUTO-003 | disc brake rotor ventilated... | `NONE` | `8713` Carriages for disabl | `8715` Baby carriages and p | `8702` Motor vehicles for t |
| 13 | S5-AUTO-005 | piston rings chrome plated ... | `NONE` | `8706` Chassis fitted with  | `8709` Works trucks, self-p | `8705` Special purpose moto |
| 14 | S5-AUTO-012 | coil spring suspension fron... | `NONE` | `8705` Special purpose moto | `8716` Trailers and semi-tr | `8709` Works trucks, self-p |
| 15 | S5-AUTO-014 | steering rack assembly hydr... | `NONE` | `8715` Baby carriages and p | `8714` Parts and accessorie | `8713` Carriages for disabl |
| 16 | S5-AUTO-015 | clutch plate friction disc ... | `NONE` | `8709` Works trucks, self-p | `8706` Chassis fitted with  | `8714` Parts and accessorie |
| 17 | S5-AUTO-016 | drive shaft propeller shaft... | `NONE` | `8709` Works trucks, self-p | `8706` Chassis fitted with  | `8701` Tractors (other than |
| 18 | S5-AUTO-020 | oil filter cartridge for pe... | `NONE` | `8408` Compression-ignition | `8409` Parts suitable for u | `8407` Spark-ignition recip |
| 19 | S5-AUTO-021 | motorcycle tyre 120/80-17 t... | `NONE` | `4013` Inner tubes, of rubb | `4011` New pneumatic tyres, | `4012` Retreaded or used pn |
| 20 | S5-AUTO-022 | alternator 12V 100A for car... | `NONE` | `8511` Electrical ignition  | `8502` Electric generating  | `8535` Electrical apparatus |
| 21 | S5-AUTO-023 | starter motor 12V for diese... | `NONE` | `8511` Electrical ignition  | `8501` Electric motors and  | `8502` Electric generating  |
| 22 | S5-SIMP-010 | milk chocolate bar with alm... | `NONE` | `1806` Chocolate and other  | `1801` Cocoa beans, whole o | `1803` Cocoa paste, whether |
| 23 | S5-SIMP-014 | cotton bed sheet queen size... | `NONE` | `6302` Bed linen, table lin | `6303` Curtains (including  | `6308` Sets consisting of w |
| 24 | S5-SIMP-015 | bath towel cotton terry clo... | `NONE` | `6301` Blankets and travell | `6302` Bed linen, table lin | `6308` Sets consisting of w |
| 25 | S5-SIMP-017 | polyester curtains printed ... | `NONE` | `6303` Curtains (including  | `6308` Sets consisting of w | `6302` Bed linen, table lin |
| 26 | S5-SIMP-021 | LED television 55 inch smar... | `NONE` | `8524` FLAT PANEL DISPLAY M | `8539` ELECTRIC FILAMENT OR | `8528` Monitors and project |
| 27 | S5-SIMP-022 | double door refrigerator fr... | `NONE` | `8418` Refrigerators, freez | `8415` Air conditioning mac | `8422` Dish washing machine |
| 28 | S5-SIMP-023 | front load washing machine ... | `NONE` | `8450` Household or laundry | `8451` Machinery (other tha | `8422` Dish washing machine |
| 29 | S5-SIMP-024 | microwave oven convection 2... | `NONE` | `8514` Industrial or labora | `8516` Electric instantaneo | `8540` Thermionic, cold cat |
| 30 | S5-SIMP-025 | split air conditioner 1.5 t... | `NONE` | `8415` Air conditioning mac | `8418` Refrigerators, freez | `8414` AIR OR VACUUM PUMPS, |
| 31 | S5-SIMP-032 | plastic bucket 20 liter wit... | `NONE` | `3924` Tableware, kitchenwa | `3923` Articles for the con | `3922` Baths, shower-baths, |
| 32 | S5-SIMP-034 | polyethylene shopping bags ... | `NONE` | `3923` Articles for the con | `3902` Polymers of propylen | `3907` Polyacetals, other p |
| 33 | S5-SIMP-037 | ballpoint pen blue ink plas... | `NONE` | `9608` Ball point pens; fel | `9612` Typewriter or simila | `9611` Date, sealing or num |
| 34 | S5-SIMP-040 | acoustic guitar wooden 6 st... | `NONE` | `9202` Other string musical | `9207` Musical instruments, | `9208` Musical boxes, fairg |

<details>
<summary>Detailed candidates for MEDIUM confidence (34 cases)</summary>

**S5-AMB-003:** "rubber floor mat for car interior"
- Current: ch=40 heading=NONE code=NONE
- Proposed: ch=40 heading=4013 code=4013.10.10
- Reasoning: Proposed heading 4013 (sim=0.323). Proposed code 4013.10.10 (sim=0.388). Notes: Ch.40 (rubber articles) or Ch.87 (vehicle accessory)
- All candidates:
  - `4013` Inner tubes, of rubber. (sim: 0.323)
  - `4012` Retreaded or used pneumatic tyres of rubber; solid or cushion tyres, tyre treads and tyre flaps, of rubber. (sim: 0.322)
  - `4011` New pneumatic tyres, of rubber. (sim: 0.318)
  - `4017` Hard rubber (for example, ebonite) in all forms, including waste and scrap; articles of hard rubber. (sim: 0.312)
  - `4001` Natural rubber, balata, gutta-percha, guayule, chicle and similar natural gums, in primary forms or in plates, sheets or strip. (sim: 0.309)

**S5-AMB-005:** "car seat cover leather custom fit"
- Current: ch=42 heading=NONE code=NONE
- Proposed: ch=42 heading=4201 code=4201.00.00
- Reasoning: Proposed heading 4201 (sim=0.301). Proposed code 4201.00.00 (sim=0.295). Notes: Ch.42 (leather articles) or Ch.87 (vehicle accessory)
- All candidates:
  - `4201` Saddlery and harness for any animal (including traces, leads, knee pads, muzzles, saddle cloths, saddle bags, dog coats and the like), of any material. (sim: 0.301)
  - `4202` Trunks, suit-cases, vanity-cases, executive-cases, brief- cases, school satchels, spectacle cases, binocular cases, camera cases, musical instrument cases, gun cases, holsters and similar containers; travelling- bags, insulated food or beverages bags, toilet bags, rucksacks, handbags, shopping- bags, wallets, purses, map-cases, cigarette- cases, tobacco- pouches, tool bags, sports bags, bottle- cases, jewellery boxes, powder-boxes, cutlery cases and similar containers, of leather or of composition leather, of sheeting of plastics, of textile materials, of vulcanised fibre or of paperboard, or wholly or mainly covered with such materials or with paper. (sim: 0.287)
  - `4205` Other articles of leather or of composition leather. (sim: 0.268)
  - `4203` Articles of apparel and clothing accessories, of leather or of composition leather. (sim: 0.265)
  - `4206` Articles of gut (other than silk-worm gut), of goldbeaters skin, of bladders or of tendons. (sim: 0.254)

**S5-AMB-006:** "vehicle headlight bulb halogen H4"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8539 code=8539.21.10
- Reasoning: Proposed heading 8539 (sim=0.294). Proposed code 8539.21.10 (sim=0.384). Notes: Ch.85 (electric lamps) or Ch.87 (vehicle parts)
- All candidates:
  - `8539` ELECTRIC FILAMENT OR DISCHARGE LAMPS INCLUDING SEALED BEAM LAMP UNITS AND ULTRAVIOLET OR INFRA-RED LAMPS, ARC- LAMPS; LIGHTEMITTING DIODE (LED) LIGHT SOURCES (sim: 0.294)
  - `8512` Electrical lighting or signalling equipment (excluding articles of heading 85.39), windscreen wipers, defrosters and demisters, of a kind used for cycles or motor vehicles. (sim: 0.262)
  - `8513` Portable electric lamps designed to function by their own source of energy (for example, dry batteries, accumulators, agnetos), other than lighting equipment of heading 85.12. (sim: 0.237)
  - `8538` PARTS SUITABLE FOR USE SOLELY OR PRINCIPALLY WITH THE APPARATUS OF HEADINGS 8535, 8536 OR 8537 (sim: 0.221)
  - `8529` PARTS SUITABLE FOR USE SOLELY OR PRINCIPALLY WITH THE APPARATUS OF HEADINGS 8524 TO 8528 (sim: 0.220)

**S5-AMB-007:** "silicone sealant tube for construction"
- Current: ch=32 heading=NONE code=NONE
- Proposed: ch=32 heading=3214 code=3214.90.10
- Reasoning: Proposed heading 3214 (sim=0.271). Proposed code 3214.90.10 (sim=0.275). Notes: Ch.32 (mastics/putty) or Ch.39 (silicone/plastic)
- All candidates:
  - `3214` Glaziers putty, grafting putty, resin cements, caulking compounds and other mastics; painters fillings; non-refractory surfacing preparations for faades, indoor walls, floors, ceilings or the like. (sim: 0.271)
  - `3213` Artists, students or signboard painters colours, modifying tints, amusement colours and the like, in tablets, tubes, jars, bottles, pans or in similar forms or packings. (sim: 0.173)
  - `3210` Other paints and varnishes (including enamels, lacquers and distempers); prepared water pigments of a kind used for finishing leather. (sim: 0.165)
  - `3209` Paints and varnishes (including enamels and lacquers) based on synthetic polymers or chemically modified natural polymers, dispersed or dissolved in an aqueous medium. (sim: 0.159)
  - `3204` Synthetic organic colouring matter, whether or not chemically defined; preparations as specified in Note 3 to this Chapter based on synthetic organic colouring matter; synthetic organic products of a kind used as fluorescent brightening agents or as luminophores, whether or not chemically defined. (sim: 0.153)

**S5-AMB-008:** "foam mattress memory foam polyurethane"
- Current: ch=94 heading=NONE code=NONE
- Proposed: ch=94 heading=9404 code=9404.29.20
- Reasoning: Proposed heading 9404 (sim=0.318). Proposed code 9404.29.20 (sim=0.366). Notes: Ch.94 (mattresses) or Ch.39 (cellular plastic)
- All candidates:
  - `9404` Mattress supports; articles of bedding and similar furnishing (for example, mattresses, quilts, eiderdowns, cushions, pouffes and pillows) fitted with springs or stuffed or internally fitted with any material or of cellular rubber or plastics, whether or not covered. (sim: 0.318)
  - `9406` Prefabricated buildings. (sim: 0.216)
  - `9403` Other furniture and parts thereof. (sim: 0.199)
  - `9401` Seats (other than those of heading 9402), whether or not convertible into beds, and parts thereof. (sim: 0.198)
  - `9402` Medical, surgical, dental or veterinary furniture (for example, operating tables, examination tables, hospital beds with mechanical fittings, dentists chairs); barbers chairs and similar chairs, having rotating as well as both reclining and elevating movements; parts of the foregoing articles. (sim: 0.156)

**S5-AMB-010:** "sports bra lycra elastic womens fitness"
- Current: ch=61 heading=NONE code=NONE
- Proposed: ch=61 heading=6104 code=6104.43.00
- Reasoning: Proposed heading 6104 (sim=0.252). Proposed code 6104.43.00 (sim=0.259). Notes: Ch.61 (knitted) or Ch.62 (woven) - depends on construction
- All candidates:
  - `6104` Womens or girls suits, ensembles, jackets, blazers, dresses, skirts, divided skirts, trousers, bib and brace overalls, breeches and shorts (other than swimwear), knitted or crocheted. (sim: 0.252)
  - `6108` Womens or girls slips, petticoats, briefs, panties, nightdresses, pyjamas, negligees, bathrobes, dressing gowns and similar articles, knitted or crocheted. (sim: 0.242)
  - `6106` Womens or girls blouses, shirts and shirt-blouses, Womens or girls blouses, shirts and shirt-blouses, knitted or crocheted. (sim: 0.241)
  - `6115` Panty hose, tights, stockings, socks and other hosiery, including graduated compression hosiery (for example, stockings for varicose veins) and footwear without applied soles, knitted or crocheted. (sim: 0.232)
  - `6112` Track suits, ski suits and swimwear, knitted or crocheted. (sim: 0.230)

**S5-AMB-011:** "canvas tote bag cotton shopping reusable"
- Current: ch=42 heading=NONE code=NONE
- Proposed: ch=42 heading=4202 code=4202.22.20
- Reasoning: Proposed heading 4202 (sim=0.257). Proposed code 4202.22.20 (sim=0.359). Notes: Ch.42 (bags) or Ch.63 (textile articles)
- All candidates:
  - `4202` Trunks, suit-cases, vanity-cases, executive-cases, brief- cases, school satchels, spectacle cases, binocular cases, camera cases, musical instrument cases, gun cases, holsters and similar containers; travelling- bags, insulated food or beverages bags, toilet bags, rucksacks, handbags, shopping- bags, wallets, purses, map-cases, cigarette- cases, tobacco- pouches, tool bags, sports bags, bottle- cases, jewellery boxes, powder-boxes, cutlery cases and similar containers, of leather or of composition leather, of sheeting of plastics, of textile materials, of vulcanised fibre or of paperboard, or wholly or mainly covered with such materials or with paper. (sim: 0.257)
  - `4201` Saddlery and harness for any animal (including traces, leads, knee pads, muzzles, saddle cloths, saddle bags, dog coats and the like), of any material. (sim: 0.195)
  - `4206` Articles of gut (other than silk-worm gut), of goldbeaters skin, of bladders or of tendons. (sim: 0.178)
  - `4205` Other articles of leather or of composition leather. (sim: 0.168)
  - `4203` Articles of apparel and clothing accessories, of leather or of composition leather. (sim: 0.165)

**S5-AMB-013:** "power bank lithium portable charger 10000mAh"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8513 code=8513.10.90
- Reasoning: Proposed heading 8513 (sim=0.277). Proposed code 8513.10.90 (sim=0.274). Notes: Ch.85 (accumulators) or Ch.84 (computer accessory)
- All candidates:
  - `8513` Portable electric lamps designed to function by their own source of energy (for example, dry batteries, accumulators, agnetos), other than lighting equipment of heading 85.12. (sim: 0.277)
  - `8506` Primary cells and primary batteries. (sim: 0.255)
  - `8529` PARTS SUITABLE FOR USE SOLELY OR PRINCIPALLY WITH THE APPARATUS OF HEADINGS 8524 TO 8528 (sim: 0.200)
  - `8538` PARTS SUITABLE FOR USE SOLELY OR PRINCIPALLY WITH THE APPARATUS OF HEADINGS 8535, 8536 OR 8537 (sim: 0.196)
  - `8510` Shavers, hair clippers and hair-removing appliances, with selfcontained electric motor. (sim: 0.193)

**S5-AMB-014:** "yoga mat PVC exercise fitness"
- Current: ch=95 heading=NONE code=NONE
- Proposed: ch=95 heading=9506 code=9506.99.20
- Reasoning: Proposed heading 9506 (sim=0.238). Proposed code 9506.99.20 (sim=0.275). Notes: Ch.95 (sports equipment) or Ch.39 (plastic sheet)
- All candidates:
  - `9506` Articles and equipment for general physical exercise, gymnastics, athletics, other sports (including table-tennis) or outdoor games, not specified or included elsewhere in this Chapter; swimming pools and paddling pools. (sim: 0.238)
  - `9503` Tricycles, scooters, pedal cars and similar wheeled toys; dolls carriages; dolls; other toys; reduced-size (scale) models and similar recreational models, working or not; puzzles of all kinds. (sim: 0.176)
  - `9504` VIDEO GAME CONSOLES AND MACHINES, TABLE OR PARLOUR GAMES, INCLUDING PINTABLES, BILLIARDS, SPECIAL TABLES FOR CASINO GAMES AND AUTOMATIC BOWLING EQUIPMENT, AMUSEMENT MACHINES OPERATED BY COINS, BANK NOTES, BANK CARDS, TOKENS OR BY ANY OTHER MEANS OF PAYMENT (sim: 0.152)
  - `9505` Festive, carnival or other entertainment articles, including conjuring tricks and novelty jokes. (sim: 0.133)
  - `9508` TRAVELLING CIRCUSES AND TRAVELLING MENAGERIES; AMUSEMENT PARK RIDES AND WATER PARK AMUSEMENTS; FAIRGROUND AMUSEMENTS, INCLUDING SHOOTING GALLERIES; TRAVELLING THEATRES (sim: 0.115)

**S5-AMB-015:** "drone with camera quadcopter aerial photography"
- Current: ch=88 heading=NONE code=NONE
- Proposed: ch=88 heading=8806 code=8806.22.00
- Reasoning: Proposed heading 8806 (sim=0.237). Proposed code 8806.22.00 (sim=0.283). Notes: Ch.88 (aircraft/UAV) or Ch.85 (electronic device)
- All candidates:
  - `8806` UNMANNED AIRCRAFT (sim: 0.237)
  - `8801` Balloons and dirigibles; gliders, hang gliders and other nonpowered aircraft. (sim: 0.219)
  - `8802` OTHER AIRCRAFT, EXCEPT UNMANNED AIRCRAFT OF HEADING 88.06 (FOR EXAMPLE, HELICOPTERS, AEROPLANES), SPACECRAFT (INCLUDING SATELLITES) AND SUBORBITAL AND SPACECRAFT LAUNCH VEHICLES (sim: 0.218)
  - `8804` Parachutes (including dirigible parachutes and paragliders) and rotochutes; parts thereof and accessories thereto. (sim: 0.212)
  - `8807` PARTS OF GOODS OF HEADING 8801, 8802 OR 8806 (sim: 0.205)

**S5-AUTO-002:** "brake drum cast iron for Tata truck rear axle"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8709 code=8708.30.00
- Reasoning: Proposed heading 8709 (sim=0.263). Proposed code 8708.30.00 (sim=0.341). Notes: GIR 2a: cast iron -> function (brake drum)
- All candidates:
  - `8709` Works trucks, self-propelled, not fitted with lifting or handling equipment, of the type used in factories, warehouses, dock areas or airports for short distance transport of goods; tractors of the type used on railway station platforms; parts of the foregoing vehicles. (sim: 0.263)
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.257)
  - `8707` Bodies (including cabs), for the motor vehicles of headings 87.01 to 87.05. (sim: 0.254)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.252)
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.251)

**S5-AUTO-003:** "disc brake rotor ventilated for passenger car"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8713 code=8708.30.00
- Reasoning: Proposed heading 8713 (sim=0.238). Proposed code 8708.30.00 (sim=0.321). Notes: GIR 2a: steel rotor -> function (brakes)
- All candidates:
  - `8713` Carriages for disabled persons, whether or not motorised or otherwise mechanically propelled. (sim: 0.238)
  - `8715` Baby carriages and parts thereof. (sim: 0.235)
  - `8702` Motor vehicles for the transport of ten or more persons, including the driver. (sim: 0.234)
  - `8703` Motor cars and other motor vehicles principally designed for the transport of persons (other than those of heading 87.02), including station wagons and racing cars. (sim: 0.227)
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.223)

**S5-AUTO-005:** "piston rings chrome plated for diesel engine truck"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8706 code=8706.00.42
- Reasoning: Proposed heading 8706 (sim=0.298). Proposed code 8706.00.42 (sim=0.312). Notes: GIR 2a: metal rings -> function (engine parts)
- All candidates:
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.298)
  - `8709` Works trucks, self-propelled, not fitted with lifting or handling equipment, of the type used in factories, warehouses, dock areas or airports for short distance transport of goods; tractors of the type used on railway station platforms; parts of the foregoing vehicles. (sim: 0.264)
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.240)
  - `8710` Tanks and other armoured fighting vehicles, motorised, whether or not fitted with weapons, and parts of such vehicles. (sim: 0.209)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.208)

**S5-AUTO-012:** "coil spring suspension front for SUV"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8705 code=8705.20.00
- Reasoning: Proposed heading 8705 (sim=0.228). Proposed code 8705.20.00 (sim=0.238). Notes: GIR 2a: steel spring -> function (suspension)
- All candidates:
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.228)
  - `8716` Trailers and semi-trailers; other vehicles, not mechanically (sim: 0.218)
  - `8709` Works trucks, self-propelled, not fitted with lifting or handling equipment, of the type used in factories, warehouses, dock areas or airports for short distance transport of goods; tractors of the type used on railway station platforms; parts of the foregoing vehicles. (sim: 0.215)
  - `8715` Baby carriages and parts thereof. (sim: 0.211)
  - `8704` Motor vehicles for the transport of goods. (sim: 0.209)

**S5-AUTO-014:** "steering rack assembly hydraulic for sedan"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8715 code=8715.00.20
- Reasoning: Proposed heading 8715 (sim=0.266). Proposed code 8715.00.20 (sim=0.273). Notes: GIR 2a: mechanical assembly -> function (steering)
- All candidates:
  - `8715` Baby carriages and parts thereof. (sim: 0.266)
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.253)
  - `8713` Carriages for disabled persons, whether or not motorised or otherwise mechanically propelled. (sim: 0.250)
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.248)
  - `8707` Bodies (including cabs), for the motor vehicles of headings 87.01 to 87.05. (sim: 0.247)

**S5-AUTO-015:** "clutch plate friction disc for Mahindra pickup"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8709 code=8708.93.00
- Reasoning: Proposed heading 8709 (sim=0.240). Proposed code 8708.93.00 (sim=0.322). Notes: GIR 2a: friction material -> function (clutch)
- All candidates:
  - `8709` Works trucks, self-propelled, not fitted with lifting or handling equipment, of the type used in factories, warehouses, dock areas or airports for short distance transport of goods; tractors of the type used on railway station platforms; parts of the foregoing vehicles. (sim: 0.240)
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.221)
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.219)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.218)
  - `8711` Motorcycles (including mopeds) and cycles fitted with an auxiliary motor, with or without side-cars; side-cars. (sim: 0.215)

**S5-AUTO-016:** "drive shaft propeller shaft for truck"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8709 code=8709.90.00
- Reasoning: Proposed heading 8709 (sim=0.305). Proposed code 8709.90.00 (sim=0.311). Notes: GIR 2a: steel shaft -> function (transmission)
- All candidates:
  - `8709` Works trucks, self-propelled, not fitted with lifting or handling equipment, of the type used in factories, warehouses, dock areas or airports for short distance transport of goods; tractors of the type used on railway station platforms; parts of the foregoing vehicles. (sim: 0.305)
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.261)
  - `8701` Tractors (other than tractors of heading 87.09). (sim: 0.257)
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.253)
  - `8704` Motor vehicles for the transport of goods. (sim: 0.250)

**S5-AUTO-020:** "oil filter cartridge for petrol engine car"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8408 code=8421.23.00
- Reasoning: Proposed heading 8408 (sim=0.227). Proposed code 8421.23.00 (sim=0.338). Notes: Exception: Filters have specific heading 8421 in Ch.84
- All candidates:
  - `8408` Compression-ignition internal combustion piston engines (diesel or semi-diesel engines). (sim: 0.227)
  - `8409` Parts suitable for use solely or principally with the engines of (sim: 0.217)
  - `8407` Spark-ignition reciprocating or rotary internal combustion piston engines. (sim: 0.217)
  - `8405` Producer gas or water gas generators, with or without their purifiers; acetylene gas generators and similar water process gas generators, with or without their purifiers. (sim: 0.202)
  - `8421` Centrifuges, including centrifugal dryers; filtering or purifying machinery and apparatus, for liquids or gases. (sim: 0.201)

**S5-AUTO-021:** "motorcycle tyre 120/80-17 tubeless radial"
- Current: ch=40 heading=NONE code=NONE
- Proposed: ch=40 heading=4013 code=4013.90.20
- Reasoning: Proposed heading 4013 (sim=0.327). Proposed code 4013.90.20 (sim=0.379). Notes: Exception: Tyres have specific heading 4011 in Ch.40
- All candidates:
  - `4013` Inner tubes, of rubber. (sim: 0.327)
  - `4011` New pneumatic tyres, of rubber. (sim: 0.324)
  - `4012` Retreaded or used pneumatic tyres of rubber; solid or cushion tyres, tyre treads and tyre flaps, of rubber. (sim: 0.323)
  - `4009` Tubes, pipes and hoses, of vulcanised rubber other than hard rubber, with or without their fittings (for example, joints, elbows, flanges). (sim: 0.282)
  - `4014` Hygienic or pharmaceutical articles (including teats), of vulcanised rubber other than hard rubber, with or without fittings of hard rubber. (sim: 0.267)

**S5-AUTO-022:** "alternator 12V 100A for car engine"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8511 code=8502.13.60
- Reasoning: Proposed heading 8511 (sim=0.299). Proposed code 8502.13.60 (sim=0.371). Notes: Electrical generators -> Ch.85 (specific heading 8511)
- All candidates:
  - `8511` Electrical ignition or starting equipment of a kind used for spark-ignition or compression-ignition internal combustion engines (for example, ignition magnetos, magneto-dynamos, ignition coils, sparking plugs and glow plugs, starter motors); generators (for example, dynamos, alternators) and cut-outs of a kind used in conjunction with such engines. (sim: 0.299)
  - `8502` Electric generating sets and rotary converters. (sim: 0.261)
  - `8535` Electrical apparatus for switching or protecting electrical circuits, or for making connections to or in electrical circuits (for example, switches, fuses, lightning arresters, voltage limiters, surge suppressors, plugs and other connectors, junction boxes), for a voltage exceeding 1,000 volts. (sim: 0.240)
  - `8501` Electric motors and generators (excluding generating sets). (sim: 0.234)
  - `8504` Electrical transformers, static converters (for example, rectifiers) and inductors. (sim: 0.225)

**S5-AUTO-023:** "starter motor 12V for diesel truck"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8511 code=8511.40.00
- Reasoning: Proposed heading 8511 (sim=0.317). Proposed code 8511.40.00 (sim=0.386). Notes: Electric motors -> Ch.85 (specific heading 8511)
- All candidates:
  - `8511` Electrical ignition or starting equipment of a kind used for spark-ignition or compression-ignition internal combustion engines (for example, ignition magnetos, magneto-dynamos, ignition coils, sparking plugs and glow plugs, starter motors); generators (for example, dynamos, alternators) and cut-outs of a kind used in conjunction with such engines. (sim: 0.317)
  - `8501` Electric motors and generators (excluding generating sets). (sim: 0.289)
  - `8502` Electric generating sets and rotary converters. (sim: 0.275)
  - `8509` Electro-mechanical domestic appliances, with self- contained electric motor, other than vacuum cleaners of heading 85.08. (sim: 0.245)
  - `8529` PARTS SUITABLE FOR USE SOLELY OR PRINCIPALLY WITH THE APPARATUS OF HEADINGS 8524 TO 8528 (sim: 0.242)

**S5-SIMP-010:** "milk chocolate bar with almonds"
- Current: ch=18 heading=NONE code=NONE
- Proposed: ch=18 heading=1806 code=1806.31.00
- Reasoning: Proposed heading 1806 (sim=0.340). Proposed code 1806.31.00 (sim=0.400). Notes: Chocolate products Ch.18
- All candidates:
  - `1806` Chocolate and other food preparations containing cocoa. (sim: 0.340)
  - `1801` Cocoa beans, whole or broken, raw or roasted (sim: 0.324)
  - `1803` Cocoa paste, whether or not defatted. (sim: 0.319)
  - `1804` Cocoa butter, fat and oil (sim: 0.295)
  - `1805` Cocoa powder, not containing added sugar or other sweetening matter (sim: 0.287)

**S5-SIMP-014:** "cotton bed sheet queen size white"
- Current: ch=63 heading=NONE code=NONE
- Proposed: ch=63 heading=6302 code=6302.10.10
- Reasoning: Proposed heading 6302 (sim=0.271). Proposed code 6302.10.10 (sim=0.340). Notes: Bed linen Ch.63
- All candidates:
  - `6302` Bed linen, table linen, toilet linen and kitchen linen. (sim: 0.271)
  - `6303` Curtains (including drapes) and interior blinds; curtain or bed valances. (sim: 0.217)
  - `6308` Sets consisting of woven fabric and yarn, whether or not with accessories, for making up into rugs, tapestries, embroidered table cloths or serviettes, or similar textile articles, put up in packings for retail sale. (sim: 0.213)
  - `6301` Blankets and travelling rugs (sim: 0.209)
  - `6306` TARPAULINS, AWNINGS ANDSUNBLINDS; TENTS (INCLUDING TEMPORARY CANOPIES AND SIMILAR ARTICLES); SAILS FOR BOATS, SAILBOARDS OR LANDCRAFT; CAMPING GOODS (sim: 0.179)

**S5-SIMP-015:** "bath towel cotton terry cloth blue"
- Current: ch=63 heading=NONE code=NONE
- Proposed: ch=63 heading=6301 code=6301.30.00
- Reasoning: Proposed heading 6301 (sim=0.270). Proposed code 6301.30.00 (sim=0.324). Notes: Towels Ch.63
- All candidates:
  - `6301` Blankets and travelling rugs (sim: 0.270)
  - `6302` Bed linen, table linen, toilet linen and kitchen linen. (sim: 0.268)
  - `6308` Sets consisting of woven fabric and yarn, whether or not with accessories, for making up into rugs, tapestries, embroidered table cloths or serviettes, or similar textile articles, put up in packings for retail sale. (sim: 0.251)
  - `6303` Curtains (including drapes) and interior blinds; curtain or bed valances. (sim: 0.227)
  - `6306` TARPAULINS, AWNINGS ANDSUNBLINDS; TENTS (INCLUDING TEMPORARY CANOPIES AND SIMILAR ARTICLES); SAILS FOR BOATS, SAILBOARDS OR LANDCRAFT; CAMPING GOODS (sim: 0.226)

**S5-SIMP-017:** "polyester curtains printed home decor"
- Current: ch=63 heading=NONE code=NONE
- Proposed: ch=63 heading=6303 code=6303.99.10
- Reasoning: Proposed heading 6303 (sim=0.277). Proposed code 6303.99.10 (sim=0.306). Notes: Curtains Ch.63
- All candidates:
  - `6303` Curtains (including drapes) and interior blinds; curtain or bed valances. (sim: 0.277)
  - `6308` Sets consisting of woven fabric and yarn, whether or not with accessories, for making up into rugs, tapestries, embroidered table cloths or serviettes, or similar textile articles, put up in packings for retail sale. (sim: 0.229)
  - `6302` Bed linen, table linen, toilet linen and kitchen linen. (sim: 0.212)
  - `6304` Other furnishing articles, excluding those of heading 94.04. (sim: 0.196)
  - `6306` TARPAULINS, AWNINGS ANDSUNBLINDS; TENTS (INCLUDING TEMPORARY CANOPIES AND SIMILAR ARTICLES); SAILS FOR BOATS, SAILBOARDS OR LANDCRAFT; CAMPING GOODS (sim: 0.188)

**S5-SIMP-021:** "LED television 55 inch smart TV 4K"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8524 code=8524.92.90
- Reasoning: Proposed heading 8524 (sim=0.264). Proposed code 8524.92.90 (sim=0.288). Notes: Televisions Ch.85
- All candidates:
  - `8524` FLAT PANEL DISPLAY MODULES, WHETHER OR NOT INCORPORATING TOUCH-SENSITIVE SCREENS (sim: 0.264)
  - `8539` ELECTRIC FILAMENT OR DISCHARGE LAMPS INCLUDING SEALED BEAM LAMP UNITS AND ULTRAVIOLET OR INFRA-RED LAMPS, ARC- LAMPS; LIGHTEMITTING DIODE (LED) LIGHT SOURCES (sim: 0.219)
  - `8528` Monitors and projectors, not incorporating television reception apparatus; reception apparatus for television, whether or not incorporating radio-broadcast receivers or sound or video recording or reproducing apparatus. (sim: 0.209)
  - `8521` Video recording or reproducing apparatus, whether or not incorporating a video tuner. (sim: 0.198)
  - `8525` Transmission apparatus for radio-broadcasting or television, whether or not incorporating reception apparatus or sound recording or reproducing apparatus; television cameras, digital cameras and video camera recorders. (sim: 0.194)

**S5-SIMP-022:** "double door refrigerator frost free 300L"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8418 code=8418.30.90
- Reasoning: Proposed heading 8418 (sim=0.265). Proposed code 8418.30.90 (sim=0.321). Notes: Refrigerators Ch.84
- All candidates:
  - `8418` Refrigerators, freezers and other refrigerating or freezing conditioning machines of heading 84.15. (sim: 0.265)
  - `8415` Air conditioning machines, comprising a motor- driven fan and elements for changing the temperature and humidity, including those machines in which the humidity cannot be separately regulated. (sim: 0.176)
  - `8422` Dish washing machines; machinery for cleaning or drying bottles or other containers; machinery for filling, closing, sealing or labelling bottles, cans, boxes, bags or other containers; machinery for capsuling bottles, jars, tubes and similar containers; other packing or wrapping machinery (including heat-shrink wrapping machinery); machinery for aerating beverages. (sim: 0.160)
  - `8436` Other agricultural, horticultural, forestry, poultry-keeping or bee-keeping machinery, including germination plant fitted with mechanical or thermal equipment; poultry incubators and brooders. (sim: 0.149)
  - `8435` Presses, crushers and similar machinery used in the manufacture of wine, cider, fruit juices or similar beverages. (sim: 0.145)

**S5-SIMP-023:** "front load washing machine automatic 7kg"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8450 code=8450.11.00
- Reasoning: Proposed heading 8450 (sim=0.332). Proposed code 8450.11.00 (sim=0.403). Notes: Washing machines Ch.84
- All candidates:
  - `8450` Household or laundry-type washing machines, including machines which both wash and dry. (sim: 0.332)
  - `8451` Machinery (other than machines of heading 84.50) for washing, cleaning, wringing, drying, ironing, pressing (including fusing presses), bleaching, dyeing, dressing, finishing, coating or impregnating textile yarns, fabrics or made up textile articles and machines for applying the paste to the base fabric or other support used in the manufacture of floor coverings such as linoleum; machines for reeling, unreeling, folding, cutting or pinking textile fabrics. (sim: 0.263)
  - `8422` Dish washing machines; machinery for cleaning or drying bottles or other containers; machinery for filling, closing, sealing or labelling bottles, cans, boxes, bags or other containers; machinery for capsuling bottles, jars, tubes and similar containers; other packing or wrapping machinery (including heat-shrink wrapping machinery); machinery for aerating beverages. (sim: 0.261)
  - `8423` Weighing machinery (excluding balances of a sensitivity of 5 cg or better), including weight operated counting or checking machines; weighing machine weights of all kinds. (sim: 0.251)
  - `8476` Automatic goods-vending machines (for example, postage stamp, cigarette, food or beverage machines), including moneychanging machines. (sim: 0.240)

**S5-SIMP-024:** "microwave oven convection 25 liter stainless"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8514 code=8514.11.00
- Reasoning: Proposed heading 8514 (sim=0.246). Proposed code 8514.11.00 (sim=0.272). Notes: Microwave ovens Ch.85
- All candidates:
  - `8514` Industrial or laboratory electric furnaces and ovens (including those functioning by induction or dielectric loss); other industrial or laboratory equipment for the heat treatment of materials by induction or dielectric loss. (sim: 0.246)
  - `8516` Electric instantaneous or storage water heaters and immersion heaters; electric space heating apparatus and soil heating apparatus; electro- thermic hair-dressing apparatus (for example, hair dryers, hair curlers, curling tong heaters) and hand dryers; electric smoothing irons; other electro- thermic appliances of a kind used for domestic purposes; electric heating resistors, other than those of heading 85.45. (sim: 0.203)
  - `8540` Thermionic, cold cathode or photo-cathode valves and tubes (for example, vacuum or vapour or gas filled valves and tubes, mercury arc rectifying valves and tubes, cathode-ray tubes, television camera tubes). (sim: 0.190)
  - `8518` Microphones and stands therefor; loudspeakers, whether or not mounted in their enclosures; headphones and earphones, whether or not combined with a microphone, and sets consisting of a microphone and one or more loudspeakers; audiofrequency electric amplifiers; electric sound amplifier sets. (sim: 0.189)
  - `8515` Electric (including electrically heated gas), laser or other light or photon beam, ultrasonic, electron beam, magnetic pulse or plasma arc soldering, brazing or welding machines and apparatus, whether or not capable of cutting; electric machines and apparatus for hot spraying of metals or cermets. (sim: 0.182)

**S5-SIMP-025:** "split air conditioner 1.5 ton inverter"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8415 code=8415.81.10
- Reasoning: Proposed heading 8415 (sim=0.278). Proposed code 8415.81.10 (sim=0.372). Notes: Air conditioners Ch.84
- All candidates:
  - `8415` Air conditioning machines, comprising a motor- driven fan and elements for changing the temperature and humidity, including those machines in which the humidity cannot be separately regulated. (sim: 0.278)
  - `8418` Refrigerators, freezers and other refrigerating or freezing conditioning machines of heading 84.15. (sim: 0.219)
  - `8414` AIR OR VACUUM PUMPS, AIR OR OTHER GAS COMPRESSORS AND FANS; VENTILATING OR RECYCLING HOODS INCORPORATING A FAN, WHETHER OR NOT FITTED WITH FILTERS; GAS-TIGHT BIOLOGICAL SAFETY CABINETS, WHETHER OR NOT FITTED WITH FILTERS (sim: 0.192)
  - `8405` Producer gas or water gas generators, with or without their purifiers; acetylene gas generators and similar water process gas generators, with or without their purifiers. (sim: 0.191)
  - `8404` Auxiliary plant for use with boilers of heading 84.02 or 84.03 (for example, economisers, super-heaters, soot removers, gas recoverers); condensers for steam or other vapour power units. (sim: 0.181)

**S5-SIMP-032:** "plastic bucket 20 liter with handle"
- Current: ch=39 heading=NONE code=NONE
- Proposed: ch=39 heading=3924 code=3925.10.00
- Reasoning: Proposed heading 3924 (sim=0.286). Proposed code 3925.10.00 (sim=0.351). Notes: Plastic household articles Ch.39
- All candidates:
  - `3924` Tableware, kitchenware, other household articles and hygienic or toilet articles, of plastics. (sim: 0.286)
  - `3923` Articles for the conveyance or packing of goods, of plastics; stoppers, lids, caps and other closures, of plastics. (sim: 0.281)
  - `3922` Baths, shower-baths, sinks, wash-basins, bidets, lavatory pans, seats and covers, flushing cisterns and similar sanitary ware, of plastics. (sim: 0.272)
  - `3925` Builders ware of plastics, not elsewhere specified or included. (sim: 0.253)
  - `3917` Tubes, pipes and hoses, and fittings therefor (for example, joints, elbows, flanges), of plastics. (sim: 0.244)

**S5-SIMP-034:** "polyethylene shopping bags carry bags"
- Current: ch=39 heading=NONE code=NONE
- Proposed: ch=39 heading=3923 code=3923.21.00
- Reasoning: Proposed heading 3923 (sim=0.270). Proposed code 3923.21.00 (sim=0.377). Notes: Plastic bags Ch.39
- All candidates:
  - `3923` Articles for the conveyance or packing of goods, of plastics; stoppers, lids, caps and other closures, of plastics. (sim: 0.270)
  - `3902` Polymers of propylene or of other olefins, in primary forms. (sim: 0.269)
  - `3907` Polyacetals, other polyethers and epoxide resins, in primary forms; polycarbonates, alkyd resins, polyallyl esters and other polyesters, in primary forms. (sim: 0.257)
  - `3908` Polyamides in primary forms. (sim: 0.253)
  - `3914` Ion-exchangers based on polymers of headings 39.01 to 39.13, in primary forms. (sim: 0.242)

**S5-SIMP-037:** "ballpoint pen blue ink plastic body"
- Current: ch=96 heading=NONE code=NONE
- Proposed: ch=96 heading=9608 code=9608.10.11
- Reasoning: Proposed heading 9608 (sim=0.332). Proposed code 9608.10.11 (sim=0.412). Notes: Writing instruments Ch.96
- All candidates:
  - `9608` Ball point pens; felt tipped and other porous- tipped pens and markers; fountain pens, stylograph pens and other pens; duplicating stylos; propelling or sliding pencils; pen- holders, pencil-holders and similar holders; parts (including caps and clips) of the foregoing articles, other than those of heading 9609. (sim: 0.332)
  - `9612` Typewriter or similar ribbons, inked or otherwise prepared for giving impressions, whether or not on spools or in cartridges; ink- pads, whether or not inked, with or without boxes. (sim: 0.259)
  - `9611` Date, sealing or numbering stamps, and the like (including devices for printing or embossing labels), designed for operating in the hand; hand-operated composing sticks and hand printing sets incorporating such composing sticks. (sim: 0.221)
  - `9609` Pencils (other than pencils of heading 96.08), crayons, pencil leads, pastels, drawing charcoals, writing or drawing chalks and tailors chalks. (sim: 0.196)
  - `9617` Vacuum flasks and other vacuum vessels, complete with cases; parts thereof other than glass inners. (sim: 0.174)

**S5-SIMP-040:** "acoustic guitar wooden 6 string classical"
- Current: ch=92 heading=NONE code=NONE
- Proposed: ch=92 heading=9202 code=9202.10.00
- Reasoning: Proposed heading 9202 (sim=0.309). Proposed code 9202.10.00 (sim=0.316). Notes: Musical instruments Ch.92
- All candidates:
  - `9202` Other string musical instruments (for example, guitars, violins, harps). (sim: 0.309)
  - `9207` Musical instruments, the sound of which is produced, or must be amplified, electrically (for example, organs, guitars, accordions). (sim: 0.289)
  - `9208` Musical boxes, fairground organs, mechanical street organs, mechanical singing birds, musical saws and other musical instruments not falling within any other heading of this Chapter; decoy calls of all kinds; whistles, call horns and other mouthblown sound signalling instruments. (sim: 0.271)
  - `9201` Pianos, including automatic pianos; harpsichords and other keyboard stringed instruments. (sim: 0.270)
  - `9205` Wind musical instruments (for example, keyboard pipe organs, accordions, clarinets, trumpets, bagpipes), other than fairground organs and mechanical street organs. (sim: 0.270)

</details>

### Confidence: LOW (need user decision)

| # | Case ID | Product | Old Code | Candidate 1 | Candidate 2 | Candidate 3 |
|---|---------|---------|----------|-------------|-------------|-------------|
| 1 | S5-AMB-009 | plastic chair stackable gar... | `NONE` | `9402` Medical, surgical, d | `9406` Prefabricated buildi | `9401` Seats (other than th |
| 2 | S5-AMB-012 | USB flash drive 64GB data s... | `NONE` | `8471` Automatic data proce | `8470` Calculating machines | `8486` MACHINES AND APPARAT |
| 3 | S5-AUTO-006 | cylinder head gasket multi-... | `NONE` | `8706` Chassis fitted with  | `8703` Motor cars and other | `8707` Bodies (including ca |
| 4 | S5-AUTO-010 | side mirror assembly with g... | `NONE` | `8707` Bodies (including ca | `8714` Parts and accessorie | `8711` Motorcycles (includi |
| 5 | S5-AUTO-011 | car door handle chrome plat... | `NONE` | `8714` Parts and accessorie | `8708` Parts and accessorie | `8713` Carriages for disabl |
| 6 | S5-AUTO-024 | wiper blade rubber refill f... | `NONE` | `8714` Parts and accessorie | `8705` Special purpose moto | `8716` Trailers and semi-tr |
| 7 | S5-SIMP-019 | laptop computer 15 inch Win... | `NONE` | `8458` Lathes (including tu | `8470` Calculating machines | `8472` Other office machine |
| 8 | S5-SIMP-020 | smartphone Android 6 inch d... | `NONE` | `8517` TELEPHONE SETS, SMAR | `8524` FLAT PANEL DISPLAY M | `8541` SEMICONDUCTOR DEVICE |
| 9 | S5-SIMP-036 | wooden dining table teak 6 ... | `NONE` | `9401` Seats (other than th | `9402` Medical, surgical, d | `9403` Other furniture and  |

<details>
<summary>Detailed candidates for LOW confidence (9 cases)</summary>

**S5-AMB-009:** "plastic chair stackable garden outdoor"
- Current: ch=94 heading=NONE code=NONE
- Proposed: ch=94 heading=9402 code=9402.10.10
- Reasoning: Proposed heading 9402 (sim=0.201). Proposed code 9402.10.10 (sim=0.229). Notes: Ch.94 (furniture) or Ch.39 (plastic articles)
- All candidates:
  - `9402` Medical, surgical, dental or veterinary furniture (for example, operating tables, examination tables, hospital beds with mechanical fittings, dentists chairs); barbers chairs and similar chairs, having rotating as well as both reclining and elevating movements; parts of the foregoing articles. (sim: 0.201)
  - `9406` Prefabricated buildings. (sim: 0.195)
  - `9401` Seats (other than those of heading 9402), whether or not convertible into beds, and parts thereof. (sim: 0.189)
  - `9403` Other furniture and parts thereof. (sim: 0.176)
  - `9404` Mattress supports; articles of bedding and similar furnishing (for example, mattresses, quilts, eiderdowns, cushions, pouffes and pillows) fitted with springs or stuffed or internally fitted with any material or of cellular rubber or plastics, whether or not covered. (sim: 0.171)

**S5-AMB-012:** "USB flash drive 64GB data storage"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8471 code=8471.70.20
- Reasoning: Proposed heading 8471 (sim=0.135). Proposed code 8471.70.20 (sim=0.232). Notes: Ch.84 (computer storage) or Ch.85 (electronic)
- All candidates:
  - `8471` Automatic data processing machines and units thereof; magnetic or optical readers, machines for transcribing data onto data media in coded form and machines for processing such data, not elsewhere specified or included. (sim: 0.135)
  - `8470` Calculating machines and pocket-size data recording, reproducing and displaying machines with calculating functions; accounting machines, postage-franking machines, ticket-issuing machines and similar machines, incorporating a calculating device; cash registers. (sim: 0.123)
  - `8486` MACHINES AND APPARATUS OF A KIND USED SOLELY SEMICONDUCTOR BOULES OR WAFERS, SEMICONDUCTOR DEVICES, ELECTRONIC INTEGRATED CIRCUITS OR FLAT PANEL DISPLAYS; MACHINES AND APPARATUS SPECIFIED IN NOTE 11(C) TO THIS CHAPTER; PARTS AND ACCESSORIES (sim: 0.103)
  - `8466` Parts and accessories suitable for use solely or principally with the machines of headings 84.56 to 84.65, including work or tool holders, self-opening dieheads, dividing heads and other special attachments for the machines; tool holders for any type of tool for working in the hand. (sim: 0.098)
  - `8408` Compression-ignition internal combustion piston engines (diesel or semi-diesel engines). (sim: 0.097)

**S5-AUTO-006:** "cylinder head gasket multi-layer steel for car engine"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8706 code=8706.00.42
- Reasoning: Proposed heading 8706 (sim=0.200). Proposed code 8706.00.42 (sim=0.217). Notes: GIR 2a: gasket -> function (engine seal)
- All candidates:
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.200)
  - `8703` Motor cars and other motor vehicles principally designed for the transport of persons (other than those of heading 87.02), including station wagons and racing cars. (sim: 0.151)
  - `8707` Bodies (including cabs), for the motor vehicles of headings 87.01 to 87.05. (sim: 0.151)
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.149)
  - `8701` Tractors (other than tractors of heading 87.09). (sim: 0.137)

**S5-AUTO-010:** "side mirror assembly with glass for Hyundai i20"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8707 code=8708.22.00
- Reasoning: Proposed heading 8707 (sim=0.175). Proposed code 8708.22.00 (sim=0.290). Notes: GIR 2a: glass/plastic -> function (vehicle accessory)
- All candidates:
  - `8707` Bodies (including cabs), for the motor vehicles of headings 87.01 to 87.05. (sim: 0.175)
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.165)
  - `8711` Motorcycles (including mopeds) and cycles fitted with an auxiliary motor, with or without side-cars; side-cars. (sim: 0.165)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.160)
  - `8715` Baby carriages and parts thereof. (sim: 0.148)

**S5-AUTO-011:** "car door handle chrome plated exterior"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8714 code=8714.92.90
- Reasoning: Proposed heading 8714 (sim=0.187). Proposed code 8714.92.90 (sim=0.209). Notes: GIR 2a: metal -> function (door parts)
- All candidates:
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.187)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.181)
  - `8713` Carriages for disabled persons, whether or not motorised or otherwise mechanically propelled. (sim: 0.168)
  - `8707` Bodies (including cabs), for the motor vehicles of headings 87.01 to 87.05. (sim: 0.160)
  - `8706` Chassis fitted with engines, for the motor vehicles of headings 87.01 to 87.05. (sim: 0.156)

**S5-AUTO-024:** "wiper blade rubber refill for SUV windshield"
- Current: ch=87 heading=NONE code=NONE
- Proposed: ch=87 heading=8714 code=8714.92.90
- Reasoning: Proposed heading 8714 (sim=0.183). Proposed code 8714.92.90 (sim=0.234). Notes: GIR 2a: rubber -> function (vehicle accessory)
- All candidates:
  - `8714` Parts and accessories of vehicles of headings 87.11 to 87.13. (sim: 0.183)
  - `8705` Special purpose motor vehicles, other than those principally designed for the transport of persons or goods (for example, breakdown lorries, crane lorries, fire fighting vehicles, concretemixer lorries, road sweeper lorries, spraying lorries, mobile workshops, mobile radiological units). (sim: 0.178)
  - `8716` Trailers and semi-trailers; other vehicles, not mechanically (sim: 0.177)
  - `8708` Parts and accessories of the motor vehicles of headings 87.01 to 87.05. (sim: 0.172)
  - `8711` Motorcycles (including mopeds) and cycles fitted with an auxiliary motor, with or without side-cars; side-cars. (sim: 0.159)

**S5-SIMP-019:** "laptop computer 15 inch Windows Intel i5"
- Current: ch=84 heading=NONE code=NONE
- Proposed: ch=84 heading=8458 code=8471.30.10
- Reasoning: Proposed heading 8458 (sim=0.161). Proposed code 8471.30.10 (sim=0.232). Notes: Computers Ch.84
- All candidates:
  - `8458` Lathes (including turning centres) for removing metal. (sim: 0.161)
  - `8470` Calculating machines and pocket-size data recording, reproducing and displaying machines with calculating functions; accounting machines, postage-franking machines, ticket-issuing machines and similar machines, incorporating a calculating device; cash registers. (sim: 0.156)
  - `8472` Other office machines (for example, hectograph or stencil duplicating machines, addressing machines, automatic banknote dispensers, coin-sorting machines, coin- counting or wrapping machines, pencil- sharpening machines, perforating or stapling machines). (sim: 0.150)
  - `8457` Machining centres, unit construction machines (single station) and multi-station transfer machines, for working metal. (sim: 0.145)
  - `8486` MACHINES AND APPARATUS OF A KIND USED SOLELY SEMICONDUCTOR BOULES OR WAFERS, SEMICONDUCTOR DEVICES, ELECTRONIC INTEGRATED CIRCUITS OR FLAT PANEL DISPLAYS; MACHINES AND APPARATUS SPECIFIED IN NOTE 11(C) TO THIS CHAPTER; PARTS AND ACCESSORIES (sim: 0.145)

**S5-SIMP-020:** "smartphone Android 6 inch display 5G"
- Current: ch=85 heading=NONE code=NONE
- Proposed: ch=85 heading=8517 code=8517.13.00
- Reasoning: Proposed heading 8517 (sim=0.197). Proposed code 8517.13.00 (sim=0.250). Notes: Telephones Ch.85
- All candidates:
  - `8517` TELEPHONE SETS, SMARTPHONES AND OTHER TELEPHONES FOR CELLULAR NETWORKS OR FOR OTHER WIRELESS N ETWO R KS : O THE R APPARAT US F OR THE TRANSMISSION OR RECEPTION OF VICE, IMAGES OR O T HE R D ATA , IN CL U DI NG A P PA RAT US FOR COMMUNICATION IN A WIRED OR WIRELESS NETWORK (SUCH AS A LOCAL OR WIDE AREA NETWORK), OTHER THAN TRANSMISSION OR RECEPTION APPARATUS OF HEADING 8443, 8525, 8527 OR (sim: 0.197)
  - `8524` FLAT PANEL DISPLAY MODULES, WHETHER OR NOT INCORPORATING TOUCH-SENSITIVE SCREENS (sim: 0.162)
  - `8541` SEMICONDUCTOR DEVICES (FOR EXAMPLE, DIODES, TRANSISTORS, SEMICONDUCTOR- BASED TRANSDUCERS); PHOTOSENSITIVE SEMICONDUCTOR, DEVICES, INCLUDING PHOTOVOLTAIC CELLS WHETHER OR NOT ASSEMBLED IN MODULES OR MADE UP INTO PANELS; LIGHT-EMITTING DIODES (LED), WHETHER OR NOT ASSEMBLED WITH OTHER LIGHT-EMITTING DIODES (LED); MOUNTED PIEZO-ELECTRIC CRYSTALS (sim: 0.125)
  - `8518` Microphones and stands therefor; loudspeakers, whether or not mounted in their enclosures; headphones and earphones, whether or not combined with a microphone, and sets consisting of a microphone and one or more loudspeakers; audiofrequency electric amplifiers; electric sound amplifier sets. (sim: 0.100)
  - `8506` Primary cells and primary batteries. (sim: 0.093)

**S5-SIMP-036:** "wooden dining table teak 6 seater"
- Current: ch=94 heading=NONE code=NONE
- Proposed: ch=94 heading=9401 code=9401.41.00
- Reasoning: Proposed heading 9401 (sim=0.214). Proposed code 9401.41.00 (sim=0.275). Notes: Furniture Ch.94
- All candidates:
  - `9401` Seats (other than those of heading 9402), whether or not convertible into beds, and parts thereof. (sim: 0.214)
  - `9402` Medical, surgical, dental or veterinary furniture (for example, operating tables, examination tables, hospital beds with mechanical fittings, dentists chairs); barbers chairs and similar chairs, having rotating as well as both reclining and elevating movements; parts of the foregoing articles. (sim: 0.195)
  - `9403` Other furniture and parts thereof. (sim: 0.186)
  - `9406` Prefabricated buildings. (sim: 0.183)
  - `9405` LUMINAIRES AND LIGHTING FITTINGS INCLUDING SEARCHLIGHTS AND SPOTLIGHTS AND PARTS THEREOF, NOT ELSEWHERE SPECIFIED OR INCLUDED; ILLUMINATED SIGNS, ILLUMINATED NAME-PLATES AND THE LIKE, HAVING A PERMANENTLY FIXED LIGHT SOURCE, AND PARTS THEREOF NOT ELSEWHERE SPECIFIED OR INCLUDED (sim: 0.143)

</details>

## Section 3: LLM-Generated Cases (78 flagged)

| # | Case ID | Product | Source | Code | Code in DB? | Issue |
|---|---------|---------|--------|------|-------------|-------|
| 1 | LLM021 | Fly ash, for cement manufacturing | LLM-generated (GPT-4o) | `2621.90.00` | Yes | Inconsistent fields |
| 2 | LLM061 | forged steel flanges, for pipeli... | LLM-generated (GPT-4o) | `7307.21.00` | Yes | Inconsistent fields |
| 3 | LLM076 | carbon steel welding electrodes ... | LLM-generated (GPT-4o) | `8311.10.00` | Yes | Inconsistent fields |
| 4 | LLM105 | electric motors for industrial use | LLM-generated (GPT-4o) | `8501.52.10` | Yes | Inconsistent fields |
| 5 | LLM122 | Video game consoles HDMI output | LLM-generated (GPT-4o) | `9504.50.00` | Yes | Inconsistent fields |
| 6 | LLM144 | canned sardines in oil, from Kerala | LLM-generated (GPT-4o) | `1604.13.10` | Yes | Inconsistent fields |
| 7 | LLM001 | basmati rice 1121 sella parboile... | LLM-generated (GPT-4o) | `1006.30.00` | **No** | Code not in DB |
| 8 | LLM004 | non-basmati rice IR64 50kg sacks | LLM-generated (GPT-4o) | `1006.30.90` | **No** | Code not in DB |
| 9 | LLM007 | rice flour for export | LLM-generated (GPT-4o) | `1102.90.00` | **No** | Code not in DB |
| 10 | LLM009 | parboiled rice from Andhra Pradesh | LLM-generated (GPT-4o) | `1006.30.00` | **No** | Code not in DB |
| 11 | LLM017 | Bentonite clay, activated, Gujar... | LLM-generated (GPT-4o) | `2508.10.11` | **No** | Code not in DB |
| 12 | LLM025 | PVC pipes for water supply 6m le... | LLM-generated (GPT-4o) | `3917.23.00` | **No** | Code not in DB |
| 13 | LLM026 | acrylic sheets transparent 4mm t... | LLM-generated (GPT-4o) | `3920.51.00` | **No** | Code not in DB |
| 14 | LLM027 | polycarbonate sheets UV resistant | LLM-generated (GPT-4o) | `3920.61.00` | **No** | Code not in DB |
| 15 | LLM029 | nylon fishing nets Kerala | LLM-generated (GPT-4o) | `3926.90.90` | **No** | Code not in DB |
| 16 | LLM033 | PET preforms for bottle manufact... | LLM-generated (GPT-4o) | `3907.60.00` | **No** | Code not in DB |
| 17 | LLM036 | dyed cotton twill fabric 200 gsm... | LLM-generated (GPT-4o) | `5209.31.00` | **No** | Code not in DB |
| 18 | LLM038 | printed cotton voile fabric 58 i... | LLM-generated (GPT-4o) | `5210.31.00` | **No** | Code not in DB |
| 19 | LLM039 | cotton poplin fabric mercerized ... | LLM-generated (GPT-4o) | `5209.22.00` | **No** | Code not in DB |
| 20 | LLM040 | bleached cotton cambric fabric 1... | LLM-generated (GPT-4o) | `5208.21.00` | **No** | Code not in DB |
| 21 | LLM041 | cotton sateen fabric printed 240... | LLM-generated (GPT-4o) | `5209.51.00` | **No** | Code not in DB |
| 22 | LLM042 | cotton canvas fabric unbleached ... | LLM-generated (GPT-4o) | `5209.12.00` | **No** | Code not in DB |
| 23 | LLM043 | cotton muslin fabric dyed 90 gsm... | LLM-generated (GPT-4o) | `5208.52.00` | **No** | Code not in DB |
| 24 | LLM044 | cotton herringbone fabric double... | LLM-generated (GPT-4o) | `5209.29.00` | **No** | Code not in DB |
| 25 | LLM045 | cotton drill fabric 3/1 twill 31... | LLM-generated (GPT-4o) | `5209.32.00` | **No** | Code not in DB |
| 26 | LLM046 | cotton jacquard fabric bleached ... | LLM-generated (GPT-4o) | `5210.21.00` | **No** | Code not in DB |
| 27 | LLM048 | silver anklets from Tamil Nadu | LLM-generated (GPT-4o) | `7113.11.30` | **No** | Code not in DB |
| 28 | LLM049 | unwrought gold bars 99.99% purity | LLM-generated (GPT-4o) | `7108.12.00` | **No** | Code not in DB |
| 29 | LLM053 | platinum earrings with emerald i... | LLM-generated (GPT-4o) | `7113.19.10` | **No** | Code not in DB |
| 30 | LLM054 | rough emeralds mined in Karnataka | LLM-generated (GPT-4o) | `7103.91.00` | **No** | Code not in DB |
| 31 | LLM055 | silver dinner set from Jaipur | LLM-generated (GPT-4o) | `7114.11.00` | **No** | Code not in DB |
| 32 | LLM056 | synthetic gemstones for jewelry | LLM-generated (GPT-4o) | `7104.90.00` | **No** | Code not in DB |
| 33 | LLM057 | gold plated bangles with cubic z... | LLM-generated (GPT-4o) | `7113.19.50` | **No** | Code not in DB |
| 34 | LLM059 | hot rolled steel coils from Guja... | LLM-generated (GPT-4o) | `7208.39.00` | **No** | Code not in DB |
| 35 | LLM060 | cold rolled stainless steel shee... | LLM-generated (GPT-4o) | `7219.32.00` | **No** | Code not in DB |
| 36 | LLM062 | galvanized steel wire, 0.5mm dia... | LLM-generated (GPT-4o) | `7217.20.90` | **No** | Code not in DB |
| 37 | LLM064 | stainless steel scrap, 316 grade... | LLM-generated (GPT-4o) | `7204.21.00` | **No** | Code not in DB |
| 38 | LLM066 | carbon steel wire rods, 5.5mm, T... | LLM-generated (GPT-4o) | `7213.91.00` | **No** | Code not in DB |
| 39 | LLM067 | corrugated galvanized steel roof... | LLM-generated (GPT-4o) | `7210.49.00` | **No** | Code not in DB |
| 40 | LLM074 | iron wire nails 2 inch Tamil Nadu | LLM-generated (GPT-4o) | `7317.00.10` | **No** | Code not in DB |
| 41 | LLM079 | copper wire rod 8mm from Gujarat | LLM-generated (GPT-4o) | `7408.11.00` | **No** | Code not in DB |
| 42 | LLM083 | copper rods for electrical wiring | LLM-generated (GPT-4o) | `7407.10.00` | **No** | Code not in DB |
| 43 | LLM089 | aluminium foil kitchen use Kerala | LLM-generated (GPT-4o) | `7607.11.00` | **No** | Code not in DB |
| 44 | LLM098 | centrifugal water pump for agric... | LLM-generated (GPT-4o) | `8413.70.20` | **No** | Code not in DB |
| 45 | LLM100 | steam turbines for power generation | LLM-generated (GPT-4o) | `8406.81.10` | **No** | Code not in DB |
| 46 | LLM101 | industrial air compressors Tamil... | LLM-generated (GPT-4o) | `8414.80.22` | **No** | Code not in DB |
| 47 | LLM103 | wastewater treatment machinery G... | LLM-generated (GPT-4o) | `8421.21.00` | **No** | Code not in DB |
| 48 | LLM104 | automatic chapati making machines | LLM-generated (GPT-4o) | `8438.10.00` | **No** | Code not in DB |
| 49 | LLM108 | irrigation sprinkler systems Tam... | LLM-generated (GPT-4o) | `8424.81.00` | **No** | Code not in DB |
| 50 | LLM110 | LED light bulbs 9W made in Gujarat | LLM-generated (GPT-4o) | `8539.50.00` | **No** | Code not in DB |
| 51 | LLM113 | Solar panels 300W polycrystalline | LLM-generated (GPT-4o) | `8541.40.11` | **No** | Code not in DB |
| 52 | LLM114 | Smart TV 55 inch LED screen | LLM-generated (GPT-4o) | `8528.72.00` | **No** | Code not in DB |
| 53 | LLM119 | Home automation systems wireless | LLM-generated (GPT-4o) | `8537.10.00` | **No** | Code not in DB |
| 54 | LLM120 | Bluetooth headphones over-ear de... | LLM-generated (GPT-4o) | `8518.30.00` | **No** | Code not in DB |
| 55 | LLM124 | Rechargeable LED torches handheld | LLM-generated (GPT-4o) | `8513.10.00` | **No** | Code not in DB |
| 56 | LLM125 | ophthalmic lenses plastic high-i... | LLM-generated (GPT-4o) | `9001.40.00` | **No** | Code not in DB |
| 57 | LLM128 | blood pressure monitor digital w... | LLM-generated (GPT-4o) | `9018.90.20` | **No** | Code not in DB |
| 58 | LLM130 | hearing aids behind-the-ear rech... | LLM-generated (GPT-4o) | `9021.40.00` | **No** | Code not in DB |
| 59 | LLM131 | laser equipment for surgery | LLM-generated (GPT-4o) | `9018.90.30` | **No** | Code not in DB |
| 60 | LLM134 | ultrasound scanner portable model | LLM-generated (GPT-4o) | `9018.12.00` | **No** | Code not in DB |
| 61 | LLM136 | endoscope flexible fiber optic | LLM-generated (GPT-4o) | `9018.19.00` | **No** | Code not in DB |
| 62 | LLM137 | frozen shrimps, headless, shell-... | LLM-generated (GPT-4o) | `0306.17.10` | **No** | Code not in DB |
| 63 | LLM139 | dried fish maw, processed in Kerala | LLM-generated (GPT-4o) | `0305.10.00` | **No** | Code not in DB |
| 64 | LLM140 | live mud crabs, farm-raised, Wes... | LLM-generated (GPT-4o) | `0306.24.00` | **No** | Code not in DB |
| 65 | LLM141 | frozen cuttlefish, whole, from O... | LLM-generated (GPT-4o) | `0307.41.00` | **No** | Code not in DB |
| 66 | LLM150 | fresh okra for export | LLM-generated (GPT-4o) | `0709.90.10` | **No** | Code not in DB |
| 67 | LLM159 | processed dates from Gujarat | LLM-generated (GPT-4o) | `0804.10.00` | **No** | Code not in DB |
| 68 | LLM169 | organic mustard oil, cold-pressed | LLM-generated (GPT-4o) | `1514.19.30` | **No** | Code not in DB |
| 69 | LLM175 | liquid glucose for confectionery... | LLM-generated (GPT-4o) | `1702.30.00` | **No** | Code not in DB |
| 70 | LLM181 | ready-to-eat upma mix in packets | LLM-generated (GPT-4o) | `1904.20.00` | **No** | Code not in DB |
| 71 | LLM184 | instant noodle cups with masala | LLM-generated (GPT-4o) | `1902.30.00` | **No** | Code not in DB |
| 72 | LLM187 | coconut water unsweetened Kerala... | LLM-generated (GPT-4o) | `2202.90.20` | **No** | Code not in DB |
| 73 | LLM194 | lemongrass oil extracted in Kera... | LLM-generated (GPT-4o) | `3301.29.51` | **No** | Code not in DB |
| 74 | LLM195 | vetiver oil double distilled 100ml | LLM-generated (GPT-4o) | `3301.29.55` | **No** | Code not in DB |
| 75 | LLM198 | printed cartons for packaging fr... | LLM-generated (GPT-4o) | `4819.10.00` | **No** | Code not in DB |
| 76 | LLM200 | handmade paper sheets from Rajas... | LLM-generated (GPT-4o) | `4802.54.00` | **No** | Code not in DB |
| 77 | LLM201 | laminated paperboard for industr... | LLM-generated (GPT-4o) | `4811.59.00` | **No** | Code not in DB |
| 78 | LLM202 | coated paper for printing from M... | LLM-generated (GPT-4o) | `4810.13.00` | **No** | Code not in DB |

## Section 4: Verification Checklist

User: please review each section and:
- [ ] Approve HIGH confidence fixes (or flag any you disagree with)
- [ ] Pick the correct code for MEDIUM confidence cases
- [ ] Pick the correct code for LOW confidence cases
- [ ] Confirm missing GT suggestions or provide corrections
- [ ] Decide whether to keep, fix, or remove LLM-generated cases

Reply with your decisions and I'll apply all changes in one commit.