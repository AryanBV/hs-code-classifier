"""Phase-2c focused extractor: pulls Export Policy + Policy Condition columns
from CBIC Schedule-2 PDFs for chapters 65-82 (excluding 72-77) and updates
ONLY `export_policy` and `policy_condition` on tariff_lines in extracted JSONs.

Idempotent: re-running on already-filled JSONs produces no diff (values match).
Touches no other fields.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Dict, Optional, Tuple

PDF_DIR = r'C:\Export Business\hs-code-classifier\data\pdfs'
JSON_DIR = r'C:\Export Business\hs-code-classifier\backend\data\extracted'
TMP_DIR = r'C:\Users\ASUS\AppData\Local\Temp\phase2c-65-82'

POLICY_TOKENS = {'Free', 'Restricted', 'Prohibited'}

# Anchored at line start: 8-digit dotless code, then description, then policy
# token, then optional condition.  We use a permissive split because pdftotext
# preserves whitespace columns inconsistently across chapters.
ROW_RE = re.compile(
    r'^\s*(?P<code>\d{8})\s+(?P<rest>.+?)\s*$'
)


def run_pdftotext(pdf_path: str, out_path: str) -> None:
    """Invoke pdftotext -table, falling back to -layout on failure."""
    if os.path.exists(out_path):
        os.remove(out_path)
    res = subprocess.run(
        ['pdftotext', '-table', pdf_path, out_path],
        capture_output=True, text=True,
    )
    if res.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        subprocess.run(
            ['pdftotext', '-layout', pdf_path, out_path],
            capture_output=True, text=True, check=True,
        )


CONDITION_N_RE = re.compile(r'Condition\s+(\d+)\s+of', re.IGNORECASE)


def normalize_condition(raw_cond: Optional[str]) -> Optional[str]:
    """Reconstruct fragmented "Subject to Policy Condition N of the Chapter."
    text into its canonical form.  Returns None for empty / dash-only.

    The PDF prints this condition vertically across 3 visual lines:
        Subject to Policy
        Condition N of
        the Chapter.
    pdftotext may stitch them in any order, so we detect the components and
    reconstruct.
    """
    if raw_cond is None:
        return None
    s = ' '.join(raw_cond.split())  # collapse whitespace
    if not s or s == '-':
        return None

    # Strip leading description bleed (next-row description that leaked in).
    # Anything before "Subject to Policy" or "Condition N" that looks like a
    # description (contains keywords typical of HS descriptions) is dropped.
    lower = s.lower()
    has_subject = 'subject to policy' in lower
    m = CONDITION_N_RE.search(s)

    if m and has_subject:
        n = m.group(1)
        return f'Subject to Policy Condition {n} of the Chapter.'
    if m:
        n = m.group(1)
        return f'Subject to Policy Condition {n} of the Chapter.'
    if has_subject and 'the chapter' in lower:
        # We see "Subject to Policy ... the Chapter." but no "Condition N".
        # The N was lost in the PDF scramble.  Drop a marker we can fix up.
        return 'Subject to Policy Condition of the Chapter.'
    if has_subject:
        # Lone "Subject to Policy" with no "Condition N" — this is likely a
        # floating header that shouldn't have been attached; treat as null
        # unless it's accompanied by something else.
        # Keep as-is for review, but clean.
        return 'Subject to Policy'
    return s


def split_row(rest: str) -> Tuple[str, Optional[str], Optional[str]]:
    """Given the row remainder after the 8-digit code, return
    (description, export_policy, policy_condition)."""
    # Find the LAST occurrence of a policy token surrounded by whitespace.
    # Everything before = description, everything after = condition.
    best_idx = -1
    best_token: Optional[str] = None
    for tok in POLICY_TOKENS:
        # Word-boundary match
        for m in re.finditer(r'(?<!\S)' + re.escape(tok) + r'(?!\S)', rest):
            if m.start() > best_idx:
                best_idx = m.start()
                best_token = tok
    if best_token is None:
        return rest.strip(), None, None
    desc = rest[:best_idx].strip()
    after = rest[best_idx + len(best_token):].strip()
    cond = normalize_condition(after) if after else None
    return desc, best_token, cond


def parse_table(text: str) -> Dict[str, Tuple[Optional[str], Optional[str]]]:
    """Return {dotless_8digit_code: (policy, condition)}."""
    out: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
    in_tariff_section = False
    for raw in text.splitlines():
        # Trigger: the "Product Description and Export Policy" header marks
        # where the tariff table starts.  We don't strictly need this gate
        # since the 8-digit regex is precise, but it avoids matching Sl.No.
        # rows that happen to contain 8 digits (e.g. notification numbers).
        if 'Product Description' in raw and 'Export Policy' in raw:
            in_tariff_section = True
            continue
        if not in_tariff_section:
            continue
        m = ROW_RE.match(raw)
        if not m:
            continue
        code = m.group('code')
        rest = m.group('rest')
        desc, pol, cond = split_row(rest)
        # If a policy token wasn't on this row, the row might be wrapped — the
        # policy may appear on the next non-empty line.  We handle that with
        # a tiny lookahead by tracking the previous code.
        out[code] = (pol, cond)
    return out


# Lines starting with a 4-digit heading code, 6-digit subheading code, or
# a section/chapter title break the current tariff row — they are the NEXT
# row, not a continuation of the current one.
HEADING_RE = re.compile(r'^\s*\d{4}\s')               # 4-digit heading row
SUBHEADING_RE = re.compile(r'^\s*\d{6}\s')            # 6-digit subheading row
NEW_ROW_RE = re.compile(r'^\s*\d{8}\s')               # next 8-digit row


def parse_with_wraps(text: str) -> Dict[str, Tuple[Optional[str], Optional[str]]]:
    """Robust parser that handles rows where the policy/condition is wrapped
    to the next line(s) (common when description is long).

    Continuation rules: a line is treated as a wrap of the current tariff row
    only if it does NOT itself begin a new heading (4-digit), subheading
    (6-digit), or tariff line (8-digit).  Anything starting with a digit
    block at column-start ends the current row's buffer.
    """
    lines = text.splitlines()
    out: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
    in_tariff_section = False
    pending_code: Optional[str] = None
    pending_buf: str = ''

    def flush():
        nonlocal pending_code, pending_buf
        if pending_code is not None:
            _, pol, cond = split_row(pending_buf)
            out[pending_code] = (pol, cond)
        pending_code = None
        pending_buf = ''

    def has_policy(buf: str) -> bool:
        for tok in POLICY_TOKENS:
            if re.search(r'(?<!\S)' + re.escape(tok) + r'(?!\S)', buf):
                return True
        return False

    # Track "floating" condition prefix lines that appear ABOVE the tariff row
    # (e.g. "Subject to Policy" printed above the 8-digit code line).
    floating_prefix: list[str] = []

    def is_condition_phrase(s: str) -> bool:
        s = s.strip()
        if not s:
            return False
        lower = s.lower()
        return (
            lower.startswith('subject to policy')
            or lower.startswith('subject to')
            or lower.startswith('condition ')
            or lower.startswith('the chapter')
            or lower.startswith('free subject')
            or lower.startswith('kimberley')
            or lower.endswith('subject to policy')
        )

    for raw in lines:
        if 'Product Description' in raw and 'Export Policy' in raw:
            in_tariff_section = True
            continue
        if not in_tariff_section:
            continue

        if NEW_ROW_RE.match(raw):
            flush()
            m = ROW_RE.match(raw)
            if m:
                pending_code = m.group('code')
                pending_buf = m.group('rest')
                # If there was a floating condition prefix above this row,
                # attach it to the buffer — it belongs to this row.
                if floating_prefix:
                    pending_buf += ' ' + ' '.join(floating_prefix)
                    floating_prefix = []
            continue

        # A 4- or 6-digit row terminates the current tariff line; the policy
        # column on that row belongs to the heading/subheading itself, not to
        # the previous 8-digit line.
        if HEADING_RE.match(raw) or SUBHEADING_RE.match(raw):
            flush()
            floating_prefix = []
            continue

        stripped = raw.strip()
        if not stripped:
            continue

        # Detect a line that's a description-bleed + trailing floating
        # condition (e.g. "Precious or semi-precious stones... -- Subject
        # to Policy").  In this case the trailing condition phrase belongs
        # to the NEXT 8-digit row, not the current one.
        # Heuristic: if the line ends with a known condition phrase preceded
        # by descriptive text, split it.
        trailing_subject = re.search(r'\s+(Subject\s+to\s+Policy)\s*$', stripped)
        if trailing_subject and len(stripped) - trailing_subject.start() < len(stripped) * 0.7:
            floating_prefix.append(trailing_subject.group(1))
            continue
        # Same logic but for trailing "Condition N of" — this happens when
        # the description bleeds onto the same visual row as the condition's
        # middle line.  Append to the CURRENT row's buffer (it's the wrap of
        # the policy column that goes with the current row).
        trailing_cond_n = re.search(r'(Condition\s+\d+\s+of)\s*$', stripped)
        if trailing_cond_n and pending_code is not None and has_policy(pending_buf):
            pending_buf += ' ' + trailing_cond_n.group(1)
            continue

        # Continuation lines after an 8-digit row
        if pending_code is not None:
            if has_policy(pending_buf):
                # Policy captured; only append if line is clearly a condition wrap
                if is_condition_phrase(stripped):
                    pending_buf += ' ' + stripped
                # else: drop (next row's description leaking)
            else:
                pending_buf += ' ' + stripped
        else:
            # Between rows; collect condition phrases as floating prefix
            if is_condition_phrase(stripped):
                floating_prefix.append(stripped)

    flush()
    return out


def dotless(code_with_dots: str) -> str:
    return code_with_dots.replace('.', '')


def update_json(chapter: int, policy_map: Dict[str, Tuple[Optional[str], Optional[str]]]) -> Dict[str, int]:
    path = os.path.join(JSON_DIR, f'chapter-{chapter:02d}.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    stats = {'Free': 0, 'Restricted': 0, 'Prohibited': 0, 'NULL': 0, 'with_condition': 0, 'unmatched': 0, 'total': 0}

    def walk(obj):
        if isinstance(obj, dict):
            if 'tariff_lines' in obj and isinstance(obj['tariff_lines'], list):
                for t in obj['tariff_lines']:
                    code = t.get('code')
                    if not code:
                        continue
                    stats['total'] += 1
                    key = dotless(code)
                    if key in policy_map:
                        pol, cond = policy_map[key]
                        if pol in POLICY_TOKENS:
                            t['export_policy'] = pol
                        else:
                            t['export_policy'] = None
                        # Normalize: empty/dash condition → None
                        if cond and cond.strip() and cond.strip() != '-':
                            t['policy_condition'] = cond.strip()
                        else:
                            t['policy_condition'] = None
                    else:
                        # Code not found in PDF parsing — leave NULL, log it
                        t['export_policy'] = None
                        t['policy_condition'] = None
                        stats['unmatched'] += 1
                    # Tally
                    pv = t.get('export_policy')
                    if pv in POLICY_TOKENS:
                        stats[pv] += 1
                    else:
                        stats['NULL'] += 1
                    if t.get('policy_condition'):
                        stats['with_condition'] += 1
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(data)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    return stats


def main() -> int:
    os.makedirs(TMP_DIR, exist_ok=True)
    chapters = [65, 66, 67, 68, 69, 70, 71, 78, 79, 80, 81, 82]
    overall = {}
    for ch in chapters:
        # Resolve PDF filename
        candidates = [f for f in os.listdir(PDF_DIR) if f.startswith(f'Chapter {ch} ') and f.endswith('.pdf')]
        if not candidates:
            print(f'[ch{ch:02d}] NO PDF FOUND', file=sys.stderr)
            continue
        pdf_path = os.path.join(PDF_DIR, candidates[0])
        out_path = os.path.join(TMP_DIR, f'ch{ch:02d}.txt')
        run_pdftotext(pdf_path, out_path)
        with open(out_path, 'r', encoding='utf-8') as f:
            text = f.read()
        policy_map = parse_with_wraps(text)
        stats = update_json(ch, policy_map)
        overall[ch] = stats
        print(
            f'ch{ch:02d}: total={stats["total"]:3d}  '
            f'Free={stats["Free"]:3d}  '
            f'Restricted={stats["Restricted"]:3d}  '
            f'Prohibited={stats["Prohibited"]:3d}  '
            f'NULL={stats["NULL"]:3d}  '
            f'cond={stats["with_condition"]:3d}  '
            f'unmatched={stats["unmatched"]:3d}'
        )
    return 0


if __name__ == '__main__':
    sys.exit(main())
