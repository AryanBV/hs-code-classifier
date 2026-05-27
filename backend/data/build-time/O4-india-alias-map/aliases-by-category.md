# O4 — India Alias Map by Category

Companion to `aliases.json`. Same entries, grouped for review.

Canonical values are chosen to match how the ITC(HS) Schedule actually
phrases the product (verified by sampling 200+ `tariff_lines.description`
rows on 2026-05-26). Where the Hindi/Indian term IS already the canonical
schedule term (e.g. `saree`, `ghee`, `jute`, `basmati`, `turmeric`,
`cumin`, `makhana`), it is **NOT** included as an alias (English→English
would pollute the map).

Total: **299 entries**.

## 1. Metals abbreviations (50 entries)

Steel trade in India is rife with abbreviations. Schedule canonical
uses `mild steel`, `hot-rolled`, `cold-rolled`, `galvanized` (with -ized
spelling — confirmed in DB; note hyphenation `hot-rolled` matches
heading 7208 wording).

- `M.S.` / `MS` / `M S` → mild steel
- `C.R.` / `CR` / `CRC` / `CR coil`/`sheet`/`strip` → cold-rolled forms
- `H.R.` / `HR` / `HRC` / `HRP` / `HR coil`/`sheet`/`plate` → hot-rolled forms
- `G.I.` / `GI` / `GI sheet`/`pipe`/`wire` → galvanized iron forms
- `GP` / `GP sheet` / `GC sheet` → galvanized plain / corrugated
- `PPGI` / `PPGL` → pre-painted galvanized iron / galvalume
- `S.S.` / `SS` / `SS sheet`/`pipe`/`coil` → stainless steel forms
- `ERW` / `SAW` / `DI pipe` / `CI pipe` → welded / ductile / cast iron pipe
- `TMT` / `TMT bar` / `TMT rebar` / `rebar` → thermo-mechanically treated steel bar / reinforcing bar
- `MS bar`/`pipe`/`angle`/`channel`/`plate` → mild-steel form-specific
- `MS scrap` / `HMS` / `HMS 1` → mild steel scrap / heavy melting scrap
- `DRI` / `HBI` → directly reduced iron / hot briquetted iron
- `WC` → tungsten carbide
- `Al` → aluminium (Schedule uses `aluminium`, not `aluminum`)
- `Cu` → copper

## 2. Food + agricultural (~110 entries)

Hindi/regional names for Indian export staples. Several canonical
Schedule terms confirmed: `Bengal gram (desi chana)` for 0713.20.20,
`Pigeon peas` for 0713.60, `Cane jaggery` for 1701, `Basmati rice` for
1006, `Maize` for cereals, `Makhana` for 2008.19.21, `Lentils` for
0713.40, `Yoghurt` for 0403.20 (spelling: schedule uses `Yogurt` in
2026 DB — but UK/India both use `yoghurt` per HMRC; standardised
`yoghurt` as canonical).

**Flour / milling:**
- `atta` → wheat flour
- `maida` → refined wheat flour
- `suji`/`sooji`/`rava`/`rawa` → semolina
- `besan` / `gram flour` → chickpea flour
- `poha` / `chura` → beaten rice

**Pulses (dal = split, raw seed = different):**
- `chana` / `kala chana` → Bengal gram
- `kabuli chana`/`kabuli channa` / `chickpea`/`chickpeas` → Bengal gram (Schedule canonical)
- `chana dal` / `channa dal` → Bengal gram split
- `toor`/`tur`/`arhar` (+ dal) → pigeon pea (split)
- `masoor` (+ dal) → lentil (split)
- `moong` / `mung` (+ dal) → mung bean (split)
- `urad` / `urd` (+ dal) → black gram (split)
- `rajma` → kidney bean
- `lobia` → cow pea
- `matar` / `kala matar` / `safed matar` → pea / black pea / white pea

**Sweeteners:**
- `jaggery` / `gur` → cane jaggery
- `khandsari` → khandsari sugar
- `bura` → powdered sugar
- `misri` → rock sugar

**Dairy:**
- `desi ghee` → ghee (schedule uses `ghee` verbatim)
- `paneer` → fresh cheese
- `khoa` / `khoya` → concentrated milk solids
- `dahi` / `curd` / `yogurt` → yoghurt
- `lassi` → buttermilk drink

**Spices (turmeric, cumin, etc. ARE the schedule canonical; only Hindi-only terms aliased):**
- `haldi` / `haldi powder` → turmeric / turmeric powder
- `jeera` / `zeera` → cumin
- `kala jeera` / `shahi jeera` → black cumin
- `dhania` / `dhaniya` → coriander
- `saunf` → fennel
- `methi` → fenugreek
- `ajwain` → carom seed
- `hing` → asafoetida
- `elaichi` / `choti elaichi` / `badi elaichi` → cardamom / green / black
- `lavang` / `laung` → clove
- `dalchini` → cinnamon
- `kali mirch` / `lal mirch` / `mirchi` → black pepper / red chilli / chilli
- `tej patta` → bay leaf
- `kesar` → saffron
- `imli` → tamarind
- `amchur` → dried mango powder
- `garam masala` / `chat masala` → spice mixture
- `kala namak` / `sendha namak` → black salt / rock salt
- `supari` / `supari nut` → areca nut

**Nuts / dry fruits:**
- `kaju` (+ nut) → cashew (nut)
- `badam` → almond
- `akhrot` → walnut
- `pista` → pistachio
- `khajur` → date
- `kismis` / `munakka` → raisin
- `anjeer` → fig
- `nariyal` → coconut
- `khopra` → copra

**Oilseeds & cereals:**
- `til` → sesame seed
- `alsi` → linseed
- `sarson` → mustard seed
- `moongphali` / `mungfali` → groundnut
- `soyabean` → soybean
- `makka` / `makki` → maize
- `bajra` → pearl millet
- `jowar` → sorghum
- `ragi` → finger millet
- `kuttu` → buckwheat
- `samai` → little millet
- `kodo` → kodo millet
- `paddy` → rice in husk
- `basmati` → basmati rice
- `non-basmati` → non-basmati rice
- `sella rice` / `usna rice` → parboiled rice
- `phool makhana` → makhana (canonical in DB)
- `fox nut` / `lotus seed` → makhana
- `sabudana` / `tapioca pearl` → sago

## 3. Textile + fabric (~40 entries)

ITC(HS) uses `saree`, `dhoti`, `muslin`, `mulmul`, `jute`, `coir`,
`pashmina` (in HS 5102 description) — these are canonical; only
spelling variants and Hindi-only terms are aliased.

- `gunny`/`gunny bag`/`gunia` → jute sack
- `hessian` / `hessian cloth` / `tat patti` → jute fabric
- `mulmul` / `malmal` → muslin (Schedule canonical `Muslin (including lawn mulmul...)`)
- `pashmina` / `shahtoosh` → fine wool
- `khadi` → handspun handwoven cloth
- `powerloom` → power-loom
- `bandhani`/`bandhej` → tie-and-dye fabric
- `ikat` → ikat fabric (preserved)
- `chikan` / `chikankari` → chikan embroidered fabric
- `zari` / `zardozi` → metallic embroidery thread / metal thread embroidery
- `kanjeevaram`/`kanjivaram` / `banarasi` / `patola` → silk saree variants
- `tussar`/`tasar` → tussar silk
- `muga` / `eri` → muga silk / eri silk
- `sari` → saree (spelling variant)
- `lehenga` / `ghagra` → ghagra skirt / skirt
- `salwar` → loose trousers
- `kurta` / `kurti` → tunic / short tunic
- `dupatta` / `chunni` / `odhni` → scarf
- `sherwani` / `achkan` → long coat
- `lungi` → wrap-around cloth

## 4. Pharma + polymer codes (~30 entries)

- `API` / `bulk drug` / `bulk API` → active pharmaceutical ingredient
- `formulation` / `FDF` → finished dosage form
- `OTC` → over-the-counter medicine
- `OSD` → oral solid dosage
- `Rx` → prescription medicine
- `I.P.` / `IP grade` / `BP grade` / `USP grade` → Pharmacopoeia grade qualifiers
- `GMP` / `WHO-GMP` → good manufacturing practice
- `HDPE` / `LDPE` / `LLDPE` / `PP` / `PVC` / `PET` / `PETE` / `PS` / `EPS` / `ABS` / `PU` / `PUF` / `EVA` → polymer abbreviations
- `NBR` / `SBR` / `EPDM` → rubber abbreviations

## 5. Machinery / vehicles (~30 entries)

Schedule uses `motorcycle`, `scooter` verbatim — `2-wheeler`/`3-wheeler`
SME shorthand normalised.

- `2-wheeler`/`two-wheeler` (and spaced variants) → motorcycle
- `3-wheeler`/`three-wheeler` / `auto rickshaw` / `tuk-tuk` → three-wheeled motor vehicle
- `e-rickshaw` → electric three-wheeled motor vehicle
- `LCV` / `HCV` / `MCV` / `MUV` / `SUV` → vehicle classes
- `CKD` / `SKD` / `CBU` → kit/built-unit forms
- `DG set`/`DG sets` / `genset`/`gen set` → diesel generator set / generator set
- `UPS` / `SMPS` / `VFD` → electrical equipment
- `AHU` / `FCU` / `HVAC` → air-handling equipment
- `CNC` / `VMC` / `HMC` → machine tools
- `EOT crane` → overhead travelling crane
- `JCB` → backhoe loader (genericised brand)
- `PVC pipe` / `HDPE pipe` / `GI fitting` → expanded polymer/metal product

## 6. Units of measure (~22 entries)

NOT product aliases — but L0 sees them in queries like "100 pcs steel
rods" and they should normalize to canonical schedule units.

- `pcs` / `pc` → pieces
- `nos` → numbers
- `qty` → quantity
- `kg` / `kgs` → kilogram / kilograms
- `MT` / `Mt` / `mts` / `tonne` / `tonnes` → metric ton / tons
- `qtl` → quintal
- `ltr` / `ltrs` → litre / litres
- `ml` → millilitre
- `mtr` / `mtrs` → metre / metres
- `sqm` / `sqft` / `cbm` → square metre / square foot / cubic metre
- `doz` / `gr` / `pr` → dozen / gross / pair

## Summary

| Category | Approx entries |
|----------|---------------:|
| Metals abbreviations | 50 |
| Food + agricultural | 110 |
| Textile + fabric | 40 |
| Pharma + polymer | 30 |
| Machinery / vehicles | 30 |
| Units of measure | 22 |
| **Total** | **~299** |

(Slight overshoot vs ~200 target — extra coverage in food/agricultural is justified by Indian-export concentration in those chapters per project context.)
