"""
Generate bulk INSERT SQL chunks for the normalized schema.

Reads all 97 canonical JSONs from backend/data/extracted/ and writes per-table
SQL chunks to backend/data/load-sql/. Each chunk is a multi-row INSERT statement
in PostgreSQL, processable in a single round-trip via Supabase MCP.

Output files (apply in this order to respect FK constraints):
  01_sections.sql         (~21 rows)
  02_chapters.sql         (97 rows)
  03_headings.sql         (1,232 rows)
  04_subheadings.sql      (5,613 rows)
  05_tariff_lines_NN.sql  (12,460 rows, split into ~2k-row chunks for size)
  06_chapter_exclusions.sql
  07_policy_conditions.sql

Standard WCO section titles used (fallback if section_notes empty).

Run: python backend/scripts/generate-load-sql.py
"""
from __future__ import annotations
import json
import os
from pathlib import Path

EXTRACTED_DIR = Path('backend/data/extracted')
OUTPUT_DIR = Path('backend/data/load-sql')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SECTION_TITLES = {
    'I': 'Live Animals; Animal Products',
    'II': 'Vegetable Products',
    'III': 'Animal or Vegetable Fats and Oils',
    'IV': 'Prepared Foodstuffs; Beverages, Spirits, Vinegar; Tobacco',
    'V': 'Mineral Products',
    'VI': 'Products of the Chemical or Allied Industries',
    'VII': 'Plastics and Articles thereof; Rubber and Articles thereof',
    'VIII': 'Raw Hides and Skins, Leather, Furskins and Articles thereof',
    'IX': 'Wood and Articles of Wood; Cork; Manufactures of Straw',
    'X': 'Pulp of Wood; Paper and Paperboard',
    'XI': 'Textiles and Textile Articles',
    'XII': 'Footwear, Headgear, Umbrellas; Artificial Flowers',
    'XIII': 'Articles of Stone, Plaster, Cement, Ceramics, Glass',
    'XIV': 'Natural or Cultured Pearls, Precious Stones, Precious Metals',
    'XV': 'Base Metals and Articles of Base Metal',
    'XVI': 'Machinery and Mechanical Appliances; Electrical Equipment',
    'XVII': 'Vehicles, Aircraft, Vessels and Associated Transport Equipment',
    'XVIII': 'Optical, Photographic, Cinematographic, Measuring Instruments; Clocks; Musical Instruments',
    'XIX': 'Arms and Ammunition; Parts and Accessories thereof',
    'XX': 'Miscellaneous Manufactured Articles',
    'XXI': "Works of Art, Collectors' Pieces and Antiques",
}


def sql_str(v):
    """Escape a Python value as a Postgres SQL literal."""
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, dict)):
        # JSON literal
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def write_chunked(name, header, rows, max_rows=2000):
    """Write a multi-row INSERT to one or more SQL files."""
    if not rows:
        return
    chunks = [rows[i:i + max_rows] for i in range(0, len(rows), max_rows)]
    for i, chunk in enumerate(chunks, start=1):
        suffix = f'_{i:02d}' if len(chunks) > 1 else ''
        path = OUTPUT_DIR / f'{name}{suffix}.sql'
        with open(path, 'w', encoding='utf-8') as f:
            f.write(header)
            f.write(' VALUES\n  ')
            f.write(',\n  '.join(chunk))
            f.write(';\n')
        print(f'  wrote {path}  ({len(chunk)} rows, {path.stat().st_size // 1024} KB)')


def main():
    sections = {}        # section_key -> (section, title, section_notes)
    chapters_rows = []
    headings_rows = []
    subheadings_rows = []
    tariff_lines_rows = []
    chapter_exclusions_rows = []
    policy_conditions_rows = []

    files = sorted(f for f in os.listdir(EXTRACTED_DIR) if f.startswith('chapter-') and f.endswith('.json'))
    print(f'Reading {len(files)} chapter files...')

    for f in files:
        path = EXTRACTED_DIR / f
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)

        section_key = data['section']
        sections.setdefault(section_key, data.get('section_notes', []))

        chapters_rows.append('(' + ', '.join([
            sql_str(data['chapter']),
            sql_str(section_key),
            sql_str(data['title']),
            sql_str(data.get('chapter_notes', [])),
            sql_str(data.get('chapter_subheading_notes', [])),
            sql_str(data.get('supplementary_notes', [])),
            sql_str(data.get('export_licensing_notes', [])),
            sql_str(data.get('definitions', [])),
            sql_str(data.get('extraction_warnings', [])),
            sql_str(data.get('notes_sources', {})),
            sql_str(data.get('source_pdf')),
            f"({sql_str(data.get('extracted_at'))})::timestamptz" if data.get('extracted_at') else 'NULL',
            'NOW()',  # verified_against_wco_at
        ]) + ')')

        for h in data.get('headings', []):
            headings_rows.append('(' + ', '.join([
                sql_str(h['heading']),
                sql_str(data['chapter']),
                sql_str(h.get('title', '')),
                sql_str(h.get('heading_notes', [])),
            ]) + ')')

            for sh in h.get('subheadings', []):
                subheadings_rows.append('(' + ', '.join([
                    sql_str(sh['subheading']),
                    sql_str(h['heading']),
                    sql_str(sh.get('title', '')),
                    sql_str(sh.get('subheading_notes', [])),
                    sql_str(sh.get('india_specific', False)),
                    sql_str(sh.get('wco_2022_match', True)),
                    sql_str(sh.get('india_specific_note')),
                ]) + ')')

                for tl in sh.get('tariff_lines', []):
                    tariff_lines_rows.append('(' + ', '.join([
                        sql_str(tl['code']),
                        sql_str(sh['subheading']),
                        sql_str(tl['description']),
                        sql_str(tl.get('unit')),
                        sql_str(tl.get('export_policy')),
                        sql_str(tl.get('policy_condition')),
                    ]) + ')')

        for e in data.get('exclusion_clauses', []):
            chapter_exclusions_rows.append('(' + ', '.join([
                sql_str(data['chapter']),
                sql_str(e.get('excluded_product_text', '')),
                sql_str(e.get('redirects_to_chapter')),
                sql_str(e.get('redirects_to_heading')),
                sql_str(e.get('source_note_number')),
                sql_str(e.get('source_note_text')),
            ]) + ')')

        for pc in data.get('policy_conditions', []):
            if not pc.get('description'):
                continue
            has_code = bool(pc.get('code'))
            policy_conditions_rows.append('(' + ', '.join([
                sql_str(None if has_code else data['chapter']),
                sql_str(pc['code']) if has_code else 'NULL',
                sql_str(pc.get('condition_number')),
                sql_str(pc['description']),
            ]) + ')')

    # Sections rows
    sections_rows = []
    for sk in sorted(sections.keys(), key=lambda k: list(SECTION_TITLES.keys()).index(k) if k in SECTION_TITLES else 99):
        title = SECTION_TITLES.get(sk, sk)
        sections_rows.append('(' + ', '.join([
            sql_str(sk),
            sql_str(title),
            sql_str(sections[sk]),
        ]) + ')')

    # Output SQL files
    write_chunked('01_sections',
        'INSERT INTO sections (section, title, notes)',
        sections_rows)
    write_chunked('02_chapters',
        'INSERT INTO chapters (chapter, section, title, notes, chapter_subheading_notes, supplementary_notes, export_licensing_notes, definitions, extraction_warnings, notes_sources, source_pdf, extracted_at, verified_against_wco_at)',
        chapters_rows)
    write_chunked('03_headings',
        'INSERT INTO headings (heading, chapter, title, notes)',
        headings_rows)
    write_chunked('04_subheadings',
        'INSERT INTO subheadings (subheading, heading, title, notes, india_specific, wco_2022_match, india_specific_note)',
        subheadings_rows)
    write_chunked('05_tariff_lines',
        'INSERT INTO tariff_lines (code, subheading, description, unit, export_policy, policy_condition)',
        tariff_lines_rows, max_rows=2000)
    write_chunked('06_chapter_exclusions',
        'INSERT INTO chapter_exclusions (source_chapter, excluded_product_text, redirects_to_chapter, redirects_to_heading, source_note_number, source_note_text)',
        chapter_exclusions_rows)
    write_chunked('07_policy_conditions',
        'INSERT INTO policy_conditions (chapter, code, condition_number, description)',
        policy_conditions_rows)

    print(f'\nTotal rows:')
    print(f'  sections:           {len(sections_rows)}')
    print(f'  chapters:           {len(chapters_rows)}')
    print(f'  headings:           {len(headings_rows)}')
    print(f'  subheadings:        {len(subheadings_rows)}')
    print(f'  tariff_lines:       {len(tariff_lines_rows)}')
    print(f'  chapter_exclusions: {len(chapter_exclusions_rows)}')
    print(f'  policy_conditions:  {len(policy_conditions_rows)}')


if __name__ == '__main__':
    main()
