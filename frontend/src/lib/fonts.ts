import { Fraunces, Hanken_Grotesk } from "next/font/google";
import localFont from "next/font/local";

/**
 * Display / certificate voice. Variable font.
 *
 * We enable Fraunces' real variable axes so each role can drive optical sizing
 * and the soft/wonky character that make a serif feel inked rather than printed:
 *   - opsz  (9..144) — optical size; drive HIGH at the hero, LOW at small UI.
 *   - SOFT  (0..100) — softens terminals; a touch warms the display cut.
 *   - WONK  (0..1)   — the quirky alternates that give Fraunces its hand.
 * `wght` is auto-included as a 100..900 range for variable fonts (do NOT list
 * it in `axes` — next/font rejects that). next/font accepts all three axes here;
 * if a future next/font version rejects SOFT or WONK, keep `opsz` at minimum.
 */
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
});

/** Body / UI. Variable font; weight range covered automatically. */
export const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/** HS codes & ledger figures — self-hosted Commit Mono (the locked code font). */
export const commit = localFont({
  variable: "--font-commit",
  display: "swap",
  preload: false,
  src: [
    { path: "../fonts/commit-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/commit-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/commit-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
