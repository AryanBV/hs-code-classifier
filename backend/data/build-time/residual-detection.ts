/**
 * Shared BUILD-TIME residual / catch-all detection — RE-EXPORT shim (Stage 3c).
 *
 * The ONE canonical detector now lives at
 * `backend/src/classifier-v2/lib/residual-detection.ts` (tsc-checked + unit-tested).
 * This file is the build-time entry point the O7/O8 derivers import as
 * `../residual-detection`; it simply re-exports the canonical definition so there is
 * a SINGLE word-boundary regex shared by both build-time levels and any runtime
 * consumer. See the canonical module's header for the full rationale (the original
 * O7 `n\.?e\.?s` collapsed to the substring "nes" and false-flagged "sardiNES" /
 * "magNESium" / "marine engiNES"; the word-boundary pattern fixes that).
 *
 * Build-time only (run via tsx, outside the src/ rootDir); no Gemini, no runtime I/O.
 */
export {
  RESIDUAL_RE,
  isResidualDescription,
} from '../../src/classifier-v2/lib/residual-detection';
