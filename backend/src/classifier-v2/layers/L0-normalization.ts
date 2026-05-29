/**
 * Layer 0 — Input Normalization
 *
 * Deterministic, no-LLM pre-Triage stage. Applies India alias map, tokenizes
 * the query, filters stopwords, and flags composite-product signals.
 *
 * Spec references:
 *   - backend/docs/ARCHITECTURE.md §2 (Layer 0 box)
 *   - backend/docs/ARCHITECTURE.md §3 (Layer 0 I/O row: deterministic, ~10ms)
 *   - backend/src/classifier-v2/types.ts (NormalizedInput shape)
 *
 * The alias map is sourced from build-time job O4 (Opus 4.7). If absent
 * (O4 not yet run), L0 still functions with an empty map — alias substitution
 * is a no-op and tokenization + composite detection proceed normally.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AliasApplied, NormalizedInput } from '../types';

/** Path to the O4 India alias map (resolved from this module's location). */
const ALIAS_MAP_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'build-time',
  'O4-india-alias-map',
  'aliases.json',
);

/**
 * Stopwords filtered from `raw_tokens`. Intentionally EXCLUDES composite-signal
 * tokens ('and', 'with', 'set', 'kit', 'plus') — those must survive into
 * raw_tokens so downstream layers (and the composite_flag computation here)
 * can see them. See ARCHITECTURE.md §2 Layer 0.
 */
const STOPWORDS = new Set<string>(['a', 'an', 'the', 'of', 'for']);

/**
 * Composite-product signal terms. ANY occurrence in tokens OR the raw query
 * text flips `composite_flag = true`. Multi-word phrases ('inclusive of',
 * 'along with') are matched against the raw query substring; single tokens
 * are matched against the post-tokenization list.
 */
const COMPOSITE_SINGLE_TOKENS = new Set<string>([
  'and',
  'with',
  'set',
  'kit',
  'combo',
  'plus',
  'including',
]);
const COMPOSITE_RAW_SYMBOLS: readonly string[] = ['&', '+'];
const COMPOSITE_RAW_PHRASES: readonly string[] = ['inclusive of', 'along with'];

/* ---------------------------------------------------------------------------
 * Noise sanitization (Round 1 routing calibration)
 *
 * Realistic exporter queries arrive wrapped in conversational intent
 * ("I need to export ..."), trailing provenance ("... for export, made in
 * India"), and pasted-tariff structural cruft (leading "---", ":--", bullet
 * dashes). This noise mis-routes Triage to ASK/REFUSE even when a perfectly
 * specific product is present. We strip it DETERMINISTICALLY before alias
 * substitution + tokenization, while PRESERVING every meaningful product word
 * (and intra-word hyphens like 'leaf-spring').
 *
 * Principles:
 *   - General patterns only — no product strings, no per-case matching.
 *   - Conservative: only strip phrases that are unambiguously intent/provenance
 *     or structural markers. A bare "for <use>" (intended-use) is NEVER stripped
 *     — only the closed-set provenance phrase "for export".
 *   - Anchored: leading phrases anchor at start; trailing phrases anchor at end.
 * --------------------------------------------------------------------------- */

/**
 * Leading conversational/intent phrases. Matched case-insensitively, anchored
 * at the start of the (trimmed, marker-stripped) query, and only when followed
 * by further product text. Each pattern ends with `\s+` so we never consume the
 * product head-noun. Ordered longest/most-specific first.
 */
const LEADING_INTENT_PATTERNS: readonly RegExp[] = [
  /^\s*what(?:'s| is| are)?\s+the\s+(?:itc[-\s]?hs|hs|hsn|tariff)\s+codes?\s+(?:for|of)\s+/i,
  /^\s*what(?:'s| is| are)?\s+the\s+codes?\s+(?:for|of)\s+/i,
  /^\s*(?:can|could)\s+you\s+(?:please\s+)?(?:classify|tell me the (?:hs )?code (?:for|of))\s+/i,
  /^\s*(?:i\s+(?:need|want|would like|am looking|'m looking)|we\s+(?:need|want))\s+to\s+(?:export|classify|ship|sell)\s+/i,
  /^\s*looking\s+to\s+(?:export|classify|ship|sell)\s+/i,
  /^\s*(?:please\s+)?(?:classify|find (?:the )?(?:hs )?code (?:for|of)|identify (?:the )?(?:hs )?code (?:for|of))\s+/i,
  /^\s*(?:hs|hsn|itc[-\s]?hs|tariff)\s+codes?\s+(?:for|of)\s+/i,
];

/**
 * Trailing provenance phrases. Matched case-insensitively, anchored at the end.
 * Closed set — only unambiguous provenance, never generic intended-use.
 *   - "for export" (optionally preceded by a comma/dash)
 *   - "made in <country>" / "manufactured in <country>" / "origin <country>"
 * The `<country>` capture is a short run of capitalized/alpha words so we don't
 * swallow real product words.
 */
const TRAILING_PROVENANCE_PATTERNS: readonly RegExp[] = [
  /[\s,;-]+for\s+export\s*$/i,
  /[\s,;-]+(?:made|manufactured|produced)\s+in\s+[A-Za-z][A-Za-z .'-]*$/i,
  /[\s,;-]+(?:country\s+of\s+)?origin\s*:?\s+[A-Za-z][A-Za-z .'-]*$/i,
];

/**
 * Strip pasted-tariff structural markers and bullet punctuation. Operates on the
 * whole string (leading markers + repeated-dash runs), NOT on intra-word
 * hyphens. We only treat a dash run as structural when it is bounded by
 * whitespace or string edges — `leaf-spring` (letter-hyphen-letter) is untouched.
 */
function stripStructuralMarkers(s: string): string {
  let out = s;
  // Leading bullet/structural markers: runs of ':', '-', whitespace at the very
  // start (e.g., '---', ':--', '- ', ': '). Repeated until none remain.
  out = out.replace(/^[\s:–—-]+/u, '');
  // Standalone dash/colon runs surrounded by whitespace (pasted-tariff column
  // separators like ' ---- '). The lookarounds keep 'leaf-spring' intact.
  out = out.replace(/(^|\s)[:–—-]{2,}(\s|$)/gu, '$1 $2');
  // Pasted-tariff dangling colons act as COLUMN SEPARATORS after provenance
  // stripping (e.g. 'Durum wheat : Seed', 'Underpants and briefs: Of cotton').
  // A colon is a separator iff it is ADJACENT to whitespace (or a string edge)
  // on at least one side: whitespace-then-colon (with optional trailing space),
  // OR colon-then-whitespace (with optional leading space), OR a trailing colon
  // at end-of-string. Replace each with a single space. The lookbehind/edge
  // logic PRESERVES intra-token colons flanked by non-space on BOTH sides
  // ('ISO:3234', '1:2', '2:1 ratio', 'URL:http').
  out = out.replace(/\s+:\s*|:\s+|:\s*$/gu, ' ');
  // Collapse any whitespace introduced above.
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Remove leading intent phrases and trailing provenance phrases. Applied
 * repeatedly for the leading set (a query may stack a marker + an intent
 * phrase). Never strips down to empty when product text remains; if a pattern
 * would consume the ENTIRE remaining string, it is skipped (defensive — a query
 * that is ONLY an intent phrase has no product to preserve and legitimately
 * reduces to '').
 */
function stripIntentAndProvenance(s: string): string {
  let out = s;

  // Leading intent — loop so 'please classify - <product>' (marker then intent,
  // or stacked intents) fully resolves. Bounded iterations to avoid any chance
  // of a pathological loop.
  for (let i = 0; i < 4; i += 1) {
    let matchedThisPass = false;
    for (const re of LEADING_INTENT_PATTERNS) {
      const m = re.exec(out);
      if (m && m[0].length > 0 && m[0].length < out.length) {
        out = out.slice(m[0].length);
        out = stripStructuralMarkers(out);
        matchedThisPass = true;
        break;
      }
    }
    if (!matchedThisPass) break;
  }

  // Trailing provenance — single pass per pattern (apply all, longest effect).
  for (const re of TRAILING_PROVENANCE_PATTERNS) {
    const m = re.exec(out);
    if (m && m[0].length > 0 && m[0].length < out.length) {
      out = out.slice(0, out.length - m[0].length).trim();
    }
  }

  return out;
}

/**
 * Full noise-sanitization pass over a raw query. Strips structural markers, then
 * leading-intent + trailing-provenance, then re-strips markers exposed by the
 * provenance removal. Returns a cleaned string with original casing preserved
 * for the surviving product words.
 */
function sanitizeNoise(rawQuery: string): string {
  let out = stripStructuralMarkers(rawQuery);
  out = stripIntentAndProvenance(out);
  // A trailing provenance strip can re-expose a dangling separator; clean again.
  out = stripStructuralMarkers(out);
  return out;
}

/** Test-only hook: expose noise sanitization directly. */
export function _sanitizeNoiseForTesting(rawQuery: string): string {
  return sanitizeNoise(rawQuery);
}

/* ---------------------------------------------------------------------------
 * Alias map loader (cached, one-time at module load)
 * --------------------------------------------------------------------------- */

interface CompiledAlias {
  alias:    string;
  /** Canonical replacement text (verbatim from alias map). */
  canonical: string;
  /** Regex with case-insensitive flag + word-ish boundaries on either side. */
  regex:    RegExp;
}

let _cachedAliases: CompiledAlias[] | null = null;

/** Escape regex metacharacters in `s` so it can be used as a literal pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Load and compile the alias map. Cached after first call. Returns [] if the
 * file is missing or malformed (warns to stderr in the malformed case).
 */
function loadAliasMap(): CompiledAlias[] {
  if (_cachedAliases !== null) return _cachedAliases;

  if (!fs.existsSync(ALIAS_MAP_PATH)) {
    _cachedAliases = [];
    return _cachedAliases;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(ALIAS_MAP_PATH, 'utf8');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[L0] Failed to read alias map at ${ALIAS_MAP_PATH}: ${(err as Error).message}`);
    _cachedAliases = [];
    return _cachedAliases;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[L0] Malformed JSON in alias map at ${ALIAS_MAP_PATH}: ${(err as Error).message}`);
    _cachedAliases = [];
    return _cachedAliases;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // eslint-disable-next-line no-console
    console.warn(`[L0] Alias map at ${ALIAS_MAP_PATH} is not a JSON object — ignoring.`);
    _cachedAliases = [];
    return _cachedAliases;
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const compiled: CompiledAlias[] = [];
  for (const [alias, canonical] of entries) {
    if (typeof canonical !== 'string' || alias.length === 0) continue;
    // Word-ish boundary: not preceded/followed by a letter/digit. This handles
    // aliases ending in '.' (like 'M.S.') where \b would fail because '.' is
    // not a word char.
    const pattern = `(?<![A-Za-z0-9])${escapeRegex(alias)}(?![A-Za-z0-9])`;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'gi');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[L0] Skipping alias '${alias}' — regex compile failed: ${(err as Error).message}`);
      continue;
    }
    compiled.push({ alias, canonical, regex });
  }

  // Sort by alias length descending so longer aliases match before shorter
  // sub-strings (e.g., 'channa dal' before 'dal').
  compiled.sort((a, b) => b.alias.length - a.alias.length);

  _cachedAliases = compiled;
  return _cachedAliases;
}

/** Test-only hook: clear the cached alias map (re-read on next call). */
export function _clearAliasCacheForTesting(): void {
  _cachedAliases = null;
}

/** Test-only hook: return the resolved alias map path. */
export function _getAliasMapPathForTesting(): string {
  return ALIAS_MAP_PATH;
}

/* ---------------------------------------------------------------------------
 * Casing preservation
 * --------------------------------------------------------------------------- */

/**
 * If the matched alias text was ALL-UPPERCASE, return canonical uppercased.
 * If it was Title-Case (first letter capitalized), capitalize first letter
 * of canonical. Otherwise return canonical as-is (lowercase by convention in
 * the alias map values).
 */
function preserveCasing(matched: string, canonical: string): string {
  // Strip non-letters when checking case (handles 'M.S.' → letters MS)
  const letters = matched.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return canonical;

  const isAllUpper = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const firstLetter = matched.match(/[A-Za-z]/);
  const isFirstUpper = firstLetter !== null && firstLetter[0] === firstLetter[0].toUpperCase();

  // Abbreviation pattern (e.g., 'M.S.', 'M.s.') — embedded period between
  // letters. For abbreviations, don't shout-cap even if all letters are
  // uppercase (user typed an abbreviation, not screaming). Title-case only
  // when the first letter is uppercase AND a later letter is lowercase
  // (distinguishing 'M.s.' from 'M.S.').
  const isAbbreviation = /[A-Za-z]\.[A-Za-z]/.test(matched);
  const hasLowerLetter = /[a-z]/.test(matched);

  if (isAllUpper && letters.length >= 3 && !isAbbreviation) {
    return canonical.toUpperCase();
  }
  if (isFirstUpper && (!isAbbreviation || hasLowerLetter)) {
    // Capitalize first letter of canonical, leave the rest alone.
    const idx = canonical.search(/[A-Za-z]/);
    if (idx < 0) return canonical;
    const ch = canonical.charAt(idx);
    return canonical.slice(0, idx) + ch.toUpperCase() + canonical.slice(idx + 1);
  }
  return canonical;
}

/* ---------------------------------------------------------------------------
 * Tokenizer
 * --------------------------------------------------------------------------- */

/**
 * Split `s` on whitespace + punctuation, return lowercase tokens with stopwords
 * and <2-char tokens filtered out. Composite-signal tokens are NOT filtered
 * (see STOPWORDS comment above).
 */
function tokenize(s: string): string[] {
  // Replace anything that isn't an ASCII letter or digit with whitespace,
  // then split. Keeps tokens like 'm10' intact.
  const cleaned = s.replace(/[^A-Za-z0-9]+/g, ' ');
  const raw = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  const tokens: string[] = [];
  for (const t of raw) {
    const lower = t.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    tokens.push(lower);
  }
  return tokens;
}

/* ---------------------------------------------------------------------------
 * Composite detector
 * --------------------------------------------------------------------------- */

function detectComposite(rawQuery: string, tokens: string[]): boolean {
  // Token-level (post-filter)
  for (const t of tokens) {
    if (COMPOSITE_SINGLE_TOKENS.has(t)) return true;
  }
  // Raw-query symbols — match anywhere (e.g., 'pen+pencil', 'pen & pencil').
  for (const sym of COMPOSITE_RAW_SYMBOLS) {
    if (rawQuery.includes(sym)) return true;
  }
  // Raw-query phrases — case-insensitive whole-substring search.
  const lowerRaw = rawQuery.toLowerCase();
  for (const phrase of COMPOSITE_RAW_PHRASES) {
    if (lowerRaw.includes(phrase)) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Alias substitution
 * --------------------------------------------------------------------------- */

function applyAliases(
  query: string,
  aliases: CompiledAlias[],
): { normalized: string; applied: AliasApplied[] } {
  if (aliases.length === 0) return { normalized: query, applied: [] };

  let normalized = query;
  const applied: AliasApplied[] = [];

  for (const a of aliases) {
    // Reset lastIndex (the regex is /g; we use replace not exec, but defensive).
    a.regex.lastIndex = 0;
    if (!a.regex.test(normalized)) continue;
    a.regex.lastIndex = 0;

    let didReplace = false;
    normalized = normalized.replace(a.regex, (matched) => {
      didReplace = true;
      return preserveCasing(matched, a.canonical);
    });
    if (didReplace) {
      applied.push({ alias: a.alias, replaced_with: a.canonical });
    }
  }

  return { normalized, applied };
}

/* ---------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------- */

/**
 * Normalize a user query for downstream pipeline layers.
 *
 * Pure-ish: the alias map file is read once and cached at module level. No
 * other side effects. Throws nothing — malformed inputs / missing alias map
 * degrade to safe defaults.
 *
 * @param query           Raw user query (any casing, any length).
 * @param previousAnswers Multi-turn replay state (currently unused at L0; reserved
 *                        for future use per ARCHITECTURE.md §3).
 * @returns NormalizedInput with normalized_query, raw_tokens, composite_flag,
 *          and an aliases_applied audit trail.
 *
 * @example
 * const out = await normalize('M.S. hex bolts and nuts');
 * // out.normalized_query → 'Mild steel hex bolts and nuts' (if O4 alias map populated)
 * // out.raw_tokens       → ['mild', 'steel', 'hex', 'bolts', 'and', 'nuts']
 * // out.composite_flag   → true  (contains 'and')
 * // out.aliases_applied  → [{ alias: 'M.S.', replaced_with: 'mild steel' }]
 */
export async function normalize(
  query: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  previousAnswers: Record<string, string> = {},
): Promise<NormalizedInput> {
  const rawQuery = typeof query === 'string' ? query : '';

  // Edge: empty / whitespace-only query
  if (rawQuery.trim().length === 0) {
    return {
      query: rawQuery,
      normalized_query: '',
      raw_tokens: [],
      composite_flag: false,
      aliases_applied: [],
    };
  }

  // Strip conversational intent, trailing provenance, and pasted-tariff
  // structural markers BEFORE alias substitution + tokenization. This keeps the
  // product description intact for downstream Triage/retrieval while removing
  // noise that mis-routes Triage to ASK/REFUSE.
  const sanitized = sanitizeNoise(rawQuery);

  // If sanitization reduced the query to empty (e.g., the input was ONLY noise
  // markers / a bare intent phrase), there is no product to classify.
  if (sanitized.trim().length === 0) {
    return {
      query: rawQuery,
      normalized_query: '',
      raw_tokens: [],
      composite_flag: false,
      aliases_applied: [],
    };
  }

  const aliases = loadAliasMap();
  const { normalized, applied } = applyAliases(sanitized, aliases);
  const tokens = tokenize(normalized);
  const composite = detectComposite(normalized, tokens);

  return {
    query: rawQuery,
    normalized_query: normalized,
    raw_tokens: tokens,
    composite_flag: composite,
    aliases_applied: applied,
  };
}
