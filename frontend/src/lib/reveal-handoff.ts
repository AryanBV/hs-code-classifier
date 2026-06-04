/**
 * Reveal handoff — the one-shot "skip-entrance" signal that prevents a DOUBLE
 * reveal at the classify -> record handoff.
 *
 * The problem: `classify-client` plays the in-page inscription reveal, then
 * `router.replace('/r/{id}')` navigates to the permalink page which mounts a
 * FRESH `ResultView` and would re-play its entrance reveal a second time.
 *
 * The fix (chosen because it does NOT defer the navigation, so the signature
 * moment keeps its latency): right before navigating, the classify flow MARKS
 * the record id. On the `/r/{id}` mount, `ResultView` reads the mark exactly
 * once and clears it; if it was set, that mount skips its entrance reveal and
 * settles instantly. A direct / cold / refreshed `/r/{id}` visit has no mark,
 * so it animates as a normal entrance. The mark is scoped to sessionStorage so
 * it never leaks across tabs/sessions, and consumed read-once so a later
 * in-tab navigation to the same record still animates.
 *
 * Fail-safe by construction: any storage error degrades to "animate" (the
 * default), which is never wrong, only slightly less seamless.
 */

const KEY_PREFIX = "prevyl.skipEntrance.";

/** Mark a record id so its NEXT mount skips the entrance reveal. */
export function markSkipEntrance(recordId: string): void {
  if (typeof window === "undefined" || !recordId) return;
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${recordId}`, "1");
  } catch {
    /* storage unavailable: degrade to a (harmless) animated entrance */
  }
}

/**
 * Read-once: returns true if this record id was marked to skip its entrance,
 * and CLEARS the mark so a later in-tab revisit animates normally. Defaults to
 * false (animate) for any direct/cold/refreshed visit or storage error.
 */
export function consumeSkipEntrance(recordId: string): boolean {
  if (typeof window === "undefined" || !recordId) return false;
  try {
    const key = `${KEY_PREFIX}${recordId}`;
    const hit = window.sessionStorage.getItem(key) === "1";
    if (hit) window.sessionStorage.removeItem(key);
    return hit;
  } catch {
    return false;
  }
}
