// Scaffold only. Full next-intl routing (locale segments, middleware) is a
// later step; English-only at launch.
//
// This is a minimal, dependency-free, typed message reader. It does NOT touch
// next.config and adds no locale routing, so it cannot break the build. When
// the app goes multi-locale, swap this for next-intl's request config.

import en from "./messages/en.json";

export type Messages = typeof en;

/** All valid dot-paths into the catalog, e.g. "cta.classify". */
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DotPaths<Messages>;

export const defaultLocale = "en" as const;

/** Returns the English message catalog. */
export function getMessages(): Messages {
  return en;
}

/**
 * Look up a message by dot-path key. Returns the key itself if missing, so a
 * typo or a not-yet-translated string degrades to a visible-but-safe fallback
 * rather than throwing.
 */
export function t(key: MessageKey): string {
  const segments = key.split(".");
  let node: unknown = en;
  for (const segment of segments) {
    if (
      node !== null &&
      typeof node === "object" &&
      segment in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}
