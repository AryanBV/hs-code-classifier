# F4 Calibration Audit — SC-62 + SM-5

Reviewer: independent calibration (F4). Date: 2026-05-28.
Scope: SC-62 (Ch.62 woven apparel, 258 rec, built 138+120) and SM-5 (multi-chapter 37/76/82/96, 396 rec).

---

## SC-62 — VERDICT: PASS

### Integrity
- output count 258 === input code_count 258 === input codes 258. PASS
- Duplicates: 0. PASS
- Field count: all 258 records have exactly 43 fields; no missing/extra keys vs canonical schema. PASS
- JSON valid (parsed cleanly). PASS
- Code-set: input⊆output and output⊆input exact (0 missing, 0 extra). PASS

### Boundary integrity (138/120 split)
- 258 = 138 + 120. Join point clean: idx137 `6207.99.90` → idx138 `6208.11.00`.
- 0 overlap between the two halves; 0 out-of-order adjacencies (monotonic). PASS

### Templating / diversity
- Full-attribute signature diversity: 97.7% (252/258 unique sigs).
- Narrow (material/form/function_) signature diversity: 65.1% (168/258) — consistent with the ~78% apparel expectation; lower because garments legitimately share material/form sigs and differ by gender/size in unique notes.
- extraction_notes: 100% unique (258/258), 0 empty, 0 templated, 0 echo the own code string. Notes reference real subheading semantics (e.g. wool/cotton restructure, lining sub-lines). VERIFIED UNIQUE — templating concern cleared.

### Spec sample (per prompt)
- fabric_construction = "woven" on 100% (0 non-woven). PASS
- made_up = true on 100% (0 exceptions). PASS
- intended_role = "support" ONLY on 6212 foundation garments (6212.10/20/30/90.10/90.90); 0 support outside 6212. PASS
- wearable T/F/null = 253/5/0; the 5 false are 6217.90 detachable garment parts/linings. Correct.

### Enum compliance
- chemical_class {null}, fabric_construction {woven}, intended_role {null, support}, solution_purpose {null}. All within DB enum sets. PASS

### Gold fidelity (3 codes)
- 6203.31.90, 6207.22.00, 6214.30.10 ALL ABSENT from output — and ALL ABSENT from input (edition-absent). Indian ITC-HS 2022 uses different national 8-digit splits: 6203.31 has only `.10` (Khadi); 6214.30 has only `.90` (Other); 6207.22 has no national lines (restructured). Chunk faithfully built the source edition; gold intersection = 0 is EXPECTED, not a defect. PASS (no fabrication of edition-absent gold codes).

### Health
- validation_status: pending×258 (correct pre-validation state). extraction_model: claude-opus-4-7. confidence HIGH/MED/LOW = 188/68/2.

---

## SM-5 — VERDICT: PASS

### Integrity
- output count 396 === input code_count 396 === input codes 396. PASS
- Duplicates: 0. PASS
- Field count: all 396 records have exactly 43 fields; no missing/extra keys. PASS
- JSON valid. Code-set exact match (0 missing, 0 extra). PASS
- Chapter prefixes present: exactly {37,76,82,96}. Per-chapter: Ch.37=100, Ch.76=97, Ch.82=98, Ch.96=101 (= 396).

### CROSS-CHAPTER VOCAB BLEED (special focus) — CLEAN
Grouped by 2-digit prefix and scanned notes+material+function_+intended_use:
- Ch.37 (photo) records with TOOL tokens: 0; with ALUMINIUM tokens: 0.
- Ch.82 (tools) records with PHOTO tokens: 0.
- Ch.76 (Al) records with PHOTO tokens: 0.
- Ch.96 (misc) records with PHOTO tokens: 0; with ALUMINIUM tokens: 0.
NO vocabulary leak detected across the four chapters. Multi-chapter chunking did not contaminate domain vocab. PASS

### Templating / diversity
- Full-attribute signature diversity: 93.4% (370/396 unique). Narrow: 66.2%.
- extraction_notes: 100% unique (396/396), 0 empty, 0 templated. PASS

### Per-chapter spec sample
- Ch.37 photo: processing_state rich and material-accurate — sensitised/unexposed, exposed/developed, colour, width-band (16-35mm, over-610mm), not-developed combinations. chemical_class {null, other}. Matches "material/sensitised states" spec. PASS
- Ch.76 aluminium metal-form: material = aluminium(80)/aluminium-alloy(19)/steel(2); forms = foil/unwrought/plate/wire/sheet/container/cylinder. The 2 "steel" are correct multi-material ACSR (7604.29.10) and steel-cored Al cable (7614.10.00). aluminum_pct=null across all 97 — CORRECT (finished Al articles are not percent-assayed; numeric metal pcts reserve for ferro-alloy/Ch.72-81 assay lines). PASS
- Ch.82 tool function_: intended_role = "technical_use" on exactly 8207/8208/8209 (27 codes); 0 technical_use outside those headings. Matches tooling spec. PASS
- Ch.96 misc: wide material spread = 36 distinct materials (base-metal, plastic, textile, mixed, bristle, wood, precious-metal, cellulose...). Matches "wide material spread" spec. PASS

### intended_role placement (spec)
- Ch.76 packaging: 7611.00.00 + all 7612.* + all 7613.* (20 codes) — Al containers. CORRECT.
- Ch.76 support: 7610.* only (6 codes) — Al structures. CORRECT.
- Ch.82 technical_use: 8207/8208/8209 tooling+packaging plates. CORRECT.
- Ch.96 intended_role {null, support}. Within enum.

### Enum compliance (per chapter)
- Ch.37: chemical_class {null,other}; others null. Within set.
- Ch.76: intended_role {null,support,packaging}; others null. Within set.
- Ch.82: intended_role {null,technical_use}; others null. Within set.
- Ch.96: intended_role {null,support}; others null. Within set.
ALL within DB enum sets (chemical_class / fabric_construction / intended_role / solution_purpose). PASS

### Health
- validation_status: pending×396. extraction_model: claude-opus-4-7. confidence HIGH/MED = 307/89.

---

## Violations / fixes
NONE. No integrity, boundary, vocab-bleed, enum, or templating violations found in either chunk. No fixes required.

## Notes for downstream
- `extraction_confidence` is a categorical string (HIGH/MEDIUM/LOW), not numeric — consistent with schema; loaders must not coerce to float.
- SC-62 gold codes are edition-absent (Indian national splits differ from WCO gold); validation harness should treat the 3 Ch.62 gold codes as not-applicable for this edition rather than misses.

Path: chunks/audits/F4-SC62-SM5-audit.md
