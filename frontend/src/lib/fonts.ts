import { Fraunces, Hanken_Grotesk } from "next/font/google";
import localFont from "next/font/local";

/** Display / certificate voice. Variable font; opsz axis for optical sizing. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

/** Body / UI. */
export const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/** HS codes & ledger figures — self-hosted Commit Mono (the locked code font). */
export const commit = localFont({
  variable: "--font-commit",
  display: "swap",
  src: [
    { path: "../fonts/commit-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/commit-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/commit-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
