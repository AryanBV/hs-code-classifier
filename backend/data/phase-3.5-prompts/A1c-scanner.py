"""
Scan all 97 chapter JSON files for positive-definition-by-restriction patterns.
Output candidate notes with full context for manual analysis.
"""
import json
import os
import re
from pathlib import Path

EXTRACTED_DIR = Path(r"C:/Export Business/hs-code-classifier/backend/data/extracted")
OUTPUT_FILE = Path(r"C:/Export Business/hs-code-classifier/backend/data/phase-3.5-prompts/A1c-candidates.json")

# Patterns that indicate positive-restriction (closed definition)
POSITIVE_RESTRICTION_PATTERNS = [
    (r"covers?\s+only", "covers_only"),
    (r"covers?\s+solely", "covers_solely"),
    (r"applies?\s+only\s+to", "applies_only_to"),
    (r"applies?\s+solely\s+to", "applies_solely_to"),
    (r"is\s+restricted\s+to", "is_restricted_to"),
    (r"restricted\s+to", "restricted_to"),
    (r"means\s+only", "means_only"),
    (r"the\s+expression\s*[\"\'“][^\"\'”]+[\"\'”]\s+means\b", "expression_means"),
    (r"the\s+term\s*[\"\'“][^\"\'”]+[\"\'”]\s+means\b", "term_means"),
    (r"the\s+expression\s*[\"\'“][^\"\'”]+[\"\'”]\s+includes\b", "expression_includes"),
    (r"the\s+term\s*[\"\'“][^\"\'”]+[\"\'”]\s+includes\b", "term_includes"),
    (r"the\s+expression\s*[\"\'“][^\"\'”]+[\"\'”]\s+applies\s+(?:only\s+)?to", "expression_applies_to"),
    (r"the\s+term\s*[\"\'“][^\"\'”]+[\"\'”]\s+applies\s+(?:only\s+)?to", "term_applies_to"),
    (r"for\s+the\s+purposes?\s+of\s+(?:this\s+)?(?:Chapter|heading|Section)[^.]+(?:means|applies\s+to)\b", "for_purposes_means"),
    (r"is\s+defined\s+as", "is_defined_as"),
    (r"are\s+to\s+be\s+regarded\s+as", "regarded_as"),
    (r"are\s+to\s+be\s+considered\s+as", "considered_as"),
    (r"shall\s+be\s+taken\s+to\s+(?:apply|mean)", "shall_be_taken_to"),
]

# Escape-hatch words: if present, the note is likely OPEN-ENDED (skip)
ESCAPE_HATCH_PATTERNS = [
    r"\b(?:etc\.?|et\s+cetera)\b",
    r"\bsuch\s+as\b",
    r"\b(?:and|or)\s+the\s+like\b",
    r"\b(?:and|or)\s+similar\b",
    r"\binter\s+alia\b",  # "among other things" — open
    r"\bamong\s+others?\b",
    r"\bfor\s+example\b",
    r"\b(?:e\.g\.?|i\.e\.?)\b",
    r"\bincluding\s+(?:but\s+not\s+limited\s+to)?\b",  # "including" alone is open
]


def has_escape_hatch(text: str) -> tuple[bool, list[str]]:
    """Check if text has open-ended escape-hatch phrases."""
    hits = []
    for pat in ESCAPE_HATCH_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            hits.append(m.group(0))
    return (len(hits) > 0, hits)


def find_positive_restrictions(text: str) -> list[dict]:
    """Find all positive-restriction patterns in a text."""
    hits = []
    for pattern, name in POSITIVE_RESTRICTION_PATTERNS:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            # Capture context: 40 chars before, 200 chars after
            start = max(0, m.start() - 40)
            end = min(len(text), m.end() + 200)
            hits.append({
                "pattern_name": name,
                "matched_text": m.group(0),
                "context": text[start:end],
                "position": m.start(),
            })
    return hits


def scan_chapter(filepath: Path) -> dict:
    """Scan a single chapter JSON file."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    chapter = data.get("chapter", "??")
    title = data.get("title", "")
    candidates = []

    # Scan chapter_notes
    for note in data.get("chapter_notes", []):
        note_num = note.get("number", "")
        text = note.get("text", "")

        # Find positive-restriction patterns
        pos_hits = find_positive_restrictions(text)
        if not pos_hits:
            continue

        # Check for escape hatches in the SAME SENTENCE / clause
        # Heuristic: look in a 250-char window around each hit
        for hit in pos_hits:
            window_start = max(0, hit["position"] - 50)
            window_end = min(len(text), hit["position"] + 250)
            window = text[window_start:window_end]
            has_eh, eh_hits = has_escape_hatch(window)

            candidates.append({
                "chapter": chapter,
                "note_number": note_num,
                "pattern_name": hit["pattern_name"],
                "matched_text": hit["matched_text"],
                "context_window": hit["context"],
                "full_note_text": text,
                "escape_hatch_in_window": has_eh,
                "escape_hatch_hits": eh_hits,
                "note_text_len": len(text),
            })

    # Also scan section_notes (Section I-XXI shared notes — may contain restrictions)
    for note in data.get("section_notes", []):
        note_num = note.get("number", "")
        text = note.get("text", "")
        pos_hits = find_positive_restrictions(text)
        if not pos_hits:
            continue
        for hit in pos_hits:
            window_start = max(0, hit["position"] - 50)
            window_end = min(len(text), hit["position"] + 250)
            window = text[window_start:window_end]
            has_eh, eh_hits = has_escape_hatch(window)
            candidates.append({
                "chapter": chapter,
                "note_number": f"Section Note {note_num}",
                "pattern_name": hit["pattern_name"],
                "matched_text": hit["matched_text"],
                "context_window": hit["context"],
                "full_note_text": text,
                "escape_hatch_in_window": has_eh,
                "escape_hatch_hits": eh_hits,
                "note_text_len": len(text),
                "is_section_note": True,
            })

    # Also scan chapter_subheading_notes (these are sub-classification rules)
    for note in data.get("chapter_subheading_notes", []):
        note_num = note.get("number", "")
        text = note.get("text", "")
        pos_hits = find_positive_restrictions(text)
        if not pos_hits:
            continue
        for hit in pos_hits:
            window_start = max(0, hit["position"] - 50)
            window_end = min(len(text), hit["position"] + 250)
            window = text[window_start:window_end]
            has_eh, eh_hits = has_escape_hatch(window)
            candidates.append({
                "chapter": chapter,
                "note_number": f"Subheading Note {note_num}",
                "pattern_name": hit["pattern_name"],
                "matched_text": hit["matched_text"],
                "context_window": hit["context"],
                "full_note_text": text,
                "escape_hatch_in_window": has_eh,
                "escape_hatch_hits": eh_hits,
                "note_text_len": len(text),
                "is_subheading_note": True,
            })

    return {
        "chapter": chapter,
        "title": title,
        "candidates": candidates,
    }


def main():
    all_results = []
    files = sorted(EXTRACTED_DIR.glob("chapter-*.json"))
    print(f"Scanning {len(files)} chapter files...")

    for f in files:
        result = scan_chapter(f)
        if result["candidates"]:
            all_results.append(result)

    total = sum(len(r["candidates"]) for r in all_results)
    no_eh = sum(1 for r in all_results for c in r["candidates"] if not c["escape_hatch_in_window"])

    summary = {
        "total_candidates": total,
        "no_escape_hatch": no_eh,
        "chapters_with_candidates": len(all_results),
        "by_pattern": {},
        "results": all_results,
    }

    # Count by pattern
    for r in all_results:
        for c in r["candidates"]:
            p = c["pattern_name"]
            summary["by_pattern"][p] = summary["by_pattern"].get(p, 0) + 1

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"Total candidate hits: {total}")
    print(f"Without escape hatch (high-confidence candidates): {no_eh}")
    print(f"Chapters touched: {len(all_results)}")
    print(f"By pattern: {summary['by_pattern']}")
    print(f"Wrote: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
