# O4 — Extraction Log

Notes on curation decisions for the India alias map.

## Date
2026-05-26 — Opus 4.7 build-time job.

## Sources consulted
1. `backend/src/classifier-v2/layers/L0-normalization.ts` — exact file
   path target: `aliases.json` (NOT `alias-map.json` as in pre-existing
   README — file kept the new name to match L0 loader).
2. `backend/src/data/chapter-triggers.json` — cross-referenced for chapter
   vocabulary; provided `2-wheeler`, `LCV`, `HCV`, `tin foil (kitchen)`
   confusion case (see Ch.72 vs Ch.80).
3. `backend/src/data/confusing-chapter-pairs.ts` — verified existence
   only (8 pairs); content reviewed via JSON sibling file below.
4. `backend/data/build-time/O5-confusing-pairs/confusing-pairs.json` —
   harvested Indian-specific examples: `tinplate` for Ch.72, `bulk API`
   / `tablet`/`capsule` for Ch.29/30, `furskin`/`pashmina`/`mulmul` for
   textile chapters, `Bengal gram (desi chana)` reference in Ch.10/11.
5. `tariff_lines` DB sample (200 random rows + targeted ILIKE on
   `basmati`, `jaggery`, `turmeric`, `cumin`, `chickpea`, `lentil`,
   `pigeon pea`, `mung`, `gram`, `maize`, `cashew`, `ghee`, `coconut`,
   `saree`, `mild steel`, `cold-rolled`, `hot-rolled`, `galvanized`,
   `muslin`, `pashmina`, `jute`, `coir`, `cashmere`, `knocked-down`,
   `motorcycle`, `scooter`, `paneer`, `khoya`, `yogurt`, `sago`,
   `fox nut`, `makhana`).

## Key findings from DB sample

The ITC(HS) Schedule uses many Hindi/regional terms verbatim — i.e.
they are the canonical English in Indian tariff usage:

| Term | Verified canonical (DB) | Tariff line |
|------|------------------------|-------------|
| saree | "Saree" | 5208.32.20 and ~30 others |
| dhoti | "Dhoti" | 5208.11.10 etc. |
| ghee | "Ghee" | 0405.90.20 |
| jaggery | "Cane jaggery" | 1701.13.10 |
| basmati | "Basmati rice" | 1006.30.20 |
| turmeric | "Turmeric oil/oleoresin" | 3301.29.49 etc. |
| cumin | "Cumin, black/other" | 0909.31.x |
| jute | "Jute" | 5705.00.31 etc. |
| coir | "Coir" | 4410.90.40 |
| muslin | "Muslin (including lawn mulmul...)" | 5208.31.70 |
| makhana | "Makhana" | 2008.19.21 |
| pashmina | (HS heading 5102 description) | — |
| lentil | "Lentils" | 0713.40.00 |
| pigeon pea | "Pigeon peas (Cajanus cajan)" | 0713.60.00 |
| mild steel | "Mild steel billets" | 7207.19.20 |
| hot-rolled | "...hot-rolled..." | 7208.10.00 |
| cold-rolled | "...cold-rolled (cold-reduced)" | 7209.18.90 |
| motorcycle | "Vintage Motorcycles..." | 8711.00.00 |
| scooter | "Scooters" | 8711.20.11 |

These were **NOT** added to the alias map (English→English with the
schedule's own canonical = pollution; would slow L0 and bloat audit
trail unnecessarily).

## Ambiguous entries — handling

Several aliases are context-dependent. L0 substitutes the canonical
unconditionally; downstream Triage/Tiebreak resolves any remaining
ambiguity. Notes on the ones I considered carefully:

### Dropped (too ambiguous to alias unconditionally)
- **`AC`** — could be "air conditioner" (Ch.84) or "alternating current"
  (Ch.85) or unrelated abbreviation. Decided NOT to alias; L0 leaves it
  for downstream context-driven disambiguation.
- **`tin foil`** — colloquial for aluminium foil (Ch.76) in Indian
  kitchens, but the literal trade name maps to Ch.80 (tin metal).
  O5 confusing-pair Ch.72_vs_Ch.80 mentions this. Decided NOT to alias —
  L0 should not silently rewrite a term that could legitimately mean
  tin metal. Will defer to L2/L4 disambiguation via mechanical-verifier
  layer reading the predominant-metal attribute.
- **`paddy`** — kept (→ "rice in husk", heading 1006.10). Could also
  mean wet ground in agriculture, but in trade context paddy = rough
  rice. Low-ambiguity in HS-classification queries.
- **`crore`** — Indian numeric unit (10 million). NOT included as a
  product alias; this is a quantity unit and orthogonal to product
  classification. L0's tokenizer will drop it as <2-char-irrelevant or
  pass it through; downstream layers don't need normalisation here.
- **`IP`** — could be `Indian Pharmacopoeia` (drug-grade qualifier) or
  internet protocol (electronics context) or intellectual property
  (rare in HS queries). Kept the more frequent pharma interpretation
  via `I.P.` (with periods) and `IP grade` (qualifier). Bare `IP` NOT
  aliased.
- **`API`** — IT API is rare in export-product context; pharma API
  dominates. Kept the alias but flagged here. If false-positive rate
  rises, downgrade to `bulk API`/`API powder` multi-word only.
- **`PB grade`** — coffee grade abbreviation (Peaberry); already in DB
  description "Arabica Cherry: ---- PB Grade" 0901.11.22. NOT aliased
  because L0 substitution would discard the disambiguating "PB Grade"
  textual cue. Better to keep raw.

### Kept (deliberate decisions)
- **`chickpea`/`chickpeas` → Bengal gram** — global English, but
  ITC(HS) explicitly says "Bengal gram (desi chana)" at 0713.20.20.
  Alias inversed direction (English → Indian canonical) for one entry
  because that's where the Schedule's canonical actually sits. This is
  the ONE place the convention reverses; flagged here.
- **`kabuli chana`/`kabuli channa` → chickpea** — separately, the
  large white chickpea is colloquially "kabuli chana" in Hindi and
  "chickpea" generically — kept for completeness despite the inversion
  above. Both routes converge to subheading 0713.20.
- **`yogurt` → yoghurt** — Schedule uses `Yogurt` (American spelling)
  at 0403.20.00 but Indian standards and HMRC/UK use `Yoghurt`. Decided
  on `yoghurt` (British/Indian convention) and aliased `yogurt`,
  `dahi`, `curd` all to it. Risk: schedule canonical search may be one
  spelling step removed. Mitigated by L4 semantic search.
- **`raw silk`** — Schedule canonical is literally "raw silk" (heading
  5002). NOT aliased (self-alias removed).
- **`JCB` → backhoe loader** — genericised brand name (like Xerox).
  Common SME shorthand for any backhoe loader. Risk: actual JCB-branded
  goods are still classified under 8429. Low risk because chapter
  routing isn't affected.

## File-path note

L0's `ALIAS_MAP_PATH` constant in `L0-normalization.ts` points at
`aliases.json` (per resolved-path tracing). The pre-existing README in
this directory referenced `alias-map.json` — that was outdated. I used
the L0-required name `aliases.json` to ensure runtime can read the
file without modification to L0.

## Casing convention

L0's `preserveCasing` re-capitalises canonical based on matched alias
casing. Therefore canonical VALUES in `aliases.json` are stored in
**lowercase** so that L0 can up-case them when needed (`MS` matched →
`Mild steel`-capitalised by L0; `M.S.` matched → `mild steel`
lowercase preserved as L0 treats it as abbreviation).

I have stored canonical values in lowercase except for `Indian
Pharmacopoeia grade`, `British Pharmacopoeia grade`, `United States
Pharmacopoeia grade`, `WHO good manufacturing practice` — these
contain proper-noun fragments where lowercase would be confusing. They
will be preserved as-stored by L0 (since matched alias `I.P.`/`BP grade`
etc. is an abbreviation, L0 takes the abbreviation branch which leaves
canonical as-is).

## Cross-reference with O5

The 8 confusing pairs benefit from these aliases:
- **Ch.42 vs Ch.43** (leather/fur): `pashmina` → "fine wool" assists
  Ch.43 detection.
- **Ch.09 vs Ch.21** (raw vs instant coffee): no Hindi-specific terms
  needed; the existing English terms already disambiguate.
- **Ch.54 vs Ch.55** (filament vs staple): no Indian-specific aliases —
  staple/filament are universal trade terms.
- **Ch.72 vs Ch.80** (steel/tin): `M.S.`, `GI`, `tinplate` all canonical
  Ch.72 markers. Did NOT alias `tinplate` — it's already canonical in
  DB descriptions (sub-heading 7210.12 wording).
- **Ch.29 vs Ch.30** (API vs formulation): `API`, `bulk drug`,
  `formulation`, `IP grade` directly support this discrimination.
- **Ch.42 vs Ch.62** (leather vs textile apparel): `kurta`, `salwar`,
  `dupatta`, `lehenga` → textile garments routed correctly.

## Total
- **299 entries** in `aliases.json`
- **0 self-aliases** (English→English with same canonical removed)
- **6 entries deliberately omitted** (AC, tin foil, crore, bare IP, PB
  grade, paddy-as-field) — see Dropped section above.
- **File written to L0's exact expected path** —
  `backend/data/build-time/O4-india-alias-map/aliases.json`.
