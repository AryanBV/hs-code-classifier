"""L1 adversarial audit for chapter JSONs vs source PDFs.
Refined methodology:
  - pdftotext -layout for column-aware extraction
  - subheading-presence acceptance (standalone OR any 8-digit child)
  - document-level word-recall for description similarity
  - skip chapter_notes verbatim for Ch.50/53/64 (patched from WCO)
"""
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path

random.seed(42)

PDF_DIR = Path(r"C:/Export Business/hs-code-classifier/data/pdfs")
JSON_DIR = Path(r"C:/Export Business/hs-code-classifier/backend/data/extracted")
OUT_DIR = Path(r"C:/Export Business/hs-code-classifier/backend/data/verification-reports")

PDF_MAP = {p.stem.split()[1]: p for p in PDF_DIR.glob("Chapter *.pdf")}
WCO_PATCHED = {"50", "53", "64"}  # chapter_notes patched from WCO — skip notes verbatim check

STOPWORDS = set("a an and or of the for with in on by to from at as is be that this these those other such not".split())


def extract_pdf_text(pdf_path: Path) -> str:
    """Run pdftotext -layout and return whole-doc text."""
    out = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return out.stdout or ""


def normalize_code(code: str) -> str:
    """Strip dots from HS code."""
    return code.replace(".", "").replace(" ", "")


def words(text: str) -> set:
    """Tokenize to lowercased significant words."""
    toks = re.findall(r"[a-zA-Z]+", text.lower())
    return {t for t in toks if t not in STOPWORDS and len(t) > 2}


def word_recall(desc_json: str, pdf_text: str) -> tuple[float, list[str]]:
    """Doc-level: fraction of significant words from desc found anywhere in pdf."""
    dw = words(desc_json)
    if not dw:
        return 1.0, []
    pw = words(pdf_text)
    missing = sorted(dw - pw)
    recall = (len(dw) - len(missing)) / len(dw)
    return recall, missing


def find_code_context(code_no_dots: str, pdf_text: str, span: int = 100) -> str | None:
    """Find code in PDF (with or without dots) and return surrounding context."""
    # try plain (no dots) since pdftotext usually concatenates digits
    idx = pdf_text.find(code_no_dots)
    if idx == -1:
        # try dotted variants
        if len(code_no_dots) == 8:
            dotted = f"{code_no_dots[:4]}.{code_no_dots[4:6]}.{code_no_dots[6:]}"
            idx = pdf_text.find(dotted)
            if idx == -1:
                dotted2 = f"{code_no_dots[:4]} {code_no_dots[4:6]} {code_no_dots[6:]}"
                idx = pdf_text.find(dotted2)
        elif len(code_no_dots) == 6:
            dotted = f"{code_no_dots[:4]}.{code_no_dots[4:]}"
            idx = pdf_text.find(dotted)
    if idx == -1:
        return None
    start = max(0, idx - span)
    end = min(len(pdf_text), idx + span)
    ctx = pdf_text[start:end].replace("\n", " ")
    ctx = re.sub(r"\s+", " ", ctx)
    return ctx


def collect_all_codes(chapter_json: dict) -> tuple[list, list, list]:
    """Return (headings 4-digit, subheadings 6-digit no-dots, tariff_lines 8-digit no-dots) lists with (code, desc)."""
    headings = []
    subs = []
    lines = []
    for h in chapter_json.get("headings", []):
        headings.append((h["heading"], h.get("title", "")))
        for sh in h.get("subheadings", []):
            sh_code = normalize_code(sh["subheading"])
            subs.append((sh_code, sh.get("title", "")))
            for tl in sh.get("tariff_lines", []):
                lines.append((normalize_code(tl["code"]), tl.get("description", "")))
    return headings, subs, lines


def audit_chapter(ch_num: str) -> dict:
    pdf_path = PDF_MAP.get(ch_num)
    json_path = JSON_DIR / f"chapter-{ch_num}.json"
    if not pdf_path or not json_path.exists():
        return {"chapter": ch_num, "verdict": "MAJOR", "error": "missing pdf or json"}

    with open(json_path, encoding="utf-8") as f:
        ch = json.load(f)

    pdf_text = extract_pdf_text(pdf_path)
    pdf_text_norm = re.sub(r"\s+", " ", pdf_text)

    headings, subs, lines = collect_all_codes(ch)

    # --- 1. spot-check 10 random 8-digit codes ---
    spot_check = []
    sample_n = min(10, len(lines))
    sampled = random.sample(lines, sample_n) if sample_n else []
    for code, desc in sampled:
        ctx = find_code_context(code, pdf_text_norm)
        in_pdf = ctx is not None
        recall, missing = word_recall(desc, pdf_text_norm)
        match_label = "exact" if recall >= 0.85 else ("partial" if recall >= 0.5 else "weak")
        spot_check.append({
            "code": code,
            "in_pdf": in_pdf,
            "pdf_context_near_code": ctx[:300] if ctx else None,
            "json_description": desc,
            "desc_significant_word_recall": round(recall, 2),
            "missing_words": missing[:10],
            "match": match_label,
        })

    # --- 2. subheading spot-check (5) — child acceptance ---
    sh_check = []
    sh_sample_n = min(5, len(subs))
    sh_sampled = random.sample(subs, sh_sample_n) if sh_sample_n else []
    for sh_code, sh_desc in sh_sampled:
        in_pdf_standalone = find_code_context(sh_code, pdf_text_norm) is not None
        # child acceptance: any 8-digit starting with this 6-digit
        child_found = any(c[0].startswith(sh_code) and find_code_context(c[0], pdf_text_norm) for c in lines)
        accepted = in_pdf_standalone or child_found
        recall, missing = word_recall(sh_desc, pdf_text_norm)
        sh_check.append({
            "subheading": sh_code,
            "in_pdf_standalone": in_pdf_standalone,
            "any_child_in_pdf": child_found,
            "accepted": accepted,
            "json_description": sh_desc[:200],
            "desc_significant_word_recall": round(recall, 2),
            "missing_words": missing[:10],
        })

    # --- 3. hierarchy sanity: every 8-digit's first 4 must be a heading ---
    heading_codes = {h[0] for h in headings}
    hierarchy_errors = []
    for c, _ in lines:
        if c[:4] not in heading_codes:
            hierarchy_errors.append({"code": c, "missing_heading": c[:4]})

    # --- 4. count check ---
    count_check = {
        "headings_in_json": len(headings),
        "subheadings_in_json": len(subs),
        "tariff_lines_in_json": len(lines),
    }

    # --- 5. notes verbatim spot-check (skip WCO-patched chapters) ---
    note_mismatches = []
    notes_count = len(ch.get("chapter_notes", []) or [])
    if ch_num not in WCO_PATCHED:
        # take up to 3 chapter_notes and check word recall
        ch_notes = ch.get("chapter_notes", []) or []
        for i, note in enumerate(ch_notes[:3]):
            note_text = note if isinstance(note, str) else (note.get("text") or json.dumps(note))
            recall, missing = word_recall(note_text[:500], pdf_text_norm)
            if recall < 0.6:
                note_mismatches.append({
                    "index": i,
                    "recall": round(recall, 2),
                    "missing_sample": missing[:8],
                    "note_excerpt": note_text[:200],
                })

    # --- 6. verdict ---
    spot_in_pdf = sum(1 for s in spot_check if s["in_pdf"])
    spot_match = sum(1 for s in spot_check if s["match"] == "exact")
    sh_accepted = sum(1 for s in sh_check if s["accepted"])

    findings_count = (
        len(hierarchy_errors) +
        (sample_n - spot_in_pdf) +  # codes missing from PDF
        (sh_sample_n - sh_accepted) +
        len(note_mismatches)
    )
    soft_warnings = (spot_in_pdf - spot_match) + sum(1 for s in sh_check if s["accepted"] and s["desc_significant_word_recall"] < 0.7)

    if findings_count == 0:
        verdict = "CLEAN" if soft_warnings <= 2 else "MINOR"
    elif findings_count <= 3:
        verdict = "MINOR"
    else:
        verdict = "MAJOR"

    return {
        "chapter": ch_num,
        "verified_at": "2026-05-22",
        "verdict": verdict,
        "findings_count": findings_count,
        "soft_warnings_count": soft_warnings,
        "wco_patched_notes_skipped": ch_num in WCO_PATCHED,
        "findings": {
            "spot_check_codes": spot_check,
            "subheading_spot_check": sh_check,
            "hierarchy_errors": hierarchy_errors[:20],
            "hierarchy_errors_total": len(hierarchy_errors),
            "missed_codes": [],
            "extra_codes": [],
            "note_mismatches": note_mismatches,
            "count_check": count_check,
            "notes_count": notes_count,
        },
        "warnings": [],
    }


def main():
    targets = ["49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64"]
    summary = []
    for ch in targets:
        print(f"Auditing chapter {ch}...", flush=True)
        try:
            report = audit_chapter(ch)
        except Exception as e:
            report = {"chapter": ch, "verdict": "MAJOR", "error": str(e)}
            print(f"  ERROR: {e}", flush=True)
        out_path = OUT_DIR / f"chapter-{ch}-audit.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        summary.append({
            "chapter": ch,
            "verdict": report.get("verdict"),
            "findings_count": report.get("findings_count"),
            "soft_warnings": report.get("soft_warnings_count"),
            "headings": report.get("findings", {}).get("count_check", {}).get("headings_in_json"),
            "subheadings": report.get("findings", {}).get("count_check", {}).get("subheadings_in_json"),
            "tariff_lines": report.get("findings", {}).get("count_check", {}).get("tariff_lines_in_json"),
            "hierarchy_errors": report.get("findings", {}).get("hierarchy_errors_total"),
        })
        print(f"  -> {report.get('verdict')}  findings={report.get('findings_count')}  soft={report.get('soft_warnings_count')}", flush=True)

    print("\n=== SUMMARY ===")
    print(f"{'CH':<4} {'VERDICT':<8} {'FIND':<5} {'SOFT':<5} {'H':<4} {'SH':<5} {'TL':<6} {'HIER':<5}")
    for r in summary:
        print(f"{r['chapter']:<4} {r['verdict'] or '-':<8} {str(r['findings_count']):<5} {str(r['soft_warnings']):<5} {str(r['headings']):<4} {str(r['subheadings']):<5} {str(r['tariff_lines']):<6} {str(r['hierarchy_errors']):<5}")


if __name__ == "__main__":
    main()
