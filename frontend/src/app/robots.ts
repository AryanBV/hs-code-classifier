import type { MetadataRoute } from "next";

/**
 * robots.txt — consistent with the layout's `robots: { index: true, follow: true }`
 * default: crawlers may index the public marketing/info surface, but are kept
 * OFF the routes that hold user records or back-end plumbing.
 *
 * DISALLOWED:
 *  - /r/   — opt-in public, no-PII shared classification records. They are
 *    shared deliberately by a user, never meant to be crawled or indexed.
 *  - /c/   — reserved private/record namespace (defensive; not yet a route).
 *  - /api/ — the BFF proxy routes; nothing crawlable, and we don't want bots
 *    triggering classification work.
 */
const SITE = "https://hscode.prevyl.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/r/", "/c/", "/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
