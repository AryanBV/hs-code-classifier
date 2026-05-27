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

  const aliases = loadAliasMap();
  const { normalized, applied } = applyAliases(rawQuery, aliases);
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
