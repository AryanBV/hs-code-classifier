# A1 Applier Log

**Pre-insert count:** 1153
**Post-insert count:** 1531 (+378)

## A1c (positive-definition-by-restriction)
- Proposed: 30
- Inserted: 30 (0 skipped on conflict, 0 skipped empty)
- Errors: 0
- DB ID range: 2646-2675
- Applied via: MCP execute_sql (single batch)

## A1a (section-level to chapter-level)
- Proposed: 288
- Inserted: 288 (0 skipped on conflict, 0 skipped empty)
- Errors: 0
- DB ID range: 2676-2963
- Applied via: 1 batch via MCP execute_sql, then 5 batches via `backend/scripts/run-a1-batches.js` (pg client direct)
- Per-batch breakdown: 50, 50, 50, 50, 50, 38

## A1d (cross-candidate heading-code refs)
- Proposed: 60
- Inserted: 60 (0 skipped on conflict, 0 skipped empty)
- Errors: 0
- DB ID range: 2964-3023
- Applied via: `backend/scripts/run-a1-batches.js` (pg client direct)
- Per-batch breakdown: 50, 10

## Validation
| Check | Value |
|---|---|
| Pre count | 1153 |
| Post count | 1531 |
| Delta | +378 |
| Expected delta (A1c+A1a+A1d) | 30+288+60 = 378 |
| Match | Y |
| A1c range count | 30 |
| A1a range count | 288 |
| A1d range count | 60 |

## Audit (5 random newly-inserted rules)

```json
[
  {"id":2865,"source_chapter":"63","source_note_number":"Section XI Note 1(ij)","redirects_to_chapter":["40"],"redirects_to_heading":null,"excluded_text_preview":"woven, knitted or crocheted fabrics, felt or nonwovens, impregnated, coated, covered or laminated with rubber, or articl..."},
  {"id":2810,"source_chapter":"57","source_note_number":"Section XI Note 1(r)","redirects_to_chapter":["70"],"redirects_to_heading":null,"excluded_text_preview":"glass fibres or articles of glass fibres, other than embroidery with glass thread on a visible ground of fabric (Chapter..."},
  {"id":2939,"source_chapter":"81","source_note_number":"Section XV Note 1(k)","redirects_to_chapter":["94"],"redirects_to_heading":null,"excluded_text_preview":"articles of Chapter 94 (for example, furniture, mattress supports, luminaires and lighting fittings, illuminated signs,..."},
  {"id":2935,"source_chapter":"81","source_note_number":"Section XV Note 1(f)","redirects_to_chapter":["84","85"],"redirects_to_heading":null,"excluded_text_preview":"articles of Section XVI (machinery, mechanical appliances and electrical goods)"},
  {"id":3014,"source_chapter":"85","source_note_number":"Note 2","redirects_to_chapter":["85"],"redirects_to_heading":"8540","excluded_text_preview":"Headings 8501 to 8504 do not apply to goods described in headings 8511, 8512, 8540, 8541 or 8542"}
]
```

All 5 spot-checked rows align with their source file (Section XI broadcast for A1a, Note 2 with heading ref for A1d).

## Artifacts
- Batch SQL files: `backend/data/phase-3.5-prompts/batches/A1{c,a,d}-batch-*.sql`
- Applier helper (JSON→SQL): `backend/data/phase-3.5-prompts/a1-applier.js`
- DB runner: `backend/scripts/run-a1-batches.js`
