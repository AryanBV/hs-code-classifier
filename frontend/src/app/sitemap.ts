import type { MetadataRoute } from "next";

/**
 * Static sitemap for the marketing/info surface only.
 *
 * Mirrors the canonical base URL from layout.tsx (no env var exists; the site
 * URL is a single hardcoded constant there, so we keep one source-of-truth
 * shape here too). If a NEXT_PUBLIC_SITE_URL is ever introduced, swap both.
 *
 * DELIBERATELY EXCLUDED:
 *  - /r/[id]  — opt-in public, no-PII user records. Listing them would leak /
 *    over-index user data and is a re-audit risk. They are discovered by the
 *    sharer handing out the link, never by a crawler enumerating a sitemap.
 *  - /history — a localStorage-only personal workspace; nothing server-side to
 *    index and not a public page.
 *
 * robots.ts additionally Disallows /r/ (and /c/, /api/) at the crawler level as
 * defense-in-depth, so even a directly-discovered permalink is not indexed.
 */
const SITE = "https://hscode.prevyl.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE}/classify`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
