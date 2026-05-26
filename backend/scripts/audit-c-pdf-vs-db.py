"""
Audit C (Phase 3.5): PDF (via extracted/*.json canonical) ↔ DB.
Sample 30 random chapters; for each pick 10 random tariff_lines from canonical JSON;
generate INSERT SQL? No, generate sample list to query DB.

Output: backend/data/phase-3.5-audits/audit-C-sample.json  (300 codes + expected)
"""
import json
import os
import random

EXTRACTED_DIR = r"C:\Export Business\hs-code-classifier\backend\data\extracted"
OUT = r"C:\Export Business\hs-code-classifier\backend\data\phase-3.5-audits\audit-C-sample.json"
SEED = 20260524


def _heading_code(h):
    return h.get("heading") or h.get("code")


def _subheading_code(sh):
    return sh.get("subheading") or sh.get("code")


def load_all_chapters():
    chapters = {}
    for fn in sorted(os.listdir(EXTRACTED_DIR)):
        if not fn.startswith("chapter-") or not fn.endswith(".json"):
            continue
        with open(os.path.join(EXTRACTED_DIR, fn), "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        chapters[data["chapter"]] = data
    return chapters


def main():
    random.seed(SEED)
    chs = load_all_chapters()

    # Sample 30 random chapters
    chapter_keys = sorted(chs.keys())
    sample_chapters = random.sample(chapter_keys, 30)

    # For each, pick up to 10 random tariff_lines
    expected_rows = {}
    for ch_key in sample_chapters:
        ch = chs[ch_key]
        tariff_lines = []
        for h in ch.get("headings", []):
            for sh in h.get("subheadings", []):
                for tl in sh.get("tariff_lines", []):
                    tariff_lines.append({
                        "code": tl["code"],
                        "subheading": _subheading_code(sh),
                        "description": tl.get("description"),
                        "export_policy": tl.get("export_policy"),
                    })
        n = min(10, len(tariff_lines))
        for tl in random.sample(tariff_lines, n):
            expected_rows[tl["code"]] = {
                "subheading": tl["subheading"],
                "description": tl["description"],
                "export_policy": tl["export_policy"],
                "chapter": ch_key,
            }

    out = {
        "audited_at": "2026-05-24",
        "sample_chapters": sample_chapters,
        "sample_codes": sorted(expected_rows.keys()),
        "expected": expected_rows,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"chapters={len(sample_chapters)}, codes={len(expected_rows)}")


if __name__ == "__main__":
    main()
