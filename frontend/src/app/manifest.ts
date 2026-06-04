import type { MetadataRoute } from "next";

/**
 * PWA web manifest (served at /manifest.webmanifest).
 *
 * Colors mirror the Foundation theme tokens already used elsewhere:
 *  - background_color #f4efe6 — the warm aged-paper light background, the same
 *    value as the light `themeColor` in layout.tsx's viewport export.
 *  - theme_color #893624 — the oxblood seal accent (see app/icon.svg), the
 *    brand's one chromatic mark; gives an on-brand install/title-bar tint.
 *
 * Icons: only an SVG mark exists today (app/icon.svg, auto-served at /icon.svg).
 * SVG is a valid maskable/any manifest icon, so it is referenced here. Proper
 * raster PWA icons at 192x192 and 512x512 PNG are a brand-asset follow-up
 * (needed for the richest Android install / splash experience).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prevyl",
    short_name: "Prevyl",
    description:
      "The correct 8-digit Indian ITC-HS export code for any product, with a cited rationale you can verify before filing.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#893624",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
