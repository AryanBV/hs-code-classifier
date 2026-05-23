"""Fix Chapter 84 subheading misplacements.

Bugs detected:
  16 subheading stubs ended up under the prior heading (PDF page-boundary
  spillover). The actual subheadings + tariff lines exist correctly in the
  proper parent — but with empty `title` strings. The misplaced stubs carry
  the title text.

Fix:
  1. Populate empty heading titles for 8406, 8412, 8434, 8446, 8455, 8482
     using canonical PDF text.
  2. For each (wrong_parent_heading, misplaced_subheading_code):
       a. Find the empty-title correct subheading in the proper parent.
       b. Copy `title` (and any non-empty fields) from the misplaced stub
          onto the correct subheading.
       c. Delete the misplaced stub from the wrong parent.
  3. Special: delete '1150.00' stub from 8411 (OCR garbage from
     '115000 Kw' power-rating line). Also patch 8411.82.50's truncated
     description.
  4. Re-sort subheadings of each touched heading by numeric subheading code
     to maintain canonical order.
"""

import json
from pathlib import Path

JSON_PATH = Path(__file__).resolve().parents[1] / 'data' / 'extracted' / 'chapter-84.json'

# Canonical heading titles missing from current extraction (recovered from PDF)
HEADING_TITLE_FIXES = {
    '8406': 'Steam turbines and other vapour turbines.',
    '8412': 'Other engines and motors.',
    '8434': 'Milking machines and dairy machinery.',
    '8446': 'Weaving machines (looms).',
    '8455': 'Metal-rolling mills and rolls therefor.',
    '8482': 'Ball or roller bearings.',
}

# (wrong_parent_heading, subheading_code) pairs to repatriate to subheading_code[:4]
REPATRIATIONS = [
    ('8405', '8406.90'),
    ('8408', '8483.50'),
    ('8408', '8483.60'),
    ('8411', '8412.29'),
    ('8411', '8412.80'),
    ('8411', '8412.90'),
    ('8433', '8434.90'),
    ('8445', '8446.10'),
    ('8445', '8446.21'),
    ('8445', '8446.29'),
    ('8445', '8446.30'),
    ('8454', '8455.21'),
    ('8481', '8482.10'),
    ('8481', '8482.20'),
    ('8481', '8482.91'),
]

# OCR garbage stubs to outright delete
DELETIONS = [
    ('8411', '1150.00'),
]

# Truncated tariff-line description to repair (8411.82.50 was cut mid-text)
TARIFF_DESCRIPTION_FIXES = {
    '8411.82.50': 'Of power exceeding 90000 but not exceeding 115000 Kw',
}


def subheading_sort_key(s):
    """Sort by numeric value of subheading code (e.g., '8406.10' -> 840610)."""
    return int(s['subheading'].replace('.', ''))


def main():
    data = json.loads(JSON_PATH.read_text(encoding='utf-8'))

    # 1. Fix heading titles
    for h in data['headings']:
        if h['heading'] in HEADING_TITLE_FIXES and not h.get('title', '').strip():
            h['title'] = HEADING_TITLE_FIXES[h['heading']]

    # Build heading lookup
    headings_by_code = {h['heading']: h for h in data['headings']}

    repatriated = []
    deleted = []

    # 2. Process repatriations
    for wrong_parent, sub_code in REPATRIATIONS:
        wh = headings_by_code.get(wrong_parent)
        if wh is None:
            print(f'WARN: wrong-parent heading {wrong_parent} not found')
            continue
        # Find misplaced stub
        misplaced_idx = next(
            (i for i, s in enumerate(wh['subheadings']) if s['subheading'] == sub_code),
            None,
        )
        if misplaced_idx is None:
            print(f'WARN: misplaced stub {sub_code} not under {wrong_parent}')
            continue
        misplaced = wh['subheadings'][misplaced_idx]

        # Find canonical (empty-title) subheading in correct parent
        correct_parent_code = sub_code[:4]
        ch = headings_by_code.get(correct_parent_code)
        if ch is None:
            print(f'WARN: correct-parent heading {correct_parent_code} not found')
            continue
        canonical = next(
            (s for s in ch['subheadings'] if s['subheading'] == sub_code),
            None,
        )
        if canonical is None:
            print(f'WARN: canonical {sub_code} not found under {correct_parent_code}')
            continue

        # Merge title (and any other non-empty fields) from misplaced -> canonical
        if misplaced.get('title') and not canonical.get('title'):
            canonical['title'] = misplaced['title']
        if misplaced.get('subheading_notes') and not canonical.get('subheading_notes'):
            canonical['subheading_notes'] = misplaced['subheading_notes']
        # tariff_lines from misplaced are expected to be empty (sanity-check)
        if misplaced.get('tariff_lines'):
            print(
                f'WARN: misplaced stub {wrong_parent}->{sub_code} had '
                f'{len(misplaced["tariff_lines"])} tariff lines; merging into canonical'
            )
            canonical['tariff_lines'].extend(misplaced['tariff_lines'])

        # Remove from wrong parent
        wh['subheadings'].pop(misplaced_idx)
        repatriated.append((wrong_parent, sub_code, correct_parent_code))

    # 3. Deletions (OCR garbage)
    for wrong_parent, sub_code in DELETIONS:
        wh = headings_by_code.get(wrong_parent)
        if wh is None:
            continue
        before = len(wh['subheadings'])
        wh['subheadings'] = [s for s in wh['subheadings'] if s['subheading'] != sub_code]
        if len(wh['subheadings']) < before:
            deleted.append((wrong_parent, sub_code))

    # 4. Tariff line description fixes
    tariff_fixes_applied = 0
    for h in data['headings']:
        for s in h['subheadings']:
            for t in s['tariff_lines']:
                if t['code'] in TARIFF_DESCRIPTION_FIXES:
                    t['description'] = TARIFF_DESCRIPTION_FIXES[t['code']]
                    tariff_fixes_applied += 1

    # 5. Re-sort subheadings within every heading (canonical order)
    for h in data['headings']:
        h['subheadings'].sort(key=subheading_sort_key)

    # 6. Update metadata
    data['extracted_at'] = '2026-05-22'
    warnings = list(data.get('extraction_warnings', []))
    warnings.append(
        'Post-extraction fix (2026-05-22): repaired 16 PDF page-boundary subheading '
        'misplacements (8406.90 under 8405; 8483.50/.60 under 8408; 8412.29/.80/.90 '
        'under 8411; 8434.90 under 8433; 8446.10/.21/.29/.30 under 8445; 8455.21 '
        'under 8454; 8482.10/.20/.91 under 8481). Restored 6 heading titles (8406, '
        '8412, 8434, 8446, 8455, 8482) that were orphaned across page breaks. '
        'Deleted OCR garbage subheading stub "1150.00" under 8411 (artefact of the '
        '"115000 Kw" power-rating line). Repaired truncated description of '
        '8411.82.50 ("Of power exceeding 90000 but not exceeding 115000 Kw").'
    )
    data['extraction_warnings'] = warnings

    # Pre-write verification
    problems = []
    for h in data['headings']:
        hc = h['heading'].replace('.', '')
        for s in h['subheadings']:
            sc = s['subheading'].replace('.', '')
            if not sc.startswith(hc):
                problems.append(('SUB', h['heading'], s['subheading']))
            for t in s['tariff_lines']:
                tc = t['code'].replace('.', '')
                if not tc.startswith(sc):
                    problems.append(('TARIFF', h['heading'], s['subheading'], t['code']))
    print(f'Verification: {len(problems)} remaining hierarchy problems')
    for p in problems[:10]:
        print(' ', p)
    if problems:
        raise SystemExit('Hierarchy problems remain — aborting write.')

    # Counts
    n_h = len(data['headings'])
    n_s = sum(len(h['subheadings']) for h in data['headings'])
    n_t = sum(len(s['tariff_lines']) for h in data['headings'] for s in h['subheadings'])
    print(f'Final counts: headings={n_h}, subheadings={n_s}, tariff_lines={n_t}')
    print(f'Repatriated: {len(repatriated)}')
    print(f'Deleted: {len(deleted)}')
    print(f'Tariff description fixes applied: {tariff_fixes_applied}')

    # Write
    JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + '\n',
        encoding='utf-8',
    )
    print(f'Wrote {JSON_PATH}')


if __name__ == '__main__':
    main()
